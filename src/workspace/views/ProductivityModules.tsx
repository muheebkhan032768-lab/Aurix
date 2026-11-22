import React from "react";
import { BellRing, FileText, FolderKanban, ListChecks, StickyNote } from "lucide-react";
import type { NoteItem, ProjectRecord, ReminderItem, TaskItem } from "../../types/aurix";
import type { WorkspaceStore } from "../useWorkspaceStore";
import { SectionHeader } from "../ui";
import { DocumentsPanel, NotesPanel, ProjectsPanel, RemindersPanel, TasksPanel } from "./WorkspacePanels";

export interface ProductivityProps {
  tasks: TaskItem[];
  notes: NoteItem[];
  projects: ProjectRecord[];
  store: WorkspaceStore;
  onSaveTask: (task: Omit<TaskItem, "id" | "createdAt"> & { id?: string }) => Promise<void>;
  onDeleteTask: (id: string) => Promise<void>;
  onSaveNote: (note: Omit<NoteItem, "id" | "updatedAt"> & { id?: string }) => Promise<void>;
  onDeleteNote: (id: string) => Promise<void>;
  onSaveProject: (project: ProjectRecord) => Promise<void>;
  onAsk: (prompt: string) => void;
}

export function ProjectsModule(props: ProductivityProps) {
  return (
    <div className="space-y-4">
      <SectionHeader
        eyebrow="Projects"
        title="Delivery portfolio"
        description="Project records with status, progress, stack and risks. These records are also injected into AURIX's project context."
        actions={<span className="ws-chip"><FolderKanban className="h-3 w-3" /> {props.projects.length} records</span>}
      />
      <ProjectsPanel {...props} />
    </div>
  );
}

export function DocumentsModule(props: ProductivityProps) {
  return (
    <div className="space-y-4">
      <SectionHeader
        eyebrow="Documents"
        title="Drafts, specs and uploads"
        description="Autosaving documents with folders, search, copy and export. Stored locally in SQLite."
        actions={<span className="ws-chip"><FileText className="h-3 w-3" /> {props.store.documents.length} documents</span>}
      />
      <DocumentsPanel {...props} />
    </div>
  );
}

export function NotesModule(props: ProductivityProps) {
  return (
    <div className="space-y-4">
      <SectionHeader
        eyebrow="Notes"
        title="Captured knowledge"
        description="Fast notes with autosave, search and delete. Notes are local and private to this workspace."
        actions={<span className="ws-chip"><StickyNote className="h-3 w-3" /> {props.notes.length} notes</span>}
      />
      <NotesPanel {...props} />
    </div>
  );
}

export function RemindersModule(props: ProductivityProps) {
  const pending = props.store.reminders.filter((r) => r.status === "pending").length;
  return (
    <div className="space-y-4">
      <SectionHeader
        eyebrow="Reminders"
        title="Nothing important slips."
        description="Schedule a reminder with a real due time. AURIX surfaces due reminders in the right-hand panel."
        actions={<span className="ws-chip"><BellRing className="h-3 w-3" /> {pending} pending</span>}
      />
      <RemindersPanel {...props} />
    </div>
  );
}

export function TasksModule(props: ProductivityProps) {
  const open = props.tasks.filter((t) => t.status !== "done").length;
  return (
    <div className="space-y-4">
      <SectionHeader
        eyebrow="Task Manager"
        title="Execution queue"
        description="Move tasks between pending, in progress and completed. The same records power the Command Center and right-hand Active Tasks panel."
        actions={<span className="ws-chip"><ListChecks className="h-3 w-3" /> {open} open</span>}
      />
      <TasksPanel {...props} />
    </div>
  );
}
