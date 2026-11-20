import React from "react";
import type { ReactorState } from "./CockpitReactor";

interface BlueprintSchematicsProps {
  state: ReactorState;
  accent?: string;
}

const nodes = Array.from({ length: 6 }, (_, i) => i);

/**
 * NOVA-style orthographic strip: front / side / top schematic views of the
 * same core that drives the holographic stage. Pure decoration — the live
 * state comes from the reactor and only changes stroke emphasis.
 */
export function BlueprintSchematics({ state, accent = "#00F2FF" }: BlueprintSchematicsProps) {
  const live = state !== "offline" && state !== "error";
  const coreOpacity = live ? 0.9 : 0.4;

  return (
    <div className="grid grid-cols-3 gap-2 border-t border-dashed border-[#00F2FF]/15 pt-2">
      {(
        [
          { key: "front", label: "FRONT VIEW" },
          { key: "side", label: "SIDE VIEW" },
          { key: "top", label: "TOP VIEW" },
        ] as const
      ).map((view) => (
        <div key={view.key} className="flex flex-col items-center gap-1">
          <svg viewBox="0 0 120 100" className="h-16 w-full max-w-[120px]" aria-hidden="true">
            {view.key === "front" && (
              <g>
                <circle cx="60" cy="50" r="38" fill="none" stroke={accent} strokeOpacity="0.35" strokeWidth="0.8" />
                <circle cx="60" cy="50" r="30" fill="none" stroke={accent} strokeOpacity="0.55" strokeWidth="0.7" strokeDasharray="3 4" />
                {nodes.map((i) => {
                  const angle = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
                  return (
                    <g key={i}>
                      <line
                        x1={60 + Math.cos(angle) * 30}
                        y1={50 + Math.sin(angle) * 30}
                        x2={60 + Math.cos(angle) * 42}
                        y2={50 + Math.sin(angle) * 42}
                        stroke={accent}
                        strokeOpacity="0.35"
                        strokeWidth="0.6"
                      />
                      <rect
                        x={60 + Math.cos(angle) * 42 - 3}
                        y={50 + Math.sin(angle) * 42 - 3}
                        width="6"
                        height="6"
                        fill="none"
                        stroke={accent}
                        strokeOpacity="0.6"
                        strokeWidth="0.7"
                      />
                    </g>
                  );
                })}
                <circle cx="60" cy="50" r="13" fill={accent} fillOpacity={coreOpacity * 0.18} stroke={accent} strokeOpacity={coreOpacity} strokeWidth="0.9" />
              </g>
            )}

            {view.key === "side" && (
              <g>
                <ellipse cx="60" cy="50" rx="44" ry="17" fill="none" stroke={accent} strokeOpacity="0.5" strokeWidth="0.8" />
                <ellipse cx="60" cy="50" rx="17" ry="38" fill="none" stroke={accent} strokeOpacity="0.3" strokeWidth="0.7" strokeDasharray="3 4" />
                <line x1="16" y1="50" x2="104" y2="50" stroke={accent} strokeOpacity="0.2" strokeWidth="0.6" />
                <line x1="60" y1="6" x2="60" y2="94" stroke={accent} strokeOpacity="0.2" strokeWidth="0.6" />
                <circle cx="60" cy="50" r="11" fill={accent} fillOpacity={coreOpacity * 0.18} stroke={accent} strokeOpacity={coreOpacity} strokeWidth="0.9" />
                <circle cx="104" cy="50" r="2.4" fill={accent} fillOpacity={coreOpacity} />
                <circle cx="16" cy="50" r="2.4" fill={accent} fillOpacity={coreOpacity} />
              </g>
            )}

            {view.key === "top" && (
              <g>
                {nodes.map((i) => {
                  const angle = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
                  const x = 60 + Math.cos(angle) * 36;
                  const y = 50 + Math.sin(angle) * 36;
                  return (
                    <g key={i}>
                      <line x1="60" y1="50" x2={x} y2={y} stroke={accent} strokeOpacity="0.3" strokeWidth="0.6" />
                      <rect x={x - 4} y={y - 4} width="8" height="8" fill="none" stroke={accent} strokeOpacity="0.65" strokeWidth="0.8" />
                    </g>
                  );
                })}
                <circle cx="60" cy="50" r="40" fill="none" stroke={accent} strokeOpacity="0.25" strokeWidth="0.7" strokeDasharray="2 5" />
                <circle cx="60" cy="50" r="12" fill={accent} fillOpacity={coreOpacity * 0.18} stroke={accent} strokeOpacity={coreOpacity} strokeWidth="0.9" />
              </g>
            )}
          </svg>
          <span className="text-[8px] font-mono uppercase tracking-[0.2em] text-[#5B7185]">{view.label}</span>
        </div>
      ))}

      <div className="col-span-3 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-dashed border-[#00F2FF]/10 pt-1.5 sm:grid-cols-4">
        {["BRAIN COGNITION", "MEMORY BANK", "AGENTS / TOOLS", "SECURITY IFACE"].map((label) => (
          <span key={label} className="blueprint-legend">
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
