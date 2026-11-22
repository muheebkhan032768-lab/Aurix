import * as THREE from "three";
import { hash2 } from "./FacialRig";

/**
 * Ambient hologram particles: the projection base, the halo behind the head
 * and the drifting motes. Everything is one Points object or one sprite, so
 * the whole scene stays inside a handful of draw calls.
 */

export function createGlowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.28, "rgba(190,250,255,0.5)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
  }
  return new THREE.CanvasTexture(canvas);
}

export interface ProjectionBase {
  group: THREE.Group;
  update: (energy: number, time: number, still: boolean) => void;
}

export function createProjectionBase(): ProjectionBase {
  const baseMaterial = new THREE.MeshBasicMaterial({
    color: "#00D9FF",
    transparent: true,
    opacity: 0.4,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.0035, 6, 96), baseMaterial);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -1.46;

  const dashPoints: THREE.Vector3[] = [];
  const segments = 72;
  for (let i = 0; i < segments; i += 1) {
    if (i % 2 === 1) continue;
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 0.7) / segments) * Math.PI * 2;
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

  const group = new THREE.Group();
  group.add(ring, dashRing);

  return {
    group,
    update(energy: number, time: number, still: boolean) {
      baseMaterial.opacity = 0.28 + energy * 0.35;
      const pulse = 1 + energy * 0.05 + (still ? 0 : Math.sin(time * 1.4) * 0.008);
      ring.scale.set(pulse, pulse, pulse);
      if (!still) dashRing.rotation.y = time * 0.14;
    },
  };
}

export function createHalo(texture: THREE.Texture): THREE.Sprite {
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      color: "#0FA8FF",
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  halo.scale.set(4.4, 4.4, 1);
  halo.position.set(0, 0.05, -0.9);
  return halo;
}

export interface Motes {
  points: THREE.Points;
  update: (dt: number, still: boolean) => void;
}

export function createMotes(count: number, texture: THREE.Texture): Motes {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const a = hash2(i, 1) * Math.PI * 2;
    const r = 0.85 + hash2(i, 2) * 1.15;
    positions[i * 3] = Math.cos(a) * r;
    positions[i * 3 + 1] = -1.5 + hash2(i, 3) * 2.8;
    positions[i * 3 + 2] = Math.sin(a) * r * 0.8;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: "#5FE7FF",
      size: 0.028,
      map: texture,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    }),
  );
  points.frustumCulled = false;

  return {
    points,
    update(dt: number, still: boolean) {
      if (still) return;
      const attr = geometry.getAttribute("position") as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i + 1] += dt * (0.04 + ((i / 3) % 5) * 0.008);
        if (arr[i + 1] > 1.35) arr[i + 1] = -1.6;
      }
      attr.needsUpdate = true;
    },
  };
}
