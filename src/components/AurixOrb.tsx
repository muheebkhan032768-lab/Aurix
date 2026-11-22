import { useMemo } from "react";

export type AurixOrbState = "idle" | "listening" | "thinking" | "speaking";

const STATE_LABEL: Record<AurixOrbState, string> = {
  idle: "Standby",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
};

export function AurixOrb({
  state = "idle",
  size = 168,
  showLabel = false,
  className = "",
}: {
  state?: AurixOrbState;
  size?: number;
  showLabel?: boolean;
  className?: string;
}) {
  const bars = useMemo(() => Array.from({ length: 9 }, (_, i) => i), []);

  return (
    <div className={`flex flex-col items-center gap-3 ${className}`}>
      <div
        className="aurix-orb"
        data-state={state}
        style={{ width: size, height: size }}
        role="img"
        aria-label={`AURIX ${STATE_LABEL[state].toLowerCase()} indicator`}
      >
        <div className="aurix-orb-halo" />
        <div className="aurix-orb-ring" style={{ inset: "-6%" }} />
        <div className="aurix-orb-ring" style={{ inset: "2%" }} />
        <div className="aurix-orb-core" />
        <div className="aurix-orb-sheen" />
        {state === "thinking" ? (
          <svg viewBox="0 0 100 100" className="absolute inset-[18%] animate-spin" style={{ animationDuration: "2.6s" }}>
            <circle
              cx="50"
              cy="50"
              r="46"
              fill="none"
              stroke="rgba(255,255,255,0.85)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray="70 220"
            />
          </svg>
        ) : (
          <div className="aurix-orb-bars relative z-10">
            {bars.map((i) => (
              <span key={i} />
            ))}
          </div>
        )}
      </div>
      {showLabel ? (
        <span className="text-[11px] font-medium uppercase tracking-[0.24em] text-[#6B6880] dark:text-slate-400">
          {STATE_LABEL[state]}
        </span>
      ) : null}
    </div>
  );
}
