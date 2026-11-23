import type { AurixLanguage } from "../types/aurix";
import {
  cancelCompanionVoice,
  companionVoiceEngine,
  speakWithCompanionVoice,
  type CompanionVoiceOptions,
} from "./companionVoice";
import { publishVoice } from "./voiceBus";

/**
 * DEX MADE audio state machine.
 *
 * Every part of the app that records or speaks goes through this single
 * service, so the microphone is opened once, recordings never overlap and
 * speech can always be interrupted. States are logged as they change.
 */
export type VoiceState =
  | "idle"
  | "initializing"
  | "listening"
  | "transcribing"
  | "thinking"
  | "speaking"
  | "interrupted"
  | "muted"
  | "error"
  | "offline";

export type VoiceEngineName = "gemini" | "device";

export interface VoiceEngineSnapshot {
  state: VoiceState;
  level: number;
  error: string | null;
  micReady: boolean;
  capturing: boolean;
  speaking: boolean;
  engine: VoiceEngineName;
  lastTransition: { from: VoiceState; to: VoiceState; at: number } | null;
}

export interface CaptureResult {
  transcript: string;
  /** True when the clip was too short or silent to hold speech. */
  silent: boolean;
  error?: string;
}

export interface CaptureOptions {
  /** Language sent to the transcriber; omit it to let the engine detect it. */
  language?: AurixLanguage;
  autoDetectLanguage?: boolean;
  /** Minimum clip length in ms before it is treated as speech. */
  minDurationMs?: number;
}

export interface SpeakOptions extends CompanionVoiceOptions {
  /** Device voice chosen in settings. */
  voiceId?: string;
  volume?: number;
}

const ALLOWED: Record<VoiceState, VoiceState[]> = {
  idle: ["initializing", "listening", "speaking", "transcribing", "error", "muted", "offline", "interrupted"],
  initializing: ["idle", "listening", "error", "offline", "muted"],
  listening: ["transcribing", "idle", "error", "interrupted", "offline"],
  transcribing: ["idle", "thinking", "speaking", "error", "interrupted", "offline"],
  thinking: ["idle", "speaking", "error", "interrupted", "offline"],
  speaking: ["idle", "interrupted", "error", "listening", "muted", "offline"],
  interrupted: ["idle", "listening", "error"],
  muted: ["idle", "speaking", "error"],
  error: ["idle", "initializing", "listening", "offline"],
  offline: ["idle", "initializing", "error"],
};

const INITIAL: VoiceEngineSnapshot = {
  state: "idle",
  level: 0,
  error: null,
  micReady: false,
  capturing: false,
  speaking: false,
  engine: "gemini",
  lastTransition: null,
};

const listeners = new Set<(snapshot: VoiceEngineSnapshot) => void>();
let snapshot: VoiceEngineSnapshot = INITIAL;

function emit() {
  listeners.forEach((listener) => listener(snapshot));
}

function setState(next: VoiceState, patch: Partial<VoiceEngineSnapshot> = {}) {
  const from = snapshot.state;
  const allowed = ALLOWED[from] || [];
  if (from !== next && !allowed.includes(next)) {
    // Never block a recovery: log the invalid edge, then take it anyway.
    console.warn(`[DEX MADE voice] invalid transition ${from} → ${next}`);
  }
  snapshot = {
    ...snapshot,
    ...patch,
    state: next,
    lastTransition: from === next ? snapshot.lastTransition : { from, to: next, at: Date.now() },
  };
  if (from !== next) {
    console.debug(`[DEX MADE voice] ${from} → ${next}${patch.error ? ` (${patch.error})` : ""}`);
  }
  emit();
}

export function getVoiceEngineSnapshot(): VoiceEngineSnapshot {
  return snapshot;
}

export function subscribeVoiceEngine(listener: (value: VoiceEngineSnapshot) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/* ------------------------------------------------------------------ */
/* Microphone                                                          */
/* ------------------------------------------------------------------ */

let stream: MediaStream | null = null;
let streamPromise: Promise<MediaStream | null> | null = null;
let context: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let meterFrame = 0;
let lastLevelEmit = 0;
let samples = new Uint8Array(0);

function stopMeter() {
  if (meterFrame) cancelAnimationFrame(meterFrame);
  meterFrame = 0;
  if (snapshot.level !== 0) {
    snapshot = { ...snapshot, level: 0 };
    emit();
    publishVoice({ level: 0 });
  }
}

function startMeter() {
  if (!analyser || meterFrame) return;
  const tick = () => {
    if (!analyser) return;
    analyser.getByteTimeDomainData(samples);
    let sum = 0;
    for (let i = 0; i < samples.length; i += 1) {
      const value = (samples[i] - 128) / 128;
      sum += value * value;
    }
    const rms = Math.sqrt(sum / samples.length);
    peakRms = Math.max(peakRms, rms);
    const now = performance.now();
    if (now - lastLevelEmit >= 66) {
      lastLevelEmit = now;
      const level = Math.max(0, Math.min(1, rms * 4.5));
      snapshot = { ...snapshot, level };
      emit();
      publishVoice({ level });
    }
    meterFrame = requestAnimationFrame(tick);
  };
  meterFrame = requestAnimationFrame(tick);
}

function describeMicError(err: unknown): string {
  const name = err instanceof Error ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Microphone access is blocked. Allow the microphone for DEX MADE, then press Space again.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No microphone was found. Connect a microphone and press Space again.";
  }
  if (name === "NotReadableError" || name === "AbortError") {
    return "The microphone is busy in another app. Close it and press Space again.";
  }
  if (name === "TimeoutError") {
    return "The microphone did not respond. Check that it is connected, then press Space again.";
  }
  return "The microphone could not be opened. Press Space to retry.";
}

function watchTrack(next: MediaStream) {
  next.getAudioTracks().forEach((track) => {
    track.addEventListener("ended", () => {
      // The device was unplugged: drop the stream so the next press re-opens it.
      if (stream !== next) return;
      stream = null;
      snapshot = { ...snapshot, micReady: false };
      setState("error", { error: "The microphone was disconnected. Press Space to reconnect." });
    });
  });
}

/** Opens the microphone once and keeps it warm for push-to-talk. */
export async function ensureMicrophone(): Promise<MediaStream | null> {
  if (stream && stream.getAudioTracks().some((track) => track.readyState === "live")) return stream;
  if (streamPromise) return streamPromise;
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    setState("error", { error: "This browser cannot access a microphone.", micReady: false });
    return null;
  }
  setState("initializing");
  streamPromise = (async () => {
    try {
      const request = navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      // A permission prompt that never answers must not leave the app stuck in
      // "initializing"; the press fails cleanly after eight seconds.
      const timeout = new Promise<null>((resolve) => {
        window.setTimeout(() => resolve(null), 8000);
      });
      const next = await Promise.race([request, timeout]);
      if (!next) {
        void request.then((late) => late.getTracks().forEach((track) => track.stop())).catch(() => {});
        const timeoutError = new Error("Microphone timed out.");
        timeoutError.name = "TimeoutError";
        throw timeoutError;
      }
      stream = next;
      watchTrack(next);
      const Ctor =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor) {
        if (!context || context.state === "closed") context = new Ctor();
        await context.resume().catch(() => {});
        analyser = context.createAnalyser();
        analyser.fftSize = 1024;
        context.createMediaStreamSource(next).connect(analyser);
        samples = new Uint8Array(analyser.fftSize);
      }
      setState("idle", { micReady: true, error: null });
      return next;
    } catch (err) {
      stream = null;
      analyser = null;
      setState("error", { error: describeMicError(err), micReady: false });
      return null;
    } finally {
      streamPromise = null;
    }
  })();
  return streamPromise;
}

export function releaseMicrophone() {
  stopMeter();
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  analyser = null;
  if (context) {
    void context.close().catch(() => {});
    context = null;
  }
  snapshot = { ...snapshot, micReady: false, level: 0 };
  emit();
}

/* ------------------------------------------------------------------ */
/* Capture                                                             */
/* ------------------------------------------------------------------ */

let recorder: MediaRecorder | null = null;
let chunks: BlobPart[] = [];
let captureStartedAt = 0;
let peakRms = 0;
let pendingStop: Promise<CaptureResult> | null = null;

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  return candidates.find((type) => MediaRecorder.isTypeSupported?.(type));
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || "").split(",")[1] || "");
    reader.onerror = () => reject(new Error("Could not read the recorded audio."));
    reader.readAsDataURL(blob);
  });
}

/** Removes the stutter a recogniser can repeat at chunk boundaries. */
function tidyTranscript(raw: string): string {
  const clean = raw.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const words = clean.split(" ");
  const deduped: string[] = [];
  for (const word of words) {
    const previous = deduped[deduped.length - 1];
    if (previous && previous.toLowerCase() === word.toLowerCase()) continue;
    deduped.push(word);
  }
  return deduped.join(" ");
}

async function transcribe(blob: Blob, options: CaptureOptions): Promise<CaptureResult> {
  const audioBase64 = await blobToBase64(blob);
  const res = await fetch("/api/voice/stt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      audioBase64,
      mimeType: blob.type || "audio/webm",
      languageHint: options.autoDetectLanguage ? undefined : options.language,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "Transcription failed.");
  }
  const transcript = tidyTranscript(String(data.transcript || ""));
  return { transcript, silent: !transcript };
}

/** Starts one recording session. A second call while listening is ignored. */
export async function startCapture(): Promise<boolean> {
  if (snapshot.capturing) return true;
  if (pendingStop) return false;
  stopSpeaking();
  const media = await ensureMicrophone();
  if (!media) return false;
  if (typeof MediaRecorder === "undefined") {
    setState("error", { error: "This browser cannot record audio." });
    return false;
  }
  try {
    const mimeType = pickMimeType();
    recorder = new MediaRecorder(media, mimeType ? { mimeType } : undefined);
  } catch {
    setState("error", { error: "Audio recording could not start." });
    return false;
  }
  chunks = [];
  peakRms = 0;
  captureStartedAt = performance.now();
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  try {
    recorder.start(120);
  } catch {
    recorder = null;
    setState("error", { error: "Audio recording could not start." });
    return false;
  }
  startMeter();
  setState("listening", { capturing: true, error: null });
  return true;
}

/** Stops the recording and returns the real transcript. */
export async function stopCapture(options: CaptureOptions = {}): Promise<CaptureResult> {
  const active = recorder;
  if (!active || active.state === "inactive") {
    stopMeter();
    setState("idle", { capturing: false });
    return { transcript: "", silent: true };
  }
  if (pendingStop) return pendingStop;
  setState("transcribing", { capturing: false });
  stopMeter();
  const durationMs = performance.now() - captureStartedAt;
  const peak = peakRms;

  pendingStop = new Promise<CaptureResult>((resolve) => {
    active.onstop = async () => {
      recorder = null;
      const blob = new Blob(chunks, { type: active.mimeType || "audio/webm" });
      chunks = [];
      const minDuration = options.minDurationMs ?? 300;
      if (blob.size < 1500 || durationMs < minDuration || peak < 0.012) {
        setState("idle");
        pendingStop = null;
        resolve({ transcript: "", silent: true });
        return;
      }
      try {
        const result = await transcribe(blob, options);
        setState("idle");
        resolve(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Transcription failed.";
        setState("error", { error: message });
        resolve({ transcript: "", silent: true, error: message });
      } finally {
        pendingStop = null;
      }
    };
    try {
      active.stop();
    } catch {
      recorder = null;
      pendingStop = null;
      setState("idle");
      resolve({ transcript: "", silent: true });
    }
  });
  return pendingStop;
}

export function isCapturing(): boolean {
  return snapshot.capturing;
}

/** A live level reading without opening the microphone a second time. */
export function getSharedStream(): MediaStream | null {
  return stream;
}

/* ------------------------------------------------------------------ */
/* Speech output                                                       */
/* ------------------------------------------------------------------ */

export function setThinking() {
  if (snapshot.state === "speaking") cancelCompanionVoice();
  setState("thinking", { speaking: false });
}

export function setIdle() {
  if (snapshot.state === "idle") return;
  setState("idle", { speaking: false, capturing: false });
}

export function stopSpeaking(): boolean {
  const wasSpeaking = snapshot.speaking;
  cancelCompanionVoice();
  if (wasSpeaking || snapshot.state === "speaking") {
    setState("interrupted", { speaking: false });
    setState("idle", { speaking: false });
  }
  return wasSpeaking;
}

/** Speaks one reply. Any previous reply is interrupted first. */
export async function speak(text: string, options: SpeakOptions = {}): Promise<boolean> {
  const clean = text.trim();
  if (!clean) return false;
  cancelCompanionVoice();
  setState("speaking", { speaking: true, error: null });
  const started = await speakWithCompanionVoice(clean, {
    ...options,
    onEnd: () => {
      options.onEnd?.();
      if (snapshot.state === "speaking") setState("idle", { speaking: false });
    },
  });
  snapshot = { ...snapshot, engine: companionVoiceEngine() };
  emit();
  if (!started && snapshot.state === "speaking") setState("idle", { speaking: false });
  return started;
}

export function markOffline() {
  setState("offline", { error: "Speech services are offline. Device voice will be used." });
}

export function resetVoiceEngine() {
  stopMeter();
  if (recorder && recorder.state !== "inactive") {
    try {
      recorder.stop();
    } catch {
      // Already stopped.
    }
  }
  recorder = null;
  chunks = [];
  cancelCompanionVoice();
  snapshot = { ...INITIAL, lastTransition: snapshot.lastTransition };
  emit();
}


