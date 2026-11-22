import React, { useMemo, useState } from "react";
import { Clock3, History, MessageSquare, Search, ShieldCheck, Zap } from "lucide-react";
import type { BootstrapPayload } from "../../types/aurix";
import type { WorkspaceStore } from "../useWorkspaceStore";
import { EmptyState, SectionHeader, timeAgo } from "../ui";

interface HistoryViewProps {
  data: BootstrapPayload;
  store: WorkspaceStore;
  onNavigate: (id: string) => void;
}

type Filter = "all" | "conversations" | "activity" | "automations";

export function HistoryView({ data, store, onNavigate }: HistoryViewProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const conversations = useMemo(
    () => data.conversations.filter((c) => !q || `${c.title} ${c.model} ${c.language}`.toLowerCase().includes(q)),
    [data.conversations, q]
  );
  const activity = useMemo(
    () => data.auditLogs.filter((a) => !q || `${a.eventType} ${a.detail} ${a.actor}`.toLowerCase().includes(q)),
    [data.auditLogs, q]
  );
  const runs = useMemo(
    () => store.runs.filter((r) => !q || `${r.workflowName} ${r.detail} ${r.status}`.toLowerCase().includes(q)),
    [store.runs, q]
  );

  return (
    <div className="space-y-4">
      <SectionHeader
        eyebrow="History"
        title="Everything AURIX has done."
        description="Saved conversations, recorded system events and automation runs, read directly from the local database."
        actions={<span className="ws-chip"><History className="h-3 w-3" /> {data.conversations.length + data.auditLogs.length + store.runs.length} records</span>}
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ws-muted)]" />
          <input className="ws-input !pl-9" placeholder="Search history" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {(["all", "conversations", "activity", "automations"] as Filter[]).map((f) => (
          <button key={f} type="button" className={`ws-btn !text-[10.5px] ${filter === f ? "ws-btn-primary" : ""}`} onClick={() => setFilter(f)}>
            {f === "all" ? "All" : f === "conversations" ? "Conversations" : f === "activity" ? "System activity" : "Automations"}
          </button>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {(filter === "all" || filter === "conversations") && (
          <div className="ws-card p-4">
            <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-[var(--ws-text)]">
              <MessageSquare className="h-3.5 w-3.5 text-[var(--ws-accent)]" /> Conversations ({conversations.length})
            </h3>
            {conversations.length === 0 ? (
              <EmptyState title="No conversations" description="Start a conversation in the AI Workspace." action={<button type="button" className="ws-btn ws-btn-primary" onClick={() => onNavigate("ai-workspace")}>Open AI Workspace</button>} />
            ) : (
              <div className="ws-scroll max-h-[480px] space-y-1.5 overflow-y-auto">
                {conversations.map((c) => (
                  <button key={c.id} type="button" onClick={() => onNavigate("ai-workspace")} className="block w-full rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[var(--ws-surface-2)]">
                    <div className="truncate text-[11px] font-medium text-[var(--ws-text)]">{c.title}</div>
                    <div className="text-[9.5px] text-[var(--ws-muted)]">{c.model} · {c.language} · {timeAgo(c.updatedAt)}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {(filter === "all" || filter === "activity") && (
          <div className="ws-card p-4">
            <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-[var(--ws-text)]">
              <ShieldCheck className="h-3.5 w-3.5 text-[var(--ws-accent)]" /> System activity ({activity.length})
            </h3>
            {activity.length === 0 ? (
              <p className="py-4 text-center text-[10.5px] text-[var(--ws-muted)]">No activity recorded.</p>
            ) : (
              <div className="ws-scroll max-h-[480px] space-y-1.5 overflow-y-auto">
                {activity.map((a) => (
                  <div key={a.id} className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-[var(--ws-surface-2)]">
                    <Clock3 className="mt-0.5 h-3 w-3 shrink-0 text-[var(--ws-muted)]" />
                    <div className="min-w-0">
                      <div className="text-[10.5px] text-[var(--ws-text)]">{a.detail}</div>
                      <div className="text-[9px] uppercase tracking-wide text-[var(--ws-muted)]">{a.eventType} · {a.actor} · {timeAgo(a.createdAt)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {(filter === "all" || filter === "automations") && (
          <div className="ws-card p-4 xl:col-span-2">
            <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-[var(--ws-text)]">
              <Zap className="h-3.5 w-3.5 text-[var(--ws-accent)]" /> Automation runs ({runs.length})
            </h3>
            {runs.length === 0 ? (
              <p className="py-4 text-center text-[10.5px] text-[var(--ws-muted)]">No automation has run yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[10.5px]">
                  <thead className="text-[9px] uppercase tracking-[0.12em] text-[var(--ws-muted)]">
                    <tr>
                      <th className="pb-2">Workflow</th>
                      <th className="pb-2">Status</th>
                      <th className="pb-2">Detail</th>
                      <th className="pb-2 text-right">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((r) => (
                      <tr key={r.id} className="border-t border-[var(--ws-border)]">
                        <td className="py-1.5 pr-3 text-[var(--ws-text)]">{r.workflowName}</td>
                        <td className="py-1.5 pr-3 font-mono text-[9.5px] text-[var(--ws-muted)]">{r.status}</td>
                        <td className="max-w-[360px] truncate py-1.5 pr-3 text-[var(--ws-muted)]">{r.detail}</td>
                        <td className="py-1.5 text-right text-[var(--ws-muted)]">{timeAgo(r.startedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
