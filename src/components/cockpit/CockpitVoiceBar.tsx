import React, { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, Send, Square, Volume2, Waves } from "lucide-react";
import type { AppSettings } from "../../types/aurix";
import {
  getSharedStream,
  getVoiceEngineSnapshot,
  speak as engineSpeak,
  startCapture,
  stopCapture,
  stopSpeaking as engineStopSpeaking,
} from "../../utils/voiceEngine";
import type { ReactorState } from "./CockpitReactor";

type VoiceStatus = "idle" | "listening" | "thinking" | "speaking" | "error";

interface CockpitVoiceBarProps {
  settings: AppSettings;
  onSignal: (signal: { state: ReactorState; level: number }) => void;
  onReply?: (text: string) => void;
}

const BAR_COUNT = 36;

/**
 * Bottom voice command centre. It records through the shared AURIX voice
 * engine, so the microphone is opened once for the whole app, and it speaks
 * with the same companion voice used everywhere else.
 */
export function CockpitVoiceBar({ settings, onSignal, onReply }: CockpitVoiceBarProps) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [input, setInput] = useState("");
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [bars, setBars] = useState<number[]>(() => Array.from({ length: BAR_COUNT }, () => 0.18));

  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  // publish reactor signal
  useEffect(() => {
    const map: Record<VoiceStatus, ReactorState> = {
      idle: "idle",
      listening: "listening",
      thinking: "thinking",
      speaking: "speaking",
      error: "error",
    };
    const energy = listening ? Math.max(...bars) : 0;
    onSignal({ state: map[status], level: energy });
  }, [status, listening, bars, onSignal]);

  const teardownMeter = useCallback(() => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    // Only the local analyser is released; the shared microphone stream stays
    // open for the next press.
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      teardownMeter();
    };
  }, [teardownMeter]);

  const submit = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text) return;
      setStatus("thinking");
      setError(null);
      setReply("");
      try {
        // Spoken commands use the fast router so AURIX replies in about a
        // second instead of waiting on the deep thinking model.
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
        if (!res.ok) throw new Error(json?.error || `AI request failed (${res.status})`);
        const answer = String(json?.assistantMessage?.content || "").trim();
        if (!answer) throw new Error("The AI engine returned an empty response.");
        if (!mountedRef.current) return;
        setReply(answer);
        onReply?.(answer);
        setInput("");

        if (settings.voiceEnabled) {
          setStatus("speaking");
          await engineSpeak(answer, {
            voiceName: settings.voiceName,
            language: settings.language,
            speed: settings.voiceSpeed,
            voiceId: settings.voiceId,
            volume: settings.voiceVolume,
          });
        }
        if (mountedRef.current) setStatus("idle");
      } catch (err) {
        if (!mountedRef.current) return;
        setStatus("error");
        setError(err instanceof Error ? err.message : "Voice request failed.");
      }
    },
    [
      onReply,
      settings.language,
      settings.voiceEnabled,
      settings.voiceName,
      settings.voiceSpeed,
      settings.voiceId,
      settings.voiceVolume,
    ]
  );

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
      const next = Array.from({ length: BAR_COUNT }, (_, i) => {
        const idx = Math.floor((i / BAR_COUNT) * data.length);
        return Math.max(0.12, Math.min(1, data[idx] / 190));
      });
      setBars(next);
      rafRef.current = window.requestAnimationFrame(tick);
    };
    tick();
  }, []);

  const startListening = useCallback(async () => {
    setError(null);
    setReply("");
    setTranscript("");
    const started = await startCapture();
    if (!started) {
      setError(
        getVoiceEngineSnapshot().error ||
          "Microphone access was blocked. Allow it in the browser, or type your command below."
      );
      setStatus("error");
      return;
    }
    startMeter();
    setListening(true);
    setStatus("listening");
  }, [startMeter]);

  const stopListening = useCallback(async () => {
    setListening(false);
    setBars(Array.from({ length: BAR_COUNT }, () => 0.18));
    teardownMeter();
    const result = await stopCapture({
      language: settings.language,
      autoDetectLanguage: settings.autoDetectLanguage,
    });
    if (!mountedRef.current) return;
    if (result.error) {
      setStatus("error");
      setError(result.error);
      return;
    }
    if (result.silent) {
      setStatus("idle");
      setError("Sorry, I didn't catch that. Could you repeat?");
      return;
    }
    setTranscript(result.transcript);
    setInput(result.transcript);
    await submit(result.transcript);
  }, [settings.language, settings.autoDetectLanguage, submit, teardownMeter]);

  const stopSpeaking = useCallback(() => {
    engineStopSpeaking();
    setStatus("idle");
  }, []);

  const statusText: Record<VoiceStatus, string> = {
    idle: "Ready — hold Space to talk, or press the mic",
    listening: "Listening… speak now",
    thinking: "AURIX is reasoning",
    speaking: "AURIX is responding",
    error: "Attention required",
  };

  return (
    <div className="nexus-panel rounded-2xl p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Waves className="w-4 h-4 text-[#00D9FF]" />
          <h3 className="text-[11px] font-mono uppercase tracking-[0.22em] text-[#A9C8D5]">Voice Command</h3>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.14em]">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              status === "error"
                ? "bg-rose-400"
                : status === "listening"
                  ? "bg-[#00D9FF] animate-pulse"
                  : status === "idle"
                    ? "bg-emerald-400"
                    : "bg-[#147DFF] animate-pulse"
            }`}
          />
          <span className="text-[#94A8B8]">{statusText[status]}</span>
        </div>
      </div>

      {/* waveform */}
      <div className="mt-3 flex h-14 items-end justify-center gap-[3px] overflow-hidden">
        {bars.map((value, i) => (
          <span
            key={i}
            className="w-[4px] rounded-full transition-[height] duration-75"
            style={{
              height: `${Math.max(6, value * 100)}%`,
              background:
                status === "error"
                  ? "linear-gradient(180deg,#FB7185,#7F1D1D)"
                  : "linear-gradient(180deg,#00D9FF,#147DFF)",
              opacity: status === "idle" ? 0.35 : 0.9,
            }}
          />
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => (listening ? void stopListening() : void startListening())}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition-colors cursor-pointer ${
            listening
              ? "bg-[#00D9FF] text-[#05080D]"
              : "border border-[#00D9FF]/45 text-[#00D9FF] hover:bg-[#00D9FF]/10"
          }`}
        >
          {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          <span>{listening ? "Stop listening" : "Speak"}</span>
        </button>

        <form
          className="flex flex-1 min-w-[220px] items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const text = input.trim();
            if (!text) return;
            setTranscript(text);
            void submit(text);
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a command or question for AURIX…"
            className="flex-1 min-w-0 rounded-xl border border-[#00D9FF]/20 bg-[#05080D]/70 px-3.5 py-2.5 text-xs text-white placeholder:text-[#5B7185] outline-none focus:border-[#00D9FF]/60"
          />
          <button
            type="submit"
            disabled={status === "thinking" || !input.trim()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#147DFF] px-3.5 py-2.5 text-xs font-semibold text-white disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
          >
            <Send className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Send</span>
          </button>
        </form>

        <button
          type="button"
          onClick={stopSpeaking}
          className="inline-flex items-center gap-1.5 rounded-xl border border-[#A9C8D5]/25 px-3.5 py-2.5 text-xs font-medium text-[#A9C8D5] hover:border-[#A9C8D5]/60 cursor-pointer"
        >
          <Square className="w-3.5 h-3.5" />
          <span>Stop voice</span>
        </button>
      </div>

      {transcript && (
        <div className="mt-3 rounded-xl border border-[#00D9FF]/15 bg-[#05080D]/60 px-3.5 py-2.5">
          <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-[#5B7185]">Transcript</div>
          <p className="mt-1 text-xs text-[#D6E6EE]">{transcript}</p>
        </div>
      )}

      {reply && (
        <div className="mt-3 rounded-xl border border-[#2FE9C6]/25 bg-[#2FE9C6]/5 px-3.5 py-2.5">
          <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.16em] text-[#2FE9C6]">
            <Volume2 className="w-3 h-3" />
            AURIX
          </div>
          <p className="mt-1 text-xs leading-relaxed text-[#D6E6EE] whitespace-pre-wrap">{reply}</p>
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2 text-[11px] text-rose-200">
          {error}
        </p>
      )}
    </div>
  );
}
