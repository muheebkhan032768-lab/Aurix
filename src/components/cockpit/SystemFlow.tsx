import React from "react";
import { AppWindow, ArrowRight, BrainCircuit, FolderOpen, Mic, Monitor, MonitorPlay, User } from "lucide-react";
import type { VoiceSnapshot } from "../../utils/voiceBus";

interface SystemFlowProps {
  voiceState: VoiceSnapshot["state"];
}

const STAGES = [
  { key: "input", label: "USER INPUT", icon: User },
  { key: "voice", label: "VOICE", icon: Mic },
  { key: "brain", label: "BRAIN", icon: BrainCircuit },
  { key: "memory", label: "MEMORY / AGENTS", icon: FolderOpen },
  { key: "computer", label: "COMPUTER", icon: Monitor },
  { key: "output", label: "OUTPUT", icon: MonitorPlay },
  { key: "interface", label: "INTERFACE", icon: AppWindow },
] as const;

/** Which node lights up for the current voice pipeline stage. */
const ACTIVE_STAGE: Record<string, string | null> = {
  idle: null,
  listening: "voice",
  thinking: "brain",
  processing: "computer",
  speaking: "output",
  error: null,
};

/**
 * NOVA blueprint signal path: user → voice → brain → memory/agents →
 * computer → output. The active node follows the real voice session state.
 */
export function SystemFlow({ voiceState }: SystemFlowProps) {
  const active = ACTIVE_STAGE[voiceState] ?? null;

  return (
    <section className="nexus-panel-soft min-w-0 rounded-2xl px-3.5 py-3" aria-label="System flow">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[10px] font-mono uppercase tracking-[0.22em] text-slate-600 dark:text-[#A9C8D5]">System Flow</h3>
        <span className="text-[8px] font-mono uppercase tracking-[0.2em] text-[#3F5567]">Signal path</span>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-1 gap-y-1.5">
        {STAGES.map((stage, index) => {
          const Icon = stage.icon;
          const isActive = active === stage.key;
          return (
            <React.Fragment key={stage.key}>
              {index > 0 && (
                <span className="flex shrink-0 items-center gap-0.5 text-[#00F2FF]/35" aria-hidden="true">
                  <span className="h-px w-2 bg-current" />
                  <ArrowRight className="h-2.5 w-2.5" />
                </span>
              )}
              <div
                aria-current={isActive ? "step" : undefined}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2 py-1.5 transition-colors ${
                  isActive
                    ? "border-[#00FF9D]/60 bg-[#00FF9D]/10 text-[#C8FFE4]"
                    : "border-[#00F2FF]/15 bg-[#05080D]/50 text-slate-600 dark:text-[#94A8B8]"
                }`}
              >
                <Icon className={`h-3 w-3 ${isActive ? "text-[#00FF9D]" : "text-[#00F2FF]/70"}`} />
                <span className="text-[8px] font-mono uppercase tracking-[0.14em] whitespace-nowrap">{stage.label}</span>
                <span
                  className={`h-1 w-1 rounded-full ${isActive ? "bg-[#00FF9D] animate-pulse" : "bg-[#3F5567]"}`}
                  aria-hidden="true"
                />
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </section>
  );
}
