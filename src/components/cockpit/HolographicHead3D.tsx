import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { VISEME_LABEL, VISEME_SHAPES, visemeAt, type Viseme } from "../../utils/visemes";
import type { VoiceSessionState } from "../../utils/voiceBus";
import { HolographicFace } from "./HolographicFace";

export type AvatarQuality = "eco" | "balanced" | "performance";
export type AvatarView = "front" | "three-quarter" | "left" | "right";

interface HolographicHead3DProps {
  state: VoiceSessionState;
  /** Live microphone energy 0..1. */
  level: number;
  /** The line DEX MADE is speaking right now. */
  reply: string;
  /** Character offset inside `reply` currently being voiced, -1 when silent. */
  spokenChars: number;
  /** ECO / reduced-motion: keep the hologram, stop the continuous motion. */
  calm?: boolean;
  quality?: AvatarQuality;
}

const STATE_HEX: Record<VoiceSessionState, string> = {
  idle: "#00D9FF",
  listening: "#22E7FF",
  processing: "#147DFF",
  thinking: "#147DFF",
  speaking: "#2FE9C6",
  error: "#FB7185",
};

const STATE_LABEL: Record<VoiceSessionState, string> = {
  idle: "STANDBY",
  listening: "LISTENING",
  processing: "PROCESSING",
  thinking: "THINKING",
  speaking: "SPEAKING",
  error: "ATTENTION",
};

const VIEWS: Array<{ id: AvatarView; label: string }> = [
  { id: "front", label: "Front" },
  { id: "three-quarter", label: "3/4" },
  { id: "left", label: "Left" },
  { id: "right", label: "Right" },
];

const VIEW_LABEL: Record<AvatarView, string> = {
  front: "Front view",
  "three-quarter": "Three-quarter view",
  left: "Left profile",
  right: "Right profile",
};

const VIEW_YAW: Record<AvatarView, number> = {
  front: 0,
  "three-quarter": -0.62,
  left: -1.18,
  right: 1.18,
};

const QUALITY: Record<AvatarQuality, { u: number; v: number; dpr: number; fps: number; motes: number; glow: boolean }> = {
  eco: { u: 52, v: 38, dpr: 1, fps: 30, motes: 50, glow: false },
  balanced: { u: 92, v: 66, dpr: 1.5, fps: 60, motes: 120, glow: true },
  performance: { u: 116, v: 84, dpr: 2, fps: 60, motes: 220, glow: true },
};

/* ------------------------------------------------------------------ */
/* Head geometry                                                       */
/* ------------------------------------------------------------------ */

function hash2(i: number, j: number): number {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

interface HeadSample {
  p: THREE.Vector3;
  upper: number;
  lower: number;
  jaw: number;
  roundW: number;
}

/**
 * Sculpts the facial features onto a point that already sits on the head's
 * base ellipsoid. Shared by the mesh sampler and the surface probes so the
 * feature lines always land on the mesh itself.
 */
function sculpt(p: THREE.Vector3): THREE.Vector3 {
  const bump = (
    cx: number,
    cy: number,
    cz: number,
    rx: number,
    ry: number,
    rz: number,
    az: number,
    ax = 0,
    ay = 0,
  ) => {
    const dx = (p.x - cx) / rx;
    const dy = (p.y - cy) / ry;
    const dz = (p.z - cz) / rz;
    const f = Math.exp(-(dx * dx + dy * dy + dz * dz) * 1.9);
    p.x += ax * f;
    p.y += ay * f;
    p.z += az * f;
  };

  // Forehead + brow ridge.
  bump(0, 0.42, 0.46, 0.34, 0.2, 0.24, 0.02);
  bump(-0.21, 0.235, 0.5, 0.17, 0.06, 0.18, 0.045);
  bump(0.21, 0.235, 0.5, 0.17, 0.06, 0.18, 0.045);
  // Eye sockets.
  bump(-0.235, 0.09, 0.5, 0.15, 0.1, 0.16, -0.058);
  bump(0.235, 0.09, 0.5, 0.15, 0.1, 0.16, -0.058);
  // Cheekbones.
  bump(-0.37, -0.1, 0.36, 0.17, 0.14, 0.2, 0.03, 0.045);
  bump(0.37, -0.1, 0.36, 0.17, 0.14, 0.2, 0.03, -0.045);
  // Nose: bridge, tip and wings.
  bump(0, 0.05, 0.55, 0.055, 0.2, 0.14, 0.105);
  bump(0, -0.235, 0.58, 0.06, 0.065, 0.1, 0.14);
  bump(-0.07, -0.265, 0.55, 0.045, 0.035, 0.05, 0.055);
  bump(0.07, -0.265, 0.55, 0.045, 0.035, 0.05, 0.055);
  // Lips and the crease between them.
  bump(0, -0.395, 0.575, 0.13, 0.032, 0.09, 0.026);
  bump(0, -0.472, 0.565, 0.12, 0.038, 0.09, 0.03);
  bump(0, -0.434, 0.585, 0.14, 0.016, 0.06, -0.032);
  // Chin.
  bump(0, -0.7, 0.42, 0.14, 0.1, 0.16, 0.075, 0, -0.01);
  // Temples pull in, ears push out.
  bump(-0.5, 0.26, 0.16, 0.12, 0.16, 0.2, 0, 0.028);
  bump(0.5, 0.26, 0.16, 0.12, 0.16, 0.2, 0, -0.028);
  bump(-0.575, -0.02, 0, 0.07, 0.13, 0.1, 0, -0.04);
  bump(0.575, -0.02, 0, 0.07, 0.13, 0.1, 0, 0.04);
  return p;
}

/** The front surface point for a final-space x/y, used for facial contours. */
function surfacePointAt(xFinal: number, y: number): THREE.Vector3 {
  const jawT = smoothstep(0.02, -0.8, y);
  const xb = xFinal / (1 - 0.44 * jawT);
  const zt = 1 - 0.1 * jawT;
  const r = 1 - (xb / 0.6) ** 2 - (y / 0.88) ** 2;
  const z = Math.sqrt(Math.max(r, 0.0004)) * 0.66 * 0.93 * zt;
  return sculpt(new THREE.Vector3(xb, y, z));
}

/**
 * One vertex of the head. The base is an ellipsoid; the face is then sculpted
 * with gaussian bumps (brow, sockets, cheekbones, nose, lips, chin, ears) so a
 * single mesh reads as the same human head from the front, side and 3/4.
 */
function sampleHead(u: number, v: number): HeadSample {
  const phi = u * Math.PI * 2;
  const theta = v * Math.PI;
  const sinT = Math.sin(theta);

  let x = sinT * Math.cos(phi) * 0.6;
  let y = Math.cos(theta) * 0.88;
  let z = sinT * Math.sin(phi) * 0.66;

  // The facial plane is flatter than the cranium.
  if (z > 0) z *= 0.93;

  // Jaw tapers into the chin.
  const jawT = smoothstep(0.02, -0.8, y);
  x *= 1 - 0.44 * jawT;
  z *= 1 - 0.1 * jawT;

  // Back of the skull keeps its volume; the forehead slopes back a little.
  if (z < 0) z *= 1 + 0.04 * smoothstep(-0.2, 0.6, Math.abs(y));
  if (z > 0) z *= 1 - 0.07 * smoothstep(0.32, 0.88, y);

  const p = sculpt(new THREE.Vector3(x, y, z));

  // Lip-sync weights: the shader moves these vertices, the CPU never does.
  const front = smoothstep(0.18, 0.52, p.z);
  const g = (cx: number, cy: number, sx: number, sy: number) =>
    Math.exp(-(((p.x - cx) / sx) ** 2 + ((p.y - cy) / sy) ** 2));

  return {
    p,
    upper: g(0, -0.392, 0.135, 0.042) * front,
    lower: g(0, -0.474, 0.125, 0.048) * front,
    jaw: g(0, -0.66, 0.3, 0.2) * smoothstep(-0.05, 0.42, p.z),
    roundW: g(0, -0.435, 0.175, 0.1) * front,
  };
}

/* ------------------------------------------------------------------ */
/* Shaders                                                             */
/* ------------------------------------------------------------------ */

const DEFORM = /* glsl */ `
uniform float uOpen;
uniform float uWide;
uniform float uRound;
uniform float uTime;
attribute float aUpper;
attribute float aLower;
attribute float aJaw;
attribute float aRoundW;
attribute float aSeed;

vec3 aurixDeform(vec3 p) {
  p.y += aUpper * uOpen * 0.055;
  p.y -= aLower * uOpen * 0.070;
  p.y -= aJaw * uOpen * 0.150;
  p.z += aJaw * uOpen * 0.020;
  p.x *= 1.0 - aRoundW * uRound * 0.20;
  p.x *= 1.0 + aRoundW * uWide * 0.09;
  p.z += aRoundW * uRound * 0.025;
  p.y += sin(uTime * 0.9 + p.y * 2.2 + aSeed * 3.0) * 0.0035;
  return p;
}
`;

const POINTS_VERT = /* glsl */ `
uniform float uSize;
uniform float uPixelRatio;
uniform float uEnergy;
varying float vGlow;
${DEFORM}

void main() {
  vec3 p = aurixDeform(position);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float flicker = 0.7 + 0.3 * sin(uTime * 2.1 + aSeed * 47.0);
  vGlow = flicker * (0.45 + 0.55 * smoothstep(-0.6, 0.9, p.z)) * (0.9 + uEnergy * 0.45);
  gl_PointSize = uSize * (0.55 + aSeed * 0.9) * uPixelRatio * (3.0 / max(0.2, -mv.z));
}
`;

const POINTS_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uAccent;
uniform float uOpacity;
varying float vGlow;

void main() {
  vec2 c = gl_PointCoord - vec2(0.5);
  float d = length(c);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.02, d);
  a *= a;
  vec3 col = mix(uColor, uAccent, smoothstep(0.35, 1.1, vGlow));
  gl_FragColor = vec4(col, a * uOpacity * (0.35 + 0.65 * vGlow));
}
`;

const LINES_VERT = /* glsl */ `
varying float vGlow;
${DEFORM}

void main() {
  vec3 p = aurixDeform(position);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  vGlow = 0.35 + 0.65 * smoothstep(-0.7, 0.9, p.z);
}
`;

const LINES_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vGlow;

void main() {
  gl_FragColor = vec4(uColor, uOpacity * vGlow);
}
`;

const SCAN_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SCAN_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vUv;

void main() {
  float edge = smoothstep(0.0, 0.14, vUv.x) * smoothstep(1.0, 0.86, vUv.x);
  float band = smoothstep(0.5, 0.0, abs(vUv.y - 0.5));
  gl_FragColor = vec4(uColor, edge * band * uOpacity);
}
`;

/* ------------------------------------------------------------------ */

export function HolographicHead3D({
  state,
  level,
  reply,
  spokenChars,
  calm = false,
  quality = "balanced",
}: HolographicHead3DProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const liveRef = useRef({ state, level, reply, spokenChars });
  const viewRef = useRef<AvatarView>("front");
  const calmRef = useRef(calm);
  const [view, setView] = useState<AvatarView>("front");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    liveRef.current = { state, level, reply, spokenChars };
  }, [state, level, reply, spokenChars]);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  useEffect(() => {
    calmRef.current = calm;
  }, [calm]);

  const viseme: Viseme = state === "speaking" && spokenChars >= 0 ? visemeAt(reply, spokenChars) : "rest";
  const speaking = state === "speaking";
  const mouthMode = speaking ? (spokenChars >= 0 ? "tracked" : "fallback") : "closed";
  const accent = STATE_HEX[state];

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const cfg = QUALITY[quality];
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: cfg.dpr <= 1.5, alpha: true, powerPreference: "high-performance" });
    } catch {
      setFailed(true);
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cfg.dpr));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 60);
    camera.position.set(0, -0.2, 5);
    camera.lookAt(0, -0.2, 0);

    const uniforms: Record<string, THREE.IUniform> = {
      uTime: { value: 0 },
      uOpen: { value: 0.02 },
      uWide: { value: 0.34 },
      uRound: { value: 0.08 },
      uEnergy: { value: 0 },
      uSize: { value: 5.4 },
      uPixelRatio: { value: renderer.getPixelRatio() },
      uOpacity: { value: 0.95 },
      uColor: { value: new THREE.Color(STATE_HEX.idle) },
      uAccent: { value: new THREE.Color("#B4FBFF") },
    };
    // Shares the same uniform objects, so one update drives both passes.
    const lineUniforms = { ...uniforms, uOpacity: { value: 0.5 } };

    const pointMaterial = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: POINTS_VERT,
      fragmentShader: POINTS_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const lineMaterial = new THREE.ShaderMaterial({
      uniforms: lineUniforms,
      vertexShader: LINES_VERT,
      fragmentShader: LINES_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    /* ---------------- head lattice ---------------- */
    const U = cfg.u;
    const V = cfg.v;
    const grid: Array<Array<{ p: THREE.Vector3; upper: number; lower: number; jaw: number; roundW: number; seed: number }>> = [];

    for (let j = 0; j <= V; j += 1) {
      const row: Array<{ p: THREE.Vector3; upper: number; lower: number; jaw: number; roundW: number; seed: number }> = [];
      for (let i = 0; i <= U; i += 1) {
        const s = sampleHead(i / U, j / V);
        const hi = i % U; // keeps the seam identical
        const jx = (hash2(hi, j) - 0.5) * 0.012;
        const jy = (hash2(hi + 31, j + 7) - 0.5) * 0.012;
        const jz = (hash2(hi + 11, j + 43) - 0.5) * 0.012;
        row.push({
          p: new THREE.Vector3(s.p.x + jx, s.p.y + jy, s.p.z + jz),
          upper: s.upper,
          lower: s.lower,
          jaw: s.jaw,
          roundW: s.roundW,
          seed: hash2(hi + 3, j + 17),
        });
      }
      grid.push(row);
    }

    const pPos: number[] = [];
    const pUpper: number[] = [];
    const pLower: number[] = [];
    const pJaw: number[] = [];
    const pRound: number[] = [];
    const pSeed: number[] = [];
    for (let j = 0; j <= V; j += 1) {
      for (let i = 0; i <= U; i += 1) {
        const vx = grid[j][i];
        pPos.push(vx.p.x, vx.p.y, vx.p.z);
        pUpper.push(vx.upper);
        pLower.push(vx.lower);
        pJaw.push(vx.jaw);
        pRound.push(vx.roundW);
        pSeed.push(vx.seed);
      }
    }

    const lPos: number[] = [];
    const lUpper: number[] = [];
    const lLower: number[] = [];
    const lJaw: number[] = [];
    const lRound: number[] = [];
    const lSeed: number[] = [];
    const connect = (a: (typeof grid)[number][number], b: (typeof grid)[number][number]) => {
      for (const vx of [a, b]) {
        lPos.push(vx.p.x, vx.p.y, vx.p.z);
        lUpper.push(vx.upper);
        lLower.push(vx.lower);
        lJaw.push(vx.jaw);
        lRound.push(vx.roundW);
        lSeed.push(vx.seed);
      }
    };
    // Organic neural lattice: most grid edges, some long-range filaments, and
    // gaps where the mesh thins out instead of reading as a clean globe.
    for (let j = 0; j <= V; j += 1) {
      for (let i = 0; i <= U; i += 1) {
        const drop = hash2(i + 71, j + 13);
        if (i < U && drop > 0.14) connect(grid[j][i], grid[j][i + 1]);
        if (j < V && drop > 0.14) connect(grid[j][i], grid[j + 1][i]);
        if (i < U && j < V && hash2(i + 5, j + 23) > 0.55) connect(grid[j][i], grid[j + 1][i + 1]);
        if (i < U - 1 && j < V && hash2(i + 41, j + 3) > 0.93) connect(grid[j][i], grid[j + 1][i + 2]);
      }
    }

    const headPointGeo = new THREE.BufferGeometry();
    headPointGeo.setAttribute("position", new THREE.Float32BufferAttribute(pPos, 3));
    headPointGeo.setAttribute("aUpper", new THREE.Float32BufferAttribute(pUpper, 1));
    headPointGeo.setAttribute("aLower", new THREE.Float32BufferAttribute(pLower, 1));
    headPointGeo.setAttribute("aJaw", new THREE.Float32BufferAttribute(pJaw, 1));
    headPointGeo.setAttribute("aRoundW", new THREE.Float32BufferAttribute(pRound, 1));
    headPointGeo.setAttribute("aSeed", new THREE.Float32BufferAttribute(pSeed, 1));

    const headLineGeo = new THREE.BufferGeometry();
    headLineGeo.setAttribute("position", new THREE.Float32BufferAttribute(lPos, 3));
    headLineGeo.setAttribute("aUpper", new THREE.Float32BufferAttribute(lUpper, 1));
    headLineGeo.setAttribute("aLower", new THREE.Float32BufferAttribute(lLower, 1));
    headLineGeo.setAttribute("aJaw", new THREE.Float32BufferAttribute(lJaw, 1));
    headLineGeo.setAttribute("aRoundW", new THREE.Float32BufferAttribute(lRound, 1));
    headLineGeo.setAttribute("aSeed", new THREE.Float32BufferAttribute(lSeed, 1));

    /* ---------------- facial contours ---------------- */
    const fPos: number[] = [];
    const fUpper: number[] = [];
    const fLower: number[] = [];
    const fJaw: number[] = [];
    const fRound: number[] = [];
    const fSeed: number[] = [];
    const pushFeature = (p: THREE.Vector3, w: { upper?: number; lower?: number; round?: number } = {}) => {
      fPos.push(p.x, p.y, p.z);
      fUpper.push(w.upper ?? 0);
      fLower.push(w.lower ?? 0);
      fJaw.push(0);
      fRound.push(w.round ?? 0);
      fSeed.push(0.55);
    };
    const contour = (points: THREE.Vector3[], w: { upper?: number; lower?: number; round?: number }) => {
      for (let i = 0; i < points.length - 1; i += 1) {
        pushFeature(points[i], w);
        pushFeature(points[i + 1], w);
      }
    };

    // Lips ride the same shader weights as the mesh, so they part on speech.
    const upperLip: THREE.Vector3[] = [];
    const lowerLip: THREE.Vector3[] = [];
    for (let i = 0; i <= 14; i += 1) {
      const t = i / 14;
      const x = (t * 2 - 1) * 0.115;
      const bow = (x / 0.115) ** 2;
      const upperY = -0.392 - 0.014 * bow + 0.006 * Math.cos((x / 0.115) * Math.PI);
      const lowerY = -0.474 + 0.016 * bow;
      upperLip.push(surfacePointAt(x, upperY).add(new THREE.Vector3(0, 0, 0.006)));
      lowerLip.push(surfacePointAt(x, lowerY).add(new THREE.Vector3(0, 0, 0.006)));
    }
    contour(upperLip, { upper: 1, round: 0.8 });
    contour(lowerLip, { lower: 1, round: 0.8 });

    // Nose bridge and nostril wings.
    const bridge: THREE.Vector3[] = [];
    for (let i = 0; i <= 8; i += 1) {
      const y = 0.12 - (i / 8) * 0.36;
      bridge.push(surfacePointAt(0, y).add(new THREE.Vector3(0, 0, 0.008)));
    }
    contour(bridge, {});
    for (const side of [-1, 1]) {
      const wing: THREE.Vector3[] = [];
      for (let i = 0; i <= 6; i += 1) {
        const a = (i / 6) * Math.PI;
        const x = side * (0.018 + 0.062 * Math.sin(a));
        const y = -0.262 - 0.018 * Math.cos(a);
        wing.push(surfacePointAt(x, y).add(new THREE.Vector3(0, 0, 0.006)));
      }
      contour(wing, {});
    }

    const featureGeo = new THREE.BufferGeometry();
    featureGeo.setAttribute("position", new THREE.Float32BufferAttribute(fPos, 3));
    featureGeo.setAttribute("aUpper", new THREE.Float32BufferAttribute(fUpper, 1));
    featureGeo.setAttribute("aLower", new THREE.Float32BufferAttribute(fLower, 1));
    featureGeo.setAttribute("aJaw", new THREE.Float32BufferAttribute(fJaw, 1));
    featureGeo.setAttribute("aRoundW", new THREE.Float32BufferAttribute(fRound, 1));
    featureGeo.setAttribute("aSeed", new THREE.Float32BufferAttribute(fSeed, 1));

    const featureMaterial = new THREE.ShaderMaterial({
      uniforms: { ...uniforms, uOpacity: { value: 0.95 } },
      vertexShader: LINES_VERT,
      fragmentShader: LINES_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const featureLines = new THREE.LineSegments(featureGeo, featureMaterial);
    featureLines.frustumCulled = false;
    featureLines.renderOrder = 3;

    /* ---------------- neck lattice ---------------- */
    const NECK_RINGS = 9;
    const NECK_SEG = 28;
    const nPos: number[] = [];
    const nSeed: number[] = [];
    const nUpper: number[] = [];
    const nLower: number[] = [];
    const nJaw: number[] = [];
    const nRound: number[] = [];
    const neckGrid: THREE.Vector3[][] = [];
    for (let r = 0; r <= NECK_RINGS; r += 1) {
      const t = r / NECK_RINGS;
      const y = -0.62 - t * 0.82;
      const radius = 0.25 + t * 0.22;
      const row: THREE.Vector3[] = [];
      for (let s = 0; s <= NECK_SEG; s += 1) {
        const a = (s / NECK_SEG) * Math.PI * 2;
        row.push(new THREE.Vector3(Math.cos(a) * radius, y, Math.sin(a) * radius * 0.85 - 0.02));
      }
      neckGrid.push(row);
    }
    const pushNeck = (v: THREE.Vector3, seed: number) => {
      nPos.push(v.x, v.y, v.z);
      nSeed.push(seed);
      nUpper.push(0);
      nLower.push(0);
      nJaw.push(0);
      nRound.push(0);
    };
    const neckLinePos: number[] = [];
    const neckLineSeed: number[] = [];
    const connectNeck = (a: THREE.Vector3, b: THREE.Vector3, seed: number) => {
      pushNeck(a, seed);
      pushNeck(b, seed + 0.5);
      neckLinePos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      neckLineSeed.push(seed, seed + 0.5);
    };
    for (let r = 0; r <= NECK_RINGS; r += 1) {
      for (let s = 0; s < NECK_SEG; s += 1) {
        connectNeck(neckGrid[r][s], neckGrid[r][s + 1], hash2(r, s));
        if (r < NECK_RINGS) connectNeck(neckGrid[r][s], neckGrid[r + 1][s], hash2(r + 9, s));
      }
    }

    const neckPointGeo = new THREE.BufferGeometry();
    neckPointGeo.setAttribute("position", new THREE.Float32BufferAttribute(nPos, 3));
    neckPointGeo.setAttribute("aUpper", new THREE.Float32BufferAttribute(nUpper, 1));
    neckPointGeo.setAttribute("aLower", new THREE.Float32BufferAttribute(nLower, 1));
    neckPointGeo.setAttribute("aJaw", new THREE.Float32BufferAttribute(nJaw, 1));
    neckPointGeo.setAttribute("aRoundW", new THREE.Float32BufferAttribute(nRound, 1));
    neckPointGeo.setAttribute("aSeed", new THREE.Float32BufferAttribute(nSeed, 1));

    const neckLineGeo = new THREE.BufferGeometry();
    neckLineGeo.setAttribute("position", new THREE.Float32BufferAttribute(neckLinePos, 3));
    neckLineGeo.setAttribute("aUpper", new THREE.Float32BufferAttribute(new Array(neckLinePos.length / 3).fill(0), 1));
    neckLineGeo.setAttribute("aLower", new THREE.Float32BufferAttribute(new Array(neckLinePos.length / 3).fill(0), 1));
    neckLineGeo.setAttribute("aJaw", new THREE.Float32BufferAttribute(new Array(neckLinePos.length / 3).fill(0), 1));
    neckLineGeo.setAttribute("aRoundW", new THREE.Float32BufferAttribute(new Array(neckLinePos.length / 3).fill(0), 1));
    neckLineGeo.setAttribute("aSeed", new THREE.Float32BufferAttribute(neckLineSeed, 1));

    const headGroup = new THREE.Group();
    const headPoints = new THREE.Points(headPointGeo, pointMaterial);
    const headLines = new THREE.LineSegments(headLineGeo, lineMaterial);
    headPoints.frustumCulled = false;
    headLines.frustumCulled = false;
    headPoints.renderOrder = 3;
    headLines.renderOrder = 2;
    headGroup.add(headLines, headPoints, featureLines);
    headGroup.add(new THREE.Points(neckPointGeo, pointMaterial), new THREE.LineSegments(neckLineGeo, lineMaterial));
    scene.add(headGroup);

    /* ---------------- eyes ---------------- */
    const eyeMaterial = new THREE.MeshBasicMaterial({
      color: STATE_HEX.idle,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const irisMaterial = new THREE.MeshBasicMaterial({
      color: "#9FF6FF",
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const pupilMaterial = new THREE.MeshBasicMaterial({ color: "#EAFDFF", transparent: true, opacity: 0.95 });
    const browMaterial = new THREE.LineBasicMaterial({
      color: "#7DE9FF",
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const eyeGeo = new THREE.TorusGeometry(0.066, 0.0042, 6, 32);
    const irisGeo = new THREE.RingGeometry(0.012, 0.04, 28);
    const pupilGeo = new THREE.SphereGeometry(0.016, 10, 10);
    const eyeGroups: THREE.Group[] = [];
    const pupils: THREE.Mesh[] = [];

    for (const side of [-1, 1]) {
      const g = new THREE.Group();
      g.position.set(side * 0.232, 0.095, 0.572);
      g.rotation.y = side * 0.26;

      const ring = new THREE.Mesh(eyeGeo, eyeMaterial);
      const iris = new THREE.Mesh(irisGeo, irisMaterial);
      iris.position.z = 0.003;
      const pupil = new THREE.Mesh(pupilGeo, pupilMaterial);
      pupil.position.z = 0.006;
      g.add(ring, iris, pupil);
      headGroup.add(g);
      eyeGroups.push(g);
      pupils.push(pupil);

      const brow = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(side * 0.325, 0.188, 0.545),
          new THREE.Vector3(side * 0.232, 0.208, 0.6),
          new THREE.Vector3(side * 0.145, 0.188, 0.552),
        ]),
        browMaterial,
      );
      headGroup.add(brow);
    }

    /* ---------------- scan beam ---------------- */
    const scanMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color("#BFFCFF") },
        uOpacity: { value: 0.3 },
      },
      vertexShader: SCAN_VERT,
      fragmentShader: SCAN_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const scan = new THREE.Mesh(new THREE.PlaneGeometry(2.35, 0.16), scanMaterial);
    scan.position.set(0, 0.1, 0.92);
    scan.renderOrder = 4;
    headGroup.add(scan);

    /* ---------------- projection base + glow ---------------- */
    const glowCanvas = document.createElement("canvas");
    glowCanvas.width = glowCanvas.height = 128;
    const gctx = glowCanvas.getContext("2d");
    if (gctx) {
      const grad = gctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      grad.addColorStop(0, "rgba(255,255,255,1)");
      grad.addColorStop(0.28, "rgba(190,250,255,0.5)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      gctx.fillStyle = grad;
      gctx.fillRect(0, 0, 128, 128);
    }
    const glowTexture = new THREE.CanvasTexture(glowCanvas);

    const baseMaterial = new THREE.MeshBasicMaterial({
      color: "#00D9FF",
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const baseRing = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.0035, 6, 96), baseMaterial);
    baseRing.rotation.x = Math.PI / 2;
    baseRing.position.y = -1.46;
    scene.add(baseRing);

    const dashPoints: THREE.Vector3[] = [];
    const dashSegments = 72;
    for (let i = 0; i < dashSegments; i += 1) {
      if (i % 2 === 1) continue;
      const a0 = (i / dashSegments) * Math.PI * 2;
      const a1 = ((i + 0.7) / dashSegments) * Math.PI * 2;
      dashPoints.push(
        new THREE.Vector3(Math.cos(a0) * 0.94, -1.46, Math.sin(a0) * 0.94),
        new THREE.Vector3(Math.cos(a1) * 0.94, -1.46, Math.sin(a1) * 0.94),
      );
    }
    const dashRing = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(dashPoints),
      new THREE.LineBasicMaterial({
        color: "#00D9FF",
        transparent: true,
        opacity: 0.22,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    scene.add(dashRing);

    let halo: THREE.Sprite | null = null;
    if (cfg.glow) {
      halo = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTexture,
          color: "#0FA8FF",
          transparent: true,
          opacity: 0.42,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      halo.scale.set(4.4, 4.4, 1);
      halo.position.set(0, 0.05, -0.9);
      scene.add(halo);
    }

    /* ---------------- drifting motes ---------------- */
    const motePositions = new Float32Array(cfg.motes * 3);
    for (let i = 0; i < cfg.motes; i += 1) {
      const a = hash2(i, 1) * Math.PI * 2;
      const r = 0.85 + hash2(i, 2) * 1.15;
      motePositions[i * 3] = Math.cos(a) * r;
      motePositions[i * 3 + 1] = -1.5 + hash2(i, 3) * 2.8;
      motePositions[i * 3 + 2] = Math.sin(a) * r * 0.8;
    }
    const moteGeo = new THREE.BufferGeometry();
    moteGeo.setAttribute("position", new THREE.BufferAttribute(motePositions, 3));
    const motes = new THREE.Points(
      moteGeo,
      new THREE.PointsMaterial({
        color: "#5FE7FF",
        size: 0.028,
        map: glowTexture,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    );
    motes.frustumCulled = false;
    scene.add(motes);

    /* ---------------- framing ---------------- */
    const resize = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      const fov = (camera.fov * Math.PI) / 180;
      const headHeight = 2.42; // head + neck
      const headWidth = 1.5;
      const visibleHeight = Math.max(headHeight / 0.96, headWidth / 0.62 / camera.aspect);
      camera.position.z = visibleHeight / (2 * Math.tan(fov / 2));
      camera.updateProjectionMatrix();
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);

    /* ---------------- pointer look ---------------- */
    const pointer = { x: 0, y: 0 };
    const onPointerMove = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    };
    const onPointerLeave = () => {
      pointer.x = 0;
      pointer.y = 0;
    };
    host.addEventListener("pointermove", onPointerMove);
    host.addEventListener("pointerleave", onPointerLeave);

    /* ---------------- animation ---------------- */
    const clock = new THREE.Clock();
    const colorTarget = new THREE.Color(STATE_HEX.idle);
    let energy = 0;
    let raf = 0;
    let lastFrame = performance.now();
    let nextBlink = 2.4;
    let blinkClock = -1;

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      if (cfg.fps < 60 && now - lastFrame < 1000 / cfg.fps - 1) return;
      const dt = Math.min(0.06, (now - lastFrame) / 1000) || 0.016;
      lastFrame = now;
      if (document.hidden) return;

      const t = clock.getElapsedTime();
      const live = liveRef.current;
      const speakingNow = live.state === "speaking";
      // The Gemini clip reports character progress; the device voice does not,
      // so fall back to a steady talk rhythm instead of a frozen mouth.
      const tracked = speakingNow && live.spokenChars >= 0;
      const shape = VISEME_SHAPES[tracked ? visemeAt(live.reply, live.spokenChars) : "rest"];
      const fallbackOpen = 0.16 + 0.3 * Math.abs(Math.sin(t * 8.4)) * (0.55 + 0.45 * Math.sin(t * 2.2));

      const targetEnergy = Math.max(0, Math.min(1, live.level));
      energy += (targetEnergy - energy) * Math.min(1, dt * 8);
      const targetOpen = tracked
        ? Math.max(0.1, shape.open)
        : speakingNow
          ? fallbackOpen
          : live.state === "listening"
            ? 0.02 + energy * 0.07
            : 0.015;
      uniforms.uOpen.value += (targetOpen - (uniforms.uOpen.value as number)) * Math.min(1, dt * 18);
      uniforms.uWide.value +=
        ((tracked ? shape.wide : 0.4) - (uniforms.uWide.value as number)) * Math.min(1, dt * 14);
      uniforms.uRound.value +=
        ((tracked ? shape.round : 0.2) - (uniforms.uRound.value as number)) * Math.min(1, dt * 14);
      uniforms.uEnergy.value = energy;
      uniforms.uTime.value = t;

      colorTarget.set(STATE_HEX[live.state]);
      (uniforms.uColor.value as THREE.Color).lerp(colorTarget, Math.min(1, dt * 4));
      eyeMaterial.color.copy(uniforms.uColor.value as THREE.Color);
      eyeMaterial.opacity = 0.7 + energy * 0.3 + (speakingNow ? 0.12 : 0);

      // Blink.
      if (blinkClock < 0 && t > nextBlink) blinkClock = 0;
      if (blinkClock >= 0) {
        blinkClock += dt;
        if (blinkClock > 0.17) {
          blinkClock = -1;
          nextBlink = t + 2.6 + Math.random() * 4.2;
        }
      }
      const blink = blinkClock >= 0 ? Math.sin((blinkClock / 0.17) * Math.PI) : 0;
      for (const g of eyeGroups) g.scale.y = 1 - blink * 0.9;
      for (const p of pupils) (p.material as THREE.MeshBasicMaterial).opacity = 0.95 - blink * 0.85;

      // Natural head motion: view angle, pointer parallax and a slow idle sway.
      const still = calmRef.current;
      const idleYaw = still ? 0 : Math.sin(t * 0.23) * 0.1;
      const idlePitch = still ? 0 : Math.sin(t * 0.37) * 0.035;
      const nod = speakingNow ? Math.sin(t * 3.4) * 0.012 * (0.4 + energy) : 0;
      const targetYaw = VIEW_YAW[viewRef.current] + idleYaw + pointer.x * 0.26;
      const targetPitch = idlePitch + pointer.y * -0.16 + nod;
      headGroup.rotation.y += (targetYaw - headGroup.rotation.y) * Math.min(1, dt * 3.2);
      headGroup.rotation.x += (targetPitch - headGroup.rotation.x) * Math.min(1, dt * 3.2);
      headGroup.position.y = still ? 0 : Math.sin(t * 0.6) * 0.008;

      // Scanning beam sweeps the face while the hologram is live.
      scan.visible = !still;
      if (!still) {
        scan.position.y = 0.95 - ((t * 0.3) % 2.3);
        scanMaterial.uniforms.uOpacity.value = 0.24 + 0.08 * Math.sin(t * 2.1);
      }

      // Base projection rings breathe with the voice.
      baseMaterial.opacity = 0.28 + energy * 0.35;
      const pulse = 1 + energy * 0.05 + (still ? 0 : Math.sin(t * 1.4) * 0.008);
      baseRing.scale.set(pulse, pulse, pulse);
      dashRing.rotation.y = still ? dashRing.rotation.y : t * 0.14;
      if (halo) (halo.material as THREE.SpriteMaterial).opacity = 0.3 + energy * 0.25;

      // Motes drift upward.
      if (!still) {
        const attr = moteGeo.getAttribute("position") as THREE.BufferAttribute;
        const arr = attr.array as Float32Array;
        for (let i = 0; i < arr.length; i += 3) {
          arr[i + 1] += dt * (0.04 + ((i / 3) % 5) * 0.008);
          if (arr[i + 1] > 1.35) arr[i + 1] = -1.6;
        }
        attr.needsUpdate = true;
      }

      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      host.removeEventListener("pointermove", onPointerMove);
      host.removeEventListener("pointerleave", onPointerLeave);
      scene.traverse((obj) => {
        const anyObj = obj as unknown as { geometry?: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[] };
        anyObj.geometry?.dispose();
        if (Array.isArray(anyObj.material)) anyObj.material.forEach((m) => m.dispose());
        else anyObj.material?.dispose();
      });
      glowTexture.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === host) host.removeChild(renderer.domElement);
    };
  }, [quality]);

  return (
    <section
      className="nexus-panel nexus-stage relative h-[clamp(440px,66vh,720px)] w-full overflow-hidden rounded-2xl"
      aria-label="DEX MADE holographic neural head"
      data-testid="holographic-face"
      data-voice-state={state}
      data-viseme={viseme}
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
          <div className="w-full max-w-[260px]">
            <HolographicFace state={state} level={level} reply={reply} spokenChars={spokenChars} calm={calm} />
          </div>
        </div>
      ) : (
        <div ref={hostRef} className="absolute inset-0" aria-hidden="true" />
      )}

      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-3 sm:p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[9px] font-mono uppercase tracking-[0.3em] text-[#00F2FF]/80">DEX MADE</p>
            <p className="mt-0.5 truncate text-[8px] font-mono uppercase tracking-[0.18em] text-[#5B7185]">
              Personal AI assistant · {VIEW_LABEL[view]}
            </p>
          </div>
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[8px] font-mono uppercase tracking-[0.16em]"
            style={{ borderColor: `${accent}55`, color: accent }}
          >
            <span className="h-1 w-1 rounded-full" style={{ background: accent }} />
            {STATE_LABEL[state]}
          </span>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[8px] font-mono uppercase tracking-[0.18em] text-[#3F5567]">
              viseme · {mouthMode === "fallback" ? "TALK" : VISEME_LABEL[viseme]}
            </p>
            <span className="mt-1 flex h-3 items-end gap-[2px]" aria-hidden="true">
              {Array.from({ length: 12 }).map((_, i) => (
                <span
                  key={i}
                  className="w-[2px] rounded-full"
                  style={{
                    height: `${20 + Math.max(energyFor(level, speaking), 0.08) * (i % 4 === 0 ? 100 : 60)}%`,
                    background: accent,
                    opacity: 0.3 + Math.max(energyFor(level, speaking), 0.08) * 0.6,
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
            {VIEWS.map((option) => (
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

function energyFor(level: number, speaking: boolean): number {
  return Math.max(0, Math.min(1, speaking ? Math.max(level, 0.42) : level));
}
