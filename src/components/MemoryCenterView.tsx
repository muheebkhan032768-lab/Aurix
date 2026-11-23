import React, { useState } from "react";
import { BrainCircuit, Plus, Search, Trash2 } from "lucide-react";
import type { MemoryItem } from "../types/aurix";

interface MemoryCenterViewProps {
  memories: MemoryItem[];
  onSaveMemory: (memory: Omit<MemoryItem, "id" | "createdAt" | "updatedAt"> & { id?: string }) => Promise<void>;
  onDeleteMemory: (id: string) => Promise<void>;
}

/**
 * Memory Center — the owner-controlled persistent memory store.
 * Reads and writes the same SQLite-backed records used by the AI context.
 */
export function MemoryCenterView({ memories, onSaveMemory, onDeleteMemory }: MemoryCenterViewProps) {
  const [query, setQuery] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("preference");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = memories.filter((memory) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return `${memory.title} ${memory.content} ${memory.category}`.toLowerCase().includes(needle);
  });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      setError("A title and content are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSaveMemory({
        category,
        title: title.trim(),
        content: content.trim(),
        source: "Memory Center",
        projectScope: "",
        approved: true,
      });
      setTitle("");
      setContent("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this memory.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="nexus-panel rounded-2xl px-4 py-3.5 sm:px-5">
        <div className="flex items-center gap-2">
          <BrainCircuit className="w-4 h-4 text-accent" />
          <h1 className="font-display text-base font-bold tracking-wide text-slate-900 dark:text-white">Memory Center</h1>
          <span className="ml-auto text-[10px] font-mono uppercase tracking-[0.16em] text-muted-ink">
            {memories.length} saved
          </span>
        </div>
        <p className="mt-1 text-[11px] text-slate-600 dark:text-[#94A8B8]">
          Only what you approve here is remembered. Delete any entry to remove it from DEX MADE context permanently.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="nexus-panel rounded-2xl p-4">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-[#00D9FF]/15 bg-white dark:bg-[#05080D]/60 px-3 py-2">
            <Search className="w-3.5 h-3.5 text-muted-ink" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search memories…"
              className="w-full bg-transparent text-xs text-slate-900 dark:text-white placeholder:text-slate-500 dark:placeholder:text-[#5B7185] outline-none"
            />
          </div>

          <div className="mt-3 space-y-2">
            {filtered.map((memory) => (
              <div key={memory.id} className="rounded-xl border border-slate-200 dark:border-[#00D9FF]/10 bg-slate-50 dark:bg-[#0B1520]/70 px-3.5 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-slate-300 dark:border-[#00D9FF]/25 px-2 py-0.5 text-[9px] font-mono uppercase tracking-[0.12em] text-accent">
                        {memory.category}
                      </span>
                      <span className="truncate text-xs font-semibold text-slate-900 dark:text-white">{memory.title}</span>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-600 dark:text-[#94A8B8]">{memory.content}</p>
                    <div className="mt-1 text-[9px] font-mono uppercase tracking-[0.1em] text-muted-ink">
                      {memory.source} · {new Date(memory.updatedAt).toLocaleString()}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void onDeleteMemory(memory.id)}
                    aria-label={`Delete memory ${memory.title}`}
                    className="rounded-lg border border-rose-400/25 p-1.5 text-rose-700 dark:text-rose-300 hover:bg-rose-500/10 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="rounded-xl border border-dashed border-slate-200 dark:border-[#00D9FF]/15 px-4 py-8 text-center text-[11px] text-muted-ink">
                {memories.length === 0 ? "No memories saved yet." : "No memory matches that search."}
              </p>
            )}
          </div>
        </div>

        <form onSubmit={save} className="nexus-panel rounded-2xl p-4 space-y-2.5 self-start">
          <h2 className="text-[11px] font-mono uppercase tracking-[0.2em] text-slate-600 dark:text-[#A9C8D5]">Save a memory</h2>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-xl border border-slate-200 dark:border-[#00D9FF]/15 bg-white dark:bg-[#05080D]/70 px-3 py-2 text-xs text-slate-900 dark:text-white outline-none focus:border-[#00D9FF]/50"
          >
            <option value="preference">Preference</option>
            <option value="project">Project</option>
            <option value="workflow">Workflow</option>
            <option value="business">Business</option>
          </select>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Short title"
            className="w-full rounded-xl border border-slate-200 dark:border-[#00D9FF]/15 bg-white dark:bg-[#05080D]/70 px-3 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-500 dark:placeholder:text-[#5B7185] outline-none focus:border-[#00D9FF]/50"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            placeholder="What should DEX MADE remember?"
            className="w-full rounded-xl border border-slate-200 dark:border-[#00D9FF]/15 bg-white dark:bg-[#05080D]/70 px-3 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-500 dark:placeholder:text-[#5B7185] outline-none focus:border-[#00D9FF]/50"
          />
          {error && <p className="text-[11px] text-rose-700 dark:text-rose-300">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#0B63D6] px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-50 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            {saving ? "Saving…" : "Save memory"}
          </button>
        </form>
      </div>
    </div>
  );
}
