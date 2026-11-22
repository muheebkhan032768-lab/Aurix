import * as THREE from "three";

/**
 * Shader-driven hologram materials.
 *
 * The vertex shader receives the lip-sync weights as attributes and deforms
 * the geometry on the GPU, so a speaking face costs no CPU vertex work. The
 * same uniforms object is shared by every pass, which keeps one update per
 * frame in sync across points, lattice lines and facial contours.
 */

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

export function createHologramUniforms(pixelRatio: number): Record<string, THREE.IUniform> {
  return {
    uTime: { value: 0 },
    uOpen: { value: 0.02 },
    uWide: { value: 0.34 },
    uRound: { value: 0.08 },
    uEnergy: { value: 0 },
    uSize: { value: 5.4 },
    uPixelRatio: { value: pixelRatio },
    uOpacity: { value: 0.95 },
    uColor: { value: new THREE.Color("#00D9FF") },
    uAccent: { value: new THREE.Color("#B4FBFF") },
  };
}

function additiveMaterial(
  uniforms: Record<string, THREE.IUniform>,
  vertexShader: string,
  fragmentShader: string,
  opacity: number,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...uniforms, uOpacity: { value: opacity } },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

export function createHologramMaterials(base: Record<string, THREE.IUniform>) {
  return {
    points: additiveMaterial(base, POINTS_VERT, POINTS_FRAG, 0.95),
    lattice: additiveMaterial(base, LINES_VERT, LINES_FRAG, 0.5),
    features: additiveMaterial(base, LINES_VERT, LINES_FRAG, 0.95),
  };
}

export function createScanMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
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
}
