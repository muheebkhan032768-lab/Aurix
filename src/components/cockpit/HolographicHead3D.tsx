import React, { useCallback, useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { AvatarScene } from "../../avatar/AvatarScene";
import type { MouthMode } from "../../avatar/LipSyncController";
import { VISEME_LABEL } from "../../utils/visemes";
import type { VoiceSessionState } from "../../utils/voiceBus";
import {
  AVATAR_STATE_HEX,
  AVATAR_STATE_LABEL,
  AVATAR_VIEWS,
  AVATAR_VIEW_LABEL,
  type AvatarAnimationState,
  type AvatarQuality,
  type AvatarView,
} from "../../avatar/configuration/avatar.config";
import { HolographicFace } from "./HolographicFace";

export type { AvatarQuality, AvatarView } from "../../avatar/configuration/avatar.config";

interface HolographicHead3DProps {
  state: VoiceSessionState;
  /** Live microphone energy 0..1. */
  level: number;
  /** The line AURIX is speaking right now. */
  reply: string;
  /** Character offset inside `reply` currently being voiced, -1 when silent. */
  spokenChars: number;
  /** ECO / reduced-motion: keep the hologram, stop the continuous motion. */
  calm?: boolean;
  quality?: AvatarQuality;
}

const VOICE_TO_ANIMATION: Record<VoiceSessionState, AvatarAnimationState> = {
  idle: "idle",
  listening: "listening",
  processing: "thinking",
  speaking: "speaking",
  error: "error",
};

/**
 * React host for the AURIX holographic head.
 *
 * All rendering lives in src/avatar (AvatarScene and its modules); this
 * component only forwards voice state, the selected inspection view and the
 * quality preset, and draws the HUD on top of the canvas.
 */
export function HolographicHead3D({
  state,
  level,
  reply,
  spokenChars,
  calm = false,
  quality = "balanced",
}: HolographicHead3DProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLElement | null>(null);
  const sceneRef = useRef<AvatarScene | null>(null);

  const [view, setView] = useState<AvatarView>("front");
  const [failed, setFailed] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [animationState, setAnimationState] = useState<AvatarAnimationState>(VOICE_TO_ANIMATION[state]);
  const [mouthMode, setMouthMode] = useState<MouthMode>("closed");

  // One scene per quality preset; a preset change rebuilds the lattice.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    setFailed(false);
    const scene = new AvatarScene(host, quality, {
      onFailure: () => setFailed(true),
      onAnimationState: (next, mouth) => {
        setAnimationState(next);
        setMouthMode(mouth);
      },
    });
    sceneRef.current = scene;
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, [quality]);

  useEffect(() => {
    sceneRef.current?.setInput({ voice: state, level, reply, spokenChars, calm });
  }, [state, level, reply, spokenChars, calm]);

  useEffect(() => {
    sceneRef.current?.setView(view);
  }, [view]);

  useEffect(() => {
    const onFullscreenChange = () => setFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    if (document.fullscreenElement === stage) {
      void document.exitFullscreen?.().catch(() => {});
      return;
    }
    void stage.requestFullscreen?.().catch(() => {});
  }, []);

  const accent = AVATAR_STATE_HEX[animationState];
  const speaking = state === "speaking";
  const energy = Math.max(0, Math.min(1, speaking ? Math.max(level, 0.42) : level));
  const visemeLabel = speaking && mouthMode === "tracked" ? "LIVE" : VISEME_LABEL.rest;

  return (
    <section
      ref={stageRef}
      className="aurix-avatar-stage nexus-panel nexus-stage relative h-[clamp(520px,72vh,900px)] w-full overflow-hidden rounded-2xl"
      aria-label="AURIX holographic neural head"
      data-testid="holographic-face"
      data-voice-state={state}
      data-animation-state={animationState}
      data-viseme={visemeLabel}
      data-mouth={mouthMode}
      data-spoken-chars={spokenChars}
      data-avatar-view={view}
    >
      <div className="nexus-grid pointer-events-none absolute inset-0" aria-hidden="true" />
      <span className="nexus-bracket left-2 top-2 border-l border-t" aria-hidden="true" />
      <span className="nexus-bracket right-2 top-2 border-r border-t" aria-hidden="true" />
      <span className="nexus-bracket bottom-2 left-2 border-b border-l" aria-hidden="true" />
      <span className="nexus-bracket bottom-2 right-2 border-b border-r" aria-hidden="true" />

      {failed ? (
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <div className="w-full max-w-[280px]">
            <HolographicFace state={state} level={level} reply={reply} spokenChars={spokenChars} calm={calm} />
            <p className="mt-2 text-center text-[9px] font-mono uppercase tracking-[0.16em] text-[#5B7185]">
              WebGL unavailable · flat hologram fallback
            </p>
          </div>
        </div>
      ) : (
        <div ref={hostRef} className="absolute inset-0" aria-hidden="true" />
      )}

      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-3 sm:p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[9px] font-mono uppercase tracking-[0.3em] text-[#00F2FF]/80">AURIX</p>
            <p className="mt-0.5 truncate text-[8px] font-mono uppercase tracking-[0.18em] text-[#5B7185]">
              Personal AI assistant · {AVATAR_VIEW_LABEL[view]}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[8px] font-mono uppercase tracking-[0.16em]"
              style={{ borderColor: `${accent}55`, color: accent }}
            >
              <span className="h-1 w-1 rounded-full" style={{ background: accent }} />
              {AVATAR_STATE_LABEL[animationState]}
            </span>
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={fullscreen ? "Exit full screen avatar" : "Show avatar full screen"}
              aria-pressed={fullscreen}
              className="pointer-events-auto rounded-md border border-[#00D9FF]/20 bg-[#05080D]/70 p-1 text-[#5B7185] hover:text-[#00D9FF] cursor-pointer"
            >
              {fullscreen ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[8px] font-mono uppercase tracking-[0.18em] text-[#3F5567]">
              mouth · {mouthMode === "tracked" ? "viseme sync" : mouthMode === "audio-fallback" ? "audio fallback" : "closed"}
            </p>
            <span className="mt-1 flex h-3 items-end gap-[2px]" aria-hidden="true">
              {Array.from({ length: 12 }).map((_, i) => (
                <span
                  key={i}
                  className="w-[2px] rounded-full"
                  style={{
                    height: `${20 + Math.max(energy, 0.08) * (i % 4 === 0 ? 100 : 60)}%`,
                    background: accent,
                    opacity: 0.3 + Math.max(energy, 0.08) * 0.6,
                  }}
                />
              ))}
            </span>
          </div>

          <div
            className="pointer-events-auto flex items-center rounded-lg border border-[#00D9FF]/15 bg-[#05080D]/70 p-0.5"
            role="group"
            aria-label="Avatar view"
          >
            {AVATAR_VIEWS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setView(option.id)}
                aria-pressed={view === option.id}
                className={`rounded-md px-2 py-1 text-[9px] font-mono uppercase tracking-[0.12em] transition-colors cursor-pointer ${
                  view === option.id ? "bg-[#00D9FF]/15 text-[#00D9FF]" : "text-[#5B7185] hover:text-[#A9C8D5]"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="text-right">
            <p className="text-[8px] font-mono uppercase tracking-[0.18em] text-[#00D9FF]/60">Powered by</p>
            <p className="text-[9px] font-display uppercase tracking-[0.2em] text-[#E8C877]">AM VEYRONIX</p>
          </div>
        </div>
      </div>
    </section>
  );
}
