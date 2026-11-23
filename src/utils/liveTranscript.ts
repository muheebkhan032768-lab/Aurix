import type { AurixLanguage } from "../types/aurix";

/**
 * Live speech transcription through the browser recogniser.
 *
 * The server transcriber is accurate but costs a round trip (and Gemini
 * quota), so it is now the fallback. This session starts the moment the
 * microphone opens, streams interim words to the UI while the user speaks and
 * hands back the final text the instant the mic closes — the same behaviour as
 * ChatGPT's dictation.
 */

interface RecognitionResultLike {
  0: { transcript: string };
  isFinal: boolean;
}

interface RecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<RecognitionResultLike>;
}

interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives?: number;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
}

type RecognitionCtor = new () => RecognitionLike;

function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const scope = window as Window & {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return scope.SpeechRecognition || scope.webkitSpeechRecognition || null;
}

function localeFor(language: AurixLanguage): string {
  if (language === "Urdu") return "ur-PK";
  if (language === "Hindi") return "hi-IN";
  return "en-US";
}

function tidy(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
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

export interface LiveTranscriptSession {
  /** False when this browser has no speech recogniser. */
  supported: boolean;
  /** Stops listening and resolves with the final text (empty if none). */
  finish: () => Promise<string>;
  /** Stops immediately without waiting for a result. */
  cancel: () => void;
}

export function startLiveTranscript(options: {
  language: AurixLanguage;
  /** Called with the running text while the user speaks. */
  onInterim?: (text: string) => void;
}): LiveTranscriptSession {
  const Ctor = getRecognitionCtor();
  if (!Ctor) {
    return { supported: false, finish: async () => "", cancel: () => {} };
  }

  let finalText = "";
  let interimText = "";
  let active = true;
  let finished = false;
  let errored = false;
  let resolveFinish: ((text: string) => void) | null = null;
  let recognition: RecognitionLike | null = null;

  const combined = () => tidy(`${finalText} ${interimText}`);
  const emit = () => options.onInterim?.(combined());

  const settle = () => {
    if (finished) return;
    finished = true;
    active = false;
    options.onInterim?.("");
    resolveFinish?.(tidy(finalText));
    resolveFinish = null;
  };

  const create = (): RecognitionLike => {
    const next = new Ctor();
    next.lang = localeFor(options.language);
    next.continuous = true;
    next.interimResults = true;
    next.maxAlternatives = 1;
    next.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result?.[0]?.transcript || "";
        if (!text) continue;
        if (result.isFinal) finalText = `${finalText} ${text}`.trim();
        else interim += text;
      }
      interimText = interim.trim();
      emit();
    };
    next.onerror = () => {
      // Permission, network or no-speech errors leave the text empty; the
      // recorded clip is transcribed on the server instead.
      errored = true;
    };
    next.onend = () => {
      if (!active || errored) {
        settle();
        return;
      }
      // Chrome ends a pass after a short pause; keep listening while the user
      // still holds the microphone open.
      window.setTimeout(() => {
        if (!active || !recognition) return;
        try {
          recognition.start();
        } catch {
          // Already restarted.
        }
      }, 180);
    };
    return next;
  };

  try {
    recognition = create();
    recognition.start();
  } catch {
    return { supported: false, finish: async () => "", cancel: () => {} };
  }

  return {
    supported: true,
    finish: () => {
      // The recogniser may already have ended (a no-speech pause); answer at
      // once with what it heard instead of waiting for an end that never comes.
      if (finished) return Promise.resolve(tidy(finalText));
      return new Promise<string>((resolve) => {
        resolveFinish = resolve;
        active = false;
        // The recogniser usually finalises within a few hundred milliseconds.
        // Never hold the command longer than this — the recording is the
        // fallback when no words arrive.
        window.setTimeout(settle, 700);
        try {
          recognition?.stop();
        } catch {
          settle();
        }
      });
    },
    cancel: () => {
      const pending = resolveFinish;
      resolveFinish = null;
      active = false;
      finished = true;
      pending?.("");
      try {
        recognition?.abort?.();
        recognition?.stop();
      } catch {
        // Already stopped.
      }
      recognition = null;
    },
  };
}
