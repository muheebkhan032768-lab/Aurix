import React from "react";

export type CompanionVisualState =
  | "idle"
  | "listening"
  | "processing"
  | "thinking"
  | "speaking"
  | "error";

interface VoiceCompanionFigureProps {
  state: CompanionVisualState;
  caption?: string;
  open: boolean;
  onToggle: () => void;
}

const LABELS: Record<CompanionVisualState, string> = {
  idle: "Ready",
  listening: "Listening",
  processing: "Processing",
  thinking: "Thinking",
  speaking: "Speaking",
  error: "Needs attention",
};

const STATUS_STYLES: Record<CompanionVisualState, string> = {
  idle: "bg-slate-500",
  listening: "bg-[#06B6D4]",
  processing: "bg-[#D6AD60]",
  thinking: "bg-[#147DFF]",
  speaking: "bg-[#10B981]",
  error: "bg-rose-500",
};

/**
 * DEX MADE's on-screen presence: a small animated figure that shows whether it is
 * listening, thinking or speaking, and speaks the last reply back to you.
 */
export function VoiceCompanionFigure({ state, caption, open, onToggle }: VoiceCompanionFigureProps) {
  const active =
    state === "listening" || state === "speaking" || state === "processing" || state === "thinking";
  const bubble = caption?.trim();

  return (
    <div className="fixed bottom-5 right-4 sm:right-6 z-40 flex flex-col items-end gap-2 max-w-[calc(100vw-2rem)]">
      {bubble && !open && (
        <div
          role="status"
          aria-live="polite"
          className="max-w-[240px] rounded-2xl rounded-br-sm border border-emerald-500/30 bg-white/95 dark:bg-[#0F1724]/95 backdrop-blur-md px-3 py-2 text-[11px] leading-snug text-[#202938] dark:text-slate-200 shadow-lg shadow-emerald-900/10 line-clamp-3"
        >
          {bubble.length > 180 ? `${bubble.slice(0, 177)}…` : bubble}
        </div>
      )}

      <div className="flex items-center gap-2">
        <span
          className={`hidden sm:inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 dark:border-slate-700/80 bg-white/95 dark:bg-[#0F1724]/95 backdrop-blur px-2.5 py-1 text-[10px] font-semibold text-[#202938] dark:text-slate-200 shadow-sm`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${STATUS_STYLES[state]} ${active ? "animate-pulse" : ""}`} />
          DEX MADE · {LABELS[state]}
        </span>

        <button
          type="button"
          data-testid="voice-command-launcher"
          aria-label={open ? "Close voice command system" : "Open voice command system"}
          aria-expanded={open}
          onClick={onToggle}
          className="relative inline-flex items-center justify-center w-[68px] h-[68px] rounded-full cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#10B981]"
        >
          {state === "listening" && (
            <>
              <span
                className="companion-halo absolute inset-0 rounded-full border-2 border-[#06B6D4]/60"
                aria-hidden="true"
              />
              <span
                className="companion-halo is-delayed absolute inset-0 rounded-full border-2 border-[#06B6D4]/40"
                aria-hidden="true"
              />
            </>
          )}

          <span
            className="companion-orb relative flex items-center justify-center w-[62px] h-[62px] rounded-full border border-emerald-300/70 dark:border-emerald-400/40 shadow-lg shadow-emerald-500/25"
            style={{
              background:
                "radial-gradient(circle at 32% 26%, #6EE7B7 0%, #10B981 42%, #047857 100%)",
            }}
            aria-hidden="true"
          >
            <span
              className="absolute top-2.5 left-3 w-4 h-2.5 rounded-full bg-white/45 blur-[2px]"
              aria-hidden="true"
            />
            <span className="flex items-center gap-2.5">
              <span className="companion-eye w-2 h-2.5 rounded-full bg-[#04372A]" />
              <span className="companion-eye w-2 h-2.5 rounded-full bg-[#04372A]" />
            </span>
            <span
              className={`companion-mouth ${state === "speaking" ? "is-talking" : ""} absolute bottom-[15px] w-4 h-[5px] rounded-full bg-[#04372A]/85`}
            />
            {state === "error" && (
              <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-rose-500 border-2 border-white dark:border-[#0F1724]" />
            )}
          </span>
        </button>
      </div>
    </div>
  );
}
