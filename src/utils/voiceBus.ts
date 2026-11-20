import { useSyncExternalStore } from "react";

export type VoiceSessionState = "idle" | "listening" | "processing" | "speaking" | "error";

export type MicPermission = "granted" | "denied" | "prompt" | "unknown";

export interface VoiceSnapshot {
  state: VoiceSessionState;
  /** Live microphone energy 0..1 while recording. */
  level: number;
  transcript: string;
  reply: string;
  detail: string;
  micPermission: MicPermission;
  muted: boolean;
}

const INITIAL: VoiceSnapshot = {
  state: "idle",
  level: 0,
  transcript: "",
  reply: "",
  detail: "SYSTEM READY",
  micPermission: "unknown",
  muted: false,
};

let snapshot: VoiceSnapshot = INITIAL;
const listeners = new Set<(value: VoiceSnapshot) => void>();

export function getVoiceSnapshot(): VoiceSnapshot {
  return snapshot;
}

/** Publishes the current voice session so the cockpit reactor can follow it. */
export function publishVoice(patch: Partial<VoiceSnapshot>): void {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((listener) => listener(snapshot));
}

function subscribe(listener: (value: VoiceSnapshot) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useVoiceSnapshot(): VoiceSnapshot {
  return useSyncExternalStore(subscribe, getVoiceSnapshot, getVoiceSnapshot);
}
