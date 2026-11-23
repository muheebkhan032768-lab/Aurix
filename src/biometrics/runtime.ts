/**
 * Live sensor/session state shared by the DEX MADE status rail.
 *
 * Only facts that actually happened are set here: camera/mic tracks are
 * opened and closed by the engine code, and session state comes from the
 * server. The rail never infers a success it was not told about.
 */
import { useSyncExternalStore } from "react";

export type SensorState = "off" | "active" | "paused" | "error";

export interface AurixRuntimeState {
  serverOnline: boolean;
  session: "locked" | "unlocked";
  sessionMethod: string | null;
  camera: SensorState;
  mic: SensorState;
  faceAuthActive: boolean;
  voiceAuthActive: boolean;
  trainingMode: boolean;
  lastMemorySavedAt: string | null;
  lastMessage: string | null;
}

let state: AurixRuntimeState = {
  serverOnline: true,
  session: "locked",
  sessionMethod: null,
  camera: "off",
  mic: "off",
  faceAuthActive: false,
  voiceAuthActive: false,
  trainingMode: false,
  lastMemorySavedAt: null,
  lastMessage: null,
};

const listeners = new Set<() => void>();

export function patchRuntime(patch: Partial<AurixRuntimeState>): void {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

export function getRuntime(): AurixRuntimeState {
  return state;
}

let memoryTimer: number | null = null;

/** Shows "MEMORY SAVED" only right after a confirmed save. */
export function markMemorySaved(): void {
  patchRuntime({ lastMemorySavedAt: new Date().toISOString() });
  if (memoryTimer) window.clearTimeout(memoryTimer);
  memoryTimer = window.setTimeout(() => {
    patchRuntime({ lastMemorySavedAt: null });
  }, 7000);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAurixRuntime(): AurixRuntimeState {
  return useSyncExternalStore(subscribe, getRuntime, getRuntime);
}
