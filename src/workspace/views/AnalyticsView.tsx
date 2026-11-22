import React, { useEffect, useMemo, useState } from "react";
import { BarChart3, BrainCircuit, CheckCircle2, Clock3, Database, MessageSquare, RefreshCw, Zap } from "lucide-react";
import type { AnalyticsPayload } from "../../types/aurix";
import { EmptyState, InlineError, SectionHeader, StatCard } from "../ui";

function shortDay(day: string): string {
  const d = new Date(`${day}T00:00:00`);
  return d.toLocaleDateString([], { weekday: "short" });
}

function Donut({ data }: { data: Array<{ label: string; value: number; color: string }> }) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 110 110" className="h-28 w-28 -rotate-90">
        <circle cx="55" cy="55" r={radius} fill="none" stroke="var(--ws-surface-3)" strokeWidth="12" />
        {total > 0 &&
          data.map((item) => {
            const length = (item.value / total) * circumference;
            const dash = `${length} ${circumference - length}`;
            const el = (
              <circle
                key={item.label}
                cx="55"
                cy="55"
                r={radius}
                fill="none"
                stroke={item.color}
                strokeWidth="12"
                strokeDasharray={dash}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            );
            offset += length;
            return el;
          })}
      </svg>
      <div className="space-y-1.5">
        {data.map((item) => (
          <div key={item.label} className="flex items-center gap-2 text-[10.5px]">
            <span className="h-2 w-2 rounded-full" style={{ background: item.color }} />
            <span className="text-[var(--ws-muted)]">{item.label}</span>
            <span className="ml-auto font-mono text-[var(--ws-text)]">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AnalyticsView() {
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/analytics");
      if (!res.ok) throw new Error("Analytics are unavailable right now.");
      setData(await res.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analytics are unavailable.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const maxActivity = useMemo(() => Math.max(1, ...(data?.activityByDay.map((d) => d.messages) || [1])), [data]);
  const modelTotal = useMemo(() => Math.max(1, (data?.models || []).reduce((sum, m) => sum + m.count, 0)), [data]);

  return (
    <div className="space-y-4">
      <SectionHeader
        eyebrow="AI Analytics"
        title="Measured, not invented."
        description="Every number is counted from the local database or a live service check. Anything the app cannot measure is labelled Data unavailable instead of estimated."
        actions={
          <button type="button" className="ws-btn" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        }
      />

      {error && <InlineError message={error} onRetry={() => void load()} />}

      {!data && loading ? (
        <div className="ws-card p-10 text-center text-xs text-[var(--ws-muted)]">Counting local activity...</div>
      ) : !data ? (
        <EmptyState title="Analytics unavailable" description="The local analytics endpoint did not answer." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Conversations" value={data.totals.conversations} hint={`${data.totals.messages} total messages`} icon={<MessageSquare className="h-4 w-4" />} />
            <StatCard label="Assistant replies" value={data.totals.assistantMessages} hint={`${data.totals.userMessages} prompts`} icon={<BrainCircuit className="h-4 w-4" />} tone="cyan" />
            <StatCard label="Tasks completed" value={`${data.totals.tasksDone}/${data.totals.tasks}`} hint={`${data.totals.tasks ? Math.round((data.totals.tasksDone / data.totals.tasks) * 100) : 0}% completion`} icon={<CheckCircle2 className="h-4 w-4" />} />
            <StatCard label="Automations" value={data.totals.workflows} hint={`${data.totals.reminders} pending reminders`} icon={<Zap className="h-4 w-4" />} tone="cyan" />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="ws-card p-4">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-xs font-semibold text-[var(--ws-text)]">Messages · last 7 days</h3>
                <span className="ws-chip"><BarChart3 className="h-3 w-3" /> local DB</span>
              </div>
              <div className="flex h-40 items-end gap-2">
                {data.activityByDay.map((day) => (
                  <div key={day.day} className="flex flex-1 flex-col items-center gap-1.5">
                    <span className="font-mono text-[9px] text-[var(--ws-muted)]">{day.messages}</span>
                    <div
                      className="w-full rounded-t-md bg-[linear-gradient(180deg,var(--ws-accent),color-mix(in_srgb,var(--ws-accent-2)_60%,transparent))] transition-[height] duration-500"
                      style={{ height: `${Math.max(3, (day.messages / maxActivity) * 120)}px` }}
                      title={`${day.day}: ${day.messages} messages`}
                    />
                    <span className="text-[9px] text-[var(--ws-muted)]">{shortDay(day.day)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="ws-card p-4">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-xs font-semibold text-[var(--ws-text)]">Model usage</h3>
                <span className="ws-chip">recorded per reply</span>
              </div>
              {data.models.length === 0 ? (
                <p className="py-8 text-center text-[11px] text-[var(--ws-muted)]">Data unavailable — no assistant replies recorded yet.</p>
              ) : (
                <div className="space-y-3">
                  {data.models.map((m, i) => (
                    <div key={m.model}>
                      <div className="flex items-center justify-between text-[10.5px]">
                        <span className="truncate font-mono text-[var(--ws-text)]">{m.model}</span>
                        <span className="text-[var(--ws-muted)]">{m.count}</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--ws-surface-3)]">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${(m.count / modelTotal) * 100}%`,
                            background: i % 2 === 0 ? "var(--ws-accent)" : "var(--ws-accent-2)",
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="ws-card p-4">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-xs font-semibold text-[var(--ws-text)]">Task distribution</h3>
                <span className="ws-chip"><CheckCircle2 className="h-3 w-3" /> live</span>
              </div>
              <Donut
                data={[
                  { label: "Pending", value: data.tasksByStatus.find((t) => t.status === "todo")?.count || 0, color: "var(--ws-accent-2)" },
                  { label: "In progress", value: data.tasksByStatus.find((t) => t.status === "in_progress")?.count || 0, color: "#E7B75C" },
                  { label: "Completed", value: data.tasksByStatus.find((t) => t.status === "done")?.count || 0, color: "var(--ws-accent)" },
                ]}
              />
            </div>

            <div className="ws-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-xs font-semibold text-[var(--ws-text)]">Integration & performance</h3>
                <span className="ws-chip"><Database className="h-3 w-3" /> checked now</span>
              </div>
              <div className="space-y-2 text-[11px]">
                {[
                  { label: "Gemini key configured", value: data.integrations.geminiConfigured ? "Yes" : "No", ok: data.integrations.geminiConfigured },
                  { label: "Local Ollama reachable", value: data.integrations.ollamaReachable ? `Yes · ${data.integrations.ollamaModels} model(s)` : "No", ok: data.integrations.ollamaReachable },
                  { label: "Offline knowledge fallback", value: data.integrations.offlineEngine ? "Available" : "Unavailable", ok: data.integrations.offlineEngine },
                  { label: "Average reply length", value: data.averageReplyChars === null ? "Data unavailable" : `${data.averageReplyChars} characters`, ok: data.averageReplyChars !== null },
                  { label: "Average response time", value: "Data unavailable", ok: false },
                  { label: "Token usage & cost", value: "Data unavailable", ok: false },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between gap-3 border-b border-[var(--ws-border)] pb-1.5 last:border-0 last:pb-0">
                    <span className="text-[var(--ws-muted)]">{row.label}</span>
                    <span className={`font-mono text-[10px] ${row.ok ? "text-[var(--ws-accent)]" : "text-[var(--ws-muted)]"}`}>{row.value}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 flex items-center gap-1.5 text-[9.5px] text-[var(--ws-muted)]">
                <Clock3 className="h-3 w-3" /> Generated {new Date(data.generatedAt).toLocaleString()}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
