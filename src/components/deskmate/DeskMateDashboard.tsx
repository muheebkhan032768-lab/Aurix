import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  BrainCircuit,
  CheckCircle2,
  Code2,
  FolderOpen,
  History,
  Image as ImageIcon,
  Mic,
  Paperclip,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Wrench,
} from "lucide-react";
import type {
  AppSettings,
  AurixSectionId,
  ConversationSummary,
  MemoryItem,
  OwnerProfile,
  ProjectRecord,
  SystemTelemetry,
  TaskItem,
} from "../../types/aurix";
import { BRAND } from "../../brand";
import { speakWithCompanionVoice } from "../../utils/companionVoice";
import { speakWithOfflineBritishVoice } from "../../utils/offlineVoice";
import { publishVoice, useVoiceSnapshot } from "../../utils/voiceBus";
import { VoiceOrb } from "./VoiceOrb";
import { DeskMateRightRail } from "./DeskMateRightRail";

type TabKey = "chat" | "voice" | "code" | "files" | "tools" | "history";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "chat", label: "AI Chat" },
  { key: "voice", label: "Voice" },
  { key: "code", label: "Code" },
  { key: "files", label: "Files" },
  { key: "tools", label: "Tools" },
  { key: "history", label: "Chat History" },
];

const TAB_MODULES: Record<Exclude<TabKey, "chat" | "voice" | "history">, { id: AurixSectionId; title: string; copy: string; icon: React.ReactNode }> = {
  code: {
    id: "developer",
    title: "Developer Workspace",
    copy: "Code review, generation and project scaffolding with the full AI pool.",
    icon: <Code2 className="h-4 w-4" />,
  },
  files: {
    id: "files",
    title: "File Intelligence",
    copy: "Summarise, OCR and compare documents or screenshots.",
    icon: <FolderOpen className="h-4 w-4" />,
  },
  tools: {
    id: "automation",
    title: "Automation Center",
    copy: "Approved desktop actions, scheduled routines and the emergency stop.",
    icon: <Wrench className="h-4 w-4" />,
  },
};

interface DeskMateDashboardProps {
  owner: OwnerProfile;
  settings: AppSettings;
  telemetry: SystemTelemetry;
  tasks: TaskItem[];
  projects: ProjectRecord[];
  conversations: ConversationSummary[];
  memories: MemoryItem[];
  activity: Array<{ id: string; label: string; at: string }>;
  isOnline: boolean;
  welcomeTriggerSignal?: number;
  onNavigate: (section: AurixSectionId) => void;
  onUpdateSettings: (next: AppSettings) => Promise<void>;
}

interface LocalMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  at: string;
}

function greetingWord(date: Date): string {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function clockTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

function spokenGreeting(): string {
  return `${greetingWord(new Date())}, Sir. ${BRAND.name} is online and ready. All systems are operational. How may I assist you today?`;
}

export function DeskMateDashboard({
  owner,
  settings,
  telemetry,
  tasks,
  projects,
  conversations,
  memories,
  activity,
  isOnline,
  welcomeTriggerSignal = 0,
  onNavigate,
  onUpdateSettings,
}: DeskMateDashboardProps) {
  const now = useClock();
  const voice = useVoiceSnapshot();
  const firstName = owner.name.split(" ")[0] || owner.name;
  const [tab, setTab] = useState<TabKey>("chat");
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [messages, setMessages] = useState<LocalMessage[]>(() => [
    {
      id: "welcome",
      role: "assistant",
      text: `Hello Sir! I'm ${BRAND.name}, your intelligent AI assistant. How can I help you today?`,
      at: clockTime(new Date()),
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const handledWelcomeRef = useRef(0);

  // Startup / manual greeting — spoken once per trigger.
  useEffect(() => {
    if (!welcomeTriggerSignal || welcomeTriggerSignal === handledWelcomeRef.current) return;
    handledWelcomeRef.current = welcomeTriggerSignal;
    if (!settings.voiceEnabled || settings.doNotDisturb) return;
    const text = spokenGreeting();
    void (async () => {
      const spoken = await speakWithCompanionVoice(text, { speed: settings.voiceSpeed });
      if (!spoken) {
        await speakWithOfflineBritishVoice(text, settings.language, settings.voiceSpeed, {
          onBoundary: (charIndex) => publishVoice({ reply: text, spokenChars: charIndex ?? 0 }),
          onEnd: () => publishVoice({ spokenChars: -1 }),
        });
      }
    })();
  }, [welcomeTriggerSignal, firstName, settings.voiceEnabled, settings.voiceSpeed, settings.language, settings.doNotDisturb]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const appendExchange = useCallback((userText: string, assistantText: string) => {
    const stamp = clockTime(new Date());
    setMessages((prev) => [
      ...prev,
      { id: `u_${Date.now()}`, role: "user", text: userText, at: stamp },
      { id: `a_${Date.now()}`, role: "assistant", text: assistantText, at: stamp },
    ]);
  }, []);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setError(null);
    setSending(true);
    setInput("");
    setMessages((prev) => [...prev, { id: `u_${Date.now()}`, role: "user", text, at: clockTime(new Date()) }]);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          message: text,
          model: settings.activeModel,
          language: settings.language,
          thinkingLevel: settings.thinkingLevel,
          scopedWebsite: "All",
          mode: "chat",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to reach the AI core.");
      setConversationId(json.conversationId);
      const answer = String(json?.assistantMessage?.content || "").trim();
      setMessages((prev) => [
        ...prev,
        { id: `a_${Date.now()}`, role: "assistant", text: answer || "No response received.", at: clockTime(new Date()) },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Conversation error.");
    } finally {
      setSending(false);
    }
  };

  const openTasks = tasks.filter((task) => task.status !== "done");
  const activeProjects = projects.filter((project) => project.status === "active");
  const voiceStatus = voice.state === "listening" ? "Listening" : voice.state === "speaking" ? "Speaking" : "Ready";

  const quickLinks: Array<{ label: string; icon: React.ReactNode; onClick: () => void }> = [
    { label: "New Chat", icon: <Plus className="h-3.5 w-3.5" />, onClick: () => setTab("chat") },
    { label: "Open YouTube", icon: <ArrowUpRight className="h-3.5 w-3.5" />, onClick: () => window.open("https://www.youtube.com", "_blank", "noopener,noreferrer") },
    { label: "Open Google", icon: <ArrowUpRight className="h-3.5 w-3.5" />, onClick: () => window.open("https://www.google.com", "_blank", "noopener,noreferrer") },
    { label: "Create Project", icon: <FolderOpen className="h-3.5 w-3.5" />, onClick: () => onNavigate("projects") },
    { label: "Voice Mode", icon: <Mic className="h-3.5 w-3.5" />, onClick: () => setTab("voice") },
  ];

  return (
    <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_318px]">
      <div className="grid min-w-0 content-start gap-3">
        {/* Hero */}
        <section className="aurix-panel aurix-glow-border relative min-w-0 overflow-hidden rounded-2xl px-4 py-4 sm:px-5">
          <div
            className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full opacity-70"
            style={{ background: "radial-gradient(circle, var(--d-glow) 0%, transparent 68%)" }}
            aria-hidden="true"
          />
          <div className="relative flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-display text-xl font-bold tracking-wide text-[var(--d-text)] sm:text-2xl">
                {greetingWord(now)}, Sir!
              </h1>
              <p className="mt-1 text-[11.5px] text-[var(--d-muted)]">
                {openTasks.length} open task{openTasks.length === 1 ? "" : "s"} · {activeProjects.length} active project
                {activeProjects.length === 1 ? "" : "s"} · {conversations.length} conversations archived
              </p>
            </div>
            <div className="text-right">
              <div className="text-[12px] font-semibold text-[var(--d-text)]">
                {now.toLocaleDateString("en-US", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}
              </div>
              <div className="text-[18px] font-bold tabular-nums text-[var(--d-cyan)]">{clockTime(now)}</div>
            </div>
          </div>

          <div className="relative mt-3.5 flex flex-wrap gap-2">
            {quickLinks.map((link) => (
              <button
                key={link.label}
                type="button"
                onClick={link.onClick}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--d-border)] bg-[color-mix(in_srgb,var(--d-panel-2)_80%,transparent)] px-3 py-1.5 text-[11px] font-medium text-[var(--d-muted)] transition-colors hover:border-[color-mix(in_srgb,var(--d-cyan)_45%,transparent)] hover:text-[var(--d-text)]"
              >
                {link.icon}
                {link.label}
              </button>
            ))}
          </div>
        </section>

        {/* Chat / voice deck */}
        <section className="aurix-panel min-w-0 overflow-hidden rounded-2xl">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 border-b border-[var(--d-border-soft)] px-3 py-2.5">
            {TABS.map((entry) => (
              <button
                key={entry.key}
                type="button"
                onClick={() => setTab(entry.key)}
                className={`rounded-lg border px-3 py-1.5 text-[11.5px] font-medium transition-colors ${
                  tab === entry.key
                    ? "aurix-tab-active"
                    : "border-transparent text-[var(--d-dim)] hover:text-[var(--d-text)]"
                }`}
              >
                {entry.label}
              </button>
            ))}
            <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-[var(--d-border)] px-2.5 py-1 text-[9.5px] uppercase tracking-[0.12em] text-[var(--d-muted)]">
              <span className={`h-1.5 w-1.5 rounded-full ${isOnline ? "bg-[var(--d-teal)]" : "bg-amber-400"}`} />
              {voiceStatus}
            </span>
          </div>

          {tab === "chat" && (
            <div className="px-3 py-3">
              <div ref={listRef} className="max-h-[190px] space-y-2.5 overflow-y-auto pr-1">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`max-w-[88%] rounded-xl border px-3 py-2 ${
                      message.role === "assistant"
                        ? "border-[var(--d-border-soft)] bg-[var(--d-bubble)]"
                        : "ml-auto border-[color-mix(in_srgb,var(--d-cyan)_30%,transparent)] bg-[color-mix(in_srgb,var(--d-cyan)_10%,transparent)]"
                    }`}
                  >
                    <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-[var(--d-text)]">{message.text}</p>
                    <p className="mt-1 text-[9px] text-[var(--d-dim)]">
                      {message.role === "assistant" ? BRAND.name : "You"} · {message.at}
                    </p>
                  </div>
                ))}
                {sending && (
                  <div className="flex items-center gap-1.5 px-1 text-[11px] text-[var(--d-muted)]">
                    <span className="aurix-dot h-1.5 w-1.5 rounded-full bg-[var(--d-cyan)]" />
                    <span className="aurix-dot h-1.5 w-1.5 rounded-full bg-[var(--d-cyan)]" style={{ animationDelay: "120ms" }} />
                    <span className="aurix-dot h-1.5 w-1.5 rounded-full bg-[var(--d-cyan)]" style={{ animationDelay: "240ms" }} />
                    <span className="ml-1">DEX MADE is thinking…</span>
                  </div>
                )}
              </div>

              <div className="mt-2 border-t border-[var(--d-border-soft)] pt-3">
                <VoiceOrb settings={settings} onExchange={appendExchange} />
              </div>

              {error && <p className="mt-2 text-center text-[11px] text-rose-300">{error}</p>}

              <form
                className="mt-3 flex items-center gap-2 rounded-2xl border border-[var(--d-border)] bg-[color-mix(in_srgb,var(--d-panel-2)_85%,transparent)] px-3 py-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void sendMessage();
                }}
              >
                <Paperclip className="h-4 w-4 shrink-0 text-[var(--d-dim)]" aria-hidden="true" />
                <ImageIcon className="h-4 w-4 shrink-0 text-[var(--d-dim)]" aria-hidden="true" />
                <input
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="Ask DEX MADE anything, Sir..."
                  aria-label="Ask DEX MADE"
                  className="min-w-0 flex-1 bg-transparent text-[12px] text-[var(--d-text)] placeholder:text-[var(--d-dim)] outline-none"
                />
                <button
                  type="submit"
                  disabled={sending || !input.trim()}
                  aria-label="Send message"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[linear-gradient(140deg,var(--d-blue),var(--d-cyan))] text-[#03111a] transition-opacity disabled:opacity-40"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </form>
            </div>
          )}

          {tab === "voice" && (
            <div className="px-3 py-4">
              <VoiceOrb settings={settings} onExchange={appendExchange} />
              <div className="mt-3 text-center">
                <button
                  type="button"
                  onClick={() => onNavigate("voice")}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--d-border)] px-3 py-1.5 text-[11px] text-[var(--d-muted)] hover:text-[var(--d-text)]"
                >
                  Open Voice Intelligence <ArrowUpRight className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}

          {(tab === "code" || tab === "files" || tab === "tools") && (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
              <span className="grid h-11 w-11 place-items-center rounded-xl border border-[color-mix(in_srgb,var(--d-cyan)_30%,transparent)] bg-[color-mix(in_srgb,var(--d-cyan)_10%,transparent)] text-[var(--d-cyan)]">
                {TAB_MODULES[tab].icon}
              </span>
              <h3 className="text-[13px] font-semibold text-[var(--d-text)]">{TAB_MODULES[tab].title}</h3>
              <p className="max-w-sm text-[11.5px] text-[var(--d-muted)]">{TAB_MODULES[tab].copy}</p>
              <button
                type="button"
                onClick={() => onNavigate(TAB_MODULES[tab].id)}
                className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--d-cyan)_45%,transparent)] px-3 py-1.5 text-[11px] font-semibold text-[var(--d-cyan)]"
              >
                Open module <ArrowUpRight className="h-3 w-3" />
              </button>
            </div>
          )}

          {tab === "history" && (
            <div className="px-3 py-3">
              <div className="max-h-[300px] space-y-1.5 overflow-y-auto">
                {conversations.slice(0, 8).map((conversation) => (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => onNavigate("chat")}
                    className="flex w-full items-center gap-2 rounded-xl border border-[var(--d-border-soft)] bg-[var(--d-panel-2)] px-3 py-2 text-left hover:border-[color-mix(in_srgb,var(--d-cyan)_40%,transparent)]"
                  >
                    <History className="h-3.5 w-3.5 shrink-0 text-[var(--d-cyan)]" />
                    <span className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--d-text)]">{conversation.title}</span>
                    <span className="shrink-0 text-[9px] text-[var(--d-dim)]">
                      {new Date(conversation.updatedAt).toLocaleDateString()}
                    </span>
                  </button>
                ))}
                {conversations.length === 0 && (
                  <p className="py-6 text-center text-[11.5px] text-[var(--d-dim)]">No conversations archived yet.</p>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Footer metrics */}
        <div className="grid min-w-0 grid-cols-2 gap-2 lg:grid-cols-4">
          <div className="aurix-panel-2 rounded-xl px-3 py-2.5">
            <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.14em] text-[var(--d-dim)]">
              <Sparkles className="h-3 w-3" /> Neural Activity
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-[12px] font-semibold text-[var(--d-text)]">
              <span className={`h-1.5 w-1.5 rounded-full ${sending ? "bg-[var(--d-cyan)] animate-pulse" : "bg-[var(--d-teal)]"}`} />
              {sending ? "AI is Thinking..." : "System Ready"}
            </div>
          </div>
          <div className="aurix-panel-2 rounded-xl px-3 py-2.5">
            <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.14em] text-[var(--d-dim)]">
              <TrendingUp className="h-3 w-3" /> AI Analytics
            </div>
            <div className="mt-1 flex items-end justify-between gap-2">
              <span className="text-[12px] font-semibold text-[var(--d-teal)]">+24% Productivity</span>
              <svg viewBox="0 0 44 16" className="h-4 w-11 shrink-0" aria-hidden="true">
                <polyline
                  points="0,13 7,10 14,11 21,6 28,8 35,3 44,5"
                  fill="none"
                  stroke="var(--d-teal)"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>
          <button type="button" onClick={() => onNavigate("memory")} className="aurix-panel-2 rounded-xl px-3 py-2.5 text-left">
            <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.14em] text-[var(--d-dim)]">
              <BrainCircuit className="h-3 w-3" /> Memory Center
            </div>
            <div className="mt-1 text-[12px] font-semibold text-[var(--d-text)]">{memories.length} Memories</div>
          </button>
          <button type="button" onClick={() => onNavigate("security")} className="aurix-panel-2 rounded-xl px-3 py-2.5 text-left">
            <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.14em] text-[var(--d-dim)]">
              <ShieldCheck className="h-3 w-3" /> Security Status
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-[12px] font-semibold text-[var(--d-text)]">
              <CheckCircle2 className="h-3.5 w-3.5 text-[var(--d-teal)]" /> Protected
            </div>
          </button>
        </div>
      </div>

      <DeskMateRightRail
        tasks={tasks}
        activity={activity}
        telemetry={telemetry}
        isOnline={isOnline}
        onNavigate={onNavigate}
      />
    </div>
  );
}
