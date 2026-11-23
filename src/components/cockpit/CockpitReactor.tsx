import React from "react";

export type ReactorState =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "processing"
  | "offline"
  | "error";

interface CockpitReactorProps {
  state: ReactorState;
  /** Live audio energy 0..1 — drives the inner ring and particle glow. */
  level?: number;
  statusLabel?: string;
  detailLabel?: string;
  size?: number;
}

const stateTheme: Record<ReactorState, { accent: string; speed: number; label: string }> = {
  idle: { accent: "#00D9FF", speed: 1, label: "STANDBY" },
  listening: { accent: "#00D9FF", speed: 1.45, label: "LISTENING" },
  thinking: { accent: "#147DFF", speed: 2.2, label: "REASONING" },
  speaking: { accent: "#2FE9C6", speed: 1.6, label: "RESPONDING" },
  processing: { accent: "#7DD3FC", speed: 2.6, label: "PROCESSING" },
  offline: { accent: "#5B7185", speed: 0.45, label: "OFFLINE" },
  error: { accent: "#FB7185", speed: 0.6, label: "ATTENTION" },
};

const ticks = Array.from({ length: 72 }, (_, i) => i);
const orbitDots = Array.from({ length: 10 }, (_, i) => i);
const outerDots = Array.from({ length: 14 }, (_, i) => i);
const waveBars = Array.from({ length: 9 }, (_, i) => i);

export function CockpitReactor({
  state,
  level = 0,
  statusLabel,
  detailLabel,
  size = 460,
}: CockpitReactorProps) {
  const theme = stateTheme[state];
  const energy = Math.max(0, Math.min(1, level));
  const duration = (base: number) => `${(base / theme.speed).toFixed(2)}s`;
  const coreRadius = 96 + energy * 10;

  return (
    <div className="relative mx-auto" style={{ width: "100%", maxWidth: size }}>
      <svg viewBox="0 0 520 520" className="w-full h-auto" role="img" aria-label={`AURIX reactor ${theme.label}`}>
        <defs>
          <radialGradient id="reactor-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={theme.accent} stopOpacity="0.95" />
            <stop offset="45%" stopColor={theme.accent} stopOpacity="0.28" />
            <stop offset="100%" stopColor={theme.accent} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="reactor-halo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={theme.accent} stopOpacity="0.18" />
            <stop offset="70%" stopColor="#147DFF" stopOpacity="0.05" />
            <stop offset="100%" stopColor="#05080D" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="reactor-scan" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={theme.accent} stopOpacity="0" />
            <stop offset="100%" stopColor={theme.accent} stopOpacity="0.35" />
          </linearGradient>
        </defs>

        {/* deep halo */}
        <circle cx="260" cy="260" r="252" fill="url(#reactor-halo)" />

        {/* static graduation ring */}
        <g opacity="0.55">
          {ticks.map((i) => {
            const angle = (i / ticks.length) * Math.PI * 2;
            const major = i % 6 === 0;
            const r1 = major ? 226 : 232;
            const r2 = 242;
            return (
              <line
                key={i}
                x1={260 + Math.cos(angle) * r1}
                y1={260 + Math.sin(angle) * r1}
                x2={260 + Math.cos(angle) * r2}
                y2={260 + Math.sin(angle) * r2}
                stroke={major ? "#A9C8D5" : theme.accent}
                strokeOpacity={major ? 0.6 : 0.3}
                strokeWidth={major ? 1.6 : 0.9}
              />
            );
          })}
        </g>

        {/* outer slow ring */}
        <g className="nexus-ring" style={{ animationDuration: duration(44) }}>
          <circle
            cx="260"
            cy="260"
            r="216"
            fill="none"
            stroke={theme.accent}
            strokeOpacity="0.35"
            strokeWidth="1.2"
            strokeDasharray="2 14"
          />
        </g>

        {/* counter-rotating ring with markers */}
        <g className="nexus-ring is-reverse" style={{ animationDuration: duration(30) }}>
          <circle cx="260" cy="260" r="190" fill="none" stroke={theme.accent} strokeOpacity="0.22" strokeWidth="1" />
          {orbitDots.map((i) => {
            const angle = (i / orbitDots.length) * Math.PI * 2;
            return (
              <circle
                key={i}
                cx={260 + Math.cos(angle) * 190}
                cy={260 + Math.sin(angle) * 190}
                r={i % 5 === 0 ? 3.2 : 1.8}
                fill={theme.accent}
                opacity={i % 5 === 0 ? 0.9 : 0.45}
              />
            );
          })}
        </g>

        {/* inner segmented ring */}
        <g className="nexus-ring" style={{ animationDuration: duration(20) }}>
          <circle
            cx="260"
            cy="260"
            r="158"
            fill="none"
            stroke={theme.accent}
            strokeOpacity="0.5"
            strokeWidth="2"
            strokeDasharray="86 34"
            strokeLinecap="round"
          />
        </g>

        {/* telemetry arc */}
        <g className="nexus-ring is-reverse" style={{ animationDuration: duration(14) }}>
          <circle
            cx="260"
            cy="260"
            r="136"
            fill="none"
            stroke="#147DFF"
            strokeOpacity="0.55"
            strokeWidth="1.6"
            strokeDasharray="40 220"
            strokeLinecap="round"
          />
        </g>

        {/* particle orbit */}
        <g className="nexus-ring" style={{ animationDuration: duration(12) }}>
          {outerDots.map((i) => {
            const angle = (i / outerDots.length) * Math.PI * 2;
            const r = 172 + (i % 3) * 6;
            return (
              <circle
                key={i}
                cx={260 + Math.cos(angle) * r}
                cy={260 + Math.sin(angle) * r}
                r={1.4 + (i % 4) * 0.5}
                fill={theme.accent}
                opacity={0.35 + energy * 0.55}
              />
            );
          })}
        </g>

        {/* radar sweep */}
        <g className="nexus-ring" style={{ animationDuration: duration(9) }} opacity={0.35 + energy * 0.4}>
          <path d="M260 260 L260 52 A208 208 0 0 1 388 92 Z" fill="url(#reactor-scan)" />
        </g>

        {/* audio-reactive ring */}
        <circle
          cx="260"
          cy="260"
          r={112 + energy * 14}
          fill="none"
          stroke={theme.accent}
          strokeOpacity={0.18 + energy * 0.6}
          strokeWidth={1.5 + energy * 3}
        />

        {/* core */}
        <circle cx="260" cy="260" r={coreRadius} fill="url(#reactor-core)" className="nexus-core" />
        <circle cx="260" cy="260" r="104" fill="none" stroke={theme.accent} strokeOpacity="0.55" strokeWidth="1.4" />
        <circle
          cx="260"
          cy="260"
          r="88"
          fill="#05080D"
          fillOpacity="0.72"
          stroke={theme.accent}
          strokeOpacity="0.85"
          strokeWidth="1.8"
        />

        {/* AURIX emblem star — shivers while the assistant speaks */}
        <g
          className={`nexus-star ${state === "speaking" ? "is-live" : ""}`}
          style={{ transformOrigin: "260px 204px" }}
        >
          <path
            d="M260 182 L266 198 L282 204 L266 210 L260 226 L254 210 L238 204 L254 198 Z"
            fill="#EAFBFF"
            fillOpacity="0.92"
          />
          <circle cx="260" cy="204" r="2.6" fill="#FFFFFF" />
        </g>

        {/* Live voice waveform under the wordmark */}
        <g
          className={`nexus-wave ${state === "speaking" ? "is-live" : ""}`}
          style={{ opacity: 0.35 + energy * 0.65 }}
        >
          {waveBars.map((i) => {
            const height = 8 + Math.abs(Math.sin((i + 1) * 1.15)) * 22 * (0.4 + energy);
            return (
              <rect
                key={i}
                x={260 - 38 + i * 9}
                y={320 - height / 2}
                width={4}
                height={height}
                rx={1.6}
                fill={theme.accent}
                className="nexus-wave-bar"
                style={{ animationDelay: `${(i % 5) * 0.11}s` }}
              />
            );
          })}
        </g>

        <text
          x="260"
          y="252"
          textAnchor="middle"
          fill="#FFFFFF"
          fontFamily="Outfit, ui-sans-serif, system-ui"
          fontSize="30"
          fontWeight="700"
          letterSpacing="6"
        >
          AURIX
        </text>
        <text
          x="260"
          y="276"
          textAnchor="middle"
          fill={theme.accent}
          fontFamily="JetBrains Mono, ui-monospace, monospace"
          fontSize="11"
          letterSpacing="3.5"
        >
          {statusLabel ?? theme.label}
        </text>
        <text
          x="260"
          y="294"
          textAnchor="middle"
          fill="#94A8B8"
          fontFamily="JetBrains Mono, ui-monospace, monospace"
          fontSize="8.5"
          letterSpacing="2"
        >
          {detailLabel ?? "NEXUS CORE"}
        </text>
      </svg>

      <span className="pointer-events-none absolute inset-x-0 -bottom-1 text-center font-mono text-[10px] tracking-[0.3em] text-[#5B7185]">
        {theme.label}
      </span>
    </div>
  );
}
