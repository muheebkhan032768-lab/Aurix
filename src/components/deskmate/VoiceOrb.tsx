import React, { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import type { AppSettings } from "../../types/aurix";
import { getVoiceEngineSnapshot, getSharedStream, startCapture, stopCapture } from "../../utils/voiceEngine";
import { useVoiceSnapshot } from "../../utils/voiceBus";

const BAR_COUNT = 26;

interface VoiceOrbProps {
  settings: AppSettings;
  /** Called with the assistant reply so the surrounding chat can show it. */
  onExchange?: (userText: string, assistantText: string) => void;
}

/**
 * The reference dashboard's centrepiece: a 2D glowing orb with a live audio
 * visualiser. Hold the orb (or the Spacebar) to speak; release to send the
 * command to the same fast router the voice bar uses.
 */
export function VoiceOrb({ settings, onExchange }: VoiceOrbProps) {
  const snapshot = useVoiceSnapshot();
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bars, setBars] = useState<number[]>(() => Array.from({ length: BAR_COUNT }, () => 0.16));

  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
      ctxRef.current?.close().catch(() => {});
    };
  }, []);

  const teardownMeter = useCallback(() => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
  }, []);

  const startMeter = useCallback(() => {
    const stream = getSharedStream();
    const Ctor =
      window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!stream || !Ctor) return;
    const ctx = new Ctor();
    ctxRef.current = ctx;
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 128;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(data);
      setBars(
        Array.from({ length: BAR_COUNT }, (_, i) => {
          const idx = Math.floor((i / BAR_COUNT) * data.length);
          return Math.max(0.14, Math.min(1, data[idx] / 190));
        })
      );
      rafRef.current = window.requestAnimationFrame(tick);
    };
    tick();
  }, []);

  const submit = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/command/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            command: text,
            language: settings.language,
            withVoice: false,
            model: "gemini-3.1-flash-lite",
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`);
        const answer = String(json?.assistantMessage?.content || "").trim();
        if (!answer) throw new Error("The AI engine returned an empty response.");
        if (!mountedRef.current) return;
        onExchange?.(text, answer);
      } catch (err) {
        if (mountedRef.current) setError(err instanceof Error ? err.message : "Voice request failed.");
      } finally {
        if (mountedRef.current) setBusy(false);
      }
    },
    [settings.language, onExchange]
  );

  const startListening = useCallback(async () => {
    if (listening || busy) return;
    setError(null);
    const started = await startCapture();
    if (!started) {
      setError(
        getVoiceEngineSnapshot().error || "Microphone access was blocked. Allow it in the browser, then try again."
      );
      return;
    }
    startMeter();
    setListening(true);
  }, [busy, listening, startMeter]);

  const stopListening = useCallback(async () => {
    if (!listening) return;
    setListening(false);
    setBars(Array.from({ length: BAR_COUNT }, () => 0.16));
    teardownMeter();
    const result = await stopCapture({
      language: settings.language,
      autoDetectLanguage: settings.autoDetectLanguage,
    });
    if (!mountedRef.current) return;
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.silent || !result.transcript.trim()) {
      setError("I didn't catch that. Hold the orb and speak again.");
      return;
    }
    await submit(result.transcript);
  }, [listening, settings.language, settings.autoDetectLanguage, submit, teardownMeter]);

  // Hold Spacebar to talk (ignored while typing in a field).
  useEffect(() => {
    const isTyping = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
    };
    const down = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat || isTyping(event.target)) return;
      event.preventDefault();
      void startListening();
    };
    const up = (event: KeyboardEvent) => {
      if (event.code !== "Space" || isTyping(event.target)) return;
      void stopListening();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [startListening, stopListening]);

  const active = listening || snapshot.state === "listening";
  const thinking = busy || snapshot.state === "processing";
  const speaking = snapshot.state === "speaking";
  const live = active || speaking;
  const statusLabel = active
    ? "Listening…"
    : thinking
      ? "Thinking…"
      : speaking
        ? "Speaking…"
        : "Press and hold Spacebar to speak";
  const subLabel = active
    ? "Release to send · Desk Mate is hearing you"
    : thinking
      ? "Routing your request through the AI pool"
      : speaking
        ? "Desk Mate is answering aloud"
        : "Tap the orb or hold Spacebar";

  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        onPointerDown={() => void startListening()}
        onPointerUp={() => void stopListening()}
        onPointerLeave={() => void stopListening()}
        aria-label="Hold to speak to Desk Mate"
        className="relative grid h-[190px] w-[190px] place-items-center rounded-full outline-none transition-transform duration-200 active:scale-[0.98] sm:h-[210px] sm:w-[210px]"
      >
        <span className="aurix-orb-halo" aria-hidden="true" />
        <span className="aurix-orb-ring is-outer" aria-hidden="true" />
        <span className="aurix-orb-ring is-mid" aria-hidden="true" />
        <span className="aurix-orb-ring is-inner" aria-hidden="true" />
        {live && <span className="aurix-orb-sweep" aria-hidden="true" />}

        <span
          className="aurix-orb-core h-[118px] w-[118px] sm:h-[132px] sm:w-[132px]"
          style={live ? { boxShadow: "0 0 46px -4px var(--d-glow), inset 0 0 34px rgba(0,0,0,0.45)" } : undefined}
        >
          <span className={`aurix-wave flex h-14 items-center justify-center gap-[3px] ${live ? "is-live" : ""}`}>
            {bars.map((value, index) => (
              <span
                key={index}
                className="aurix-wave-bar"
                style={{
                  height: `${Math.max(6, value * 52)}px`,
                  animationDelay: `${(index % 7) * 90}ms`,
                }}
              />
            ))}
          </span>
        </span>
      </button>

      <p className="mt-4 text-sm font-semibold tracking-wide text-[var(--d-text)]">{statusLabel}</p>
      <p className="mt-1 text-[11px] text-[var(--d-dim)]">{subLabel}</p>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => (listening ? void stopListening() : void startListening())}
          className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--d-cyan)_45%,transparent)] px-3.5 py-1.5 text-[11px] font-semibold text-[var(--d-cyan)] transition-colors hover:bg-[color-mix(in_srgb,var(--d-cyan)_12%,transparent)]"
        >
          {listening ? <Square className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
          {listening ? "Stop" : "Speak"}
        </button>
        {error && <span className="text-[11px] text-rose-300">{error}</span>}
      </div>
    </div>
  );
}
