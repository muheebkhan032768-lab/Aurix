import * as THREE from "three";
import { hash2, sampleHead, surfacePointAt } from "./FacialRig";

/**
 * The visible face: a connected neural lattice sampled from the sculpted head,
 * plus the facial contours (lips, nose bridge, nostril wings) that make the
 * features readable from every angle. All geometry is static BufferGeometry;
 * the shaders do the deformation, so the CPU only updates uniforms per frame.
 */

interface LatticeVertex {
  p: THREE.Vector3;
  upper: number;
  lower: number;
  jaw: number;
  roundW: number;
  seed: number;
}

function attributes(
  positions: number[],
  upper: number[],
  lower: number[],
  jaw: number[],
  roundW: number[],
  seed: number[],
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aUpper", new THREE.Float32BufferAttribute(upper, 1));
  geometry.setAttribute("aLower", new THREE.Float32BufferAttribute(lower, 1));
  geometry.setAttribute("aJaw", new THREE.Float32BufferAttribute(jaw, 1));
  geometry.setAttribute("aRoundW", new THREE.Float32BufferAttribute(roundW, 1));
  geometry.setAttribute("aSeed", new THREE.Float32BufferAttribute(seed, 1));
  return geometry;
}

function buildLattice(u: number, v: number): LatticeVertex[][] {
  const grid: LatticeVertex[][] = [];
  for (let j = 0; j <= v; j += 1) {
    const row: LatticeVertex[] = [];
    for (let i = 0; i <= u; i += 1) {
      const sample = sampleHead(i / u, j / v);
      const hi = i % u; // keeps the seam identical
      const jx = (hash2(hi, j) - 0.5) * 0.012;
      const jy = (hash2(hi + 31, j + 7) - 0.5) * 0.012;
      const jz = (hash2(hi + 11, j + 43) - 0.5) * 0.012;
      row.push({
        p: new THREE.Vector3(sample.p.x + jx, sample.p.y + jy, sample.p.z + jz),
        upper: sample.upper,
        lower: sample.lower,
        jaw: sample.jaw,
        roundW: sample.roundW,
        seed: hash2(hi + 3, j + 17),
      });
    }
    grid.push(row);
  }
  return grid;
}

function buildFeatureContours(): THREE.BufferGeometry {
  const positions: number[] = [];
  const upper: number[] = [];
  const lower: number[] = [];
  const jaw: number[] = [];
  const roundW: number[] = [];
  const seed: number[] = [];

  const push = (p: THREE.Vector3, w: { upper?: number; lower?: number; round?: number } = {}) => {
    positions.push(p.x, p.y, p.z);
    upper.push(w.upper ?? 0);
    lower.push(w.lower ?? 0);
    jaw.push(0);
    roundW.push(w.round ?? 0);
    seed.push(0.55);
  };
  const contour = (points: THREE.Vector3[], w: { upper?: number; lower?: number; round?: number }) => {
    for (let i = 0; i < points.length - 1; i += 1) {
      push(points[i], w);
      push(points[i + 1], w);
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

  // The mouth line itself, so the lips read as a closed mouth at rest.
  const mouthLine: THREE.Vector3[] = [];
  for (let i = 0; i <= 12; i += 1) {
    const t = i / 12;
    const x = (t * 2 - 1) * 0.108;
    const y = -0.433 + 0.004 * Math.cos((x / 0.108) * Math.PI);
    mouthLine.push(surfacePointAt(x, y).add(new THREE.Vector3(0, 0, 0.005)));
  }
  contour(mouthLine, {});

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

  return attributes(positions, upper, lower, jaw, roundW, seed);
}

export interface NeuralHead {
  group: THREE.Group;
  points: THREE.Points;
  lines: THREE.LineSegments;
  features: THREE.LineSegments;
}

export function buildNeuralHead(
  u: number,
  v: number,
  materials: { points: THREE.Material; lattice: THREE.Material; features: THREE.Material },
): NeuralHead {
  const grid = buildLattice(u, v);

  const pPos: number[] = [];
  const pUpper: number[] = [];
  const pLower: number[] = [];
  const pJaw: number[] = [];
  const pRound: number[] = [];
  const pSeed: number[] = [];
  for (let j = 0; j <= v; j += 1) {
    for (let i = 0; i <= u; i += 1) {
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
  const connect = (a: LatticeVertex, b: LatticeVertex) => {
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
  for (let j = 0; j <= v; j += 1) {
    for (let i = 0; i <= u; i += 1) {
      const drop = hash2(i + 71, j + 13);
      if (i < u && drop > 0.14) connect(grid[j][i], grid[j][i + 1]);
      if (j < v && drop > 0.14) connect(grid[j][i], grid[j + 1][i]);
      if (i < u && j < v && hash2(i + 5, j + 23) > 0.55) connect(grid[j][i], grid[j + 1][i + 1]);
      if (i < u - 1 && j < v && hash2(i + 41, j + 3) > 0.93) connect(grid[j][i], grid[j + 1][i + 2]);
    }
  }

  const points = new THREE.Points(
    attributes(pPos, pUpper, pLower, pJaw, pRound, pSeed),
    materials.points,
  );
  const lines = new THREE.LineSegments(
    attributes(lPos, lUpper, lLower, lJaw, lRound, lSeed),
    materials.lattice,
  );
  const features = new THREE.LineSegments(buildFeatureContours(), materials.features);
  points.frustumCulled = false;
  lines.frustumCulled = false;
  features.frustumCulled = false;
  points.renderOrder = 3;
  lines.renderOrder = 2;
  features.renderOrder = 3;

  const group = new THREE.Group();
  group.add(lines, points, features);
  return { group, points, lines, features };
}

/** Neck lattice — keeps the holographic silhouette from ending at the jaw. */
export function buildNeuralNeck(
  materials: { points: THREE.Material; lattice: THREE.Material },
): THREE.Group {
  const RINGS = 9;
  const SEGMENTS = 28;
  const positions: number[] = [];
  const seeds: number[] = [];
  const linePositions: number[] = [];
  const lineSeeds: number[] = [];
  const neckGrid: THREE.Vector3[][] = [];

  for (let r = 0; r <= RINGS; r += 1) {
    const t = r / RINGS;
    const y = -0.62 - t * 0.82;
    const radius = 0.25 + t * 0.12;
    const row: THREE.Vector3[] = [];
    for (let s = 0; s <= SEGMENTS; s += 1) {
      const a = (s / SEGMENTS) * Math.PI * 2;
      row.push(new THREE.Vector3(Math.cos(a) * radius, y, Math.sin(a) * radius * 0.85 - 0.02));
    }
    neckGrid.push(row);
  }

  const push = (v: THREE.Vector3, seed: number) => {
    positions.push(v.x, v.y, v.z);
    seeds.push(seed);
  };
  const connect = (a: THREE.Vector3, b: THREE.Vector3, seed: number) => {
    push(a, seed);
    push(b, seed + 0.5);
    linePositions.push(a.x, a.y, a.z, b.x, b.y, b.z);
    lineSeeds.push(seed, seed + 0.5);
  };
  for (let r = 0; r <= RINGS; r += 1) {
    for (let s = 0; s < SEGMENTS; s += 1) {
      connect(neckGrid[r][s], neckGrid[r][s + 1], hash2(r, s));
      if (r < RINGS) connect(neckGrid[r][s], neckGrid[r + 1][s], hash2(r + 9, s));
    }
  }

  const zeros = (length: number) => new Array(length).fill(0);
  const pointGeometry = attributes(
    positions,
    zeros(positions.length / 3),
    zeros(positions.length / 3),
    zeros(positions.length / 3),
    zeros(positions.length / 3),
    seeds,
  );
  const lineGeometry = attributes(
    linePositions,
    zeros(linePositions.length / 3),
    zeros(linePositions.length / 3),
    zeros(linePositions.length / 3),
    zeros(linePositions.length / 3),
    lineSeeds,
  );

  const points = new THREE.Points(pointGeometry, materials.points);
  const lines = new THREE.LineSegments(lineGeometry, materials.lattice);
  points.frustumCulled = false;
  lines.frustumCulled = false;

  const group = new THREE.Group();
  group.add(lines, points);
  return group;
}
