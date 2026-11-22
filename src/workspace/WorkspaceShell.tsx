import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BellRing, Search, X } from "lucide-react";
import type {
  AiStatusPayload,
  AurixSectionId,
  BiometricSnapshot,
  BootstrapPayload,
  DocumentItem,
  MemoryItem,
  NoteItem,
  OwnerProfile,
  ProjectRecord,
  TaskItem,
} from "../types/aurix";
import { ALL_NAV_ITEMS, findNavItem } from "./nav";
import { registerWorkspaceNavigate } from "./navigation";
import { applyAccent, getStoredAccent } from "./theme";
import { useWorkspaceStore } from "./useWorkspaceStore";
import { WorkspaceSidebar } from "./WorkspaceSidebar";
import { WorkspaceTopBar } from "./WorkspaceTopBar";
import { RightPanel } from "./RightPanel";
import { Composer } from "./Composer";
import type { PendingAsk } from "./pending";
import { CommandCenter } from "./views/CommandCenter";
import { AIWorkspace } from "./views/AIWorkspace";
import { VoiceIntelligence } from "./views/VoiceIntelligence";
import { NeuralActivity } from "./views/NeuralActivity";
import { AnalyticsView } from "./views/AnalyticsView";
import { KnowledgeCenter } from "./views/KnowledgeCenter";
import { HistoryView } from "./views/HistoryView";
import { MemoryCenter } from "./views/MemoryCenter";
import { SecurityCenter } from "./views/SecurityCenter";
import { AutomationCenter } from "./views/AutomationCenter";
import { IntegrationsView } from "./views/IntegrationsView";
import { ModelManagement } from "./views/ModelManagement";
import { WorkspaceSettings } from "./views/WorkspaceSettings";
import { HelpView } from "./views/HelpView";
import { DocumentsModule, NotesModule, ProjectsModule, RemindersModule, TasksModule } from "./views/ProductivityModules";

export interface WorkspaceShellProps {
  data: BootstrapPayload;
  isOnline: boolean;
  biometrics: BiometricSnapshot | null;
  onUpdateSettings: (settings: BootstrapPayload["settings"]) => Promise<void>;
  onSaveOwner: (owner: OwnerProfile) => Promise<void>;
  onSaveTask: (task: Omit<TaskItem, "id" | "createdAt"> & { id?: string }) => Promise<void>;
  onDeleteTask: (id: string) => Promise<void>;
  onSaveNote: (note: Omit<NoteItem, "id" | "updatedAt"> & { id?: string }) => Promise<void>;
  onDeleteNote: (id: string) => Promise<void>;
  onSaveProject: (project: ProjectRecord) => Promise<void>;
  onSaveMemory: (memory: Omit<MemoryItem, "id" | "createdAt" | "updatedAt"> & { id?: string }) => Promise<void>;
  onDeleteMemory: (id: string) => Promise<void>;
  onSetPin: (pin: string) => Promise<void>;
  onUpdateSecurityPrefs: (inactivityMinutes: number, requirePinOnBoot: boolean) => Promise<void>;
  onLockNow: () => void;
  onToggleEmergencyStop: (active: boolean) => Promise<void>;
  onConversationsUpdated: (conversations: BootstrapPayload["conversations"]) => void;
  renderLegacy: (section: AurixSectionId, fileMode?: "summarize" | "ocr" | "vision" | "code-review" | "compare") => React.ReactNode;
}

function stored(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function saveStored(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

export function WorkspaceShell(props: WorkspaceShellProps) {
  const { data, isOnline, biometrics } = props;
  const [activeModule, setActiveModule] = useState<string>(() => {
    const storedId = stored("aurix_active_module", "command-center");
    return ALL_NAV_ITEMS.some((item) => item.id === storedId) ? storedId : "command-center";
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => stored("aurix_sidebar_collapsed", "0") === "1");
  const [rightOpen, setRightOpen] = useState(() => stored("aurix_right_panel", "1") === "1");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [accentId, setAccentId] = useState<string>(() => getStoredAccent());
  const [aiStatus, setAiStatus] = useState<AiStatusPayload | null>(null);
  const [pendingAsk, setPendingAsk] = useState<PendingAsk | null>(null);
  const [dueNotice, setDueNotice] = useState<{ title: string; dueAt: string } | null>(null);
  const notifiedRef = useRef<Set<string>>(new Set());

  const store = useWorkspaceStore();

  useEffect(() => {
    applyAccent(accentId);
  }, [accentId]);

  useEffect(() => {
    registerWorkspaceNavigate((id) => {
      if (ALL_NAV_ITEMS.some((item) => item.id === id)) setActiveModule(id);
    });
    return () => registerWorkspaceNavigate(null);
  }, []);

  useEffect(() => saveStored("aurix_active_module", activeModule), [activeModule]);
  useEffect(() => saveStored("aurix_sidebar_collapsed", sidebarCollapsed ? "1" : "0"), [sidebarCollapsed]);
  useEffect(() => saveStored("aurix_right_panel", rightOpen ? "1" : "0"), [rightOpen]);

  const loadAiStatus = useCallback(() => {
    fetch("/api/ai/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((status) => status && setAiStatus(status))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    loadAiStatus();
    // One live probe at startup turns "untested" into a genuine connected or
    // degraded state without waiting for the owner's first message.
    fetch("/api/ai/probe", { method: "POST" })
      .then((r) => (r.ok ? r.json() : null))
      .then((status) => status && setAiStatus(status))
      .catch(() => undefined);
    const timer = window.setInterval(loadAiStatus, 30_000);
    return () => window.clearInterval(timer);
  }, [loadAiStatus]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Surface due reminders without pretending they fired elsewhere.
  useEffect(() => {
    const check = () => {
      const now = Date.now();
      const due = store.reminders.find(
        (r) => r.status === "pending" && new Date(r.dueAt).getTime() <= now && !notifiedRef.current.has(r.id)
      );
      if (!due) return;
      notifiedRef.current.add(due.id);
      setDueNotice({ title: due.title, dueAt: due.dueAt });
      try {
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          new Notification("AURIX reminder", { body: due.title });
        }
      } catch {
        /* notifications unavailable */
      }
    };
    check();
    const timer = window.setInterval(check, 30_000);
    return () => window.clearInterval(timer);
  }, [store.reminders]);

  const navigate = (id: string) => {
    setActiveModule(id);
    setMobileNavOpen(false);
  };

  const ask = (next: PendingAsk) => {
    setPendingAsk(next);
    setActiveModule("ai-workspace");
  };

  const currentItem = findNavItem(activeModule);
  const title = currentItem?.label || "Command Center";

  const commonProductivity = {
    tasks: data.tasks,
    notes: data.notes,
    projects: data.projects,
    store,
    onSaveTask: props.onSaveTask,
    onDeleteTask: props.onDeleteTask,
    onSaveNote: props.onSaveNote,
    onDeleteNote: props.onDeleteNote,
    onSaveProject: props.onSaveProject,
    onAsk: (prompt: string) => ask({ text: prompt, nonce: Date.now() }),
  };

  const content = useMemo(() => {
    if (currentItem.legacy) return props.renderLegacy(currentItem.legacy, currentItem.fileMode);
    switch (activeModule) {
      case "command-center":
        return (
          <CommandCenter
            data={data}
            isOnline={isOnline}
            aiStatus={aiStatus}
            onNavigate={navigate}
            onAsk={(prompt) => ask({ text: prompt, nonce: Date.now() })}
          />
        );
      case "ai-workspace":
        return (
          <AIWorkspace
            conversations={data.conversations}
            settings={data.settings}
            pendingAsk={pendingAsk}
            onConsumePendingAsk={() => setPendingAsk(null)}
            onConversationsUpdated={props.onConversationsUpdated}
            tasks={data.tasks}
            notes={data.notes}
            projects={data.projects}
            store={store}
            onSaveTask={props.onSaveTask}
            onDeleteTask={props.onDeleteTask}
            onSaveNote={props.onSaveNote}
            onDeleteNote={props.onDeleteNote}
            onSaveProject={props.onSaveProject}
          />
        );
      case "voice":
        return <VoiceIntelligence settings={data.settings} onUpdateSettings={props.onUpdateSettings} />;
      case "neural":
        return <NeuralActivity telemetry={data.telemetry} aiStatus={aiStatus} isOnline={isOnline} activeModel={data.settings.activeModel} />;
      case "analytics":
        return <AnalyticsView />;
      case "projects":
        return <ProjectsModule {...commonProductivity} />;
      case "documents":
        return <DocumentsModule {...commonProductivity} />;
      case "notes":
        return <NotesModule {...commonProductivity} />;
      case "reminders":
        return <RemindersModule {...commonProductivity} />;
      case "tasks":
        return <TasksModule {...commonProductivity} />;
      case "history":
        return <HistoryView data={data} store={store} onNavigate={navigate} />;
      case "memory":
        return <MemoryCenter memories={data.memories} onSaveMemory={props.onSaveMemory} onDeleteMemory={props.onDeleteMemory} />;
      case "knowledge":
        return <KnowledgeCenter data={data} onNavigate={navigate} />;
      case "security":
        return (
          <SecurityCenter
            security={data.security}
            auditLogs={data.auditLogs}
            biometrics={biometrics}
            onSetPin={props.onSetPin}
            onUpdatePrefs={props.onUpdateSecurityPrefs}
            onLockNow={props.onLockNow}
            onNavigate={navigate}
          />
        );
      case "automation":
        return (
          <AutomationCenter
            store={store}
            auditLogs={data.auditLogs}
            emergencyStopActive={data.telemetry.emergencyStopActive}
            onToggleEmergencyStop={props.onToggleEmergencyStop}
          />
        );
      case "integrations":
        return <IntegrationsView />;
      case "models":
        return <ModelManagement settings={data.settings} telemetry={data.telemetry} onUpdateSettings={props.onUpdateSettings} />;
      case "settings":
        return (
          <WorkspaceSettings
            settings={data.settings}
            owner={data.owner}
            accentId={accentId}
            onAccentChange={setAccentId}
            onUpdateSettings={props.onUpdateSettings}
            onSaveOwner={props.onSaveOwner}
            onNavigate={navigate}
          />
        );
      case "help":
        return <HelpView onNavigate={navigate} />;
      default:
        return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeModule, data, isOnline, aiStatus, pendingAsk, store, accentId, biometrics]);

  const isWorkspace = activeModule === "ai-workspace";

  return (
    <div className="ws-root flex h-[100dvh] flex-col overflow-hidden">
      <WorkspaceTopBar
        title={title}
        settings={data.settings}
        aiStatus={aiStatus}
        isOnline={isOnline}
        telemetry={data.telemetry}
        notifications={data.auditLogs}
        ownerName={data.owner.name}
        rightOpen={rightOpen}
        onToggleRightPanel={() => setRightOpen((v) => !v)}
        onOpenMobileNav={() => setMobileNavOpen(true)}
        onOpenSearch={() => setSearchOpen(true)}
        onNavigate={navigate}
        onToggleTheme={() => void props.onUpdateSettings({ ...data.settings, theme: data.settings.theme === "dark" ? "light" : "dark" })}
        onUpdateSettings={props.onUpdateSettings}
        onLock={props.onLockNow}
      />

      {dueNotice && (
        <div className="fixed right-4 top-16 z-[60] w-[min(92vw,320px)]">
          <div className="ws-card flex items-start gap-2 border-[#E7B75C]/45 p-3">
            <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-[#E7B75C]" />
            <div className="min-w-0 flex-1">
              <div className="text-[10.5px] font-semibold text-[var(--ws-text)]">Reminder due</div>
              <div className="truncate text-[10px] text-[var(--ws-muted)]">{dueNotice.title}</div>
            </div>
            <button type="button" className="ws-btn ws-btn-ghost !p-1" onClick={() => { setDueNotice(null); navigate("reminders"); }} aria-label="Open reminders">
              <BellRing className="h-3.5 w-3.5" />
            </button>
            <button type="button" className="ws-btn ws-btn-ghost !p-1" onClick={() => setDueNotice(null)} aria-label="Dismiss reminder">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <WorkspaceSidebar
          activeModule={activeModule}
          onNavigate={navigate}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={() => setSidebarCollapsed((v) => !v)}
          mobileOpen={mobileNavOpen}
          onCloseMobile={() => setMobileNavOpen(false)}
          taskCount={data.tasks.filter((t) => t.status !== "done").length}
          reminderCount={store.reminders.filter((r) => r.status === "pending").length}
          aiState={aiStatus?.state || "untested"}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <main className={`min-h-0 flex-1 ${isWorkspace ? "overflow-hidden px-3 py-3 sm:px-4" : "ws-scroll overflow-y-auto px-3 py-4 sm:px-5"}`}>
            <div className={isWorkspace ? "h-full" : "mx-auto max-w-[1500px]"}>
              {content}
              {currentItem.legacy && (
                <div className="mt-4 rounded-xl border border-[var(--ws-border)] bg-[var(--ws-surface-2)] px-3 py-2 text-[9.5px] text-[var(--ws-muted)]">
                  This is an original AURIX module preserved inside the Neural Command Workspace. Its data and integrations are unchanged.
                </div>
              )}
            </div>
          </main>
          {!isWorkspace && <Composer onAsk={ask} onOpenVoice={() => navigate("voice")} />}
        </div>

        {rightOpen && (
          <RightPanel
            tasks={data.tasks}
            reminders={store.reminders}
            auditLogs={data.auditLogs}
            aiStatus={aiStatus}
            telemetry={data.telemetry}
            isOnline={isOnline}
            onNavigate={navigate}
            onCollapse={() => setRightOpen(false)}
          />
        )}
      </div>

      <SearchPalette
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        data={data}
        documents={store.documents}
        onSelect={(kind, id) => {
          setSearchOpen(false);
          if (kind === "module") navigate(id);
          else if (kind === "conversation") navigate("ai-workspace");
          else if (kind === "note") navigate("notes");
          else if (kind === "project") navigate("projects");
          else navigate("documents");
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Command palette                                                     */
/* ------------------------------------------------------------------ */

function SearchPalette({
  open,
  onClose,
  data,
  documents,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  data: BootstrapPayload;
  documents: DocumentItem[];
  onSelect: (kind: "module" | "conversation" | "note" | "project" | "document", id: string) => void;
}) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  if (!open) return null;
  const q = query.trim().toLowerCase();

  const modules = ALL_NAV_ITEMS.filter((m) => !q || `${m.label} ${m.hint}`.toLowerCase().includes(q)).slice(0, 7);
  const conversations = data.conversations.filter((c) => q && c.title.toLowerCase().includes(q)).slice(0, 4);
  const notes = data.notes.filter((n) => q && `${n.title} ${n.content}`.toLowerCase().includes(q)).slice(0, 4);
  const projects = data.projects.filter((p) => q && `${p.name} ${p.description}`.toLowerCase().includes(q)).slice(0, 4);
  const docs = documents.filter((d) => q && `${d.title} ${d.content}`.toLowerCase().includes(q)).slice(0, 4);

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center bg-black/55 p-4 pt-[12vh] backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Quick search">
      <button type="button" className="absolute inset-0 cursor-default" onClick={onClose} aria-label="Close quick search" />
      <div className="ws-card relative w-full max-w-xl overflow-hidden p-0">
        <div className="flex items-center gap-2 border-b border-[var(--ws-border)] px-3.5 py-2.5">
          <Search className="h-4 w-4 text-[var(--ws-muted)]" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "Enter" && modules[0]) onSelect("module", modules[0].id);
            }}
            placeholder="Search modules, conversations, notes, projects and documents…"
            className="flex-1 border-0 bg-transparent text-[12.5px] text-[var(--ws-text)] outline-none placeholder:text-[var(--ws-muted)]"
          />
          <button type="button" className="ws-btn ws-btn-ghost !p-1" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <div className="ws-scroll max-h-[54vh] overflow-y-auto p-2">
          <div className="px-2 pb-1 pt-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--ws-muted)]">Modules</div>
          {modules.map((m) => (
            <button key={m.id} type="button" onClick={() => onSelect("module", m.id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-[var(--ws-surface-2)]">
              <m.icon className="h-3.5 w-3.5 text-[var(--ws-accent)]" />
              <span className="text-[11px] text-[var(--ws-text)]">{m.label}</span>
              <span className="ml-auto text-[9px] text-[var(--ws-muted)]">{m.hint}</span>
            </button>
          ))}
          {conversations.length > 0 && (
            <>
              <div className="px-2 pb-1 pt-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--ws-muted)]">Conversations</div>
              {conversations.map((c) => (
                <button key={c.id} type="button" onClick={() => onSelect("conversation", c.id)} className="block w-full rounded-lg px-2 py-1.5 text-left hover:bg-[var(--ws-surface-2)]">
                  <span className="block truncate text-[11px] text-[var(--ws-text)]">{c.title}</span>
                  <span className="block text-[9px] text-[var(--ws-muted)]">{c.model}</span>
                </button>
              ))}
            </>
          )}
          {notes.length > 0 && (
            <>
              <div className="px-2 pb-1 pt-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--ws-muted)]">Notes</div>
              {notes.map((n) => (
                <button key={n.id} type="button" onClick={() => onSelect("note", n.id)} className="block w-full truncate rounded-lg px-2 py-1.5 text-left text-[11px] text-[var(--ws-text)] hover:bg-[var(--ws-surface-2)]">{n.title}</button>
              ))}
            </>
          )}
          {projects.length > 0 && (
            <>
              <div className="px-2 pb-1 pt-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--ws-muted)]">Projects</div>
              {projects.map((p) => (
                <button key={p.id} type="button" onClick={() => onSelect("project", p.id)} className="block w-full truncate rounded-lg px-2 py-1.5 text-left text-[11px] text-[var(--ws-text)] hover:bg-[var(--ws-surface-2)]">{p.name}</button>
              ))}
            </>
          )}
          {docs.length > 0 && (
            <>
              <div className="px-2 pb-1 pt-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--ws-muted)]">Documents</div>
              {docs.map((d) => (
                <button key={d.id} type="button" onClick={() => onSelect("document", d.id)} className="block w-full truncate rounded-lg px-2 py-1.5 text-left text-[11px] text-[var(--ws-text)] hover:bg-[var(--ws-surface-2)]">{d.title}</button>
              ))}
            </>
          )}
          {q && !modules.length && !conversations.length && !notes.length && !projects.length && !docs.length && (
            <p className="px-2 py-6 text-center text-[10.5px] text-[var(--ws-muted)]">No match for “{query}”.</p>
          )}
        </div>
      </div>
    </div>
  );
}
