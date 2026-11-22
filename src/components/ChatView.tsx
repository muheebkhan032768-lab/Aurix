import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  Check,
  Copy,
  Mic,
  Paperclip,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Volume2,
  X,
} from "lucide-react";
import type {
  AppSettings,
  AurixLanguage,
  ChatMessage,
  ConversationSummary,
  ThinkingDepth,
  WebsiteRecord,
} from "../types/aurix";
import { AurixOrb } from "./AurixOrb";
import { MarkdownLite } from "./chat/MarkdownLite";

interface ChatViewProps {
  conversations: ConversationSummary[];
  websites: WebsiteRecord[];
  settings: AppSettings;
  pendingQuickPrompt: string | null;
  onClearPendingQuickPrompt: () => void;
  onConversationsUpdated: (convs: ConversationSummary[]) => void;
}

interface Attachment {
  name: string;
  mimeType: string;
  dataUrl?: string;
  text?: string;
}

const SUGGESTIONS = [
  "Draft a launch plan for my next AM Veyronix product",
  "Explain this codebase and suggest improvements",
  "Summarise what you remember about my business goals",
  "Write a polite client email in English and Urdu",
];

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

function compressImage(file: File): Promise<string> {
  return readAsDataUrl(file).then(
    (dataUrl) =>
      new Promise<string>((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
          const max = 1280;
          const scale = Math.min(1, max / Math.max(image.width, image.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(image.width * scale));
          canvas.height = Math.max(1, Math.round(image.height * scale));
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("Canvas unavailable"));
            return;
          }
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.85));
        };
        image.onerror = () => reject(new Error("Could not read image"));
        image.src = dataUrl;
      })
  );
}

export function ChatView({
  conversations,
  websites,
  settings,
  pendingQuickPrompt,
  onClearPendingQuickPrompt,
  onConversationsUpdated,
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
  const [query, setQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [dictating, setDictating] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);

  const filteredConversations = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return conversations;
    return conversations.filter((c) => c.title.toLowerCase().includes(needle));
  }, [conversations, query]);

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
    if ((!trimmed && !attachment) || loading) return;
    setError(null);
    setLoading(true);

    const attachedName = attachment?.name;
    let composed = trimmed;
    try {
      if (attachment) {
        if (attachment.dataUrl) {
          const res = await fetch("/api/vision/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mode: "vision",
              prompt: trimmed || "Describe this attachment in detail and note anything important.",
              fileName: attachment.name,
              mimeType: attachment.mimeType,
              base64Data: attachment.dataUrl.split(",")[1],
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Attachment analysis failed.");
          composed = `${trimmed || "Analyse the attached file."}\n\n[Attached: ${attachment.name}]\n${data.analysis}`;
        } else {
          composed = `${trimmed || "Summarise the attached file."}\n\n[Attached: ${attachment.name}]\n${(attachment.text || "").slice(0, 14000)}`;
        }
        setAttachment(null);
      }

      const optimisticUser: ChatMessage = {
        id: `temp_${Date.now()}`,
        conversationId: activeConvId || "new",
        role: "user",
        content: trimmed || `Attached: ${attachedName}`,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimisticUser]);
      setInput("");

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: activeConvId,
          message: composed,
          model: settings.activeModel,
          language,
          thinkingLevel,
          scopedWebsite,
          mode: "chat",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to reach AURIX core.");
      }
      setActiveConvId(data.conversationId);
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== optimisticUser.id),
        data.userMessage,
        data.assistantMessage,
      ]);
      if (Array.isArray(data.conversations)) {
        onConversationsUpdated(data.conversations);
      }
    } catch (err) {
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
      setError(err instanceof Error ? err.message : "Could not play AURIX voice.");
    }
  };

  const copyMessage = async (msg: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(msg.content);
      setCopiedId(msg.id);
      window.setTimeout(() => setCopiedId(null), 1600);
    } catch {
      setError("Clipboard is blocked in this browser.");
    }
  };

  const regenerate = (assistantId: string) => {
    const index = messages.findIndex((m) => m.id === assistantId);
    const previousUser = [...messages.slice(0, index)].reverse().find((m) => m.role === "user");
    if (previousUser) sendMessage(previousUser.content);
  };

  const saveEdit = (msg: ChatMessage) => {
    const next = editDraft.trim();
    setEditingId(null);
    setEditDraft("");
    if (next && next !== msg.content) sendMessage(next);
  };

  const toggleDictation = () => {
    const Ctor =
      (window as unknown as { SpeechRecognition?: new () => unknown }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => unknown }).webkitSpeechRecognition;
    if (!Ctor) {
      setError("Voice input is not available in this browser.");
      return;
    }
    if (dictating) {
      recognitionRef.current?.stop();
      setDictating(false);
      return;
    }
    const recognition = new Ctor() as {
      lang: string;
      interimResults: boolean;
      continuous: boolean;
      start: () => void;
      stop: () => void;
      onresult: (event: { results?: ArrayLike<ArrayLike<{ transcript?: string }>> }) => void;
      onend: () => void;
      onerror: () => void;
    };
    recognition.lang = language === "Urdu" ? "ur-PK" : language === "Hindi" ? "hi-IN" : "en-GB";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript;
      if (transcript) setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
    };
    recognition.onend = () => setDictating(false);
    recognition.onerror = () => setDictating(false);
    recognition.start();
    recognitionRef.current = recognition;
    setDictating(true);
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      if (file.type.startsWith("image/")) {
        setAttachment({ name: file.name, mimeType: "image/jpeg", dataUrl: await compressImage(file) });
      } else if (file.type === "application/pdf") {
        setAttachment({ name: file.name, mimeType: file.type, dataUrl: await readAsDataUrl(file) });
      } else {
        setAttachment({ name: file.name, mimeType: file.type || "text/plain", text: await file.text() });
      }
    } catch {
      setError("Could not read that file.");
    }
  };

  const startNewChat = () => {
    setActiveConvId(undefined);
    setMessages([]);
    setError(null);
    setAttachment(null);
    setHistoryOpen(false);
  };

  const orbState = loading ? "thinking" : speakingId ? "speaking" : dictating ? "listening" : "idle";

  return (
    <div className="grid h-[calc(100dvh-9rem)] min-h-[600px] grid-cols-1 gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      {/* Conversation history */}
      <aside
        className={`${historyOpen ? "flex" : "hidden"} aurix-card min-h-0 flex-col p-3 lg:flex`}
      >
        <button
          type="button"
          onClick={startNewChat}
          className="aurix-btn-primary inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold"
        >
          <Plus className="h-4 w-4" />
          New chat
        </button>

        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#6B6880]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversations"
            aria-label="Search conversations"
            className="w-full rounded-xl border border-black/5 bg-[#F6F5FB] py-2 pl-9 pr-3 text-xs text-[#1A1826] outline-none transition focus:border-[#7C5CFF]/50 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100"
          />
        </div>

        <div className="mt-3 flex-1 space-y-1 overflow-y-auto pr-1">
          {filteredConversations.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-[#6B6880]">
              {conversations.length === 0 ? "No conversations yet." : "No matches."}
            </p>
          ) : (
            filteredConversations.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setActiveConvId(c.id);
                  setHistoryOpen(false);
                }}
                className={`w-full cursor-pointer rounded-xl px-3 py-2.5 text-left text-xs transition-colors ${
                  activeConvId === c.id
                    ? "bg-[#7C5CFF]/10 font-medium text-[#1A1826] dark:bg-white/[0.08] dark:text-white"
                    : "text-[#6B6880] hover:bg-black/[0.03] dark:text-slate-300 dark:hover:bg-white/[0.04]"
                }`}
              >
                <div className="truncate">{c.title}</div>
                <div className="mt-0.5 font-mono text-[10px] text-[#9C99AD] tabular-nums">
                  {c.language} · {c.updatedAt.slice(0, 10)}
                </div>
              </button>
            ))
          )}
        </div>

        <div className="mt-3 rounded-xl border border-black/5 bg-[#F6F5FB] px-3 py-2 dark:border-white/10 dark:bg-white/[0.03]">
          <div className="text-[9px] font-medium uppercase tracking-[0.18em] text-[#9C99AD]">
            Active model
          </div>
          <div className="mt-0.5 truncate font-mono text-[11px] text-[#1A1826] dark:text-slate-200">
            {settings.activeModel}
          </div>
        </div>
      </aside>

      {/* Chat workspace */}
      <section className="aurix-card flex min-h-0 flex-col overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/5 px-4 py-2.5 dark:border-white/10">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setHistoryOpen((v) => !v)}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-black/5 px-2.5 py-1.5 text-[11px] font-medium text-[#6B6880] lg:hidden dark:border-white/10 dark:text-slate-300"
            >
              Chats
            </button>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#7C5CFF]/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7C5CFF] dark:bg-[#7C5CFF]/20 dark:text-[#C4B5FD]">
              <Sparkles className="h-3 w-3" />
              AURIX Core
            </span>
            <select
              value={scopedWebsite}
              onChange={(e) => setScopedWebsite(e.target.value)}
              aria-label="Project scope"
              className="rounded-lg border border-black/5 bg-[#F6F5FB] px-2 py-1.5 text-[11px] text-[#1A1826] outline-none dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200"
            >
              <option value="All">All records</option>
              {websites.map((w) => (
                <option key={w.id} value={w.name}>
                  {w.name}
                </option>
              ))}
            </select>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as AurixLanguage)}
              aria-label="Language"
              className="rounded-lg border border-black/5 bg-[#F6F5FB] px-2 py-1.5 text-[11px] text-[#1A1826] outline-none dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200"
            >
              <option value="English">English</option>
              <option value="Urdu">Urdu</option>
              <option value="Hindi">Hindi</option>
            </select>
            <select
              value={thinkingLevel}
              onChange={(e) => setThinkingLevel(e.target.value as ThinkingDepth)}
              aria-label="Reasoning depth"
              className="rounded-lg border border-black/5 bg-[#F6F5FB] px-2 py-1.5 font-mono text-[11px] text-[#1A1826] outline-none dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200"
            >
              <option value="LOW">LOW</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="HIGH">HIGH</option>
              <option value="XHIGH">XHIGH</option>
            </select>
          </div>
          <span className="font-mono text-[10px] text-[#9C99AD]">{settings.voiceName} · Sir</span>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-3 py-5 sm:px-6">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <AurixOrb state={orbState} size={132} />
              <h3 className="mt-5 font-display text-xl font-semibold text-[#1A1826] dark:text-white">
                How can I help, Sir?
              </h3>
              <p className="mt-1.5 max-w-md text-sm leading-relaxed text-[#6B6880] dark:text-slate-400">
                Ask about strategy, code, research, documents or your websites — in English, Urdu or Hindi.
              </p>
              <div className="mt-6 grid w-full max-w-xl grid-cols-1 gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => sendMessage(suggestion)}
                    className="cursor-pointer rounded-xl border border-black/5 bg-white/70 px-3.5 py-2.5 text-left text-[12px] text-[#4A4759] transition-colors hover:border-[#7C5CFF]/40 hover:text-[#1A1826] dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300 dark:hover:border-[#7C5CFF]/40 dark:hover:text-white"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) => {
              const isUser = m.role === "user";
              return (
                <div key={m.id} className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
                  {!isUser && (
                    <div className="mt-0.5 shrink-0">
                      <AurixOrb state={speakingId === m.id ? "speaking" : "idle"} size={34} />
                    </div>
                  )}
                  <div className={`min-w-0 max-w-[min(46rem,92%)] ${isUser ? "items-end" : ""}`}>
                    <div
                      className={`mb-1 flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-[#9C99AD] ${
                        isUser ? "justify-end" : ""
                      }`}
                    >
                      <span>{isUser ? "Abdul Muheeb" : "AURIX"}</span>
                      {m.modelUsed && !isUser ? <span className="font-mono normal-case">{m.modelUsed}</span> : null}
                      <span className="font-mono tabular-nums">{m.createdAt.slice(11, 19)}</span>
                    </div>

                    {editingId === m.id ? (
                      <div className="rounded-2xl border border-[#7C5CFF]/40 bg-white p-2 dark:bg-[#12121A]">
                        <textarea
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          rows={3}
                          className="w-full resize-none bg-transparent px-2 py-1.5 text-sm text-[#1A1826] outline-none dark:text-slate-100"
                        />
                        <div className="mt-1 flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="cursor-pointer rounded-lg px-2.5 py-1 text-[11px] text-[#6B6880] hover:bg-black/5 dark:hover:bg-white/10"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => saveEdit(m)}
                            className="aurix-btn-primary cursor-pointer rounded-lg px-2.5 py-1 text-[11px] font-semibold"
                          >
                            Save &amp; resend
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className={`rounded-2xl px-4 py-3 text-sm ${
                          isUser
                            ? "bg-[linear-gradient(135deg,#7C5CFF,#6D3EF5)] text-white shadow-[0_14px_30px_-18px_rgba(124,92,255,0.9)]"
                            : "border border-black/5 bg-[#FBFBFF] text-[#26242F] dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100"
                        }`}
                      >
                        {isUser ? (
                          <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                        ) : (
                          <MarkdownLite content={m.content} />
                        )}
                      </div>
                    )}

                    {!isUser && editingId !== m.id && (
                      <div className="mt-1.5 flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => copyMessage(m)}
                          className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-[#6B6880] transition-colors hover:bg-black/5 hover:text-[#1A1826] dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
                        >
                          {copiedId === m.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                          {copiedId === m.id ? "Copied" : "Copy"}
                        </button>
                        <button
                          type="button"
                          onClick={() => regenerate(m.id)}
                          disabled={loading}
                          className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-[#6B6880] transition-colors hover:bg-black/5 hover:text-[#1A1826] disabled:opacity-40 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
                        >
                          <RefreshCw className="h-3 w-3" />
                          Regenerate
                        </button>
                        <button
                          type="button"
                          onClick={() => speakReply(m)}
                          disabled={speakingId === m.id}
                          className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-[#6B6880] transition-colors hover:bg-black/5 hover:text-[#1A1826] disabled:opacity-40 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
                        >
                          <Volume2 className="h-3 w-3" />
                          {speakingId === m.id ? "Speaking" : "Speak"}
                        </button>
                      </div>
                    )}

                    {isUser && editingId !== m.id && (
                      <div className="mt-1.5 flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => copyMessage(m)}
                          className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-[#6B6880] transition-colors hover:bg-black/5 hover:text-[#1A1826] dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
                        >
                          {copiedId === m.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                          {copiedId === m.id ? "Copied" : "Copy"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(m.id);
                            setEditDraft(m.content);
                          }}
                          className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-[#6B6880] transition-colors hover:bg-black/5 hover:text-[#1A1826] dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
                        >
                          <Pencil className="h-3 w-3" />
                          Edit
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {loading && (
            <div className="flex items-center gap-3">
              <AurixOrb state="thinking" size={34} />
              <div className="rounded-2xl border border-black/5 bg-[#FBFBFF] px-4 py-2.5 text-xs text-[#6B6880] dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300">
                AURIX is reasoning · {thinkingLevel.toLowerCase()}
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-rose-300/60 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
              {error}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Composer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage(input);
          }}
          className="border-t border-black/5 p-3 sm:p-4 dark:border-white/10"
        >
          {attachment && (
            <div className="mb-2 inline-flex items-center gap-2 rounded-lg border border-black/5 bg-[#F6F5FB] px-2.5 py-1.5 text-[11px] text-[#4A4759] dark:border-white/10 dark:bg-white/[0.05] dark:text-slate-300">
              <Paperclip className="h-3 w-3 text-[#7C5CFF]" />
              <span className="max-w-[16rem] truncate">{attachment.name}</span>
              <button
                type="button"
                onClick={() => setAttachment(null)}
                aria-label="Remove attachment"
                className="cursor-pointer text-[#9C99AD] hover:text-rose-500"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
          <div className="flex items-end gap-2 rounded-2xl border border-black/10 bg-white p-1.5 pl-2 shadow-[0_10px_30px_-24px_rgba(26,24,38,0.5)] focus-within:border-[#7C5CFF]/50 dark:border-white/10 dark:bg-white/[0.04]">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf,.txt,.md,.csv,.json,.log"
              className="hidden"
              onChange={(e) => {
                handleFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Attach file or image"
              aria-label="Attach file or image"
              className="cursor-pointer rounded-xl p-2 text-[#6B6880] transition-colors hover:bg-black/5 hover:text-[#1A1826] dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={toggleDictation}
              title={dictating ? "Stop dictation" : "Dictate with your voice"}
              aria-label={dictating ? "Stop dictation" : "Dictate with your voice"}
              className={`cursor-pointer rounded-xl p-2 transition-colors ${
                dictating
                  ? "bg-[#7C5CFF]/15 text-[#7C5CFF]"
                  : "text-[#6B6880] hover:bg-black/5 hover:text-[#1A1826] dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
              }`}
            >
              <Mic className="h-4 w-4" />
            </button>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage(input);
                }
              }}
              rows={1}
              placeholder={`Message AURIX in ${language}…`}
              className="max-h-32 min-h-[2.5rem] flex-1 resize-none bg-transparent px-1 py-2 text-sm text-[#1A1826] outline-none placeholder:text-[#9C99AD] dark:text-slate-100"
            />
            <button
              type="submit"
              disabled={loading || (!input.trim() && !attachment)}
              aria-label="Send message"
              className="aurix-btn-primary inline-flex shrink-0 cursor-pointer items-center justify-center rounded-xl p-2.5 disabled:opacity-40"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-2 text-center text-[10px] text-[#9C99AD]">
            AURIX may be inaccurate — verify important details. Voice: {settings.voiceName} · Powered by AM Veyronix.
          </p>
        </form>
      </section>
    </div>
  );
}
