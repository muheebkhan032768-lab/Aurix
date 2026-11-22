import { VISEME_SHAPES, visemeAt, type Viseme } from "../utils/visemes";

/**
 * Lip-sync controller.
 *
 * The speech adapter reports how many characters of the reply are being voiced
 * right now. That character offset is mapped onto a viseme, and the viseme
 * drives the mouth uniforms. When a provider only gives playback position (no
 * phoneme data) the mode is reported as "audio-fallback": the mouth follows the
 * clip's progress and a talk rhythm, which is NOT phoneme-exact synchronisation.
 */
export type MouthMode = "tracked" | "audio-fallback" | "closed";

export interface LipSyncInput {
  speaking: boolean;
  listening: boolean;
  reply: string;
  spokenChars: number;
  level: number;
}

export interface LipSyncOutput {
  open: number;
  wide: number;
  round: number;
  viseme: Viseme;
  mode: MouthMode;
}

export class LipSyncController {
  private open = 0.02;
  private wide = 0.34;
  private round = 0.08;

  update(dt: number, time: number, input: LipSyncInput): LipSyncOutput {
    const tracked = input.speaking && input.spokenChars >= 0 && input.reply.length > 0;
    const viseme: Viseme = tracked ? visemeAt(input.reply, input.spokenChars) : "rest";
    const shape = VISEME_SHAPES[viseme];

    let targetOpen = 0.015;
    let targetWide = 0.34;
    let targetRound = 0.08;
    let mode: MouthMode = "closed";

    if (tracked) {
      mode = "tracked";
      targetOpen = Math.max(0.1, shape.open);
      targetWide = shape.wide;
      targetRound = shape.round;
    } else if (input.speaking) {
      // Amplitude / rhythm fallback: clearly a talk animation, not phonemes.
      mode = "audio-fallback";
      targetOpen = 0.16 + 0.3 * Math.abs(Math.sin(time * 8.4)) * (0.55 + 0.45 * Math.sin(time * 2.2));
      targetOpen *= 0.85 + Math.min(0.3, input.level * 0.4);
      targetWide = 0.4;
      targetRound = 0.2;
    } else if (input.listening) {
      // Listening keeps the mouth naturally closed.
      targetOpen = 0.015 + input.level * 0.03;
    }

    // Ease toward the target so shapes blend instead of snapping.
    this.open += (targetOpen - this.open) * Math.min(1, dt * 18);
    this.wide += (targetWide - this.wide) * Math.min(1, dt * 14);
    this.round += (targetRound - this.round) * Math.min(1, dt * 14);

    return { open: this.open, wide: this.wide, round: this.round, viseme, mode };
  }
}
