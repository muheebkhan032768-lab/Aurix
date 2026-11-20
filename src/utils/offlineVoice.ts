import type { AurixLanguage } from "../types/aurix";

export interface OfflineVoiceCallbacks {
  onStart?: () => void;
  onEnd?: () => void;
  onBoundary?: () => void;
}

interface DeviceVoice {
  voice: SpeechSynthesisVoice;
  score: number;
}

const NATURAL_PATTERN = /natural|neural|online|premium|enhanced|studio/i;
const MALE_PATTERN =
  /george|ryan|daniel|arthur|oliver|alfie|guy|david|mark|james|thomas|alex|male|charon|fred|tom/i;

function supportsSpeech(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

function rankVoices(language: AurixLanguage): DeviceVoice[] {
  if (!supportsSpeech()) return [];
  const voices = window.speechSynthesis.getVoices();
  const wanted =
    language === "Urdu" ? "ur" : language === "Hindi" ? "hi" : "en";
  return voices
    .map((voice) => {
      const lang = voice.lang.toLowerCase();
      let score = 0;
      if (lang.startsWith(wanted)) score += 40;
      if (wanted === "en" && lang.includes("gb")) score += 25;
      if (wanted === "en" && lang.includes("us")) score += 8;
      if (NATURAL_PATTERN.test(voice.name)) score += 30;
      if (MALE_PATTERN.test(voice.name)) score += 18;
      if (voice.localService === false) score += 6;
      if (voice.default) score += 2;
      return { voice, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
}

/** Device voices ordered best-first, for the settings selector. */
export function getDeviceVoiceOptions(language: AurixLanguage = "English"): {
  uri: string;
  label: string;
  natural: boolean;
}[] {
  return rankVoices(language).map(({ voice }) => ({
    uri: voice.voiceURI,
    label: `${voice.name} · ${voice.lang}`,
    natural: NATURAL_PATTERN.test(voice.name),
  }));
}

export function getAvailableBritishVoices(): SpeechSynthesisVoice[] {
  return rankVoices("English").map((entry) => entry.voice);
}

/** True when the device exposes a neural/online voice worth preferring. */
export function hasNaturalDeviceVoice(): boolean {
  return rankVoices("English").some((entry) => NATURAL_PATTERN.test(entry.voice.name));
}

function splitForSpeech(text: string): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  // Sentence-sized chunks keep Chrome from cutting long replies off and give
  // the voice a natural breath between sentences.
  const parts = clean.match(/[^.!?۔]+[.!?۔]*/g) || [clean];
  const chunks: string[] = [];
  let current = "";
  for (const part of parts) {
    const piece = part.trim();
    if (!piece) continue;
    if ((current + " " + piece).trim().length > 190) {
      if (current) chunks.push(current.trim());
      current = piece;
    } else {
      current = `${current} ${piece}`;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

let runToken = 0;

export function speakWithOfflineBritishVoice(
  text: string,
  language: AurixLanguage = "English",
  speed = 1.0,
  callbacks?: OfflineVoiceCallbacks,
  preferredVoiceUri?: string,
  volume?: number
): boolean {
  if (!supportsSpeech()) return false;
  const chunks = splitForSpeech(text);
  if (!chunks.length) return false;

  const run = ++runToken;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // Nothing to cancel.
  }

  const ranked = rankVoices(language);
  const preferred =
    (preferredVoiceUri &&
      ranked.find(
        (entry) => entry.voice.voiceURI === preferredVoiceUri || entry.voice.name === preferredVoiceUri
      )?.voice) ||
    ranked[0]?.voice ||
    null;

  const rate = Math.max(0.8, Math.min(1.2, speed));
  let started = false;
  let watchdog = 0;

  const clearWatchdog = () => {
    if (watchdog) window.clearTimeout(watchdog);
    watchdog = 0;
  };

  const speakChunk = (index: number) => {
    if (run !== runToken) return;
    if (index >= chunks.length) {
      clearWatchdog();
      callbacks?.onEnd?.();
      return;
    }
    const utter = new SpeechSynthesisUtterance(chunks[index]);
    if (preferred) utter.voice = preferred;
    utter.lang =
      language === "Urdu" ? "ur-PK" : language === "Hindi" ? "hi-IN" : preferred?.lang || "en-GB";
    utter.rate = rate;
    // A gentle lower pitch reads as a composed male voice without sounding
    // synthetic; the browser default pitch is the fallback when it sounds off.
    utter.pitch = 0.96;
    utter.volume = Math.max(0, Math.min(1, volume ?? 1));
    utter.onstart = () => {
      if (!started) {
        started = true;
        callbacks?.onStart?.();
      }
    };
    utter.onboundary = () => callbacks?.onBoundary?.();
    utter.onend = () => {
      if (run !== runToken) return;
      speakChunk(index + 1);
    };
    utter.onerror = () => {
      if (run !== runToken) return;
      clearWatchdog();
      callbacks?.onEnd?.();
    };
    // Some engines never fire onend when they have no voice installed; the
    // watchdog releases the "speaking" state instead of leaving it stuck.
    clearWatchdog();
    watchdog = window.setTimeout(() => {
      if (run !== runToken) return;
      callbacks?.onEnd?.();
    }, 20000);
    window.speechSynthesis.speak(utter);
  };

  speakChunk(0);
  return true;
}

export function cancelOfflineVoice() {
  runToken += 1;
  if (supportsSpeech()) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // Already cancelled.
    }
  }
}
