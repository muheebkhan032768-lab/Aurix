import React from "react";
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, Pause, Play, Video, X } from "lucide-react";

interface CameraPreviewDockProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  position: "right" | "left";
  minimized: boolean;
  paused: boolean;
  active: boolean;
  secondsLeft: number | null;
  onMove: (position: "right" | "left") => void;
  onMinimize: () => void;
  onMaximize: () => void;
  onPause: () => void;
  onResume: () => void;
  onClose: () => void;
}

/**
 * Floating camera preview: ~1/8 of the viewport, right side by default, movable
 * to the left, aspect-correct (never stretched), with a permanent live-camera
 * indicator — including while minimized.
 */
export function CameraPreviewDock({
  videoRef,
  position,
  minimized,
  paused,
  active,
  secondsLeft,
  onMove,
  onMinimize,
  onMaximize,
  onPause,
  onResume,
  onClose,
}: CameraPreviewDockProps) {
  const sideClass = position === "right" ? "right-3 sm:right-5" : "left-3 sm:left-5";

  if (minimized) {
    return (
      <div className={`fixed bottom-24 z-40 ${sideClass} transition-all duration-300`}>
        <div className="nexus-panel flex items-center gap-2 rounded-2xl px-3 py-2 shadow-[0_18px_50px_rgba(0,0,0,0.55)]">
          <span className={`h-2 w-2 rounded-full ${active && !paused ? "animate-pulse bg-rose-400" : "bg-amber-400"}`} />
          <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#A9C8D5]">
            {paused ? "Camera paused" : active ? "Camera live" : "Camera off"}
          </span>
          <button type="button" onClick={onMaximize} aria-label="Maximize camera preview" className="rounded-lg p-1 text-[#00D9FF] hover:bg-white/5 cursor-pointer">
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={onClose} aria-label="Close camera" className="rounded-lg p-1 text-rose-300 hover:bg-rose-500/10 cursor-pointer">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`fixed top-24 z-40 ${sideClass} w-[clamp(240px,32vw,480px)] transition-all duration-300`}
      style={{ maxWidth: "calc(100vw - 1.5rem)" }}
    >
      <div className="nexus-panel overflow-hidden rounded-2xl border-[#00D9FF]/25 shadow-[0_22px_60px_rgba(0,0,0,0.6)]">
        <div className="relative bg-black">
          <video ref={videoRef} playsInline muted className="aspect-video w-full object-contain" />
          <div className="pointer-events-none absolute left-2 top-2 flex items-center gap-1.5 rounded-full bg-black/65 px-2 py-1 text-[9px] font-mono uppercase tracking-[0.14em]">
            <span className={`h-1.5 w-1.5 rounded-full ${active && !paused ? "animate-pulse bg-rose-400" : "bg-amber-400"}`} />
            <span className={active && !paused ? "text-rose-300" : "text-amber-300"}>
              {paused ? "Paused" : active ? "Camera live" : "Camera off"}
            </span>
          </div>
          {secondsLeft !== null && (
            <div className="pointer-events-none absolute right-2 top-2 rounded-full bg-black/65 px-2 py-1 text-[9px] font-mono text-[#A9C8D5]">
              auto-minimize {secondsLeft}s
            </div>
          )}
          {paused && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/55">
              <button type="button" onClick={onResume} className="inline-flex items-center gap-1.5 rounded-xl bg-[#00D9FF] px-3 py-2 text-[11px] font-semibold text-[#05080D] cursor-pointer">
                <Play className="h-3.5 w-3.5" /> Resume camera
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-1 border-t border-white/5 bg-[#05080D]/70 px-1.5 py-1.5">
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => onMove("left")}
              aria-label="Move preview left"
              title="Move left"
              className={`rounded-lg p-1.5 hover:bg-white/5 cursor-pointer ${position === "left" ? "text-[#00D9FF]" : "text-[#5B7185]"}`}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onMove("right")}
              aria-label="Move preview right"
              title="Move right"
              className={`rounded-lg p-1.5 hover:bg-white/5 cursor-pointer ${position === "right" ? "text-[#00D9FF]" : "text-[#5B7185]"}`}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
            {paused ? (
              <button type="button" onClick={onResume} aria-label="Resume camera" title="Resume camera" className="rounded-lg p-1.5 text-emerald-300 hover:bg-white/5 cursor-pointer">
                <Play className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button type="button" onClick={onPause} aria-label="Pause camera" title="Pause camera" className="rounded-lg p-1.5 text-[#A9C8D5] hover:bg-white/5 cursor-pointer">
                <Pause className="h-3.5 w-3.5" />
              </button>
            )}
            <button type="button" onClick={onMinimize} aria-label="Minimize camera preview" title="Minimize" className="rounded-lg p-1.5 text-[#A9C8D5] hover:bg-white/5 cursor-pointer">
              <Minimize2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-0.5">
            <span className="hidden items-center gap-1 px-1 text-[9px] font-mono uppercase tracking-[0.12em] text-[#5B7185] sm:flex">
              <Video className="h-3 w-3" /> preview
            </span>
            <button type="button" onClick={onClose} aria-label="Close camera" title="Close camera" className="rounded-lg p-1.5 text-rose-300 hover:bg-rose-500/10 cursor-pointer">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
