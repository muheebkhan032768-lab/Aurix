import React from "react";
import type { ReactorState } from "./CockpitReactor";

interface ExplodedViewProps {
  state: ReactorState;
}

const CORE = { x: 260, y: 150 };

const MODULES = [
  { key: "VOICE", x: 150, y: 68, labelY: 46, anchor: "middle" as const },
  { key: "BRAIN", x: 260, y: 46, labelY: 26, anchor: "middle" as const },
  { key: "MEMORY", x: 372, y: 68, labelY: 46, anchor: "middle" as const },
  { key: "TOOLS", x: 104, y: 150, labelY: 146, anchor: "end" as const, labelX: 88 },
  { key: "AGENTS", x: 416, y: 150, labelY: 146, anchor: "start" as const, labelX: 432 },
  { key: "COMPUTER", x: 162, y: 240, labelY: 264, anchor: "middle" as const },
  { key: "SECURITY", x: 358, y: 240, labelY: 264, anchor: "middle" as const },
];

const accentFor: Record<ReactorState, string> = {
  idle: "#00F2FF",
  listening: "#00F2FF",
  thinking: "#3B82F6",
  speaking: "#00FF9D",
  processing: "#7DD3FC",
  offline: "#5B7185",
  error: "#FB7185",
};

function Cube({ x, y, accent }: { x: number; y: number; accent: string }) {
  const s = 9;
  return (
    <g>
      <rect x={x - s} y={y - s} width={s * 2} height={s * 2} fill="rgba(0,242,255,0.07)" stroke={accent} strokeOpacity="0.75" strokeWidth="0.8" />
      <path d={`M${x - s} ${y - s} l6 -6 h${s * 2} l-6 6`} fill="none" stroke={accent} strokeOpacity="0.45" strokeWidth="0.7" />
      <path d={`M${x + s} ${y - s} l6 -6 v${s * 2} l-6 6`} fill="none" stroke={accent} strokeOpacity="0.45" strokeWidth="0.7" />
    </g>
  );
}

/**
 * NOVA exploded view: the core orb with every subsystem module lifted off it,
 * each one tied back to the core by a dashed leader line.
 */
export function ExplodedView({ state }: ExplodedViewProps) {
  const accent = accentFor[state];
  const live = state !== "offline" && state !== "error";

  return (
    <section className="nexus-panel-soft min-w-0 rounded-2xl px-3.5 py-3" aria-label="Exploded view">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[10px] font-mono uppercase tracking-[0.22em] text-[#A9C8D5]">Exploded View</h3>
        <span className="hidden text-[8px] font-mono uppercase tracking-[0.18em] text-[#3F5567] sm:block">
          Core architecture
        </span>
      </div>

      <svg viewBox="0 0 520 290" className="mt-1 h-auto w-full" role="img" aria-label="AURIX core exploded architecture">
        <defs>
          <radialGradient id="exploded-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={accent} stopOpacity="0.55" />
            <stop offset="60%" stopColor={accent} stopOpacity="0.12" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* data rings */}
        <circle cx={CORE.x} cy={CORE.y} r="92" fill="none" stroke={accent} strokeOpacity="0.18" strokeWidth="0.8" strokeDasharray="2 7" />
        <g className="nexus-ring" style={{ animationDuration: "36s" }} opacity="0.5">
          <circle cx={CORE.x} cy={CORE.y} r="78" fill="none" stroke={accent} strokeOpacity="0.3" strokeWidth="1" strokeDasharray="40 26" />
        </g>

        {/* leader lines */}
        {MODULES.map((m) => {
          const dx = CORE.x - m.x;
          const dy = CORE.y - m.y;
          const len = Math.hypot(dx, dy) || 1;
          return (
            <line
              key={`lead-${m.key}`}
              x1={m.x}
              y1={m.y}
              x2={m.x + (dx / len) * (len - 58)}
              y2={m.y + (dy / len) * (len - 58)}
              stroke={accent}
              strokeOpacity="0.3"
              strokeWidth="0.7"
              strokeDasharray="3 4"
            />
          );
        })}

        {/* core */}
        <circle cx={CORE.x} cy={CORE.y} r="72" fill="url(#exploded-core)" />
        <circle cx={CORE.x} cy={CORE.y} r="46" fill="none" stroke={accent} strokeOpacity="0.6" strokeWidth="1.2" />
        <circle cx={CORE.x} cy={CORE.y} r="34" fill="rgba(5,8,13,0.85)" stroke={accent} strokeOpacity="0.9" strokeWidth="1.4" />
        <path
          d={`M${CORE.x} ${CORE.y - 16} l4 12 l12 4 l-12 4 l-4 12 l-4 -12 l-12 -4 l12 -4 Z`}
          fill="#EAFBFF"
          fillOpacity={live ? 0.9 : 0.45}
        />
        <text x={CORE.x} y={CORE.y + 26} textAnchor="middle" fill={accent} fontFamily="JetBrains Mono, ui-monospace, monospace" fontSize="8" letterSpacing="2">
          CORE
        </text>

        {/* modules + labels */}
        {MODULES.map((m) => (
          <g key={m.key}>
            <Cube x={m.x} y={m.y} accent={accent} />
            <text
              x={m.labelX ?? m.x}
              y={m.labelY}
              textAnchor={m.anchor}
              fill="#A9C8D5"
              fontFamily="JetBrains Mono, ui-monospace, monospace"
              fontSize="9.5"
              letterSpacing="1.6"
            >
              {m.key}
            </text>
          </g>
        ))}
      </svg>
    </section>
  );
}
