import type { ReactNode } from "react";
import type { CoreNode, OrthoViewSpec } from "./data";
import { BLUEPRINT_MODULES, CORE_NODES, EXPLODED_PARTS, FLOW_STEPS } from "./data";

const CORNERS = [
  "-left-px -top-px border-l border-t",
  "-right-px -top-px border-r border-t",
  "-left-px -bottom-px border-l border-b",
  "-right-px -bottom-px border-r border-b",
];

function hexPoints(cx: number, cy: number, r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    return `${(cx + r * Math.cos(angle)).toFixed(1)},${(cy + r * Math.sin(angle)).toFixed(1)}`;
  }).join(" ");
}

export function BlueprintPanel({
  title,
  tag,
  children,
  className = "",
}: {
  title: string;
  tag?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`relative rounded-[3px] border border-[#A78BFA]/20 bg-[#101018]/80 ${className}`}
    >
      {CORNERS.map((corner) => (
        <span
          key={corner}
          aria-hidden="true"
          className={`pointer-events-none absolute h-2.5 w-2.5 border-[#A78BFA]/60 ${corner}`}
        />
      ))}
      <header className="flex items-center justify-between gap-2 border-b border-[#A78BFA]/15 px-2.5 py-1.5">
        <h2 className="text-[9px] font-semibold uppercase tracking-[0.22em] text-[#C4B5FD]">
          {title}
        </h2>
        {tag ? (
          <span className="truncate text-[8px] uppercase tracking-[0.16em] text-[#7C7890]">
            {tag}
          </span>
        ) : null}
      </header>
      <div className="p-2.5">{children}</div>
    </section>
  );
}

const ORTHO_NODES: Record<OrthoViewSpec["id"], number[]> = {
  front: [0, 60, 120, 180, 240, 300],
  side: [30, 150, 270],
  top: [45, 135, 225, 315],
};

export function OrthographicView({ view }: { view: OrthoViewSpec }) {
  const nodes = ORTHO_NODES[view.id];
  const gradientId = `ortho-core-${view.id}`;

  return (
    <figure className="rounded-[2px] border border-[#A78BFA]/15 bg-[#0E0E16]/70 p-1.5">
      <svg
        viewBox="0 0 200 200"
        className="h-auto w-full"
        role="img"
        aria-label={`${view.label} schematic`}
      >
        <defs>
          <radialGradient id={gradientId}>
            <stop offset="0%" stopColor="#eafcff" />
            <stop offset="45%" stopColor="#5ff0ff" />
            <stop offset="100%" stopColor="#0092b3" stopOpacity="0.25" />
          </radialGradient>
        </defs>

        <g stroke="#A78BFA" strokeOpacity="0.12" strokeDasharray="3 6">
          <line x1="100" y1="10" x2="100" y2="190" />
          <line x1="10" y1="100" x2="190" y2="100" />
        </g>

        <circle cx="100" cy="100" r="72" fill="none" stroke="#A78BFA" strokeOpacity="0.3" />
        <circle
          cx="100"
          cy="100"
          r="56"
          fill="none"
          stroke="#A78BFA"
          strokeOpacity="0.16"
          strokeDasharray="2 6"
        />

        {view.id === "top" && (
          <>
            <circle cx="100" cy="100" r="40" fill="none" stroke="#A78BFA" strokeOpacity="0.2" />
            <circle
              cx="100"
              cy="100"
              r="24"
              fill="none"
              stroke="#A78BFA"
              strokeOpacity="0.25"
              strokeDasharray="1 5"
            />
          </>
        )}

        {view.id === "side" && (
          <rect
            x="84"
            y="52"
            width="32"
            height="96"
            rx="16"
            fill="none"
            stroke="#A78BFA"
            strokeOpacity="0.22"
            strokeDasharray="4 4"
          />
        )}

        {nodes.map((deg) => {
          const rad = (deg * Math.PI) / 180;
          const x = 100 + 56 * Math.cos(rad);
          const y = 100 + 56 * Math.sin(rad);
          return (
            <g key={deg}>
              <polygon
                points={hexPoints(x, y, 9)}
                fill="#0E0E16"
                stroke="#A78BFA"
                strokeOpacity="0.55"
              />
              <circle cx={x} cy={y} r="2" fill="#7ef9ff" />
            </g>
          );
        })}

        <circle
          cx="100"
          cy="100"
          r="17"
          fill={`url(#${gradientId})`}
          className="blueprint-pulse"
        />
        <circle cx="100" cy="100" r="4.5" fill="#f2feff" />

        <g stroke="#A78BFA" strokeOpacity="0.45">
          <line x1="34" y1="182" x2="166" y2="182" />
          <line x1="34" y1="178" x2="34" y2="186" />
          <line x1="166" y1="178" x2="166" y2="186" />
        </g>
      </svg>
      <figcaption className="mt-1 flex items-center justify-between gap-2 px-0.5 text-[8px] uppercase tracking-[0.18em]">
        <span className="text-[#DDD6FE]">{view.label}</span>
        <span className="text-[#7C7890]">{view.meta}</span>
      </figcaption>
    </figure>
  );
}

function CoreLabel({
  node,
  align,
  className,
}: {
  node: CoreNode;
  align: "left" | "center" | "right";
  className: string;
}) {
  const textAlign =
    align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  const lineAlign = align === "right" ? "ml-auto" : align === "center" ? "mx-auto" : "";

  return (
    <div className={`max-w-[10rem] ${textAlign} ${className}`}>
      <div className="bg-[#0E0E16]/70 px-1 text-[9px] font-semibold uppercase leading-tight tracking-[0.16em] text-[#DDD6FE]">
        {node.label}
      </div>
      <div className="mt-0.5 px-1 text-[8px] uppercase tracking-[0.14em] text-[#8B87A0]">
        {node.detail}
      </div>
      <div className={`mt-1 h-px w-8 bg-[#A78BFA]/40 ${lineAlign}`} />
    </div>
  );
}

export function CoreDiagram() {
  const angles = [-90, -30, 30, 90, 150, 210];

  return (
    <div>
      <div className="relative mx-auto aspect-square w-full max-w-[540px]">
        <svg viewBox="0 0 600 600" className="absolute inset-0 h-full w-full">
          <defs>
            <radialGradient id="core-halo">
              <stop offset="0%" stopColor="#d8fdff" stopOpacity="0.95" />
              <stop offset="32%" stopColor="#A78BFA" stopOpacity="0.6" />
              <stop offset="62%" stopColor="#0096c7" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#0096c7" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="core-body">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="38%" stopColor="#b8fbff" />
              <stop offset="78%" stopColor="#22d3ee" />
              <stop offset="100%" stopColor="#0e7490" />
            </radialGradient>
          </defs>

          <circle cx="300" cy="300" r="252" fill="none" stroke="#A78BFA" strokeOpacity="0.16" />
          <circle
            cx="300"
            cy="300"
            r="246"
            fill="none"
            stroke="#A78BFA"
            strokeOpacity="0.08"
            strokeDasharray="1 7"
          />
          <g className="blueprint-orbit">
            <circle
              cx="300"
              cy="300"
              r="214"
              fill="none"
              stroke="#A78BFA"
              strokeOpacity="0.22"
              strokeDasharray="2 12"
            />
          </g>
          <g className="blueprint-orbit-reverse">
            <circle
              cx="300"
              cy="300"
              r="176"
              fill="none"
              stroke="#22D3EE"
              strokeOpacity="0.28"
              strokeDasharray="18 10"
            />
          </g>
          <circle cx="300" cy="300" r="140" fill="none" stroke="#A78BFA" strokeOpacity="0.14" />
          <circle
            cx="300"
            cy="300"
            r="96"
            fill="none"
            stroke="#A78BFA"
            strokeOpacity="0.2"
            strokeDasharray="3 9"
          />

          {Array.from({ length: 36 }, (_, i) => {
            const a = (i * 10 * Math.PI) / 180;
            const inner = 236;
            const outer = i % 3 === 0 ? 252 : 245;
            return (
              <line
                key={i}
                x1={300 + inner * Math.cos(a)}
                y1={300 + inner * Math.sin(a)}
                x2={300 + outer * Math.cos(a)}
                y2={300 + outer * Math.sin(a)}
                stroke="#A78BFA"
                strokeOpacity={i % 3 === 0 ? 0.4 : 0.18}
              />
            );
          })}

          <circle cx="300" cy="300" r="130" fill="url(#core-halo)" className="blueprint-pulse" />
          <circle cx="300" cy="300" r="44" fill="url(#core-body)" />
          <g stroke="#eafcff" strokeOpacity="0.45" fill="none">
            <ellipse cx="300" cy="300" rx="44" ry="16" />
            <ellipse cx="300" cy="300" rx="44" ry="30" strokeOpacity="0.22" />
            <ellipse cx="300" cy="300" rx="16" ry="44" />
            <ellipse cx="300" cy="300" rx="30" ry="44" strokeOpacity="0.22" />
          </g>
          <circle cx="300" cy="300" r="44" fill="none" stroke="#eafcff" strokeOpacity="0.7" />

          {angles.map((deg) => {
            const a = (deg * Math.PI) / 180;
            const nx = 300 + 190 * Math.cos(a);
            const ny = 300 + 190 * Math.sin(a);
            const lx = 300 + 232 * Math.cos(a);
            const ly = 300 + 232 * Math.sin(a);
            return (
              <g key={deg}>
                <line
                  x1={300 + 150 * Math.cos(a)}
                  y1={300 + 150 * Math.sin(a)}
                  x2={nx}
                  y2={ny}
                  stroke="#A78BFA"
                  strokeOpacity="0.28"
                  strokeDasharray="4 5"
                />
                <line
                  x1={nx}
                  y1={ny}
                  x2={lx}
                  y2={ly}
                  stroke="#A78BFA"
                  strokeOpacity="0.35"
                />
                <polygon
                  points={hexPoints(nx, ny, 13)}
                  fill="#0E0E16"
                  stroke="#22D3EE"
                  strokeOpacity="0.75"
                />
                <circle cx={nx} cy={ny} r="3" fill="#9ff7ff" />
              </g>
            );
          })}

          <g fill="#7C7890" fontSize="8" letterSpacing="2">
            <text x="300" y="24" textAnchor="middle">
              Y+
            </text>
            <text x="300" y="590" textAnchor="middle">
              Y-
            </text>
            <text x="16" y="303">
              X-
            </text>
            <text x="566" y="303">
              X+
            </text>
          </g>
        </svg>

        <div className="pointer-events-none absolute inset-0 hidden grid-cols-3 grid-rows-3 gap-1 p-1 md:grid">
          <CoreLabel node={CORE_NODES[0]} align="left" className="self-start justify-self-start" />
          <CoreLabel node={CORE_NODES[1]} align="center" className="self-start justify-self-center" />
          <CoreLabel node={CORE_NODES[2]} align="right" className="self-start justify-self-end" />
          <CoreLabel node={CORE_NODES[3]} align="left" className="self-center justify-self-start" />
          <span aria-hidden="true" />
          <CoreLabel node={CORE_NODES[4]} align="right" className="self-center justify-self-end" />
          <CoreLabel node={CORE_NODES[5]} align="left" className="self-end justify-self-start" />
          <span aria-hidden="true" />
          <CoreLabel node={CORE_NODES[6]} align="right" className="self-end justify-self-end" />
        </div>
      </div>

      <ul className="mt-2 grid grid-cols-2 gap-1.5 md:hidden">
        {CORE_NODES.map((node) => (
          <li
            key={node.label}
            className="rounded-[2px] border border-[#A78BFA]/15 bg-[#0E0E16]/70 px-2 py-1"
          >
            <div className="text-[8px] font-semibold uppercase tracking-[0.14em] text-[#DDD6FE]">
              {node.label}
            </div>
            <div className="text-[7px] uppercase tracking-[0.12em] text-[#8B87A0]">
              {node.detail}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ExplodedDiagram() {
  const angles = [-90, -30, 30, 90, 150, 210];

  return (
    <div>
      <svg viewBox="0 0 240 210" className="h-auto w-full" role="img" aria-label="Exploded view">
        <defs>
          <radialGradient id="exploded-core">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="50%" stopColor="#6ff4ff" />
            <stop offset="100%" stopColor="#0e7490" stopOpacity="0.4" />
          </radialGradient>
        </defs>

        <ellipse
          cx="120"
          cy="105"
          rx="92"
          ry="58"
          fill="none"
          stroke="#A78BFA"
          strokeOpacity="0.18"
          strokeDasharray="3 7"
        />
        <circle cx="120" cy="105" r="30" fill="url(#exploded-core)" className="blueprint-pulse" />
        <circle cx="120" cy="105" r="30" fill="none" stroke="#F5F3FF" strokeOpacity="0.6" />

        {angles.map((deg, i) => {
          const a = (deg * Math.PI) / 180;
          const x = 120 + 74 * Math.cos(a);
          const y = 105 + 47 * Math.sin(a);
          const tx = 120 + 34 * Math.cos(a);
          const ty = 105 + 22 * Math.sin(a);
          return (
            <g key={deg}>
              <line
                x1={tx}
                y1={ty}
                x2={x}
                y2={y}
                stroke="#22D3EE"
                strokeOpacity="0.4"
                strokeDasharray="2 4"
              />
              <rect
                x={x - 7}
                y={y - 7}
                width="14"
                height="14"
                transform={`rotate(45 ${x} ${y})`}
                fill="#101018"
                stroke="#A78BFA"
                strokeOpacity="0.65"
              />
              <text x={x} y={y + 1.5} textAnchor="middle" fontSize="6" fill="#9ff7ff">
                {EXPLODED_PARTS[i].index}
              </text>
            </g>
          );
        })}
      </svg>

      <ul className="mt-2 divide-y divide-[#A78BFA]/10 border-t border-[#A78BFA]/10">
        {EXPLODED_PARTS.map((part) => (
          <li key={part.index} className="flex items-baseline gap-2 py-1">
            <span className="w-4 shrink-0 text-[8px] tracking-[0.16em] text-[#7C7890]">
              {part.index}
            </span>
            <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#DDD6FE]">
              {part.name}
            </span>
            <span className="ml-auto text-right text-[8px] uppercase tracking-[0.1em] text-[#8B87A0]">
              {part.detail}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SystemFlow() {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-stretch gap-1.5">
        {FLOW_STEPS.map((step, i) => (
          <div key={step.index} className="flex min-w-[8.5rem] flex-1 items-center gap-1.5">
            <div className="flex-1 rounded-[2px] border border-[#A78BFA]/20 bg-[#0E0E16]/70 px-2 py-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[8px] tracking-[0.2em] text-[#7C7890]">{step.index}</span>
                <span className="h-1 w-1 rounded-full bg-[#A78BFA]/70" />
              </div>
              <div className="mt-0.5 text-[9px] font-semibold uppercase leading-tight tracking-[0.14em] text-[#E9E5FF]">
                {step.label}
              </div>
              <div className="text-[8px] uppercase tracking-[0.1em] text-[#8B87A0]">
                {step.detail}
              </div>
            </div>
            {i < FLOW_STEPS.length - 1 && (
              <span aria-hidden="true" className="text-[10px] text-[#A78BFA]/50">
                →
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 rounded-[2px] border border-dashed border-[#A78BFA]/25 px-2 py-1 text-[8px] uppercase tracking-[0.16em] text-[#8B87A0]">
        <span aria-hidden="true" className="text-[#A78BFA]/70">
          ↺
        </span>
        <span>Feedback loop — output, memory and tool results return to brain and interface</span>
      </div>
    </div>
  );
}

export function ModuleTable() {
  return (
    <table className="w-full border-collapse text-left">
      <thead>
        <tr className="text-[8px] uppercase tracking-[0.2em] text-[#7C7890]">
          <th className="border-b border-[#A78BFA]/20 px-1.5 py-1.5 font-medium">Module</th>
          <th className="border-b border-[#A78BFA]/20 px-1.5 py-1.5 font-medium">Description</th>
          <th className="border-b border-[#A78BFA]/20 px-1.5 py-1.5 text-right font-medium">
            Type
          </th>
        </tr>
      </thead>
      <tbody>
        {BLUEPRINT_MODULES.map((module) => (
          <tr key={module.name} className="align-top transition-colors hover:bg-[#A78BFA]/[0.06]">
            <td className="whitespace-nowrap border-b border-[#A78BFA]/10 px-1.5 py-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#E9E5FF]">
              {module.name}
            </td>
            <td className="border-b border-[#A78BFA]/10 px-1.5 py-1.5 text-[9px] leading-relaxed text-[#A7A3B8]">
              {module.description}
            </td>
            <td className="border-b border-[#A78BFA]/10 px-1.5 py-1.5 text-right text-[8px] uppercase tracking-[0.12em] text-[#A78BFA]/70">
              {module.type}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
