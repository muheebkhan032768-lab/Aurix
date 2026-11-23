import React, { useEffect, useMemo, useRef } from "react";
import { useVoiceSnapshot, type VoiceSessionState } from "../../utils/voiceBus";

const STATE_LABEL: Record<VoiceSessionState, string> = {
  idle: "STANDBY",
  listening: "CAPTURING",
  processing: "TRANSCRIBING",
  thinking: "THINKING",
  speaking: "VOICE OUT",
  error: "ATTENTION",
};

const STATE_COLOR: Record<VoiceSessionState, string> = {
  idle: "text-[#5B7185]",
  listening: "text-[#00D9FF]",
  processing: "text-[#147DFF]",
  thinking: "text-[#00D9FF]",
  speaking: "text-[#2FE9C6]",
  error: "text-rose-300",
};

interface WordSpan {
  word: string;
  end: number;
}

/**
 * Live transcript: what the microphone is hearing, then DEX MADE's answer with the
 * word being spoken highlighted as the voice reaches it.
 */
export function LiveTranscriptPanel() {
  const voice = useVoiceSnapshot();

  const words = useMemo<WordSpan[]>(() => {
    const spans: WordSpan[] = [];
    const pattern = /\S+/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(voice.reply))) {
      spans.push({ word: match[0], end: match.index + match[0].length });
    }
    return spans;
  }, [voice.reply]);

  const speaking = voice.state === "speaking";
  const spokenWords = speaking && voice.spokenChars >= 0
    ? words.filter((span) => span.end <= voice.spokenChars).length
    : words.length;

  const activeRef = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [spokenWords]);

  const heard =
    voice.state === "listening"
      ? voice.interim || "Listening…"
      : voice.transcript || "Nothing captured yet.";

  return (
    <section
      className="nexus-panel rounded-2xl px-4 py-3"
      aria-label="DEX MADE live transcript"
      data-testid="live-transcript"
      data-transcript-state={voice.state}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[11px] font-mono uppercase tracking-[0.22em] text-[#A9C8D5]">Live transcript</h2>
        <span className={`text-[9px] font-mono uppercase tracking-[0.16em] ${STATE_COLOR[voice.state]}`}>
          {STATE_LABEL[voice.state]}
        </span>
      </div>

      <div className="mt-2 space-y-2">
        <div>
          <p className="text-[8px] font-mono uppercase tracking-[0.2em] text-[#3F5567]">You</p>
          <p
            className={`mt-0.5 line-clamp-2 text-[11px] leading-snug ${
              voice.state === "listening" ? "text-[#00D9FF]" : "text-[#94A8B8]"
            }`}
            data-testid="live-transcript-heard"
          >
            {heard}
          </p>
        </div>

        <div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[8px] font-mono uppercase tracking-[0.2em] text-[#3F5567]">DEX MADE</p>
            <span className="text-[8px] font-mono uppercase tracking-[0.14em] text-[#3F5567]">
              {words.length ? `${spokenWords}/${words.length} words` : "—"}
            </span>
          </div>
          <p
            className="mt-0.5 max-h-24 overflow-y-auto text-[11px] leading-relaxed text-[#5B7185]"
            data-testid="live-transcript-reply"
          >
            {words.length === 0 ? (
              <span className="text-[#3F5567]">No reply yet — hold the talk key and speak.</span>
            ) : (
              words.map((span, index) => {
                const spoken = index < spokenWords;
                const current = speaking && index === spokenWords;
                return (
                  <span
                    key={`${span.word}-${index}`}
                    ref={current ? activeRef : undefined}
                    className={spoken || current ? "text-[#E6F7FF]" : "text-[#5B7185]"}
                    style={
                      current
                        ? { textShadow: "0 0 10px rgba(0,217,255,0.65)" }
                        : spoken
                          ? { opacity: 0.92 }
                          : undefined
                    }
                  >
                    {span.word}{" "}
                  </span>
                );
              })
            )}
          </p>
        </div>
      </div>
    </section>
  );
}
