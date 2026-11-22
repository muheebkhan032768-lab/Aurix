import React, { useEffect, useMemo, useRef, useState } from "react";
import { Mic, MicOff, Square, Volume2, Waves, Radio, Sparkles, ShieldCheck } from "lucide-react";
import type { AppSettings, AurixLanguage } from "../../types/aurix";
import { useVoiceSnapshot } from "../../utils/voiceBus";
import { getVoiceControls } from "../voiceControls";
import { InlineError, SectionHeader } from "../ui";

interface VoiceIntelligenceProps {
  settings: AppSettings;
  onUpdateSettings: (settings: AppSettings) => Promise<void>;
}

const STATE_COPY: Record<string, { label: string; hint: string }> = {
  idle: { label: "Idle", hint: "Hold Space or press Start listening." },
  listening: { label: "Listening", hint: "Speak now — release Space to finalize." },
  processing: { label: "Processing", hint: "Transcribing and reasoning with AURIX." },
  speaking: { label: "Speaking", hint: "AURIX is answering aloud. Press Escape to interrupt." },
  error: { label: "Error", hint: "Check the microphone permission and try again." },
};

export function VoiceIntelligence({ settings, onUpdateSettings }: VoiceIntelligenceProps) {
  const voice = useVoiceSnapshot();
  const [tick, setTick] = useState(0);
  const [permission, setPermission] = useState<string>("unknown");
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const state = voice.state;
  const copy = STATE_COPY[state] || STATE_COPY.idle;

  useEffect(() => {
    const timer = window.setInterval(() => setTick((t) => t + 1), 90);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let mounted = true;
    navigator.permissions
      ?.query({ name: "microphone" as PermissionName })
      .then((status) => {
        if (!mounted) return;
        setPermission(status.state);
        status.onchange = () => setPermission(status.state);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
      audioRef.current?.pause();
    };
  }, []);

  useEffect(() => {
    if (voice.micPermission !== "unknown") setPermission(voice.micPermission);
  }, [voice.micPermission]);

  const bars = useMemo(() => {
    const count = 44;
    const level = Math.max(voice.level, state === "speaking" ? 0.42 : 0);
    return Array.from({ length: count }, (_, i) => {
      const wave = Math.abs(Math.sin(i * 0.55 + tick * 0.35)) * 0.55 + Math.abs(Math.cos(i * 0.21 - tick * 0.22)) * 0.45;
      const idle = 0.1 + Math.abs(Math.sin(i * 0.7 + tick * 0.06)) * 0.08;
      const height = state === "listening" || state === "speaking" ? Math.min(1, 0.12 + level * wave * 1.5) : idle;
      return height;
    });
  }, [tick, voice.level, state]);

  const enableMic = async () => {
    setError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser does not expose a microphone API.");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setPermission("granted");
      const controls = getVoiceControls();
      controls?.open();
      controls?.start();
    } catch {
      setPermission("denied");
      setError("Microphone access was blocked. Allow it in the browser's site settings, then try again.");
    }
  };

  const testVoice = async () => {
    setError(null);
    setTesting(true);
    try {
      audioRef.current?.pause();
      const res = await fetch("/api/voice/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "Yes, Sir. AURIX voice systems are online and ready.",
          voiceName: settings.voiceName,
          language: settings.language,
          speed: settings.voiceSpeed,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Speech synthesis is unavailable.");
      const audio = new Audio(`data:${data.mimeType || "audio/wav"};base64,${data.audioBase64}`);
      audioRef.current = audio;
      audio.onended = () => setTesting(false);
      audio.onerror = () => {
        setTesting(false);
        setError("The synthesized voice could not be played.");
      };
      await audio.play();
    } catch (err) {
      setTesting(false);
      setError(err instanceof Error ? err.message : "Speech synthesis failed.");
    }
  };

  const updateLanguage = async (language: AurixLanguage) => {
    await onUpdateSettings({ ...settings, language, greetingLanguage: language });
  };

  const controls = getVoiceControls();
  const orbScale = state === "listening" ? 1 + Math.min(0.16, voice.level * 0.5) : state === "speaking" ? 1.04 : 1;

  return (
    <div className="space-y-4">
      <SectionHeader
        eyebrow="Voice Intelligence"
        title="Speak naturally, Sir."
        description="One real microphone engine powers push-to-talk, transcription and the natural male AURIX voice in English and Urdu. Nothing is recorded in the background."
        actions={
          <span className="ws-chip">
            <ShieldCheck className="h-3 w-3" /> {permission === "granted" ? "Mic allowed" : permission === "denied" ? "Mic blocked" : "Mic not requested"}
          </span>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1.15fr_1fr]">
        <div className="ws-card ws-noise relative overflow-hidden p-6">
          <div className="pointer-events-none absolute inset-0 ws-grid-bg opacity-60" />
          <div className="relative flex flex-col items-center">
            <div className="relative flex h-64 w-64 items-center justify-center">
              <div
                className="ws-spin-slow absolute inset-0 rounded-full border border-dashed"
                style={{ borderColor: "color-mix(in srgb, var(--ws-accent) 30%, transparent)" }}
              />
              <div
                className="absolute inset-6 rounded-full border"
                style={{ borderColor: "color-mix(in srgb, var(--ws-accent-2) 26%, transparent)" }}
              />
              <div
                className={`ws-orb absolute inset-12 rounded-full transition-transform duration-200 ${state === "idle" ? "ws-pulse" : ""}`}
                style={{ transform: `scale(${orbScale})` }}
              />
              <div className="relative z-10 text-center">
                <div className="font-display text-sm font-semibold uppercase tracking-[0.24em] text-white/90">
                  {copy.label}
                </div>
                <div className="mt-1 text-[10px] text-white/70">{voice.detail || copy.hint}</div>
              </div>
            </div>

            <div className="mt-5 flex h-14 w-full items-center justify-center gap-[3px]" aria-hidden="true">
              {bars.map((h, i) => (
                <span
                  key={i}
                  className="w-[3px] rounded-full transition-[height] duration-100"
                  style={{
                    height: `${Math.round(h * 100)}%`,
                    background:
                      i % 3 === 0
                        ? "var(--ws-accent)"
                        : i % 3 === 1
                          ? "var(--ws-accent-2)"
                          : "color-mix(in srgb, var(--ws-accent) 55%, transparent)",
                    opacity: 0.55 + h * 0.45,
                  }}
                />
              ))}
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <button type="button" className="ws-btn ws-btn-primary" onClick={() => void enableMic()}>
                <Mic className="h-4 w-4" /> {state === "listening" ? "Listening..." : "Start listening"}
              </button>
              <button type="button" className="ws-btn" onClick={() => controls?.stop()} disabled={state !== "listening"}>
                <Square className="h-3.5 w-3.5" /> Stop & send
              </button>
              <button type="button" className="ws-btn" onClick={() => controls?.interrupt()}>
                <MicOff className="h-3.5 w-3.5" /> Interrupt
              </button>
              <button type="button" className="ws-btn" onClick={() => void testVoice()} disabled={testing}>
                <Volume2 className="h-3.5 w-3.5" /> {testing ? "Speaking..." : "Test voice"}
              </button>
            </div>
            <p className="mt-3 text-center text-[10px] text-[var(--ws-muted)]">
              Hold <kbd className="rounded border border-[var(--ws-border-strong)] px-1">Space</kbd> anywhere to talk; release to finalize.
              Space is ignored while typing in any input, textarea or editable field.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="ws-card p-4">
            <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-[var(--ws-text)]">
              <Waves className="h-3.5 w-3.5 text-[var(--ws-accent)]" /> Session transcript
            </h3>
            <div className="ws-inset min-h-[86px] p-3 text-[11.5px] leading-relaxed text-[var(--ws-text)]">
              {voice.transcript || voice.interim || <span className="text-[var(--ws-muted)]">Your spoken words will appear here after AURIX transcribes them.</span>}
              {voice.interim && voice.transcript && <span className="text-[var(--ws-muted)]"> {voice.interim}</span>}
            </div>
            <div className="mt-2 text-[9.5px] uppercase tracking-[0.14em] text-[var(--ws-muted)]">AURIX reply</div>
            <div className="mt-1 max-h-32 overflow-y-auto text-[11.5px] leading-relaxed text-[var(--ws-text)]">
              {voice.reply || <span className="text-[var(--ws-muted)]">No reply yet.</span>}
            </div>
          </div>

          <div className="ws-card space-y-3 p-4">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold text-[var(--ws-text)]">
              <Sparkles className="h-3.5 w-3.5 text-[var(--ws-accent)]" /> Voice configuration
            </h3>
            <div>
              <div className="mb-1 text-[10px] text-[var(--ws-muted)]">Language</div>
              <div className="flex gap-1.5">
                {(["English", "Urdu"] as AurixLanguage[]).map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    className={`ws-btn flex-1 ${settings.language === lang ? "ws-btn-primary" : ""}`}
                    onClick={() => void updateLanguage(lang)}
                  >
                    {lang}
                  </button>
                ))}
              </div>
            </div>
            <label className="block text-[10px] text-[var(--ws-muted)]">
              Male voice
              <select
                className="ws-input mt-1"
                value={settings.voiceName}
                onChange={(e) => void onUpdateSettings({ ...settings, voiceName: e.target.value as AppSettings["voiceName"] })}
              >
                <option value="Charon">Charon — deep, composed (default)</option>
                <option value="Fenrir">Fenrir — warm, authoritative</option>
                <option value="Puck">Puck — lighter, precise</option>
              </select>
            </label>
            <label className="block text-[10px] text-[var(--ws-muted)]">
              Speaking speed: {settings.voiceSpeed.toFixed(2)}×
              <input
                type="range"
                min={0.75}
                max={1.4}
                step={0.05}
                value={settings.voiceSpeed}
                onChange={(e) => void onUpdateSettings({ ...settings, voiceSpeed: Number(e.target.value) })}
                className="mt-1 w-full accent-[var(--ws-accent)]"
              />
            </label>
            <button
              type="button"
              className={`ws-btn w-full ${voice.wake ? "ws-btn-primary" : ""}`}
              onClick={() => controls?.toggleWake()}
            >
              <Radio className="h-3.5 w-3.5" />
              {voice.wake ? "Wake phrase armed — say “Hello AURIX”" : "Enable “Hello AURIX” wake phrase"}
            </button>
            <p className="text-[9px] leading-relaxed text-[var(--ws-muted)]">
              Wake-phrase listening is opt-in for this session, uses browser speech recognition, and answers
              “Yes, Sir. I&apos;m listening.” when it hears the phrase. It is never hidden or always-on by default.
            </p>
            {error && <InlineError message={error} />}
          </div>

          <div className="ws-card p-4">
            <h3 className="mb-2 text-xs font-semibold text-[var(--ws-text)]">How this actually works</h3>
            <ul className="space-y-1.5 text-[10.5px] leading-relaxed text-[var(--ws-muted)]">
              <li>• Push-to-talk opens the microphone only while Space is held; releasing it finalizes the utterance and releases the audio device.</li>
              <li>• Speech recognition transcribes on-device in Chrome/Edge; audio is sent to Gemini only when the browser recognizer is unavailable.</li>
              <li>• Replies are spoken through Gemini TTS with a male voice; if the cloud voice is unavailable the device voice takes over.</li>
              <li>• Urdu speech is recognized and answered in Urdu; the chosen voice reads it back.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
