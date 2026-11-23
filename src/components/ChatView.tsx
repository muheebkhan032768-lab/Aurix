import React, { useEffect, useRef, useState } from "react";
import { Plus, Send, Volume2 } from "lucide-react";
import type {
  AppSettings,
  AurixLanguage,
  AurixSectionId,
  ChatMessage,
  ConversationSummary,
  ThinkingDepth,
  WebsiteRecord,
} from "../types/aurix";

interface ChatViewProps {
  conversations: ConversationSummary[];
  websites: WebsiteRecord[];
  settings: AppSettings;
  pendingQuickPrompt: string | null;
  onClearPendingQuickPrompt: () => void;
  onConversationsUpdated: (convs: ConversationSummary[]) => void;
  onNavigate?: (section: AurixSectionId) => void;
}

export function ChatView({
  conversations,
  websites,
  settings,
  pendingQuickPrompt,
  onClearPendingQuickPrompt,
  onConversationsUpdated,
  onNavigate,
}: ChatViewProps) {
  const [activeConvId, setActiveConvId] = useState<string | undefined>(conversations[0]?.id);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [scopedWebsite, setScopedWebsite] = useState("All");
  const [language, setLanguage] = useState<AurixLanguage>(settings.language);
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingDepth>(settings.thinkingLevel);
  const [loading, setLoading] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activeConvId) {
      setMessages([]);
      return;
    }
    fetch(`/api/conversations/${activeConvId}/messages`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setMessages(data);
      })
      .catch(() => {});
  }, [activeConvId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = async (textToSend: string) => {
    const trimmed = textToSend.trim();
    if (!trimmed || loading) return;
    setError(null);
    setLoading(true);

    const optimisticUser: ChatMessage = {
      id: `temp_${Date.now()}`,
      conversationId: activeConvId || "new",
      role: "user",
      content: trimmed,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUser]);
    setInput("");

    const streamId = `stream_${Date.now()}`;
    try {
      // Server-sent events: the answer is rendered while it is generated.
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: activeConvId,
          message: trimmed,
          model: settings.activeModel,
          language,
          thinkingLevel,
          scopedWebsite,
          mode: "chat",
        }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to reach DEX MADE core.");
      }

      setMessages((prev) => [
        ...prev,
        {
          id: streamId,
          conversationId: activeConvId || "new",
          role: "assistant",
          content: "",
          createdAt: new Date().toISOString(),
        },
      ]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";

      const handleEvent = (raw: string) => {
        let event = "message";
        let dataText = "";
        for (const line of raw.split("\n")) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) dataText += line.slice(5).trim();
        }
        if (!dataText) return;
        const data = JSON.parse(dataText);
        if (event === "start") {
          setActiveConvId(data.conversationId);
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id === optimisticUser.id) return data.userMessage as ChatMessage;
              if (m.id === streamId) return { ...m, conversationId: data.conversationId };
              return m;
            })
          );
        } else if (event === "delta") {
          fullText += data.text;
          setMessages((prev) => prev.map((m) => (m.id === streamId ? { ...m, content: fullText } : m)));
        } else if (event === "done") {
          setMessages((prev) =>
            prev.map((m) => (m.id === streamId ? (data.assistantMessage as ChatMessage) : m))
          );
          if (Array.isArray(data.conversations)) onConversationsUpdated(data.conversations);
          // Link Vault answers carry the action the answer describes.
          if (data.action?.type === "navigate" && data.action.section) {
            onNavigate?.(data.action.section as AurixSectionId);
          } else if (data.action?.type === "open_url" && data.action.url) {
            window.open(data.action.url, "_blank", "noopener,noreferrer");
          } else if (data.action?.type === "copy_url" && data.action.url) {
            navigator.clipboard?.writeText(data.action.url).catch(() => {});
          }
        } else if (event === "error") {
          throw new Error(data.error || "Conversation error.");
        }
      };

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        for (const part of parts) handleEvent(part);
      }
      if (buffer.trim()) handleEvent(buffer);
    } catch (err) {
      // Drop the empty placeholder so a failed request leaves no ghost bubble.
      setMessages((prev) => prev.filter((m) => !(m.id === streamId && !m.content.trim())));
      setError(err instanceof Error ? err.message : "Conversation error.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (pendingQuickPrompt) {
      const prompt = pendingQuickPrompt;
      onClearPendingQuickPrompt();
      setActiveConvId(undefined);
      setMessages([]);
      sendMessage(prompt);
    }
  }, [pendingQuickPrompt]);

  const speakReply = async (msg: ChatMessage) => {
    try {
      setSpeakingId(msg.id);
      const res = await fetch("/api/voice/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: msg.content,
          voiceName: settings.voiceName,
          language,
          speed: settings.voiceSpeed,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Voice synthesis failed.");
      const audio = new Audio(`data:${data.mimeType || "audio/wav"};base64,${data.audioBase64}`);
      audio.onended = () => setSpeakingId(null);
      audio.onerror = () => setSpeakingId(null);
      await audio.play();
    } catch (err) {
      setSpeakingId(null);
      setError(err instanceof Error ? err.message : "Could not play DEX MADE voice.");
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-140px)] min-h-[560px]">
      {/* Conversation History Column */}
      <aside className="lg:col-span-3 bg-white dark:bg-[#0D1420] border border-slate-200 dark:border-slate-800/80 rounded-xl p-4 flex flex-col">
        <button
          type="button"
          onClick={() => {
            setActiveConvId(undefined);
            setMessages([]);
            setError(null);
          }}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-cyan-700 hover:bg-cyan-600 text-white text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>New Session</span>
        </button>

        <div className="mt-4 text-xs font-medium text-slate-500 dark:text-slate-400 px-1">
          Recent Sessions
        </div>
        <div className="mt-2 flex-1 overflow-y-auto space-y-1">
          {conversations.length === 0 ? (
            <p className="text-xs text-slate-500 px-2 py-4">No saved sessions yet.</p>
          ) : (
            conversations.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setActiveConvId(c.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-xs transition-colors cursor-pointer ${
                  activeConvId === c.id
                    ? "bg-cyan-500/10 text-accent font-medium"
                    : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60"
                }`}
              >
                <div className="truncate">{c.title}</div>
                <div className="mt-0.5 text-[11px] text-muted-ink font-mono tabular-nums">
                  {c.language} · {c.updatedAt.slice(0, 10)}
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* Active Chat Workspace */}
      <section className="lg:col-span-9 bg-white dark:bg-[#0D1420] border border-slate-200 dark:border-slate-800/80 rounded-xl flex flex-col overflow-hidden">
        {/* Controls Toolbar */}
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
              <span>Project Scope:</span>
              <select
                value={scopedWebsite}
                onChange={(e) => setScopedWebsite(e.target.value)}
                className="bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100"
              >
                <option value="All">All Isolated Records</option>
                {websites.map((w) => (
                  <option key={w.id} value={w.name}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
              <span>Language:</span>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as AurixLanguage)}
                className="bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100"
              >
                <option value="English">English</option>
                <option value="Urdu">Urdu</option>
                <option value="Hindi">Hindi</option>
              </select>
            </label>

            <label className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
              <span>Reasoning:</span>
              <select
                value={thinkingLevel}
                onChange={(e) => setThinkingLevel(e.target.value as ThinkingDepth)}
                className="bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 font-mono"
              >
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH</option>
                <option value="XHIGH">XHIGH</option>
              </select>
            </label>
          </div>

          <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
            {settings.activeModel}
          </span>
        </div>

        {/* Message Feed */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                DEX MADE Intelligence Ready
              </h3>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                Ask about architecture, code debugging, AM VEYRONIX strategy, website planning, mathematics, or documents in English, Urdu, or Hindi.
              </p>
            </div>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}
              >
                <div className="flex items-center gap-2 mb-1 text-[11px] text-muted-ink">
                  <span>{m.role === "user" ? "Abdul Muheeb" : "DEX MADE"}</span>
                  {m.modelUsed && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">{m.modelUsed}</span>
                    </>
                  )}
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">{m.createdAt.slice(11, 19)}</span>
                </div>
                <div
                  className={`max-w-3xl rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-cyan-700 text-white"
                      : "bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100"
                  }`}
                >
                  {m.content}
                </div>
                {m.role === "assistant" && (
                  <button
                    type="button"
                    onClick={() => speakReply(m)}
                    disabled={speakingId === m.id}
                    className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-cyan-500 transition-colors cursor-pointer"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>{speakingId === m.id ? "Speaking..." : `Speak (${settings.voiceName})`}</span>
                  </button>
                )}
              </div>
            ))
          )}
          {loading && (
            <div className="text-xs text-accent font-mono">
              DEX MADE is reasoning ({thinkingLevel})...
            </div>
          )}
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-600 dark:text-red-400">
              {error}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input Composer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage(input);
          }}
          className="p-4 border-t border-slate-200 dark:border-slate-800/80 flex gap-3"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Message DEX MADE in ${language}...`}
            className="flex-1 bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 text-white text-sm font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Send className="w-4 h-4" />
            <span>Send</span>
          </button>
        </form>
      </section>
    </div>
  );
}
