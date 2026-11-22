/**
 * AURIX holographic avatar configuration.
 *
 * One place for the quality presets, palette, motion limits and asset path so
 * the renderer, the dashboard HUD and the docs never drift apart.
 */

export type AvatarQuality = "eco" | "balanced" | "performance";

export type AvatarView = "front" | "three-quarter" | "left" | "right";

/** Animation states the avatar itself can be in. */
export type AvatarAnimationState =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "interrupted"
  | "error"
  | "paused";

export interface AvatarQualityPreset {
  /** Lattice resolution around the head. */
  u: number;
  /** Lattice resolution from crown to chin. */
  v: number;
  /** Maximum device pixel ratio. */
  dpr: number;
  /** Target frames per second. */
  fps: number;
  /** Ambient drifting particle count. */
  motes: number;
  /** Additive halo behind the head. */
  glow: boolean;
  /** Sweeping scan beam. */
  scan: boolean;
  /** MSAA on the WebGL context. */
  antialias: boolean;
}

/**
 * HIGH QUALITY = performance, PERFORMANCE MODE = eco.
 * Eco still renders the full face, just with a coarser lattice, no scan beam
 * and a 30 fps cap so an integrated GPU stays responsive.
 */
export const AVATAR_QUALITY: Record<AvatarQuality, AvatarQualityPreset> = {
  eco: { u: 52, v: 38, dpr: 1, fps: 30, motes: 50, glow: false, scan: false, antialias: false },
  balanced: { u: 92, v: 66, dpr: 1.5, fps: 60, motes: 120, glow: true, scan: true, antialias: true },
  performance: { u: 116, v: 84, dpr: 2, fps: 60, motes: 220, glow: true, scan: true, antialias: true },
};

export const AVATAR_STATE_HEX: Record<AvatarAnimationState, string> = {
  idle: "#00D9FF",
  listening: "#22E7FF",
  thinking: "#147DFF",
  speaking: "#2FE9C6",
  interrupted: "#FBBF24",
  error: "#FB7185",
  paused: "#5B7185",
};

export const AVATAR_STATE_LABEL: Record<AvatarAnimationState, string> = {
  idle: "STANDBY",
  listening: "LISTENING",
  thinking: "THINKING",
  speaking: "SPEAKING",
  interrupted: "INTERRUPTED",
  error: "ATTENTION",
  paused: "PAUSED",
};

export const AVATAR_VIEWS: Array<{ id: AvatarView; label: string }> = [
  { id: "front", label: "Front" },
  { id: "three-quarter", label: "3/4" },
  { id: "left", label: "Left" },
  { id: "right", label: "Right" },
];

export const AVATAR_VIEW_LABEL: Record<AvatarView, string> = {
  front: "Front view",
  "three-quarter": "Three-quarter view",
  left: "Left profile",
  right: "Right profile",
};

/** Inspection angles — the user asks for these views, so they exceed idle limits. */
export const AVATAR_VIEW_YAW: Record<AvatarView, number> = {
  front: 0,
  "three-quarter": -0.62,
  left: -1.18,
  right: 1.18,
};

/**
 * Natural head movement limits for the idle / speaking behaviour:
 * ±12° yaw, ±6° pitch, ±3° roll. Tuning values, not hard physical stops.
 */
export const HEAD_MOTION = {
  yaw: 0.21,
  pitch: 0.105,
  roll: 0.052,
  pointerYaw: 0.16,
  pointerPitch: 0.1,
  idleYaw: 0.09,
  idlePitch: 0.03,
  follow: 3.2,
};

/** Blink timing is randomised inside these bounds so it never ticks. */
export const BLINK = {
  minSeconds: 2.4,
  maxSeconds: 7.2,
  durationSeconds: 0.17,
};

/** Camera framing: keep the face large but never cropped. */
export const AVATAR_FRAME = {
  headHeight: 2.05,
  headWidth: 1.5,
  heightFill: 0.99,
  widthFill: 0.86,
};

/**
 * Optional replacement model. Drop a rigged GLB here and the loader will use
 * its vertices for the neural cloud instead of the procedural face. See
 * docs/AVATAR.md for the authoring contract.
 */
export const AVATAR_ASSET_PATH = "/assets/avatar/aurix-face.glb";
