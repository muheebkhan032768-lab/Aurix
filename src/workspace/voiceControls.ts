export interface VoiceControls {
  start: () => void;
  stop: () => void;
  interrupt: () => void;
  open: () => void;
  toggleWake: () => void;
}

let controls: VoiceControls | null = null;

/** Registered by the single global VoiceCommandSystem instance. */
export function registerVoiceControls(next: VoiceControls | null): void {
  controls = next;
}

export function getVoiceControls(): VoiceControls | null {
  return controls;
}
