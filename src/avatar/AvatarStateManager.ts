import type { VoiceSessionState } from "../utils/voiceBus";
import type { AvatarAnimationState } from "./configuration/avatar.config";

const VOICE_TO_AVATAR: Record<VoiceSessionState, AvatarAnimationState> = {
  idle: "idle",
  listening: "listening",
  processing: "thinking",
  speaking: "speaking",
  error: "error",
};

/**
 * Maps the voice session onto the avatar's own animation state.
 *
 * INTERRUPTED is produced when speech stops mid-sentence: the mouth closes at
 * once and the avatar holds a brief amber interrupt state before returning to
 * listening (or idle). PAUSED is set while the document is hidden, when the
 * render loop is suspended.
 */
export class AvatarStateManager {
  private paused = false;
  private wasSpeaking = false;
  private interruptedUntil = 0;

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  resolve(voice: VoiceSessionState, now: number): AvatarAnimationState {
    if (this.paused) return "paused";
    if (voice === "speaking") {
      this.wasSpeaking = true;
      this.interruptedUntil = 0;
      return "speaking";
    }
    if (this.wasSpeaking) {
      this.wasSpeaking = false;
      this.interruptedUntil = now + 900;
    }
    if (now < this.interruptedUntil) return "interrupted";
    return VOICE_TO_AVATAR[voice] ?? "idle";
  }
}
