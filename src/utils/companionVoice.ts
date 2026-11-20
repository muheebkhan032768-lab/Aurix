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

/** Recently synthesized lines, kept as blob URLs so repeats start instantly. */
const spokenCache = new Map<string, string>();
const SPOKEN_CACHE_LIMIT = 24;

function cacheKeyFor(text: string, options: CompanionVoiceOptions): string {
  return `${options.voiceName || ""}|${options.language || ""}|${options.speed ?? 1}|${text}`;
}

function rememberSpoken(key: string, url: string) {
  const previous = spokenCache.get(key);
  if (previous) URL.revokeObjectURL(previous);
  spokenCache.set(key, url);
  if (spokenCache.size <= SPOKEN_CACHE_LIMIT) return;
  const oldestKey = spokenCache.keys().next().value;
  if (!oldestKey) return;
  const oldestUrl = spokenCache.get(oldestKey);
  if (oldestUrl) URL.revokeObjectURL(oldestUrl);
  spokenCache.delete(oldestKey);
}

function base64ToObjectUrl(base64: string, mimeType: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
}

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

async function playSource(
  src: string,
  speed: number,
  run: number,
  options: CompanionVoiceOptions
): Promise<boolean> {
  const audio = new Audio(src);
  audio.playbackRate = Math.min(1.25, Math.max(0.75, speed));
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
}

/**
 * Plays audio the server already synthesized, so a reply starts without a
 * second network round trip.
 */
export async function playCompanionAudioBase64(
  audioBase64: string,
  mimeType: string | undefined,
  speed = 1,
  options: CompanionVoiceOptions = {}
): Promise<boolean> {
  if (!audioBase64) return false;
  cancelCompanionVoice();
  const run = ++runToken;
  try {
    return await playSource(
      `data:${mimeType || "audio/wav"};base64,${audioBase64}`,
      speed,
      run,
      options
    );
  } catch {
    if (run === runToken) audioEl = null;
    return false;
  }
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
  const key = cacheKeyFor(clean, { ...options, speed });

  const speakWithBrowser = () =>
    speakWithOfflineBritishVoice(clean, options.language || "English", speed, {
      onStart: options.onStart,
      onEnd: options.onEnd,
    });

  const cachedUrl = spokenCache.get(key);
  if (cachedUrl) {
    try {
      return await playSource(cachedUrl, speed, run, options);
    } catch {
      spokenCache.delete(key);
    }
  }

  const controller = new AbortController();
  abortRef = controller;

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

    const mimeType = data.mimeType || "audio/wav";
    let url = `data:${mimeType};base64,${data.audioBase64}`;
    try {
      url = base64ToObjectUrl(data.audioBase64, mimeType);
      rememberSpoken(key, url);
    } catch {
      // A data URL still plays even when the blob cannot be cached.
    }
    abortRef = null;
    return await playSource(url, speed, run, options);
  } catch {
    if (run !== runToken) return false;
    abortRef = null;
    audioEl = null;
    return speakWithBrowser();
  }
}
