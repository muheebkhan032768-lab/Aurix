import * as THREE from "three";
import { AVATAR_VIEW_YAW, HEAD_MOTION, type AvatarView } from "./configuration/avatar.config";

export interface HeadMovementInput {
  view: AvatarView;
  pointer: { x: number; y: number };
  speaking: boolean;
  energy: number;
  calm: boolean;
}

function clamp(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, value));
}

/**
 * Subtle, realistic head motion: a slow idle sway, pointer parallax, a small
 * speaking nod and a touch of roll. Idle motion stays inside ±12° yaw,
 * ±6° pitch and ±3° roll; the view buttons are an explicit inspection
 * override for the front / 3-4 / profile renders.
 */
export class HeadMovement {
  update(target: THREE.Object3D, dt: number, time: number, input: HeadMovementInput): void {
    const still = input.calm;
    const idleYaw = still ? 0 : Math.sin(time * 0.23) * HEAD_MOTION.idleYaw;
    const idlePitch = still ? 0 : Math.sin(time * 0.37) * HEAD_MOTION.idlePitch;
    const nod = input.speaking ? Math.sin(time * 3.4) * 0.012 * (0.4 + input.energy) : 0;

    const targetYaw = AVATAR_VIEW_YAW[input.view] + idleYaw + clamp(input.pointer.x * HEAD_MOTION.pointerYaw, HEAD_MOTION.yaw);
    const targetPitch = clamp(idlePitch + input.pointer.y * -HEAD_MOTION.pointerPitch + nod, HEAD_MOTION.pitch);
    const targetRoll = clamp(Math.sin(time * 0.19) * 0.02 + input.pointer.x * 0.012, HEAD_MOTION.roll);

    const ease = Math.min(1, dt * HEAD_MOTION.follow);
    target.rotation.y += (targetYaw - target.rotation.y) * ease;
    target.rotation.x += (targetPitch - target.rotation.x) * ease;
    target.rotation.z += (targetRoll - target.rotation.z) * ease;
    target.position.y = still ? 0 : Math.sin(time * 0.6) * 0.008;
  }
}
