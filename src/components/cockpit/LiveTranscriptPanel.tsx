import React, { useEffect, useMemo, useRef } from "react";
import { useVoiceSnapshot, type VoiceSessionState } from "../../utils/voiceBus";

const STATE_LABEL: Record<VoiceSessionState, string> = {
  idle: "STANDBY",
  listening: "CAPTURING",
  processing: "TRANSCRIBING",
  speaking: "VOICE OUT",
  error: "ATTENTION",
};

const STATE_COLOR: Record<VoiceSessionState, string> = {
  idle: "text-[#5B7185]",
  listening: "text-[#00D9FF]",
  processing: "text-[#147DFF]",
  speaking: "text-[#2FE9C6]",
  error: "text-rose-300",
};

interface WordSpan {
  word: string;
  end: number;
}

function clock(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * Live transcript: recognised speech, AURIX's answer with the word being
 * spoken highlighted as the voice reaches it, and the finished exchange
 * history with speaker labels and timestamps.
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
  const spokenWords =
    speaking && voice.spokenChars >= 0
      ? words.filter((span) => span.end <= voice.spokenChars).length
      : words.length;

  const activeRef = useRef<HTMLSpanElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [spokenWords]);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [voice.history.length]);

  const heard =
    voice.state === "listening"
      ? voice.interim || "Listening…"
      : voice.transcript || "Nothing captured yet.";

  const history = voice.history.slice(-12);

  return (
    <section
      className="nexus-panel rounded-2xl px-4 py-3"
      aria-label="AURIX live transcript"
      data-testid="live-transcript"
      data-transcript-state={voice.state}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[11px] font-mono uppercase tracking-[0.22em] text-[#A9C8D5]">Live transcript</h2>
        <span className={`text-[9px] font-mono uppercase tracking-[0.16em] ${STATE_COLOR[voice.state]}`}>
          {STATE_LABEL[voice.state]}
        </span>
      </div>

      {/* Finished exchanges */}
      {history.length > 0 && (
        <div
          ref={scrollRef}
          className="mt-2 max-h-[132px] space-y-1.5 overflow-y-auto pr-1"
          data-testid="live-transcript-history"
          aria-label="Conversation history"
        >
          {history.map((entry) => (
            <div key={entry.id} className="rounded-lg border border-white/5 bg-[#05080D]/40 px-2 py-1.5">
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`text-[8px] font-mono uppercase tracking-[0.18em] ${
                    entry.role === "user" ? "text-[#7DE9FF]" : "text-[#2FE9C6]"
                  }`}
                >
                  {entry.role === "user" ? "You" : "AURIX"}
                </span>
                <span className="text-[8px] font-mono tabular-nums text-[#3F5567]">{clock(entry.at)}</span>
              </div>
              <p
                className={`mt-0.5 line-clamp-3 text-[10px] leading-snug ${
                  entry.ok === false ? "text-amber-200/80" : "text-[#A9C8D5]"
                }`}
              >
                {entry.text}
              </p>
            </div>
          ))}
        </div>
      )}

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
            <p className="text-[8px] font-mono uppercase tracking-[0.2em] text-[#3F5567]">AURIX</p>
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
