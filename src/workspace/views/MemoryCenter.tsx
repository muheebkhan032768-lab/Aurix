import React, { useMemo, useState } from "react";
import { BrainCircuit, Check, Pencil, Plus, Power, Search, ShieldAlert, Trash2, X } from "lucide-react";
import type { MemoryItem } from "../../types/aurix";
import { ConfirmDialog, EmptyState, InlineError, SectionHeader, timeAgo } from "../ui";

interface MemoryCenterProps {
  memories: MemoryItem[];
  onSaveMemory: (memory: Omit<MemoryItem, "id" | "createdAt" | "updatedAt"> & { id?: string }) => Promise<void>;
  onDeleteMemory: (id: string) => Promise<void>;
}

const SECRET_PATTERN =
  /(api[_-]?key|secret|password|passwd|token|bearer)\s*[:=]\s*\S{6,}|\b(sk-[A-Za-z0-9]{16,}|AIza[0-9A-Za-z_-]{20,}|ghp_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})\b/i;

const CATEGORIES = ["Preference", "Project Context", "Instruction", "Workflow", "Owner Profile", "Website Project"];

export function MemoryCenter({ memories, onSaveMemory, onDeleteMemory }: MemoryCenterProps) {
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", content: "", category: "Preference", projectScope: "Global", approved: true });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MemoryItem | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return memories.filter((m) => !q || `${m.title} ${m.content} ${m.category} ${m.projectScope}`.toLowerCase().includes(q));
  }, [memories, query]);

  const reset = () => {
    setEditingId(null);
    setForm({ title: "", content: "", category: "Preference", projectScope: "Global", approved: true });
    setError(null);
  };

  const startEdit = (memory: MemoryItem) => {
    setEditingId(memory.id);
    setForm({
      title: memory.title,
      content: memory.content,
      category: memory.category,
      projectScope: memory.projectScope || "Global",
      approved: memory.approved,
    });
    setError(null);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.content.trim()) {
      setError("A title and content are required.");
      return;
    }
    if (SECRET_PATTERN.test(form.content) || SECRET_PATTERN.test(form.title)) {
      setError("This looks like a password, API key or token. AURIX never stores credentials in memory — keep them in the server-side secret store.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSaveMemory({
        id: editingId || undefined,
        category: form.category,
        title: form.title.trim(),
        content: form.content.trim(),
        source: editingId ? "Memory Center edit" : "Memory Center",
        projectScope: form.projectScope.trim() || "Global",
        approved: form.approved,
      });
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this memory.");
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (memory: MemoryItem) => {
    await onSaveMemory({
      id: memory.id,
      category: memory.category,
      title: memory.title,
      content: memory.content,
      source: memory.source,
      projectScope: memory.projectScope,
      approved: !memory.approved,
    });
  };

  return (
    <div className="space-y-4">
      <SectionHeader
        eyebrow="Memory Center"
        title="Only what you approve is remembered."
        description="Preferences, project context, instructions and workflows that AURIX may use. Disable an entry to remove it from AI context without deleting it."
        actions={<span className="ws-chip"><BrainCircuit className="h-3 w-3" /> {memories.filter((m) => m.approved).length} active</span>}
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ws-muted)]" />
            <input className="ws-input !pl-9" placeholder="Search memories, instructions and project context" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          {filtered.length === 0 ? (
            <EmptyState icon={<BrainCircuit className="h-5 w-5" />} title={memories.length ? "No memory matches that search" : "No memories saved yet"} description="Save an approved preference or project fact and AURIX will include it in future context." />
          ) : (
            filtered.map((memory) => (
              <div key={memory.id} className={`ws-card p-3.5 ${!memory.approved ? "opacity-65" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="ws-chip !text-[var(--ws-accent)]">{memory.category}</span>
                      <span className="ws-chip">{memory.projectScope || "Global"}</span>
                      <span className={`ws-chip ${memory.approved ? "!text-[var(--ws-accent)]" : ""}`}>
                        <Power className="h-2.5 w-2.5" /> {memory.approved ? "Enabled" : "Disabled"}
                      </span>
                    </div>
                    <h3 className="mt-1.5 text-[12px] font-semibold text-[var(--ws-text)]">{memory.title}</h3>
                    <p className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed text-[var(--ws-muted)]">{memory.content}</p>
                    <div className="mt-1.5 text-[9px] uppercase tracking-[0.1em] text-[var(--ws-muted)]">
                      {memory.source} · updated {timeAgo(memory.updatedAt)}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    <button type="button" className="ws-btn ws-btn-ghost !p-1.5" onClick={() => void toggle(memory)} aria-label={memory.approved ? "Disable memory" : "Enable memory"}>
                      <Power className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" className="ws-btn ws-btn-ghost !p-1.5" onClick={() => startEdit(memory)} aria-label="Edit memory">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" className="ws-btn ws-btn-ghost !p-1.5 hover:!text-[#F0729B]" onClick={() => setDeleteTarget(memory)} aria-label="Delete memory">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <form onSubmit={save} className="ws-card space-y-3 self-start p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-[var(--ws-text)]">{editingId ? "Edit memory" : "Save a memory"}</h3>
            {editingId && (
              <button type="button" className="ws-btn ws-btn-ghost !p-1" onClick={reset} aria-label="Cancel edit">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <label className="block text-[10px] text-[var(--ws-muted)]">
            Title
            <input className="ws-input mt-1" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Short, specific label" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-[10px] text-[var(--ws-muted)]">
              Category
              <select className="ws-input mt-1" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="block text-[10px] text-[var(--ws-muted)]">
              Scope
              <input className="ws-input mt-1" value={form.projectScope} onChange={(e) => setForm({ ...form, projectScope: e.target.value })} />
            </label>
          </div>
          <label className="block text-[10px] text-[var(--ws-muted)]">
            Content
            <textarea className="ws-input mt-1 min-h-[120px]" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="What should AURIX remember?" />
          </label>
          <label className="flex items-center gap-2 text-[10.5px] text-[var(--ws-muted)]">
            <input type="checkbox" checked={form.approved} onChange={(e) => setForm({ ...form, approved: e.target.checked })} className="accent-[var(--ws-accent)]" />
            Approved for AI context
          </label>
          {error && <InlineError message={error} />}
          <button type="submit" className="ws-btn ws-btn-primary w-full" disabled={saving}>
            {editingId ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />} {saving ? "Saving..." : editingId ? "Update memory" : "Save memory"}
          </button>
          <p className="flex items-start gap-1.5 rounded-lg border border-[#E7B75C]/30 bg-[#E7B75C]/8 px-2.5 py-2 text-[9px] leading-relaxed text-[#E7B75C]">
            <ShieldAlert className="mt-0.5 h-3 w-3 shrink-0" />
            Passwords, API keys and tokens are rejected here. Keep credentials in the encrypted server-side secret store.
          </p>
        </form>
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete this memory?"
        message={`"${deleteTarget?.title || ""}" will be permanently removed from AURIX context.`}
        confirmLabel="Delete memory"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await onDeleteMemory(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}
