/**
 * Local voice feature extraction for AURIX speaker verification.
 *
 * The microphone stream is analysed in the browser into MFCC frames (13
 * cepstral coefficients per 23 ms frame). Only those features are sent to the
 * local AURIX server — the raw recording is never uploaded or stored.
 */
import { patchRuntime } from "./runtime";

const FFT_SIZE = 1024;
const MEL_BANDS = 26;
const CEPS_COEFFS = 13;
const FRAME_INTERVAL_MS = 40;

function fftInPlace(real: Float32Array, imag: Float32Array): void {
  const n = real.length;
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wReal = Math.cos(angle);
    const wImag = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let curReal = 1;
      let curImag = 0;
      for (let k = 0; k < len / 2; k += 1) {
        const uReal = real[i + k];
        const uImag = imag[i + k];
        const vReal = real[i + k + len / 2] * curReal - imag[i + k + len / 2] * curImag;
        const vImag = real[i + k + len / 2] * curImag + imag[i + k + len / 2] * curReal;
        real[i + k] = uReal + vReal;
        imag[i + k] = uImag + vImag;
        real[i + k + len / 2] = uReal - vReal;
        imag[i + k + len / 2] = uImag - vImag;
        const nextReal = curReal * wReal - curImag * wImag;
        curImag = curReal * wImag + curImag * wReal;
        curReal = nextReal;
      }
    }
  }
}

function hzToMel(hz: number): number {
  return 2595 * Math.log10(1 + hz / 700);
}

function melToHz(mel: number): number {
  return 700 * (10 ** (mel / 2595) - 1);
}

let cachedFilters: { sampleRate: number; filters: Float32Array[] } | null = null;

function melFilters(sampleRate: number): Float32Array[] {
  if (cachedFilters && cachedFilters.sampleRate === sampleRate) return cachedFilters.filters;
  const lowHz = 80;
  const highHz = Math.min(7600, sampleRate / 2 - 100);
  const lowMel = hzToMel(lowHz);
  const highMel = hzToMel(highHz);
  const points: number[] = [];
  for (let i = 0; i < MEL_BANDS + 2; i += 1) {
    const mel = lowMel + ((highMel - lowMel) * i) / (MEL_BANDS + 1);
    points.push(Math.floor(((FFT_SIZE + 1) * melToHz(mel)) / sampleRate));
  }
  const filters: Float32Array[] = [];
  for (let band = 0; band < MEL_BANDS; band += 1) {
    const filter = new Float32Array(FFT_SIZE / 2 + 1);
    const left = points[band];
    const center = points[band + 1];
    const right = points[band + 2];
    for (let k = left; k < center; k += 1) {
      if (center > left) filter[k] = (k - left) / (center - left);
    }
    for (let k = center; k < right; k += 1) {
      if (right > center) filter[k] = (right - k) / (right - center);
    }
    filters.push(filter);
  }
  cachedFilters = { sampleRate, filters };
  return filters;
}

function mfccFrame(frame: Float32Array, sampleRate: number): number[] {
  const real = new Float32Array(FFT_SIZE);
  const imag = new Float32Array(FFT_SIZE);
  // Pre-emphasis lifts the higher formants that carry speaker identity.
  for (let i = 0; i < FFT_SIZE; i += 1) {
    const current = frame[i] ?? 0;
    const previous = frame[i - 1] ?? current;
    real[i] = (current - 0.97 * previous) * (0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1)));
  }
  fftInPlace(real, imag);
  const power = new Float32Array(FFT_SIZE / 2 + 1);
  for (let k = 0; k <= FFT_SIZE / 2; k += 1) power[k] = real[k] * real[k] + imag[k] * imag[k];

  const filters = melFilters(sampleRate);
  const logEnergies = filters.map((filter) => {
    let sum = 0;
    for (let k = 0; k < filter.length; k += 1) sum += filter[k] * power[k];
    return Math.log(Math.max(sum, 1e-10));
  });

  const coeffs: number[] = [];
  for (let c = 0; c < CEPS_COEFFS; c += 1) {
    let sum = 0;
    for (let m = 0; m < MEL_BANDS; m += 1) {
      sum += logEnergies[m] * Math.cos((Math.PI * c * (m + 0.5)) / MEL_BANDS);
    }
    coeffs.push(sum);
  }
  return coeffs;
}

export interface VoiceSample {
  frames: number[][];
  /** Median fundamental frequency of the voiced frames, in Hz. */
  f0: number;
  durationMs: number;
  voicedFrames: number;
  peakRms: number;
}

/**
 * Autocorrelation pitch estimate for one analysis frame. Pitch is a strong,
 * cheap speaker cue and is compared on the server alongside the cepstral
 * envelope.
 */
function estimateF0(frame: Float32Array, sampleRate: number): number {
  const minLag = Math.max(2, Math.floor(sampleRate / 500));
  const maxLag = Math.min(frame.length - 2, Math.floor(sampleRate / 70));
  let bestLag = 0;
  let bestScore = 0;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let correlation = 0;
    let energyA = 0;
    let energyB = 0;
    for (let i = 0; i + lag < frame.length; i += 1) {
      correlation += frame[i] * frame[i + lag];
      energyA += frame[i] * frame[i];
      energyB += frame[i + lag] * frame[i + lag];
    }
    const score = correlation / Math.sqrt(energyA * energyB + 1e-9);
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }
  return bestScore > 0.3 && bestLag > 0 ? sampleRate / bestLag : 0;
}

export class VoiceError extends Error {}

/**
 * Records `durationMs` of microphone audio and returns MFCC frames for the
 * voiced parts. The stream is always stopped before returning.
 */
export async function recordVoiceSample(durationMs = 2800, onProgress?: (progress: number) => void): Promise<VoiceSample> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new VoiceError("This browser does not expose a microphone API.");
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
      video: false,
    });
  } catch (err) {
    throw new VoiceError(
      err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "SecurityError")
        ? "Microphone permission was denied. Allow the microphone for this page, or use face/PIN verification."
        : `Microphone unavailable: ${err instanceof Error ? err.message : "unknown error"}`
    );
  }

  patchRuntime({ mic: "active" });
  const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  const context = new AudioContextClass();
  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = FFT_SIZE;
  analyser.smoothingTimeConstant = 0;
  source.connect(analyser);
  const buffer = new Float32Array(FFT_SIZE);
  const frames: number[][] = [];
  const pitches: number[] = [];
  let peakRms = 0;
  const started = performance.now();

  try {
    while (performance.now() - started < durationMs) {
      analyser.getFloatTimeDomainData(buffer);
      let energy = 0;
      for (let i = 0; i < buffer.length; i += 1) energy += buffer[i] * buffer[i];
      const rms = Math.sqrt(energy / buffer.length);
      peakRms = Math.max(peakRms, rms);
      if (rms > 0.008) {
        frames.push(mfccFrame(buffer, context.sampleRate));
        const f0 = estimateF0(buffer, context.sampleRate);
        if (f0 > 70 && f0 < 500) pitches.push(f0);
      }
      onProgress?.((performance.now() - started) / durationMs);
      await new Promise((resolve) => setTimeout(resolve, FRAME_INTERVAL_MS));
    }
  } finally {
    stream.getTracks().forEach((track) => track.stop());
    source.disconnect();
    await context.close().catch(() => undefined);
    patchRuntime({ mic: "off" });
  }

  pitches.sort((a, b) => a - b);
  const f0 = pitches.length ? pitches[Math.floor(pitches.length / 2)] : 0;
  return { frames, f0, durationMs, voicedFrames: frames.length, peakRms };
}

/* ------------------------------------------------------------------ */
/* Speech recognition (challenge phrase + training commands)           */
/* ------------------------------------------------------------------ */

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  const candidate =
    (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition ??
    (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition;
  return candidate ?? null;
}

export function speechRecognitionSupported(): boolean {
  return Boolean(getRecognitionCtor());
}

/** Transcribes one short utterance. Resolves null when unsupported or silent. */
export function recognizeOnce(timeoutMs = 7000, lang = "en-US"): Promise<string | null> {
  const Ctor = getRecognitionCtor();
  if (!Ctor) return Promise.resolve(null);
  return new Promise((resolve) => {
    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      try {
        recognition.stop();
      } catch {
        /* already stopped */
      }
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(null), timeoutMs);
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();
      window.clearTimeout(timer);
      finish(transcript || null);
    };
    recognition.onerror = () => {
      window.clearTimeout(timer);
      finish(null);
    };
    recognition.onend = () => {
      window.clearTimeout(timer);
      finish(null);
    };
    try {
      recognition.start();
    } catch {
      window.clearTimeout(timer);
      finish(null);
    }
  });
}

export interface VoiceCommandListener {
  stop: () => void;
}

/**
 * Continuous command listening for TEACH AURIX mode. Calls back with each
 * finalized transcript. Stops cleanly and reports failures instead of looping.
 */
export function listenForCommands(
  onTranscript: (text: string) => void,
  onError: (message: string) => void,
  lang = "en-US"
): VoiceCommandListener {
  const Ctor = getRecognitionCtor();
  if (!Ctor) {
    onError("This browser does not support speech recognition. Use the on-screen buttons to teach AURIX.");
    return { stop: () => undefined };
  }
  let stopped = false;
  let recognition: SpeechRecognitionLike | null = null;

  const start = () => {
    if (stopped) return;
    recognition = new Ctor();
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const last = event.results[event.results.length - 1];
      const transcript = last?.[0]?.transcript?.trim();
      if (transcript) onTranscript(transcript);
    };
    recognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        onError("Microphone permission for speech recognition was denied.");
        stopped = true;
        patchRuntime({ mic: "error" });
        return;
      }
      if (event.error === "no-speech" || event.error === "aborted") return;
      onError(`Speech recognition error: ${event.error}`);
    };
    recognition.onend = () => {
      if (!stopped) {
        // Chrome ends the stream periodically; restart to keep listening.
        window.setTimeout(start, 350);
      }
    };
    try {
      recognition.start();
      patchRuntime({ mic: "active" });
    } catch {
      onError("Could not start speech recognition.");
    }
  };

  start();

  return {
    stop: () => {
      stopped = true;
      try {
        recognition?.stop();
      } catch {
        /* ignore */
      }
      patchRuntime({ mic: "off" });
    },
  };
}
