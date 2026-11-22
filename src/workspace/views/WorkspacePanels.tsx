import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  BellRing,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  Download,
  FilePlus2,
  FileText,
  FolderKanban,
  ListChecks,
  Plus,
  Save,
  Search,
  Sparkles,
  StickyNote,
  Trash2,
} from "lucide-react";
import type {
  DocumentItem,
  NoteItem,
  ProjectRecord,
  ReminderItem,
  TaskItem,
} from "../../types/aurix";
import type { WorkspaceStore } from "../useWorkspaceStore";
import { ConfirmDialog, EmptyState, InlineError, timeAgo } from "../ui";

interface CommonProps {
  tasks: TaskItem[];
  notes: NoteItem[];
  projects: ProjectRecord[];
  store: WorkspaceStore;
  onSaveTask: (task: Omit<TaskItem, "id" | "createdAt"> & { id?: string }) => Promise<void>;
  onDeleteTask: (id: string) => Promise<void>;
  onSaveNote: (note: Omit<NoteItem, "id" | "updatedAt"> & { id?: string }) => Promise<void>;
  onDeleteNote: (id: string) => Promise<void>;
  onSaveProject: (project: ProjectRecord) => Promise<void>;
  onAsk?: (prompt: string) => void;
}

const STATUS_LABEL: Record<string, string> = {
  todo: "Pending",
  in_progress: "In progress",
  done: "Completed",
};

function download(name: string, content: string, mime = "text/plain") {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------------ */
/* Projects                                                            */
/* ------------------------------------------------------------------ */

export function ProjectsPanel({ projects, onSaveProject }: CommonProps) {
  const [editing, setEditing] = useState<ProjectRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const blank = (): ProjectRecord => ({
    id: `prj_${Date.now().toString(36)}`,
    name: "",
    category: "Product",
    description: "",
    status: "planned",
    progress: 0,
    stack: [],
    locationOrUrl: "",
    knownBugs: "",
    pendingTasks: "",
    securityNotes: "",
    updatedAt: new Date().toISOString(),
  });

  const save = async () => {
    if (!editing || !editing.name.trim()) {
      setError("A project name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSaveProject({ ...editing, name: editing.name.trim(), updatedAt: new Date().toISOString() });
      setEditing(null);
    } catch {
      setError("The project could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-[var(--ws-muted)]">
            {projects.length} project{projects.length === 1 ? "" : "s"} · stored in the local SQLite database
          </p>
          <button type="button" className="ws-btn ws-btn-primary" onClick={() => setEditing(blank())}>
            <Plus className="h-4 w-4" /> New project
          </button>
        </div>
        {projects.length === 0 ? (
          <EmptyState icon={<FolderKanban className="h-5 w-5" />} title="No projects yet" description="Create your first project to track delivery, stack and open risks." />
        ) : (
          <div className="space-y-2.5">
            {projects.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setEditing({ ...p })}
                className="ws-card block w-full p-3.5 text-left transition-colors hover:border-[color-mix(in_srgb,var(--ws-accent)_34%,var(--ws-border))]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold text-[var(--ws-text)]">{p.name}</div>
                    <div className="mt-0.5 text-[10px] text-[var(--ws-muted)]">
                      {p.category} · {p.status} · updated {timeAgo(p.updatedAt)}
                    </div>
                  </div>
                  <span className="font-mono text-[10px] text-[var(--ws-accent)]">{p.progress}%</span>
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--ws-surface-3)]">
                  <div className="h-full rounded-full bg-[linear-gradient(90deg,var(--ws-accent),var(--ws-accent-2))]" style={{ width: `${Math.min(100, Math.max(0, p.progress))}%` }} />
                </div>
                {p.description && <p className="mt-2 line-clamp-2 text-[10.5px] leading-relaxed text-[var(--ws-muted)]">{p.description}</p>}
                {p.stack.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {p.stack.slice(0, 5).map((s) => (
                      <span key={s} className="ws-chip !py-0.5">{s}</span>
                    ))}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="ws-card p-4">
        {editing ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-[var(--ws-text)]">{projects.some((p) => p.id === editing.id) ? "Edit project" : "New project"}</h3>
              <button type="button" className="ws-btn ws-btn-ghost !text-[10px]" onClick={() => setEditing(null)}>Close</button>
            </div>
            <label className="block text-[10px] text-[var(--ws-muted)]">
              Name
              <input className="ws-input mt-1" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Project name" />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-[10px] text-[var(--ws-muted)]">
                Category
                <input className="ws-input mt-1" value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })} />
              </label>
              <label className="block text-[10px] text-[var(--ws-muted)]">
                Status
                <select className="ws-input mt-1" value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value as ProjectRecord["status"] })}>
                  <option value="planned">Planned</option>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                  <option value="abandoned">Abandoned</option>
                </select>
              </label>
            </div>
            <label className="block text-[10px] text-[var(--ws-muted)]">
              Progress: {editing.progress}%
              <input type="range" min={0} max={100} value={editing.progress} onChange={(e) => setEditing({ ...editing, progress: Number(e.target.value) })} className="mt-1 w-full accent-[var(--ws-accent)]" />
            </label>
            <label className="block text-[10px] text-[var(--ws-muted)]">
              Description
              <textarea className="ws-input mt-1 min-h-[70px]" value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            </label>
            <label className="block text-[10px] text-[var(--ws-muted)]">
              Stack (comma separated)
              <input className="ws-input mt-1" value={editing.stack.join(", ")} onChange={(e) => setEditing({ ...editing, stack: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
            </label>
            <label className="block text-[10px] text-[var(--ws-muted)]">
              Location or URL
              <input className="ws-input mt-1" value={editing.locationOrUrl} onChange={(e) => setEditing({ ...editing, locationOrUrl: e.target.value })} />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-[10px] text-[var(--ws-muted)]">
                Pending tasks
                <textarea className="ws-input mt-1 min-h-[56px]" value={editing.pendingTasks} onChange={(e) => setEditing({ ...editing, pendingTasks: e.target.value })} />
              </label>
              <label className="block text-[10px] text-[var(--ws-muted)]">
                Known bugs
                <textarea className="ws-input mt-1 min-h-[56px]" value={editing.knownBugs} onChange={(e) => setEditing({ ...editing, knownBugs: e.target.value })} />
              </label>
            </div>
            {error && <InlineError message={error} />}
            <button type="button" className="ws-btn ws-btn-primary w-full" onClick={() => void save()} disabled={saving}>
              <Save className="h-4 w-4" /> {saving ? "Saving..." : "Save project"}
            </button>
          </div>
        ) : (
          <EmptyState icon={<FolderKanban className="h-5 w-5" />} title="Select or create a project" description="Project records live in the local SQLite store and feed AURIX project context." />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Documents / coding workspace                                        */
/* ------------------------------------------------------------------ */

export function DocumentsPanel({ store, codeOnly = false, onAsk }: CommonProps & { codeOnly?: boolean }) {
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ title: string; folder: string; kind: DocumentItem["kind"]; content: string }>({
    title: "",
    folder: "General",
    kind: codeOnly ? "code" : "document",
    content: "",
  });
  const [status, setStatus] = useState<"idle" | "dirty" | "saving" | "saved">("idle");
  const [deleteTarget, setDeleteTarget] = useState<DocumentItem | null>(null);
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  const docs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return store.documents
      .filter((d) => (codeOnly ? d.kind === "code" : true))
      .filter((d) => !q || d.title.toLowerCase().includes(q) || d.content.toLowerCase().includes(q));
  }, [store.documents, search, codeOnly]);

  useEffect(() => {
    if (!activeId) return;
    const doc = store.documents.find((d) => d.id === activeId);
    if (doc) setDraft({ title: doc.title, folder: doc.folder, kind: doc.kind, content: doc.content });
  }, [activeId, store.documents]);

  const persist = async () => {
    if (!draft.title.trim()) return;
    setStatus("saving");
    const saved = await store.saveDocument({
      id: activeId || undefined,
      title: draft.title,
      folder: draft.folder,
      kind: draft.kind,
      content: draft.content,
    });
    if (saved) {
      setActiveId(saved.id);
      setStatus("saved");
    } else {
      setStatus("dirty");
    }
  };

  useEffect(() => {
    if (status !== "dirty") return;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      void persist();
    }, 900);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, status]);

  const openNew = () => {
    setActiveId(null);
    setDraft({ title: "", folder: codeOnly ? "Code" : "General", kind: codeOnly ? "code" : "document", content: "" });
    setStatus("idle");
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[280px_1fr]">
      <div className="ws-card flex flex-col overflow-hidden">
        <div className="space-y-2 border-b border-[var(--ws-border)] p-3">
          <button type="button" className="ws-btn ws-btn-primary w-full" onClick={openNew}>
            <FilePlus2 className="h-4 w-4" /> New {codeOnly ? "code file" : "document"}
          </button>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ws-muted)]" />
            <input className="ws-input !py-2 !pl-8 !text-[11px]" placeholder="Search content" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="ws-scroll max-h-[520px] flex-1 overflow-y-auto p-2">
          {docs.length === 0 ? (
            <p className="px-2 py-6 text-center text-[11px] text-[var(--ws-muted)]">No {codeOnly ? "code files" : "documents"} yet.</p>
          ) : (
            docs.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => {
                  setActiveId(d.id);
                  setDraft({ title: d.title, folder: d.folder, kind: d.kind, content: d.content });
                  setStatus("idle");
                }}
                className={`block w-full rounded-lg px-2.5 py-2 text-left transition-colors ${
                  activeId === d.id ? "bg-[color-mix(in_srgb,var(--ws-accent)_10%,transparent)]" : "hover:bg-[var(--ws-surface-2)]"
                }`}
              >
                <div className="truncate text-[11px] font-medium text-[var(--ws-text)]">{d.title}</div>
                <div className="text-[9.5px] text-[var(--ws-muted)]">{d.folder} · {timeAgo(d.updatedAt)}</div>
              </button>
            ))
          )}
        </div>
        <div className="border-t border-[var(--ws-border)] p-2.5 text-[9px] leading-relaxed text-[var(--ws-muted)]">
          Stored in SQLite (`data/aurix.db`, table `documents`). Nothing is uploaded to a third party.
        </div>
      </div>

      <div className="ws-card flex min-h-[460px] flex-col p-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="ws-input min-w-[160px] flex-1 !text-[13px] !font-semibold"
            value={draft.title}
            placeholder={codeOnly ? "Untitled code file" : "Untitled document"}
            onChange={(e) => {
              setDraft({ ...draft, title: e.target.value });
              setStatus("dirty");
            }}
          />
          <input
            className="ws-input !w-32 !text-[11px]"
            value={draft.folder}
            placeholder="Folder"
            onChange={(e) => {
              setDraft({ ...draft, folder: e.target.value });
              setStatus("dirty");
            }}
          />
          <select
            className="ws-input !w-auto !text-[11px]"
            value={draft.kind}
            onChange={(e) => {
              setDraft({ ...draft, kind: e.target.value as DocumentItem["kind"] });
              setStatus("dirty");
            }}
          >
            <option value="document">Document</option>
            <option value="markdown">Markdown</option>
            <option value="spec">Spec</option>
            <option value="code">Code</option>
          </select>
          <span className={`ws-chip ${status === "saved" ? "!text-[var(--ws-accent)]" : ""}`}>
            {status === "saving" ? "Saving..." : status === "saved" ? "Saved" : status === "dirty" ? "Unsaved changes" : "Autosave on"}
          </span>
        </div>

        <textarea
          value={draft.content}
          onChange={(e) => {
            setDraft({ ...draft, content: e.target.value });
            setStatus("dirty");
          }}
          placeholder={codeOnly ? "// Write code here. Autosaves after you pause." : "Start writing, Sir. Autosave is on."}
          className={`ws-input ws-scroll mt-2.5 min-h-[360px] flex-1 resize-none !bg-[color-mix(in_srgb,var(--ws-bg-deep)_70%,transparent)] !py-3 !leading-relaxed ${
            draft.kind === "code" ? "!font-mono !text-[12px]" : "!text-[13px]"
          }`}
        />

        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <button type="button" className="ws-btn ws-btn-primary" onClick={() => void persist()} disabled={!draft.title.trim() || status === "saving"}>
            <Save className="h-3.5 w-3.5" /> Save now
          </button>
          <button
            type="button"
            className="ws-btn"
            onClick={async () => {
              await navigator.clipboard.writeText(draft.content);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1400);
            }}
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy"}
          </button>
          <button
            type="button"
            className="ws-btn"
            onClick={() =>
              download(
                `${(draft.title || "document").replace(/[^\w.-]+/g, "-")}.${draft.kind === "code" ? "txt" : "md"}`,
                draft.content
              )
            }
          >
            <Download className="h-3.5 w-3.5" /> Export
          </button>
          {onAsk && (
            <button
              type="button"
              className="ws-btn"
              onClick={() => onAsk(`Review this ${draft.kind === "code" ? "code" : "document"} and suggest concrete improvements:\n\n${draft.content.slice(0, 6000)}`)}
              disabled={!draft.content.trim()}
            >
              <Sparkles className="h-3.5 w-3.5" /> Ask AURIX
            </button>
          )}
          {activeId && (
            <button
              type="button"
              className="ws-btn ml-auto !border-[#F0729B]/40 !text-[#F0729B]"
              onClick={() => setDeleteTarget(store.documents.find((d) => d.id === activeId) || null)}
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete this document?"
        message={`"${deleteTarget?.title || ""}" will be permanently removed from the local database.`}
        confirmLabel="Delete document"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await store.removeDocument(deleteTarget.id);
          if (activeId === deleteTarget.id) openNew();
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Notes                                                               */
/* ------------------------------------------------------------------ */

export function NotesPanel({ notes, onSaveNote, onDeleteNote }: CommonProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ title: "", category: "General", content: "" });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"idle" | "dirty" | "saving" | "saved">("idle");
  const [deleteTarget, setDeleteTarget] = useState<NoteItem | null>(null);
  const timerRef = useRef<number | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return notes.filter((n) => !q || n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q));
  }, [notes, search]);

  useEffect(() => {
    if (!activeId) return;
    const note = notes.find((n) => n.id === activeId);
    if (note) setDraft({ title: note.title, category: note.category, content: note.content });
  }, [activeId, notes]);

  const persist = async () => {
    if (!draft.title.trim()) return;
    setStatus("saving");
    try {
      await onSaveNote({ id: activeId || undefined, ...draft });
      setStatus("saved");
    } catch {
      setStatus("dirty");
    }
  };

  useEffect(() => {
    if (status !== "dirty") return;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => void persist(), 900);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, status]);

  return (
    <div className="grid gap-4 xl:grid-cols-[280px_1fr]">
      <div className="ws-card flex flex-col overflow-hidden">
        <div className="space-y-2 border-b border-[var(--ws-border)] p-3">
          <button
            type="button"
            className="ws-btn ws-btn-primary w-full"
            onClick={() => {
              setActiveId(null);
              setDraft({ title: "", category: "General", content: "" });
              setStatus("idle");
            }}
          >
            <Plus className="h-4 w-4" /> New note
          </button>
          <input className="ws-input !py-2 !text-[11px]" placeholder="Search notes" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="ws-scroll max-h-[520px] flex-1 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <p className="px-2 py-6 text-center text-[11px] text-[var(--ws-muted)]">No notes yet.</p>
          ) : (
            filtered.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  setActiveId(n.id);
                  setDraft({ title: n.title, category: n.category, content: n.content });
                  setStatus("idle");
                }}
                className={`block w-full rounded-lg px-2.5 py-2 text-left transition-colors ${
                  activeId === n.id ? "bg-[color-mix(in_srgb,var(--ws-accent)_10%,transparent)]" : "hover:bg-[var(--ws-surface-2)]"
                }`}
              >
                <div className="truncate text-[11px] font-medium text-[var(--ws-text)]">{n.title}</div>
                <div className="text-[9.5px] text-[var(--ws-muted)]">{n.category} · {timeAgo(n.updatedAt)}</div>
              </button>
            ))
          )}
        </div>
      </div>
      <div className="ws-card flex min-h-[420px] flex-col p-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <input className="ws-input min-w-[160px] flex-1 !font-semibold" placeholder="Note title" value={draft.title} onChange={(e) => { setDraft({ ...draft, title: e.target.value }); setStatus("dirty"); }} />
          <input className="ws-input !w-36" placeholder="Category" value={draft.category} onChange={(e) => { setDraft({ ...draft, category: e.target.value }); setStatus("dirty"); }} />
          <span className="ws-chip">{status === "saved" ? "Saved" : status === "saving" ? "Saving..." : status === "dirty" ? "Unsaved" : "Autosave on"}</span>
        </div>
        <textarea
          className="ws-input ws-scroll mt-2.5 min-h-[330px] flex-1 resize-none !py-3 !text-[13px] !leading-relaxed"
          placeholder="Write freely, Sir."
          value={draft.content}
          onChange={(e) => { setDraft({ ...draft, content: e.target.value }); setStatus("dirty"); }}
        />
        <div className="mt-2.5 flex items-center gap-2">
          <button type="button" className="ws-btn ws-btn-primary" onClick={() => void persist()} disabled={!draft.title.trim()}>
            <Save className="h-3.5 w-3.5" /> Save note
          </button>
          {activeId && (
            <button type="button" className="ws-btn ml-auto !border-[#F0729B]/40 !text-[#F0729B]" onClick={() => setDeleteTarget(notes.find((n) => n.id === activeId) || null)}>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete this note?"
        message={`"${deleteTarget?.title || ""}" will be permanently removed.`}
        confirmLabel="Delete note"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await onDeleteNote(deleteTarget.id);
          setActiveId(null);
          setDraft({ title: "", category: "General", content: "" });
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Reminders                                                           */
/* ------------------------------------------------------------------ */

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function RemindersPanel({ store }: CommonProps) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [dueAt, setDueAt] = useState(() => toLocalInput(new Date(Date.now() + 3_600_000).toISOString()));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ReminderItem | null>(null);

  const sorted = useMemo(
    () => [...store.reminders].sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || a.dueAt.localeCompare(b.dueAt)),
    [store.reminders]
  );

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !dueAt) {
      setError("A title and due time are required.");
      return;
    }
    setSaving(true);
    setError(null);
    const iso = new Date(dueAt).toISOString();
    const saved = await store.saveReminder({ title: title.trim(), notes, dueAt: iso, status: "pending" });
    setSaving(false);
    if (saved) {
      setTitle("");
      setNotes("");
      setDueAt(toLocalInput(new Date(Date.now() + 3_600_000).toISOString()));
    } else {
      setError("The reminder could not be saved.");
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
      <form onSubmit={create} className="ws-card space-y-3 p-4">
        <h3 className="text-xs font-semibold text-[var(--ws-text)]">Schedule a reminder</h3>
        <label className="block text-[10px] text-[var(--ws-muted)]">
          Title
          <input className="ws-input mt-1" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What should AURIX remind you about?" />
        </label>
        <label className="block text-[10px] text-[var(--ws-muted)]">
          Due
          <input type="datetime-local" className="ws-input mt-1" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
        </label>
        <label className="block text-[10px] text-[var(--ws-muted)]">
          Notes
          <textarea className="ws-input mt-1 min-h-[70px]" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional detail" />
        </label>
        {error && <InlineError message={error} />}
        <button type="submit" className="ws-btn ws-btn-primary w-full" disabled={saving}>
          <BellRing className="h-4 w-4" /> {saving ? "Saving..." : "Create reminder"}
        </button>
        <p className="text-[9px] leading-relaxed text-[var(--ws-muted)]">
          Stored in the local SQLite database. AURIX shows an in-app alert when a reminder becomes due; browser notifications
          appear only if you allow them.
        </p>
      </form>

      <div className="space-y-2.5">
        {sorted.length === 0 ? (
          <EmptyState icon={<BellRing className="h-5 w-5" />} title="No reminders scheduled" description="Create one and AURIX will surface it when it falls due." />
        ) : (
          sorted.map((r) => {
            const due = new Date(r.dueAt);
            const overdue = r.status === "pending" && due.getTime() < Date.now();
            return (
              <div key={r.id} className={`ws-card flex items-start gap-3 p-3.5 ${overdue ? "!border-[#E7B75C]/45" : ""}`}>
                <button
                  type="button"
                  aria-label={r.status === "done" ? "Mark pending" : "Mark complete"}
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                    r.status === "done"
                      ? "border-[var(--ws-accent)] bg-[var(--ws-accent)] text-[var(--ws-accent-ink)]"
                      : "border-[var(--ws-border-strong)] text-transparent hover:border-[var(--ws-accent)]"
                  }`}
                  onClick={() => void store.saveReminder({ ...r, status: r.status === "done" ? "pending" : "done" })}
                >
                  <Check className="h-3 w-3" />
                </button>
                <div className="min-w-0 flex-1">
                  <div className={`text-[11.5px] font-medium ${r.status === "done" ? "text-[var(--ws-muted)] line-through" : "text-[var(--ws-text)]"}`}>{r.title}</div>
                  {r.notes && <p className="mt-0.5 text-[10px] text-[var(--ws-muted)]">{r.notes}</p>}
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[9.5px] text-[var(--ws-muted)]">
                    <span>{due.toLocaleString()}</span>
                    {overdue && <span className="ws-chip !border-[#E7B75C]/40 !text-[#E7B75C]">Overdue</span>}
                    {r.status === "done" && <span className="ws-chip !text-[var(--ws-accent)]">Completed</span>}
                  </div>
                </div>
                <button type="button" className="ws-btn ws-btn-ghost !p-1.5 hover:!text-[#F0729B]" onClick={() => setDeleteTarget(r)} aria-label="Delete reminder">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete this reminder?"
        message={`"${deleteTarget?.title || ""}" will be removed.`}
        confirmLabel="Delete reminder"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await store.removeReminder(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tasks                                                               */
/* ------------------------------------------------------------------ */

export function TasksPanel({ tasks, onSaveTask, onDeleteTask }: CommonProps) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<TaskItem["priority"]>("medium");
  const [category, setCategory] = useState<TaskItem["category"]>("daily");
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TaskItem | null>(null);

  const columns: Array<{ id: TaskItem["status"]; label: string }> = [
    { id: "todo", label: "Pending" },
    { id: "in_progress", label: "In progress" },
    { id: "done", label: "Completed" },
  ];

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("A task title is required.");
      return;
    }
    setError(null);
    try {
      await onSaveTask({ title: title.trim(), category, priority, status: "todo", dueDate, notes: "" });
      setTitle("");
    } catch {
      setError("The task could not be saved.");
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={create} className="ws-card flex flex-wrap items-end gap-2 p-3.5">
        <label className="min-w-[200px] flex-1 text-[10px] text-[var(--ws-muted)]">
          New task
          <input className="ws-input mt-1" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs to be done, Sir?" />
        </label>
        <label className="text-[10px] text-[var(--ws-muted)]">
          Priority
          <select className="ws-input mt-1 !w-auto" value={priority} onChange={(e) => setPriority(e.target.value as TaskItem["priority"])}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>
        <label className="text-[10px] text-[var(--ws-muted)]">
          Category
          <select className="ws-input mt-1 !w-auto" value={category} onChange={(e) => setCategory(e.target.value as TaskItem["category"])}>
            <option value="daily">Daily</option>
            <option value="study">Study</option>
            <option value="business">Business</option>
            <option value="dev">Development</option>
          </select>
        </label>
        <label className="text-[10px] text-[var(--ws-muted)]">
          Due
          <input type="date" className="ws-input mt-1 !w-auto" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </label>
        <button type="submit" className="ws-btn ws-btn-primary">
          <Plus className="h-4 w-4" /> Add task
        </button>
        {error && <div className="w-full"><InlineError message={error} /></div>}
      </form>

      <div className="grid gap-3 lg:grid-cols-3">
        {columns.map((col) => {
          const items = tasks.filter((t) => t.status === col.id);
          return (
            <div key={col.id} className="ws-card flex flex-col p-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[11px] font-semibold text-[var(--ws-text)]">{col.label}</h3>
                <span className="ws-chip !py-0.5">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-[var(--ws-border)] px-2 py-4 text-center text-[10px] text-[var(--ws-muted)]">Empty</p>
                ) : (
                  items.map((task) => (
                    <div key={task.id} className="ws-inset p-2.5">
                      <div className="flex items-start gap-2">
                        <span
                          className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ background: task.priority === "high" ? "#F0729B" : task.priority === "medium" ? "#E7B75C" : "var(--ws-accent)" }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className={`text-[11px] font-medium ${task.status === "done" ? "text-[var(--ws-muted)] line-through" : "text-[var(--ws-text)]"}`}>{task.title}</div>
                          <div className="mt-0.5 text-[9px] text-[var(--ws-muted)]">{task.category} · {task.dueDate || "no date"}</div>
                        </div>
                        <button type="button" className="ws-btn ws-btn-ghost !p-1 hover:!text-[#F0729B]" onClick={() => setDeleteTarget(task)} aria-label="Delete task">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {columns
                          .filter((c) => c.id !== task.status)
                          .map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              className="ws-chip !cursor-pointer hover:!text-[var(--ws-text)]"
                              onClick={() => void onSaveTask({ ...task, status: c.id })}
                            >
                              <CheckCircle2 className="h-2.5 w-2.5" /> {c.label}
                            </button>
                          ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete this task?"
        message={`"${deleteTarget?.title || ""}" will be removed from the task list.`}
        confirmLabel="Delete task"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await onDeleteTask(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}

export function StorageNote() {
  return (
    <p className="flex items-center gap-1.5 text-[9.5px] text-[var(--ws-muted)]">
      <FileText className="h-3 w-3" /> Data is stored locally in SQLite (`data/aurix.db`); uploaded attachments are used for the current
      AI request only and are not persisted.
    </p>
  );
}

export const PANEL_ICONS = { Code2, StickyNote, ListChecks };
