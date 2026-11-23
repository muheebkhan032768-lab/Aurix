import React, { useEffect, useState } from "react";
import { VISEME_LABEL, VISEME_SHAPES, visemeAt, type Viseme } from "../../utils/visemes";
import type { VoiceSessionState } from "../../utils/voiceBus";

interface HolographicFaceProps {
  state: VoiceSessionState;
  /** Live microphone energy 0..1. */
  level: number;
  /** The line DEX MADE is speaking right now. */
  reply: string;
  /** Character offset inside `reply` currently being voiced, -1 when silent. */
  spokenChars: number;
  /** ECO / reduced-motion: keep the composition, drop the continuous motion. */
  calm?: boolean;
}

const STATE_ACCENT: Record<VoiceSessionState, string> = {
  idle: "#00D9FF",
  listening: "#00D9FF",
  processing: "#147DFF",
  thinking: "#147DFF",
  speaking: "#2FE9C6",
  error: "#FB7185",
};

const STATE_LABEL: Record<VoiceSessionState, string> = {
  idle: "STANDBY",
  listening: "LISTENING",
  processing: "PROCESSING",
  thinking: "THINKING",
  speaking: "SPEAKING",
  error: "ATTENTION",
};

/** Horizontal wireframe contours across the head. */
const CONTOURS = [58, 76, 94, 112, 130, 148, 166, 184, 202, 218];

export function HolographicFace({ state, level, reply, spokenChars, calm = false }: HolographicFaceProps) {
  const accent = STATE_ACCENT[state];
  const speaking = state === "speaking" && spokenChars >= 0;
  const viseme: Viseme = speaking ? visemeAt(reply, spokenChars) : "rest";
  const shape = VISEME_SHAPES[viseme];
  const energy = Math.max(0, Math.min(1, level));

  // Idle blinking keeps the face alive without any audio.
  const [blink, setBlink] = useState(false);
  useEffect(() => {
    if (calm) return;
    let timer = 0;
    const loop = () => {
      timer = window.setTimeout(() => {
        setBlink(true);
        timer = window.setTimeout(() => {
          setBlink(false);
          loop();
        }, 130);
      }, 3200 + Math.random() * 2600);
    };
    loop();
    return () => window.clearTimeout(timer);
  }, [calm]);

  // The mouth: a small open shape scaled to the current viseme.
  const mouthOpen = speaking ? shape.open : state === "listening" ? 0.05 + energy * 0.35 : 0.04;
  const mouthWide = speaking ? shape.wide : 0.36;
  const mouthScaleX = 0.72 + mouthWide * 0.62;
  const mouthScaleY = 0.1 + mouthOpen * 0.95;
  const eyeHeight = blink ? 0.6 : state === "listening" ? 5.2 : 6.4;
  const eyeGlow = speaking ? 1.2 + Math.abs(Math.sin(spokenChars * 0.4)) * 0.5 : state === "listening" ? 1.15 : 0.85;

  return (
    <section
      className="nexus-panel relative overflow-hidden rounded-2xl px-3 py-3"
      aria-label="DEX MADE holographic face"
      data-testid="holographic-face"
      data-voice-state={state}
      data-viseme={viseme}
      data-spoken-chars={spokenChars}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] font-mono uppercase tracking-[0.22em] text-[#A9C8D5]">Presence</span>
        <span
          className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[8px] font-mono uppercase tracking-[0.14em]"
          style={{ borderColor: `${accent}55`, color: accent }}
        >
          <span className="h-1 w-1 rounded-full" style={{ background: accent }} />
          {STATE_LABEL[state]}
        </span>
      </div>

      <div className={`relative mx-auto mt-1 w-full max-w-[220px] ${calm ? "" : "aurix-holo"}`}>
        <svg viewBox="0 0 240 300" className="h-auto w-full" role="img" aria-label="DEX MADE holographic head">
          <defs>
            <radialGradient id="holo-glow" cx="50%" cy="45%" r="55%">
              <stop offset="0%" stopColor={accent} stopOpacity="0.3" />
              <stop offset="60%" stopColor={accent} stopOpacity="0.06" />
              <stop offset="100%" stopColor="#05080D" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="holo-scan" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={accent} stopOpacity="0" />
              <stop offset="55%" stopColor={accent} stopOpacity="0.45" />
              <stop offset="100%" stopColor={accent} stopOpacity="0" />
            </linearGradient>
            <clipPath id="holo-head-clip">
              <path d="M120 34 C168 34 188 74 188 116 C188 154 176 190 152 214 C140 226 128 234 120 234 C112 234 100 226 88 214 C64 190 52 154 52 116 C52 74 72 34 120 34 Z" />
            </clipPath>
            <filter id="holo-soft" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="3.2" />
            </filter>
          </defs>

          {/* projection glow + pedestal */}
          <ellipse cx="120" cy="140" rx="118" ry="132" fill="url(#holo-glow)" />
          <ellipse cx="120" cy="262" rx="66" ry="12" fill="none" stroke={accent} strokeOpacity="0.35" strokeWidth="1" />
          <ellipse cx="120" cy="270" rx="44" ry="8" fill="none" stroke={accent} strokeOpacity="0.2" strokeWidth="1" strokeDasharray="3 5" />

          <g clipPath="url(#holo-head-clip)">
            {/* wireframe contours */}
            {CONTOURS.map((y, i) => (
              <path
                key={y}
                d={`M48 ${y} Q120 ${y + 10 - (i % 2) * 6} 192 ${y}`}
                fill="none"
                stroke={accent}
                strokeOpacity={0.16 + (i % 3) * 0.05}
                strokeWidth="0.9"
              />
            ))}
            {/* meridians */}
            <path d="M120 32 V236" stroke={accent} strokeOpacity="0.3" strokeWidth="0.9" />
            <path d="M92 38 C78 92 78 176 100 226" stroke={accent} strokeOpacity="0.2" strokeWidth="0.8" />
            <path d="M148 38 C162 92 162 176 140 226" stroke={accent} strokeOpacity="0.2" strokeWidth="0.8" />
            {/* travelling scan band */}
            <rect
              className={calm ? undefined : "aurix-holo-scan"}
              x="40"
              y="0"
              width="160"
              height="34"
              fill="url(#holo-scan)"
              opacity={calm ? 0.25 : 0.7}
            />
          </g>

          {/* head outline */}
          <path
            d="M120 34 C168 34 188 74 188 116 C188 154 176 190 152 214 C140 226 128 234 120 234 C112 234 100 226 88 214 C64 190 52 154 52 116 C52 74 72 34 120 34 Z"
            fill="none"
            stroke={accent}
            strokeOpacity="0.65"
            strokeWidth="1.4"
          />

          {/* eyes */}
          <g>
            {[94, 146].map((x) => (
              <g key={x}>
                <ellipse cx={x} cy={124} rx={12} ry={eyeHeight} fill={`${accent}22`} stroke={accent} strokeOpacity="0.85" strokeWidth="1.1" />
                <ellipse cx={x} cy={124} rx={11} ry={eyeHeight} fill={accent} opacity={0.5} filter="url(#holo-soft)" style={{ opacity: 0.18 * eyeGlow }} />
                <circle cx={x} cy={124} r={2.6} fill="#EAFBFF" opacity={blink ? 0.2 : 0.95} />
              </g>
            ))}
            {/* brows */}
            <path d="M82 106 Q94 100 106 106" fill="none" stroke={accent} strokeOpacity="0.5" strokeWidth="1.2" />
            <path d="M134 106 Q146 100 158 106" fill="none" stroke={accent} strokeOpacity="0.5" strokeWidth="1.2" />
          </g>

          {/* nose */}
          <path d="M120 130 L114 164 Q120 168 126 164" fill="none" stroke={accent} strokeOpacity="0.4" strokeWidth="1" />

          {/* mouth — driven by the current viseme */}
          <g transform="translate(120 188)">
            <ellipse
              rx={20}
              ry={9}
              fill="#05080D"
              stroke={accent}
              strokeWidth="1.4"
              strokeOpacity={speaking ? 0.95 : 0.6}
              style={{
                transformBox: "fill-box",
                transformOrigin: "center",
                transform: `scale(${mouthScaleX}, ${mouthScaleY})`,
                transition: "transform 90ms linear",
                filter: speaking ? `drop-shadow(0 0 ${4 + mouthOpen * 6}px ${accent}aa)` : undefined,
              }}
            />
            {mouthOpen > 0.5 && (
              <line x1="-9" y1="-4" x2="9" y2="-4" stroke="#EAFBFF" strokeOpacity="0.45" strokeWidth="1" />
            )}
          </g>

          {/* jaw accents */}
          <path d="M96 206 Q120 220 144 206" fill="none" stroke={accent} strokeOpacity="0.28" strokeWidth="1" />
        </svg>

        {/* corner readouts */}
        <span className="pointer-events-none absolute left-0 top-0 text-[8px] font-mono uppercase tracking-[0.14em] text-[#3F5567]">
          viseme · {VISEME_LABEL[viseme]}
        </span>
        <span className="pointer-events-none absolute right-0 top-0 text-[8px] font-mono uppercase tracking-[0.14em] text-[#3F5567]">
          {speaking ? `${Math.min(100, Math.round((spokenChars / Math.max(1, reply.length)) * 100))}%` : "sync"}
        </span>
      </div>

      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="text-[8px] font-mono uppercase tracking-[0.16em] text-[#5B7185]">
          lip-sync · {speaking ? "live" : "armed"}
        </span>
        <span className="flex h-3 items-end gap-[2px]" aria-hidden="true">
          {Array.from({ length: 12 }).map((_, i) => (
            <span
              key={i}
              className="w-[2px] rounded-full"
              style={{
                height: `${20 + Math.max(energy, speaking ? 0.4 : 0.1) * (i % 4 === 0 ? 100 : 60)}%`,
                background: accent,
                opacity: 0.35 + Math.max(energy, speaking ? 0.4 : 0) * 0.6,
              }}
            />
          ))}
        </span>
      </div>
    </section>
  );
}
