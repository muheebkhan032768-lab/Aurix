import React, { useCallback, useEffect, useMemo, useState } from "react";
import { BrainCircuit, CheckCircle2, Hand, ListChecks, Pencil, Save, Search, Sparkles, Trash2, Wand2, X } from "lucide-react";
import type { TrainingExample, TrainingStats } from "../../types/aurix";

const KIND_LABELS: Record<string, string> = {
  object: "Visual object",
  gesture: "Gesture",
  voice_command: "Voice command",
  task: "Custom task",
};

export function TrainingMemoryCenterView() {
  const [examples, setExamples] = useState<TrainingExample[]>([]);
  const [stats, setStats] = useState<TrainingStats | null>(null);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<TrainingExample | null>(null);
  const [draft, setDraft] = useState({ label: "", description: "", category: "" });
  const [confirmDelete, setConfirmDelete] = useState<TrainingExample | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearPhrase, setClearPhrase] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/training");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load training memory.");
      setExamples(data.examples ?? []);
      setStats(data.stats ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load training memory.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return examples
      .filter((example) => (kind === "all" ? true : example.kind === kind))
      .filter((example) =>
        needle ? `${example.label} ${example.description} ${example.category} ${example.trigger ?? ""}`.toLowerCase().includes(needle) : true
      );
  }, [examples, kind, query]);

  const saveEdit = async () => {
    if (!editing) return;
    const res = await fetch(`/api/training/${editing.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Could not update this example.");
      return;
    }
    setEditing(null);
    await load();
  };

  const remove = async (example: TrainingExample) => {
    const res = await fetch(`/api/training/${example.id}`, { method: "DELETE" });
    if (res.ok) {
      setConfirmDelete(null);
      await load();
    }
  };

  const clearAll = async () => {
    if (clearPhrase !== "DELETE ALL") return;
    const res = await fetch("/api/training/clear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: "DELETE_ALL_TRAINING_DATA" }),
    });
    if (res.ok) {
      setClearOpen(false);
      setClearPhrase("");
      await load();
    }
  };

  const kindIcon = (value: string) => {
    if (value === "object") return <Sparkles className="h-3.5 w-3.5 text-[#00D9FF]" />;
    if (value === "gesture") return <Hand className="h-3.5 w-3.5 text-[#A9C8D5]" />;
    if (value === "task") return <Wand2 className="h-3.5 w-3.5 text-[#D6AD60]" />;
    return <ListChecks className="h-3.5 w-3.5 text-[#147DFF]" />;
  };

  return (
    <div className="space-y-4">
      <section className="nexus-panel rounded-2xl p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.22em] text-[#00D9FF]">
              <BrainCircuit className="h-3.5 w-3.5" /> AURIX memory center
            </div>
            <h1 className="mt-1 font-display text-lg font-bold tracking-wide text-white">Training Memory</h1>
            <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-[#94A8B8]">
              Only owner-approved examples appear here. Images and metadata live in <span className="font-mono text-[#A9C8D5]">data/training</span> on this machine; delete anything permanently at any time.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[#00D9FF]/25 bg-[#00D9FF]/10 px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.12em] text-[#7FE9FF]">
              {stats?.total ?? examples.length} approved
            </span>
            <button type="button" onClick={() => setClearOpen(true)} className="inline-flex items-center gap-1.5 rounded-xl border border-rose-400/30 px-3 py-2 text-[11px] text-rose-300 hover:bg-rose-500/10 cursor-pointer">
              <Trash2 className="h-3.5 w-3.5" /> Clear all training data
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="flex min-w-[200px] flex-1 items-center gap-2 rounded-xl border border-[#00D9FF]/15 bg-[#05080D]/60 px-3 py-2">
            <Search className="h-3.5 w-3.5 text-[#5B7185]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search my training memory…"
              className="w-full bg-transparent text-xs text-white placeholder:text-[#5B7185] outline-none"
            />
          </div>
          {[
            { id: "all", label: "All" },
            { id: "object", label: "Objects" },
            { id: "gesture", label: "Gestures" },
            { id: "voice_command", label: "Voice commands" },
            { id: "task", label: "Tasks" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setKind(tab.id)}
              className={`rounded-xl border px-2.5 py-1.5 text-[10px] cursor-pointer ${
                kind === tab.id ? "border-[#00D9FF]/40 bg-[#00D9FF]/10 text-[#7FE9FF]" : "border-white/10 text-[#7A8FA0] hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {error && <p className="mt-2 rounded-xl border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-[11px] text-rose-200">{error}</p>}
      </section>

      {clearOpen && (
        <section className="nexus-panel rounded-2xl border-rose-400/30 p-4">
          <h2 className="text-sm font-semibold text-rose-200">Delete every training example?</h2>
          <p className="mt-1 text-[11px] text-[#94A8B8]">
            This removes all approved images, gestures, commands and tasks from this machine. It cannot be undone. Type <span className="font-mono text-white">DELETE ALL</span> to confirm.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              value={clearPhrase}
              onChange={(e) => setClearPhrase(e.target.value)}
              placeholder="DELETE ALL"
              className="rounded-xl border border-rose-400/30 bg-[#05080D]/70 px-3 py-2 text-xs text-white outline-none"
            />
            <button type="button" onClick={() => void clearAll()} disabled={clearPhrase !== "DELETE ALL"} className="rounded-xl bg-rose-500 px-3 py-2 text-[11px] font-semibold text-white disabled:opacity-40 cursor-pointer">
              Permanently delete all
            </button>
            <button type="button" onClick={() => { setClearOpen(false); setClearPhrase(""); }} className="rounded-xl border border-white/15 px-3 py-2 text-[11px] text-[#A9C8D5] cursor-pointer">
              Cancel
            </button>
          </div>
        </section>
      )}

      {loading ? (
        <p className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-[11px] text-[#5B7185]">Loading approved training memory…</p>
      ) : filtered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[#00D9FF]/15 px-4 py-10 text-center text-[11px] text-[#5B7185]">
          {examples.length === 0 ? "No training examples yet. Teach AURIX something in Visual Learning Mode." : "No example matches that search."}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((example) => (
            <article key={example.id} className="nexus-panel overflow-hidden rounded-2xl">
              {example.assetUrl && (
                <img src={example.assetUrl} alt={example.label} className="h-36 w-full border-b border-white/5 object-cover" />
              )}
              <div className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-[0.14em] text-[#5B7185]">
                      {kindIcon(example.kind)} {KIND_LABELS[example.kind] ?? example.kind}
                    </div>
                    <h2 className="mt-0.5 truncate text-sm font-semibold text-white">{example.label}</h2>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[9px] font-mono uppercase tracking-[0.1em] text-emerald-300">
                    <CheckCircle2 className="h-2.5 w-2.5" /> approved
                  </span>
                </div>
                {example.description && <p className="mt-1.5 line-clamp-3 text-[11px] leading-relaxed text-[#94A8B8]">{example.description}</p>}
                {example.trigger && <p className="mt-1 text-[10px] text-[#5B7185]">Trigger: <span className="text-[#A9C8D5]">{example.trigger}</span></p>}
                {example.action?.urls?.length ? (
                  <p className="mt-1 truncate text-[10px] text-[#5B7185]">{example.action.urls.join(" · ")}</p>
                ) : null}
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="font-mono text-[9px] text-[#5B7185]">
                    {example.category} · {new Date(example.createdAt).toLocaleDateString()}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(example);
                        setDraft({ label: example.label, description: example.description, category: example.category });
                      }}
                      aria-label={`Edit ${example.label}`}
                      className="rounded-lg border border-white/10 p-1.5 text-[#A9C8D5] hover:bg-white/5 cursor-pointer"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(example)}
                      aria-label={`Delete ${example.label}`}
                      className="rounded-lg border border-rose-400/25 p-1.5 text-rose-300 hover:bg-rose-500/10 cursor-pointer"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
          <div className="nexus-panel w-full max-w-md space-y-2 rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Edit training example</h2>
              <button type="button" onClick={() => setEditing(null)} aria-label="Close" className="rounded-lg p-1 text-[#5B7185] hover:bg-white/5 cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>
            <input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} className="w-full rounded-xl border border-white/10 bg-[#05080D]/70 px-3 py-2 text-xs text-white outline-none" placeholder="Label" />
            <textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} rows={3} className="w-full rounded-xl border border-white/10 bg-[#05080D]/70 px-3 py-2 text-xs text-white outline-none" placeholder="Description" />
            <input value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} className="w-full rounded-xl border border-white/10 bg-[#05080D]/70 px-3 py-2 text-xs text-white outline-none" placeholder="Category" />
            <button type="button" onClick={() => void saveEdit()} className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#10B981] px-3 py-2 text-[11px] font-semibold text-white hover:bg-emerald-600 cursor-pointer">
              <Save className="h-3.5 w-3.5" /> Save changes
            </button>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
          <div className="nexus-panel w-full max-w-sm space-y-3 rounded-2xl p-4">
            <h2 className="text-sm font-semibold text-white">Delete “{confirmDelete.label}”?</h2>
            <p className="text-[11px] text-[#94A8B8]">The image and its metadata are removed from this machine. This cannot be undone.</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => void remove(confirmDelete)} className="flex-1 rounded-xl bg-rose-500 px-3 py-2 text-[11px] font-semibold text-white cursor-pointer">
                Delete permanently
              </button>
              <button type="button" onClick={() => setConfirmDelete(null)} className="flex-1 rounded-xl border border-white/15 px-3 py-2 text-[11px] text-[#A9C8D5] cursor-pointer">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
