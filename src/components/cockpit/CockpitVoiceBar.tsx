import React, { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, Send, Square, Volume2, Waves } from "lucide-react";
import type { AppSettings } from "../../types/aurix";
import { cancelCompanionVoice, speakWithCompanionVoice } from "../../utils/companionVoice";
import type { ReactorState } from "./CockpitReactor";

type VoiceStatus = "idle" | "listening" | "thinking" | "speaking" | "error";

interface CockpitVoiceBarProps {
  settings: AppSettings;
  onSignal: (signal: { state: ReactorState; level: number }) => void;
  onReply?: (text: string) => void;
}

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
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type RecognitionCtor = new () => RecognitionLike;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const scope = window as Window & {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return scope.SpeechRecognition || scope.webkitSpeechRecognition || null;
}

function localeFor(language: AppSettings["language"]): string {
  if (language === "Urdu") return "ur-PK";
  if (language === "Hindi") return "hi-IN";
  return "en-GB";
}

const BAR_COUNT = 36;

/**
 * Bottom voice command centre. Speech recognition and the live waveform use the
 * real microphone; the reply comes from the AURIX chat API and is spoken with the
 * configured companion voice. Nothing here fakes a transcript or an answer.
 */
export function CockpitVoiceBar({ settings, onSignal, onReply }: CockpitVoiceBarProps) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [input, setInput] = useState("");
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [bars, setBars] = useState<number[]>(() => Array.from({ length: BAR_COUNT }, () => 0.18));

  const recognitionRef = useRef<RecognitionLike | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const finalRef = useRef("");
  const mountedRef = useRef(true);

  // publish reactor signal
  useEffect(() => {
    const map: Record<VoiceStatus, ReactorState> = {
      idle: "idle",
      listening: "listening",
      thinking: "thinking",
      speaking: "speaking",
      error: "error",
    };
    const energy = listening ? Math.max(...bars) : 0;
    onSignal({ state: map[status], level: energy });
  }, [status, listening, bars, onSignal]);

  const teardownAudio = useCallback(() => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    teardownAudio();
    setListening(false);
    setInterim("");
    setBars(Array.from({ length: BAR_COUNT }, () => 0.18));
    setStatus((prev) => (prev === "listening" ? "idle" : prev));
  }, [teardownAudio]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      recognitionRef.current?.stop();
      teardownAudio();
      cancelCompanionVoice();
    };
  }, [teardownAudio]);

  const submit = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text) return;
      setStatus("thinking");
      setError(null);
      setReply("");
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            language: settings.language,
            model: settings.activeModel,
            thinkingLevel: settings.thinkingLevel,
            mode: "chat",
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || `AI request failed (${res.status})`);
        const answer = String(json?.assistantMessage?.content || "").trim();
        if (!answer) throw new Error("The AI engine returned an empty response.");
        if (!mountedRef.current) return;
        setReply(answer);
        onReply?.(answer);
        setInput("");

        if (settings.voiceEnabled) {
          setStatus("speaking");
          const spoken = await speakWithCompanionVoice(answer, { speed: settings.voiceSpeed });
          if (!mountedRef.current) return;
          if (!spoken) setStatus("idle");
          else setStatus("idle");
        } else {
          setStatus("idle");
        }
      } catch (err) {
        if (!mountedRef.current) return;
        setStatus("error");
        setError(err instanceof Error ? err.message : "Voice request failed.");
      }
    },
    [onReply, settings.activeModel, settings.language, settings.thinkingLevel, settings.voiceEnabled, settings.voiceSpeed]
  );

  const startListening = useCallback(async () => {
    setError(null);
    setReply("");
    setTranscript("");
    setInterim("");
    finalRef.current = "";

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const Ctor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor) {
        const ctx = new Ctor();
        ctxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 128;
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);

        const tick = () => {
          analyser.getByteFrequencyData(data);
          const next = Array.from({ length: BAR_COUNT }, (_, i) => {
            const idx = Math.floor((i / BAR_COUNT) * data.length);
            return Math.max(0.12, Math.min(1, data[idx] / 190));
          });
          setBars(next);
          rafRef.current = window.requestAnimationFrame(tick);
        };
        tick();
      }
      setListening(true);
      setStatus("listening");
    } catch {
      setError("Microphone access was blocked. Allow it in the browser, or type your command below.");
      setStatus("error");
      return;
    }

    const Ctor = recognitionCtor();
    if (!Ctor) {
      setError("Speech recognition isn't available in this browser — type your command below.");
      return;
    }
    const rec = new Ctor();
    rec.lang = localeFor(settings.language);
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const chunk = result[0]?.transcript ?? "";
        if (result.isFinal) finalText += chunk;
        else interimText += chunk;
      }
      if (interimText) setInterim(interimText);
      if (finalText) {
        finalRef.current = `${finalRef.current} ${finalText}`.trim();
        setTranscript(finalRef.current);
        setInput(finalRef.current);
        setInterim("");
      }
    };
    rec.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setError("Speech recognition was blocked by the browser. Typed commands still work.");
        setStatus("error");
      }
    };
    rec.onend = () => {
      stopListening();
      if (finalRef.current.trim()) void submit(finalRef.current);
    };
    recognitionRef.current = rec;
    try {
      rec.start();
    } catch {
      setError("Speech recognition could not start. Try again or type your command.");
    }
  }, [settings.language, stopListening, submit]);

  const stopSpeaking = useCallback(() => {
    cancelCompanionVoice();
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setStatus("idle");
  }, []);

  const statusText: Record<VoiceStatus, string> = {
    idle: "Ready — press the mic or type a command",
    listening: "Listening… speak now",
    thinking: "AURIX is reasoning",
    speaking: "AURIX is responding",
    error: "Attention required",
  };

  return (
    <div className="nexus-panel rounded-2xl p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Waves className="w-4 h-4 text-[#00D9FF]" />
          <h3 className="text-[11px] font-mono uppercase tracking-[0.22em] text-[#A9C8D5]">Voice Command</h3>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.14em]">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              status === "error"
                ? "bg-rose-400"
                : status === "listening"
                  ? "bg-[#00D9FF] animate-pulse"
                  : status === "idle"
                    ? "bg-emerald-400"
                    : "bg-[#147DFF] animate-pulse"
            }`}
          />
          <span className="text-[#94A8B8]">{statusText[status]}</span>
        </div>
      </div>

      {/* waveform */}
      <div className="mt-3 flex h-14 items-end justify-center gap-[3px] overflow-hidden">
        {bars.map((value, i) => (
          <span
            key={i}
            className="w-[4px] rounded-full transition-[height] duration-75"
            style={{
              height: `${Math.max(6, value * 100)}%`,
              background:
                status === "error"
                  ? "linear-gradient(180deg,#FB7185,#7F1D1D)"
                  : "linear-gradient(180deg,#00D9FF,#147DFF)",
              opacity: status === "idle" ? 0.35 : 0.9,
            }}
          />
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => (listening ? stopListening() : void startListening())}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition-colors cursor-pointer ${
            listening
              ? "bg-[#00D9FF] text-[#05080D]"
              : "border border-[#00D9FF]/45 text-[#00D9FF] hover:bg-[#00D9FF]/10"
          }`}
        >
          {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          <span>{listening ? "Stop listening" : "Speak"}</span>
        </button>

        <form
          className="flex flex-1 min-w-[220px] items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const text = input.trim();
            if (!text) return;
            setTranscript(text);
            void submit(text);
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a command or question for AURIX…"
            className="flex-1 min-w-0 rounded-xl border border-[#00D9FF]/20 bg-[#05080D]/70 px-3.5 py-2.5 text-xs text-white placeholder:text-[#5B7185] outline-none focus:border-[#00D9FF]/60"
          />
          <button
            type="submit"
            disabled={status === "thinking" || !input.trim()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#147DFF] px-3.5 py-2.5 text-xs font-semibold text-white disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
          >
            <Send className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Send</span>
          </button>
        </form>

        <button
          type="button"
          onClick={stopSpeaking}
          className="inline-flex items-center gap-1.5 rounded-xl border border-[#A9C8D5]/25 px-3.5 py-2.5 text-xs font-medium text-[#A9C8D5] hover:border-[#A9C8D5]/60 cursor-pointer"
        >
          <Square className="w-3.5 h-3.5" />
          <span>Stop voice</span>
        </button>
      </div>

      {(transcript || interim) && (
        <div className="mt-3 rounded-xl border border-[#00D9FF]/15 bg-[#05080D]/60 px-3.5 py-2.5">
          <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-[#5B7185]">Transcript</div>
          <p className="mt-1 text-xs text-[#D6E6EE]">
            {transcript} <span className="text-[#5B7185]">{interim}</span>
          </p>
        </div>
      )}

      {reply && (
        <div className="mt-3 rounded-xl border border-[#2FE9C6]/25 bg-[#2FE9C6]/5 px-3.5 py-2.5">
          <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.16em] text-[#2FE9C6]">
            <Volume2 className="w-3 h-3" />
            AURIX
          </div>
          <p className="mt-1 text-xs leading-relaxed text-[#D6E6EE] whitespace-pre-wrap">{reply}</p>
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2 text-[11px] text-rose-200">
          {error}
        </p>
      )}
    </div>
  );
}
