import * as THREE from "three";

/**
 * Procedural facial rig.
 *
 * The head is an ellipsoid sculpted with gaussian bumps (brow, eye sockets,
 * cheekbones, nose, lips, chin, ears). The same functions produce the mesh
 * vertices, the feature contours and the lip-sync weights, so the face stays
 * anatomically consistent from every viewing angle without an external asset.
 */

export function hash2(i: number, j: number): number {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export interface HeadSample {
  p: THREE.Vector3;
  /** Weight that lifts the upper lip when the mouth opens. */
  upper: number;
  /** Weight that drops the lower lip when the mouth opens. */
  lower: number;
  /** Weight that drops the jaw and chin. */
  jaw: number;
  /** Weight that rounds the lips for OO / OH shapes. */
  roundW: number;
}

/**
 * Sculpts the facial features onto a point that already sits on the head's
 * base ellipsoid. Shared by the mesh sampler and the surface probes so the
 * feature lines always land on the mesh itself.
 */
export function sculpt(p: THREE.Vector3): THREE.Vector3 {
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
  bump(0, -0.395, 0.575, 0.13, 0.032, 0.09, 0.034);
  bump(0, -0.472, 0.565, 0.12, 0.038, 0.09, 0.038);
  bump(0, -0.434, 0.585, 0.14, 0.016, 0.06, -0.042);
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
export function surfacePointAt(xFinal: number, y: number): THREE.Vector3 {
  const jawT = smoothstep(0.02, -0.8, y);
  const xb = xFinal / (1 - 0.44 * jawT);
  const zt = 1 - 0.1 * jawT;
  const r = 1 - (xb / 0.6) ** 2 - (y / 0.88) ** 2;
  const z = Math.sqrt(Math.max(r, 0.0004)) * 0.66 * 0.93 * zt;
  return sculpt(new THREE.Vector3(xb, y, z));
}

/**
 * One vertex of the head. The base is an ellipsoid; the face is then sculpted
 * so a single mesh reads as the same human head from the front, side and 3/4.
 */
export function sampleHead(u: number, v: number): HeadSample {
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
