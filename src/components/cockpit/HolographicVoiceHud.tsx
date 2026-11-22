import React from "react";
import { Mic, MicOff, ShieldCheck, ShieldAlert, Volume2, VolumeX } from "lucide-react";
import { useVoiceSnapshot, type MicPermission, type VoiceSessionState } from "../../utils/voiceBus";

const BAR_COUNT = 34;
const SHAPE = Array.from({ length: BAR_COUNT }, (_, i) => 0.32 + 0.68 * Math.abs(Math.sin((i / BAR_COUNT) * Math.PI * 3.2)));

const STATUS_LABEL: Record<VoiceSessionState, string> = {
  idle: "SYSTEM READY",
  listening: "LIVE LISTENING",
  processing: "PROCESSING COMMAND",
  speaking: "AURIX SPEAKING",
  error: "MICROPHONE ATTENTION",
};

const STATUS_COLOR: Record<VoiceSessionState, string> = {
  idle: "text-[#5B7185]",
  listening: "text-[#00D9FF]",
  processing: "text-[#147DFF]",
  speaking: "text-[#2FE9C6]",
  error: "text-rose-300",
};

const PERMISSION_META: Record<MicPermission, { label: string; ok: boolean }> = {
  granted: { label: "MIC GRANTED", ok: true },
  denied: { label: "MIC BLOCKED", ok: false },
  prompt: { label: "MIC ASK", ok: false },
  unknown: { label: "MIC CHECK", ok: false },
};

interface HolographicVoiceHudProps {
  pushToTalkLabel: string;
  onToggleMute: () => void;
}

/**
 * Holographic microphone interface for the cockpit. Everything it shows comes
 * from the live voice session — no simulated transcripts or fake levels.
 */
export function HolographicVoiceHud({ pushToTalkLabel, onToggleMute }: HolographicVoiceHudProps) {
  const voice = useVoiceSnapshot();
  const listening = voice.state === "listening";
  const permission = PERMISSION_META[voice.micPermission];
  // Listening and processing show what was recognised; speaking shows the reply.
  const caption =
    voice.state === "speaking"
      ? voice.reply || voice.detail
      : (listening || voice.state === "processing") && voice.transcript
        ? voice.transcript
        : voice.detail;

  return (
    <section
      className="nexus-panel rounded-2xl px-4 py-4 sm:px-5"
      aria-label="AURIX holographic microphone"
      data-testid="holographic-mic"
      data-voice-state={voice.state}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Mic className="w-4 h-4 text-[#00D9FF]" />
          <h2 className="text-[11px] font-mono uppercase tracking-[0.22em] text-[#A9C8D5]">Microphone</h2>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-mono uppercase tracking-[0.14em] ${
              permission.ok
                ? "border-emerald-400/40 text-emerald-300"
                : "border-[#D6AD60]/40 text-[#D6AD60]"
            }`}
          >
            {permission.ok ? <ShieldCheck className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}
            {permission.label}
          </span>
          <button
            type="button"
            onClick={onToggleMute}
            aria-pressed={voice.muted}
            aria-label={voice.muted ? "Unmute AURIX voice" : "Mute AURIX voice"}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold cursor-pointer ${
              voice.muted
                ? "border-rose-400/50 bg-rose-500/10 text-rose-200"
                : "border-[#00D9FF]/35 text-[#00D9FF] hover:bg-[#00D9FF]/10"
            }`}
          >
            {voice.muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            {voice.muted ? "Muted" : "Voice on"}
          </button>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-4">
        <div className="relative shrink-0">
          {listening && (
            <>
              <span className="absolute inset-0 rounded-full border border-[#00D9FF]/50 animate-ping" aria-hidden="true" />
              <span
                className="absolute -inset-2 rounded-full border border-[#00D9FF]/25"
                style={{ transform: `scale(${1 + voice.level * 0.18})` }}
                aria-hidden="true"
              />
            </>
          )}
          <div
            className={`relative flex h-14 w-14 items-center justify-center rounded-full border transition-all duration-150 ${
              listening
                ? "border-[#00D9FF] bg-[#00D9FF]/15"
                : voice.state === "speaking"
                  ? "border-[#2FE9C6] bg-[#2FE9C6]/10"
                  : voice.state === "error"
                    ? "border-rose-400/60 bg-rose-500/10"
                    : "border-[#00D9FF]/25 bg-[#05080D]"
            }`}
            style={{
              boxShadow: listening
                ? `0 0 ${16 + voice.level * 34}px rgba(0,217,255,${0.35 + voice.level * 0.4})`
                : "0 0 14px rgba(0,217,255,0.12)",
            }}
          >
            {voice.muted ? (
              <MicOff className={`w-6 h-6 ${STATUS_COLOR[voice.state]}`} />
            ) : (
              <Mic className={`w-6 h-6 ${STATUS_COLOR[voice.state]}`} />
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                listening || voice.state === "processing" || voice.state === "speaking"
                  ? "bg-[#00D9FF] animate-pulse"
                  : voice.state === "error"
                    ? "bg-rose-400"
                    : "bg-emerald-400"
              }`}
              aria-hidden="true"
            />
            <span
              className={`text-[10px] font-mono uppercase tracking-[0.2em] ${STATUS_COLOR[voice.state]}`}
              data-testid="holographic-mic-status"
            >
              {STATUS_LABEL[voice.state]}
            </span>
            <span className="text-[9px] font-mono uppercase tracking-[0.14em] text-[#5B7185]">
              hold {pushToTalkLabel}
            </span>
          </div>

          <div
            className={`mt-2 flex h-9 items-end gap-[3px] ${voice.state === "speaking" ? "animate-pulse" : ""}`}
            aria-hidden="true"
          >
            {SHAPE.map((shape, i) => (
              <span
                key={i}
                className="w-[3px] flex-1 rounded-full bg-gradient-to-t from-[#147DFF] to-[#00D9FF] transition-[height] duration-75"
                style={{
                  height: `${Math.max(8, voice.level * shape * 100)}%`,
                  opacity: listening ? 0.55 + voice.level * 0.45 : 0.22,
                }}
              />
            ))}
          </div>

          <p className="mt-1.5 truncate text-[11px] text-[#94A8B8]" data-testid="holographic-mic-caption">
            {caption || "Hold the spacebar and speak, or press the mic in the voice panel."}
          </p>
        </div>
      </div>
    </section>
  );
}
