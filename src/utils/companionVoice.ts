import type { AurixLanguage } from "../types/aurix";
import { cancelOfflineVoice, speakWithOfflineBritishVoice } from "./offlineVoice";

export interface CompanionVoiceOptions {
  voiceName?: "Charon" | "Fenrir" | "Puck";
  language?: AurixLanguage;
  speed?: number;
  onStart?: () => void;
  onEnd?: () => void;
}

let audioEl: HTMLAudioElement | null = null;
let abortRef: AbortController | null = null;
let runToken = 0;

/** Stops whatever the companion is currently saying. */
export function cancelCompanionVoice() {
  runToken += 1;
  abortRef?.abort();
  abortRef = null;
  if (audioEl) {
    audioEl.pause();
    audioEl.src = "";
    audioEl = null;
  }
  cancelOfflineVoice();
}

/**
 * Speaks with AURIX's real Gemini voice and falls back to the browser voice
 * when the speech service is unavailable, so the companion always answers.
 */
export async function speakWithCompanionVoice(
  text: string,
  options: CompanionVoiceOptions = {}
): Promise<boolean> {
  const clean = text.trim();
  if (!clean) return false;

  cancelCompanionVoice();
  const run = ++runToken;
  const speed = Math.min(1.25, Math.max(0.75, options.speed ?? 1));
  const controller = new AbortController();
  abortRef = controller;

  const speakWithBrowser = () =>
    speakWithOfflineBritishVoice(clean, options.language || "English", speed, {
      onStart: options.onStart,
      onEnd: options.onEnd,
    });

  try {
    const res = await fetch("/api/voice/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: clean,
        voiceName: options.voiceName,
        language: options.language,
        speed,
      }),
      signal: controller.signal,
    });
    const data = await res.json();
    if (!res.ok || !data.audioBase64) throw new Error("Speech service unavailable.");
    if (run !== runToken) return false;

    const audio = new Audio(`data:${data.mimeType || "audio/wav"};base64,${data.audioBase64}`);
    audio.playbackRate = speed;
    audioEl = audio;
    audio.onended = () => {
      if (run !== runToken) return;
      audioEl = null;
      options.onEnd?.();
    };
    audio.onerror = () => {
      if (run !== runToken) return;
      audioEl = null;
      options.onEnd?.();
    };
    await audio.play();
    options.onStart?.();
    return true;
  } catch {
    if (run !== runToken) return false;
    abortRef = null;
    audioEl = null;
    return speakWithBrowser();
  }
}
