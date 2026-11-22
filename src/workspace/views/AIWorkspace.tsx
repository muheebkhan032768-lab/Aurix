import React, { useEffect, useState } from "react";
import { Code2, FileText, FolderKanban, ListChecks, BellRing, Sparkles, StickyNote } from "lucide-react";
import type { AppSettings, ConversationSummary } from "../../types/aurix";
import type { WorkspaceStore } from "../useWorkspaceStore";
import type { NoteItem, ProjectRecord, ReminderItem, TaskItem } from "../../types/aurix";
import { ChatWorkspace } from "./ChatWorkspace";
import { DocumentsPanel, NotesPanel, ProjectsPanel, RemindersPanel, TasksPanel, StorageNote } from "./WorkspacePanels";
import type { PendingAsk } from "../pending";

export interface AIWorkspaceProps {
  conversations: ConversationSummary[];
  settings: AppSettings;
  pendingAsk: PendingAsk | null;
  onConsumePendingAsk: () => void;
  onConversationsUpdated: (conversations: ConversationSummary[]) => void;
  tasks: TaskItem[];
  notes: NoteItem[];
  projects: ProjectRecord[];
  store: WorkspaceStore;
  onSaveTask: (task: Omit<TaskItem, "id" | "createdAt"> & { id?: string }) => Promise<void>;
  onDeleteTask: (id: string) => Promise<void>;
  onSaveNote: (note: Omit<NoteItem, "id" | "updatedAt"> & { id?: string }) => Promise<void>;
  onDeleteNote: (id: string) => Promise<void>;
  onSaveProject: (project: ProjectRecord) => Promise<void>;
}

type TabId = "chat" | "projects" | "documents" | "notes" | "reminders" | "tasks" | "code";

const TABS: Array<{ id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "chat", label: "AI Chat", icon: Sparkles },
  { id: "projects", label: "Projects", icon: FolderKanban },
  { id: "documents", label: "Documents", icon: FileText },
  { id: "notes", label: "Notes", icon: StickyNote },
  { id: "reminders", label: "Reminders", icon: BellRing },
  { id: "tasks", label: "Tasks", icon: ListChecks },
  { id: "code", label: "Coding", icon: Code2 },
];

export function AIWorkspace(props: AIWorkspaceProps) {
  const [tab, setTab] = useState<TabId>("chat");
  const [internalAsk, setInternalAsk] = useState<PendingAsk | null>(null);

  useEffect(() => {
    if (props.pendingAsk) setTab("chat");
  }, [props.pendingAsk]);

  const common = {
    tasks: props.tasks,
    notes: props.notes,
    projects: props.projects,
    store: props.store,
    onSaveTask: props.onSaveTask,
    onDeleteTask: props.onDeleteTask,
    onSaveNote: props.onSaveNote,
    onDeleteNote: props.onDeleteNote,
    onSaveProject: props.onSaveProject,
    onAsk: (prompt: string) => {
      setInternalAsk({ text: prompt, nonce: Date.now() });
      setTab("chat");
    },
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--ws-muted)]">AI Workspace</div>
          <h1 className="font-display text-lg font-semibold text-[var(--ws-text)]">Create, write and think with AURIX</h1>
        </div>
        <StorageNote />
      </div>

      <div className="ws-scroll mb-3 flex gap-1 overflow-x-auto rounded-xl border border-[var(--ws-border)] bg-[var(--ws-surface-2)] p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium transition-colors ${
              tab === t.id
                ? "bg-[var(--ws-surface)] text-[var(--ws-text)] shadow-sm"
                : "text-[var(--ws-muted)] hover:text-[var(--ws-text)]"
            }`}
          >
            <t.icon className={`h-3.5 w-3.5 ${tab === t.id ? "text-[var(--ws-accent)]" : ""}`} />
            {t.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1">
        {tab === "chat" && (
          <ChatWorkspace
            conversations={props.conversations}
            settings={props.settings}
            pendingAsk={internalAsk ?? props.pendingAsk}
            onConsumePendingAsk={() => {
              setInternalAsk(null);
              props.onConsumePendingAsk();
            }}
            onConversationsUpdated={props.onConversationsUpdated}
          />
        )}
        {tab !== "chat" && (
          <div className="ws-scroll h-full overflow-y-auto pb-2">
            {tab === "projects" && <ProjectsPanel {...common} />}
            {tab === "documents" && <DocumentsPanel {...common} />}
            {tab === "notes" && <NotesPanel {...common} />}
            {tab === "reminders" && <RemindersPanel {...common} />}
            {tab === "tasks" && <TasksPanel {...common} />}
            {tab === "code" && <DocumentsPanel {...common} codeOnly />}
          </div>
        )}
      </div>
    </div>
  );
}
