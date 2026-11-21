import type { AurixLanguage } from "../types/aurix";
import { cancelOfflineVoice, speakWithOfflineBritishVoice } from "./offlineVoice";
import { publishVoice } from "./voiceBus";
import { estimatedSpeechMs } from "./visemes";

export interface CompanionVoiceOptions {
  voiceName?: "Charon" | "Fenrir" | "Puck";
  language?: AurixLanguage;
  speed?: number;
  /** Device voice picked in settings (SpeechSynthesis voiceURI). */
  voiceId?: string;
  /** 0..1 playback volume for the device voice. */
  volume?: number;
  onStart?: () => void;
  onEnd?: () => void;
  /** Word-boundary pulse with the offset inside the spoken text. */
  onBoundary?: (charIndex?: number) => void;
}

let audioEl: HTMLAudioElement | null = null;
let abortRef: AbortController | null = null;
let runToken = 0;
let lastEngine: "gemini" | "device" = "gemini";
let progressTimer = 0;

function stopSpeechProgress() {
  if (progressTimer) window.clearInterval(progressTimer);
  progressTimer = 0;
}

function endSpeechProgress() {
  stopSpeechProgress();
  publishVoice({ spokenChars: -1 });
}

/**
 * Gemini audio arrives as one clip with no word events, so progress is
 * interpolated from playback time — enough to keep the face in sync.
 */
function trackAudioProgress(text: string, run: number) {
  stopSpeechProgress();
  const length = text.length;
  // Some clips report no usable duration, so pace against the text length.
  const estimated = estimatedSpeechMs(text) / 1000;
  progressTimer = window.setInterval(() => {
    if (run !== runToken || !audioEl) {
      stopSpeechProgress();
      return;
    }
    const { currentTime, duration } = audioEl;
    const total = Number.isFinite(duration) && duration > 0 ? duration : estimated;
    publishVoice({ spokenChars: Math.min(length, Math.round((currentTime / total) * length)) });
  }, 90);
}

/** Which voice produced the most recent reply: cloud Gemini or the device. */
export function companionVoiceEngine(): "gemini" | "device" {
  return lastEngine;
}

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
  stopSpeechProgress();
  publishVoice({ spokenChars: -1 });
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
  options: CompanionVoiceOptions,
  text?: string
): Promise<boolean> {
  const audio = new Audio(src);
  // Gemini audio is already paced by the server, so it plays at natural speed;
  // only an explicit speed change nudges it slightly.
  audio.playbackRate = speed === 1 ? 1 : Math.min(1.15, Math.max(0.85, speed));
  audioEl = audio;
  audio.onended = () => {
    if (run !== runToken) return;
    audioEl = null;
    endSpeechProgress();
    options.onEnd?.();
  };
  audio.onerror = () => {
    if (run !== runToken) return;
    audioEl = null;
    endSpeechProgress();
    options.onEnd?.();
  };
  await audio.play();
  if (text) trackAudioProgress(text, run);
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
  options: CompanionVoiceOptions = {},
  text?: string
): Promise<boolean> {
  if (!audioBase64) return false;
  cancelCompanionVoice();
  lastEngine = "gemini";
  const run = ++runToken;
  if (text) publishVoice({ reply: text, spokenChars: 0 });
  try {
    return await playSource(
      `data:${mimeType || "audio/wav"};base64,${audioBase64}`,
      speed,
      run,
      options,
      text
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
  // The line about to be spoken is what the face and transcript follow.
  publishVoice({ reply: clean, spokenChars: 0 });

  const speakWithBrowser = () => {
    lastEngine = "device";
    return speakWithOfflineBritishVoice(
      clean,
      options.language || "English",
      speed,
      {
        onStart: options.onStart,
        onEnd: options.onEnd,
        onBoundary: (charIndex) => {
          if (typeof charIndex === "number") publishVoice({ spokenChars: charIndex });
          options.onBoundary?.(charIndex);
        },
      },
      options.voiceId,
      options.volume
    );
  };

  const cachedUrl = spokenCache.get(key);
  if (cachedUrl) {
    try {
      lastEngine = "gemini";
      return await playSource(cachedUrl, speed, run, options, clean);
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

    lastEngine = "gemini";
    const mimeType = data.mimeType || "audio/wav";
    let url = `data:${mimeType};base64,${data.audioBase64}`;
    try {
      url = base64ToObjectUrl(data.audioBase64, mimeType);
      rememberSpoken(key, url);
    } catch {
      // A data URL still plays even when the blob cannot be cached.
    }
    abortRef = null;
    return await playSource(url, speed, run, options, clean);
  } catch {
    if (run !== runToken) return false;
    abortRef = null;
    audioEl = null;
    return speakWithBrowser();
  }
}
