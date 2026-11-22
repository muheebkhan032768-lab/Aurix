import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  Bot,
  Check,
  Copy,
  FileText,
  Image as ImageIcon,
  Mic,
  Paperclip,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Square,
  Trash2,
  Volume2,
  X,
} from "lucide-react";
import type { AppSettings, AurixLanguage, ChatMessage, ConversationSummary, ThinkingDepth } from "../../types/aurix";
import { Markdown } from "../Markdown";
import { ConfirmDialog, EmptyState, InlineError, timeAgo } from "../ui";
import { getVoiceControls } from "../voiceControls";
import type { ComposerAttachment, PendingAsk } from "../pending";

type Attachment = ComposerAttachment;

interface ChatWorkspaceProps {
  conversations: ConversationSummary[];
  settings: AppSettings;
  pendingAsk: PendingAsk | null;
  onConsumePendingAsk: () => void;
  onConversationsUpdated: (conversations: ConversationSummary[]) => void;
}

const SUGGESTIONS = [
  { title: "Debug my code", prompt: "Review this bug and explain the root cause before fixing it: " },
  { title: "Plan a project", prompt: "Help me plan a project step by step, with milestones and risks." },
  { title: "Write & refine", prompt: "Draft a professional email and then tighten it for clarity." },
  { title: "Understand a document", prompt: "Summarise the attached document and list the key decisions." },
];

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function ChatWorkspace({
  conversations,
  settings,
  pendingAsk,
  onConsumePendingAsk,
  onConversationsUpdated,
}: ChatWorkspaceProps) {
  const [activeId, setActiveId] = useState<string | undefined>(conversations[0]?.id);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [language, setLanguage] = useState<AurixLanguage>(settings.language);
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingDepth>(settings.thinkingLevel);
  const [loading, setLoading] = useState(false);
  const [thinkingPhase, setThinkingPhase] = useState<"thinking" | "writing">("thinking");
  const [error, setError] = useState<string | null>(null);
  const [lastAttempt, setLastAttempt] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ConversationSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const filteredConversations = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => c.title.toLowerCase().includes(q));
  }, [conversations, search]);

  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/conversations/${activeId}/messages`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Could not load this conversation."))))
      .then((data) => {
        if (!cancelled && Array.isArray(data)) setMessages(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load messages.");
      });
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setSpeakingId(null);
  };

  const send = async (raw: string, conversationOverride?: string, initialAttachments?: Attachment[]) => {
    const trimmed = raw.trim();
    if (!trimmed || loading) return;
    setError(null);
    setLoading(true);
    setThinkingPhase("thinking");
    const phaseTimer = window.setTimeout(() => setThinkingPhase("writing"), 2200);
    setLastAttempt(trimmed);

    const activeAttachments = initialAttachments ?? attachments;
    const textAttachments = activeAttachments.filter((a) => a.text);
    const imageAttachments = activeAttachments.filter((a) => a.dataBase64);
    const composed = textAttachments.length
      ? `${trimmed}\n\n${textAttachments
          .map((a) => `--- Attached file: ${a.name} ---\n${(a.text || "").slice(0, 20_000)}`)
          .join("\n\n")}`
      : trimmed;

    const optimistic: ChatMessage = {
      id: `temp_${Date.now()}`,
      conversationId: conversationOverride || activeId || "new",
      role: "user",
      content: trimmed + (activeAttachments.length ? `\n\n[${activeAttachments.length} attachment${activeAttachments.length > 1 ? "s" : ""}]` : ""),
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setInput("");
    const sentAttachments = activeAttachments;
    if (!initialAttachments) setAttachments([]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: conversationOverride || activeId,
          message: composed,
          model: settings.activeModel,
          language,
          thinkingLevel,
          scopedWebsite: "All",
          mode: "chat",
          attachments: imageAttachments.map((a) => ({
            name: a.name,
            mimeType: a.mimeType,
            dataBase64: a.dataBase64,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "AURIX could not answer that request.");
      setActiveId(data.conversationId);
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== optimistic.id),
        data.userMessage,
        data.assistantMessage,
      ]);
      if (Array.isArray(data.conversations)) onConversationsUpdated(data.conversations);
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setAttachments(sentAttachments);
      setInput(trimmed);
      setError(err instanceof Error ? err.message : "Conversation failed.");
    } finally {
      window.clearTimeout(phaseTimer);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!pendingAsk) return;
    const ask = pendingAsk;
    onConsumePendingAsk();
    setActiveId(undefined);
    setMessages([]);
    void send(ask.text, undefined, ask.attachments);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAsk]);

  const regenerate = async () => {
    if (!activeId || loading) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/chat/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: activeId,
          model: settings.activeModel,
          language,
          thinkingLevel,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Regeneration failed.");
      setMessages((prev) => {
        const withoutLastAssistant = [...prev];
        while (withoutLastAssistant.length && withoutLastAssistant[withoutLastAssistant.length - 1].role === "assistant") {
          withoutLastAssistant.pop();
        }
        return [...withoutLastAssistant, data.assistantMessage];
      });
      if (Array.isArray(data.conversations)) onConversationsUpdated(data.conversations);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Regeneration failed.");
    } finally {
      setLoading(false);
    }
  };

  const rename = async (id: string) => {
    const title = renameValue.trim();
    if (!title) return;
    try {
      const res = await fetch(`/api/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error("Rename failed.");
      const updated = (await res.json()) as ConversationSummary;
      onConversationsUpdated(conversations.map((c) => (c.id === id ? updated : c)));
      setRenamingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rename failed.");
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/conversations/${deleteTarget.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed.");
      onConversationsUpdated(data.conversations || conversations.filter((c) => c.id !== deleteTarget.id));
      if (activeId === deleteTarget.id) {
        setActiveId(undefined);
        setMessages([]);
      }
      setDeleteTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setDeleting(false);
    }
  };

  const speak = async (message: ChatMessage) => {
    if (speakingId === message.id) {
      stopAudio();
      return;
    }
    stopAudio();
    try {
      setSpeakingId(message.id);
      const res = await fetch("/api/voice/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: message.content,
          voiceName: settings.voiceName,
          language,
          speed: settings.voiceSpeed,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Voice synthesis is unavailable.");
      const audio = new Audio(`data:${data.mimeType || "audio/wav"};base64,${data.audioBase64}`);
      audioRef.current = audio;
      audio.onended = () => setSpeakingId(null);
      audio.onerror = () => {
        setSpeakingId(null);
        setError("The synthesized audio could not be played.");
      };
      await audio.play();
    } catch (err) {
      setSpeakingId(null);
      setError(err instanceof Error ? err.message : "Could not play the reply.");
    }
  };

  const copyMessage = async (message: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedId(message.id);
      window.setTimeout(() => setCopiedId(null), 1500);
    } catch {
      setError("Clipboard access is blocked by the browser.");
    }
  };

  const addFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setAttachmentError(null);
    const next: Attachment[] = [];
    for (const file of Array.from(files).slice(0, 4)) {
      if (file.size > 8 * 1024 * 1024) {
        setAttachmentError(`${file.name} is larger than 8 MB.`);
        continue;
      }
      const isImage = file.type.startsWith("image/");
      const isText =
        file.type.startsWith("text/") ||
        /\.(txt|md|markdown|json|csv|log|ts|tsx|js|jsx|py|html|css|yml|yaml|sql)$/i.test(file.name);
      if (isImage) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error("Could not read the image."));
          reader.readAsDataURL(file);
        });
        next.push({
          id: `${file.name}-${file.size}-${Date.now()}`,
          name: file.name,
          mimeType: file.type || "image/png",
          size: file.size,
          dataBase64: dataUrl.split(",")[1] || "",
        });
      } else if (isText) {
        next.push({
          id: `${file.name}-${file.size}-${Date.now()}`,
          name: file.name,
          mimeType: file.type || "text/plain",
          size: file.size,
          text: await file.text(),
        });
      } else {
        setAttachmentError(`${file.name}: only images and text-based files can be analysed.`);
      }
    }
    setAttachments((prev) => [...prev, ...next].slice(0, 4));
    if (fileRef.current) fileRef.current.value = "";
  };

  const startVoice = () => {
    const controls = getVoiceControls();
    if (!controls) {
      setError("The voice engine is still starting. Try again in a moment.");
      return;
    }
    controls.open();
    controls.start();
  };

  const activeConversation = conversations.find((c) => c.id === activeId);

  return (
    <div className="flex h-full min-h-0 gap-4">
      {/* Sessions */}
      <aside className="ws-card hidden w-[248px] shrink-0 flex-col overflow-hidden lg:flex">
        <div className="border-b border-[var(--ws-border)] p-3">
          <button
            type="button"
            className="ws-btn ws-btn-primary w-full"
            onClick={() => {
              stopAudio();
              setActiveId(undefined);
              setMessages([]);
              setError(null);
              setInput("");
              inputRef.current?.focus();
            }}
          >
            <Plus className="h-4 w-4" /> New conversation
          </button>
          <div className="relative mt-2.5">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ws-muted)]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations"
              className="ws-input !py-2 !pl-8 !text-[11px]"
            />
          </div>
        </div>
        <div className="ws-scroll flex-1 space-y-1 overflow-y-auto p-2">
          {filteredConversations.length === 0 ? (
            <p className="px-2 py-6 text-center text-[11px] text-[var(--ws-muted)]">
              {conversations.length === 0 ? "No saved conversations yet." : "No conversations match that search."}
            </p>
          ) : (
            filteredConversations.map((c) => {
              const active = c.id === activeId;
              return (
                <div
                  key={c.id}
                  className={`group rounded-xl border px-2.5 py-2 transition-colors ${
                    active
                      ? "border-[color-mix(in_srgb,var(--ws-accent)_38%,transparent)] bg-[color-mix(in_srgb,var(--ws-accent)_10%,transparent)]"
                      : "border-transparent hover:bg-[var(--ws-surface-2)]"
                  }`}
                >
                  {renamingId === c.id ? (
                    <div className="flex items-center gap-1">
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void rename(c.id);
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                        className="ws-input !px-2 !py-1 !text-[11px]"
                      />
                      <button type="button" className="ws-btn ws-btn-ghost !p-1" onClick={() => void rename(c.id)} aria-label="Save name">
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        stopAudio();
                        setActiveId(c.id);
                        setError(null);
                      }}
                      className="block w-full text-left"
                    >
                      <span className={`block truncate text-[11.5px] font-medium ${active ? "text-[var(--ws-text)]" : "text-[var(--ws-text)]/85"}`}>
                        {c.title}
                      </span>
                      <span className="mt-0.5 block truncate text-[10px] text-[var(--ws-muted)]">
                        {c.model} · {timeAgo(c.updatedAt)}
                      </span>
                    </button>
                  )}
                  <div className="mt-1 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <button
                      type="button"
                      className="ws-btn ws-btn-ghost !p-1 !text-[10px]"
                      onClick={() => {
                        setRenamingId(c.id);
                        setRenameValue(c.title);
                      }}
                      aria-label="Rename conversation"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      className="ws-btn ws-btn-ghost !p-1 !text-[10px] hover:!text-[#F0729B]"
                      onClick={() => setDeleteTarget(c)}
                      aria-label="Delete conversation"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
        <div className="border-t border-[var(--ws-border)] px-3 py-2 text-[9.5px] leading-relaxed text-[var(--ws-muted)]">
          Sessions are stored in the local SQLite database (`data/aurix.db`).
        </div>
      </aside>

      {/* Conversation */}
      <section className="ws-card flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--ws-border)] px-4 py-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-[var(--ws-accent)]" />
              <h2 className="truncate text-xs font-semibold text-[var(--ws-text)]">
                {activeConversation?.title || "New conversation"}
              </h2>
            </div>
            <p className="mt-0.5 text-[10px] text-[var(--ws-muted)]">
              {activeConversation ? `${activeConversation.model} · ${activeConversation.language}` : "Context-aware session · markdown & images"}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as AurixLanguage)}
              className="ws-input !w-auto !py-1.5 !text-[10.5px]"
              aria-label="Response language"
            >
              <option value="English">English</option>
              <option value="Urdu">Urdu</option>
              <option value="Hindi">Hindi</option>
            </select>
            <select
              value={thinkingLevel}
              onChange={(e) => setThinkingLevel(e.target.value as ThinkingDepth)}
              className="ws-input !w-auto !py-1.5 !font-mono !text-[10.5px]"
              aria-label="Reasoning depth"
            >
              <option value="LOW">LOW</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="HIGH">HIGH</option>
              <option value="XHIGH">XHIGH</option>
            </select>
            <button
              type="button"
              className="ws-btn ws-btn-ghost !px-2 !py-1.5 lg:hidden"
              onClick={() => {
                setActiveId(undefined);
                setMessages([]);
              }}
              aria-label="New conversation"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="ws-scroll flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {messages.length === 0 && !loading ? (
            <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center py-8 text-center">
              <div className="ws-orb ws-pulse mb-5 h-16 w-16 rounded-full" />
              <h3 className="font-display text-lg font-semibold text-[var(--ws-text)]">How may I help you, Sir?</h3>
              <p className="mt-1.5 max-w-md text-xs leading-relaxed text-[var(--ws-muted)]">
                Coding, debugging, writing, mathematics, translation, research, document and image understanding, or planning —
                with real server-side AI, not a simulated front end.
              </p>
              <div className="mt-5 grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.title}
                    type="button"
                    onClick={() => {
                      setInput(s.prompt);
                      inputRef.current?.focus();
                    }}
                    className="ws-inset px-3 py-2.5 text-left text-[11px] text-[var(--ws-muted)] transition-colors hover:text-[var(--ws-text)]"
                  >
                    <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ws-accent)]">
                      {s.title}
                    </span>
                    {s.prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-4">
              {messages.map((m, index) => {
                const isLast = index === messages.length - 1;
                return (
                  <div key={m.id} className={`ws-rise flex gap-2.5 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
                    <div
                      className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold ${
                        m.role === "user"
                          ? "bg-[var(--ws-surface-3)] text-[var(--ws-text)]"
                          : "bg-[linear-gradient(135deg,var(--ws-accent),var(--ws-accent-2))] text-[var(--ws-accent-ink)]"
                      }`}
                    >
                      {m.role === "user" ? "AM" : <Bot className="h-3.5 w-3.5" />}
                    </div>
                    <div className={`min-w-0 max-w-[86%] ${m.role === "user" ? "items-end text-right" : ""}`}>
                      <div
                        className={`rounded-2xl px-3.5 py-2.5 text-left ${
                          m.role === "user"
                            ? "bg-[color-mix(in_srgb,var(--ws-accent)_14%,var(--ws-surface-2))] border border-[color-mix(in_srgb,var(--ws-accent)_24%,transparent)]"
                            : "border border-[var(--ws-border)] bg-[var(--ws-surface-2)]"
                        }`}
                      >
                        {m.role === "assistant" ? (
                          <Markdown content={m.content} />
                        ) : (
                          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--ws-text)]">{m.content}</p>
                        )}
                      </div>
                      <div className={`mt-1 flex flex-wrap items-center gap-2 text-[9.5px] text-[var(--ws-muted)] ${m.role === "user" ? "justify-end" : ""}`}>
                        <span>{formatTime(m.createdAt)}</span>
                        {m.modelUsed && <span className="font-mono">{m.modelUsed}</span>}
                        {m.role === "assistant" && (
                          <>
                            <button type="button" className="ws-btn ws-btn-ghost !p-1 !text-[9.5px]" onClick={() => void copyMessage(m)}>
                              {copiedId === m.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                              {copiedId === m.id ? "Copied" : "Copy"}
                            </button>
                            <button type="button" className="ws-btn ws-btn-ghost !p-1 !text-[9.5px]" onClick={() => void speak(m)}>
                              {speakingId === m.id ? <Square className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
                              {speakingId === m.id ? "Stop" : "Speak"}
                            </button>
                            {isLast && (
                              <button
                                type="button"
                                className="ws-btn ws-btn-ghost !p-1 !text-[9.5px]"
                                onClick={() => void regenerate()}
                                disabled={loading}
                              >
                                <RefreshCw className="h-3 w-3" /> Regenerate
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {loading && (
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[linear-gradient(135deg,var(--ws-accent),var(--ws-accent-2))] text-[var(--ws-accent-ink)]">
                    <Bot className="h-3.5 w-3.5" />
                  </div>
                  <div className="ws-inset flex items-center gap-2 px-3 py-2">
                    <span className="flex gap-1">
                      <span className="ws-blink h-1.5 w-1.5 rounded-full bg-[var(--ws-accent)]" />
                      <span className="ws-blink h-1.5 w-1.5 rounded-full bg-[var(--ws-accent)] [animation-delay:160ms]" />
                      <span className="ws-blink h-1.5 w-1.5 rounded-full bg-[var(--ws-accent)] [animation-delay:320ms]" />
                    </span>
                    <span className="text-[10.5px] text-[var(--ws-muted)]">
                      {thinkingPhase === "thinking" ? "AURIX is reasoning" : "Composing the answer"} · {thinkingLevel}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="border-t border-[var(--ws-border)] p-3">
          {error && (
            <div className="mb-2">
              <InlineError message={error} onRetry={lastAttempt ? () => void send(lastAttempt) : undefined} />
            </div>
          )}
          {attachmentError && (
            <div className="mb-2 flex items-center justify-between rounded-lg border border-[#E7B75C]/35 bg-[#E7B75C]/10 px-3 py-1.5 text-[10.5px] text-[#E7B75C]">
              {attachmentError}
              <button type="button" className="ws-btn ws-btn-ghost !p-0.5" onClick={() => setAttachmentError(null)} aria-label="Dismiss">
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
          {attachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {attachments.map((a) => (
                <span key={a.id} className="ws-chip !py-1">
                  {a.dataBase64 ? <ImageIcon className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                  <span className="max-w-[160px] truncate">{a.name}</span>
                  <button
                    type="button"
                    onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))}
                    aria-label={`Remove ${a.name}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
            className="ws-inset flex items-end gap-2 p-2"
          >
            <input
              ref={fileRef}
              type="file"
              multiple
              accept="image/*,.txt,.md,.markdown,.json,.csv,.log,.ts,.tsx,.js,.jsx,.py,.html,.css,.yml,.yaml,.sql"
              className="hidden"
              onChange={(e) => void addFiles(e.target.files)}
            />
            <button
              type="button"
              className="ws-btn ws-btn-ghost !p-2"
              onClick={() => fileRef.current?.click()}
              title="Attach image or text file"
              aria-label="Attach image or text file"
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="ws-btn ws-btn-ghost !p-2"
              onClick={startVoice}
              title="Hold Space to talk (or click to start listening)"
              aria-label="Start voice input"
            >
              <Mic className="h-4 w-4" />
            </button>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
                if (e.key === "Escape") {
                  const controls = getVoiceControls();
                  if (controls) controls.interrupt();
                  stopAudio();
                }
              }}
              rows={1}
              placeholder="Ask AURIX anything, Sir..."
              className="max-h-32 min-h-[36px] flex-1 resize-none border-0 bg-transparent px-1 py-2 text-[13px] text-[var(--ws-text)] outline-none placeholder:text-[var(--ws-muted)]"
            />
            <button
              type="submit"
              disabled={loading || (!input.trim() && attachments.length === 0)}
              className="ws-btn ws-btn-primary !h-9 !w-9 !rounded-full !p-0"
              aria-label="Send message"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </form>
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1 px-1 text-[9px] text-[var(--ws-muted)]">
            <span>Enter to send · Shift+Enter for a new line · Hold Space to talk · Esc interrupts</span>
            <span>Images are sent to Gemini only when attached.</span>
          </div>
        </div>
      </section>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete this conversation?"
        message={`"${deleteTarget?.title || ""}" and all of its messages will be permanently removed from the local database. This cannot be undone.`}
        confirmLabel="Delete conversation"
        busy={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
