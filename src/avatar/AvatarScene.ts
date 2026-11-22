import * as THREE from "three";
import type { VoiceSessionState } from "../utils/voiceBus";
import { loadAvatarAsset } from "./AvatarLoader";
import { AvatarStateManager } from "./AvatarStateManager";
import { createEyes, type EyeRig } from "./EyeAnimation";
import { HeadMovement } from "./HeadMovement";
import {
  createHologramMaterials,
  createHologramUniforms,
  createScanMaterial,
} from "./HologramMaterial";
import { LipSyncController, type MouthMode } from "./LipSyncController";
import { buildNeuralHead, buildNeuralNeck } from "./NeuralMesh";
import { createGlowTexture, createHalo, createMotes, createProjectionBase } from "./ParticleSystem";
import {
  AVATAR_FRAME,
  AVATAR_QUALITY,
  AVATAR_STATE_HEX,
  type AvatarAnimationState,
  type AvatarQuality,
  type AvatarQualityPreset,
  type AvatarView,
} from "./configuration/avatar.config";

export interface AvatarSceneInput {
  voice: VoiceSessionState;
  level: number;
  reply: string;
  spokenChars: number;
  calm: boolean;
}

export interface AvatarSceneCallbacks {
  onFailure?: () => void;
  onAnimationState?: (state: AvatarAnimationState, mouth: MouthMode) => void;
}

/**
 * Owns the WebGL renderer, scene, camera and animation loop for the avatar.
 * React only forwards state changes; nothing here re-renders the component.
 */
export class AvatarScene {
  private readonly host: HTMLElement;
  private readonly preset: AvatarQualityPreset;
  private readonly callbacks: AvatarSceneCallbacks;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(34, 1, 0.1, 60);
  private uniforms: Record<string, THREE.IUniform> = createHologramUniforms(1);
  private readonly states = new AvatarStateManager();
  private readonly lipSync = new LipSyncController();
  private readonly headMovement = new HeadMovement();
  private readonly clock = new THREE.Clock();
  private readonly colorTarget = new THREE.Color(AVATAR_STATE_HEX.idle);
  private readonly pointer = { x: 0, y: 0 };
  private readonly glowTexture = createGlowTexture();

  private renderer: THREE.WebGLRenderer | null = null;
  private headGroup: THREE.Group | null = null;
  private eyes: EyeRig | null = null;
  private scan: THREE.Mesh | null = null;
  private scanMaterial: THREE.ShaderMaterial | null = null;
  private projection: ReturnType<typeof createProjectionBase> | null = null;
  private motes: ReturnType<typeof createMotes> | null = null;
  private halo: THREE.Sprite | null = null;
  private resizeObserver: ResizeObserver | null = null;

  private live: AvatarSceneInput = {
    voice: "idle",
    level: 0,
    reply: "",
    spokenChars: -1,
    calm: false,
  };
  private view: AvatarView = "front";
  private energy = 0;
  private raf = 0;
  private lastFrame = 0;
  private disposed = false;
  private lastAnimation: AvatarAnimationState | null = null;
  private lastMouth: MouthMode | null = null;

  constructor(host: HTMLElement, quality: AvatarQuality, callbacks: AvatarSceneCallbacks = {}) {
    this.host = host;
    this.preset = AVATAR_QUALITY[quality];
    this.callbacks = callbacks;

    try {
      this.renderer = new THREE.WebGLRenderer({
        antialias: this.preset.antialias,
        alpha: true,
        powerPreference: "high-performance",
      });
    } catch {
      this.renderer = null;
      callbacks.onFailure?.();
      return;
    }

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.preset.dpr));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.addEventListener("webglcontextlost", this.onContextLost);
    host.appendChild(this.renderer.domElement);

    this.camera.position.set(0, -0.2, 5);
    this.camera.lookAt(0, -0.2, 0);

    this.uniforms = createHologramUniforms(this.renderer.getPixelRatio());
    const materials = createHologramMaterials(this.uniforms);

    const head = buildNeuralHead(this.preset.u, this.preset.v, materials);
    const headGroup = new THREE.Group();
    headGroup.add(head.group, buildNeuralNeck(materials));
    this.headGroup = headGroup;
    this.scene.add(headGroup);
    this.eyes = createEyes(headGroup);

    // Scanning beam.
    this.scanMaterial = createScanMaterial();
    const scan = new THREE.Mesh(new THREE.PlaneGeometry(2.35, 0.16), this.scanMaterial);
    scan.position.set(0, 0.1, 0.92);
    scan.renderOrder = 4;
    this.scan = scan;
    headGroup.add(scan);

    // Projection base + ambient particles.
    this.projection = createProjectionBase();
    this.scene.add(this.projection.group);
    this.motes = createMotes(this.preset.motes, this.glowTexture);
    this.scene.add(this.motes.points);
    if (this.preset.glow) {
      this.halo = createHalo(this.glowTexture);
      this.scene.add(this.halo);
    }

    this.resize();
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(host);
    }
    host.addEventListener("pointermove", this.onPointerMove);
    host.addEventListener("pointerleave", this.onPointerLeave);
    document.addEventListener("visibilitychange", this.onVisibility);

    this.lastFrame = performance.now();
    this.raf = requestAnimationFrame(this.tick);

    // Optional GLB replacement; the procedural face stays if it is absent.
    void loadAvatarAsset().then((asset) => {
      if (!asset || this.disposed || !this.headGroup) return;
      this.headGroup.visible = false;
      this.scene.add(asset.object);
    });
  }

  setInput(patch: Partial<AvatarSceneInput>): void {
    this.live = { ...this.live, ...patch };
  }

  setView(view: AvatarView): void {
    this.view = view;
  }

  dispose(): void {
    this.disposed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.resizeObserver?.disconnect();
    this.host.removeEventListener("pointermove", this.onPointerMove);
    this.host.removeEventListener("pointerleave", this.onPointerLeave);
    document.removeEventListener("visibilitychange", this.onVisibility);
    if (this.renderer) {
      this.renderer.domElement.removeEventListener("webglcontextlost", this.onContextLost);
    }
    this.scene.traverse((object) => {
      const node = object as unknown as {
        geometry?: THREE.BufferGeometry;
        material?: THREE.Material | THREE.Material[];
      };
      node.geometry?.dispose();
      if (Array.isArray(node.material)) node.material.forEach((material) => material.dispose());
      else node.material?.dispose();
    });
    this.glowTexture.dispose();
    if (this.renderer) {
      this.renderer.dispose();
      if (this.renderer.domElement.parentElement === this.host) {
        this.host.removeChild(this.renderer.domElement);
      }
      this.renderer = null;
    }
  }

  private onContextLost = (event: Event) => {
    event.preventDefault();
    this.callbacks.onFailure?.();
  };

  private onPointerMove = (event: PointerEvent) => {
    const rect = this.host.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
  };

  private onPointerLeave = () => {
    this.pointer.x = 0;
    this.pointer.y = 0;
  };

  private onVisibility = () => {
    if (this.disposed) return;
    if (document.hidden) {
      this.states.setPaused(true);
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.callbacks.onAnimationState?.("paused", this.lastMouth ?? "closed");
      return;
    }
    this.states.setPaused(false);
    this.clock.getDelta();
    this.lastFrame = performance.now();
    if (!this.raf) this.raf = requestAnimationFrame(this.tick);
  };

  private resize(): void {
    if (!this.renderer) return;
    const width = this.host.clientWidth;
    const height = this.host.clientHeight;
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    const fov = (this.camera.fov * Math.PI) / 180;
    const visibleHeight = Math.max(
      AVATAR_FRAME.headHeight / AVATAR_FRAME.heightFill,
      AVATAR_FRAME.headWidth / AVATAR_FRAME.widthFill / this.camera.aspect,
    );
    this.camera.position.z = visibleHeight / (2 * Math.tan(fov / 2));
    this.camera.updateProjectionMatrix();
  }

  private tick = () => {
    this.raf = requestAnimationFrame(this.tick);
    const renderer = this.renderer;
    const headGroup = this.headGroup;
    if (!renderer || !headGroup) return;

    const now = performance.now();
    const minDelta = 1000 / this.preset.fps;
    if (now - this.lastFrame < minDelta - 1) return;
    const dt = Math.min(0.06, (now - this.lastFrame) / 1000) || 0.016;
    this.lastFrame = now;
    const time = this.clock.getElapsedTime();

    const input = this.live;
    const animation = this.states.resolve(input.voice, now);
    const speaking = input.voice === "speaking";
    const listening = input.voice === "listening";
    const still = input.calm;

    // Energy: microphone level, plus a calm pulse while thinking.
    const targetEnergy =
      animation === "thinking"
        ? 0.42 + 0.18 * Math.sin(time * 2.4)
        : Math.max(0, Math.min(1, input.level));
    this.energy += (targetEnergy - this.energy) * Math.min(1, dt * 8);

    const mouth = this.lipSync.update(dt, time, {
      speaking,
      listening,
      reply: input.reply,
      spokenChars: input.spokenChars,
      level: this.energy,
    });
    this.uniforms.uOpen.value = mouth.open;
    this.uniforms.uWide.value = mouth.wide;
    this.uniforms.uRound.value = mouth.round;
    this.uniforms.uEnergy.value = this.energy;
    this.uniforms.uTime.value = time;

    this.colorTarget.set(AVATAR_STATE_HEX[animation]);
    const color = this.uniforms.uColor.value as THREE.Color;
    color.lerp(this.colorTarget, Math.min(1, dt * 4));
    this.eyes?.setColor(color);

    this.headMovement.update(headGroup, dt, time, {
      view: this.view,
      pointer: this.pointer,
      speaking,
      energy: this.energy,
      calm: still,
    });
    this.eyes?.update(dt, time, {
      energy: this.energy,
      speaking,
      listening,
      calm: still,
    });

    this.projection?.update(this.energy, time, still);
    this.motes?.update(dt, still);
    if (this.halo) {
      (this.halo.material as THREE.SpriteMaterial).opacity = 0.3 + this.energy * 0.25;
    }

    if (this.scan && this.scanMaterial) {
      this.scan.visible = this.preset.scan && !still;
      if (!still) {
        this.scan.position.y = 0.95 - ((time * 0.3) % 2.3);
        this.scanMaterial.uniforms.uOpacity.value = 0.24 + 0.08 * Math.sin(time * 2.1);
      }
    }

    renderer.render(this.scene, this.camera);

    if (this.lastAnimation !== animation || this.lastMouth !== mouth.mode) {
      this.lastAnimation = animation;
      this.lastMouth = mouth.mode;
      this.callbacks.onAnimationState?.(animation, mouth.mode);
    }
  };
}
