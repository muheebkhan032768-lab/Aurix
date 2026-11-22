import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  BellRing,
  BrainCircuit,
  CheckCircle2,
  Clock,
  Cpu,
  FileText,
  FolderKanban,
  HardDrive,
  ListChecks,
  Mic,
  Plus,
  Sparkles,
  Zap,
} from "lucide-react";
import type { AiStatusPayload, AnalyticsPayload, BootstrapPayload, TaskItem } from "../../types/aurix";
import { formatBytes, SectionHeader, StatCard, StatusDot, timeAgo } from "../ui";

interface CommandCenterProps {
  data: BootstrapPayload;
  isOnline: boolean;
  aiStatus: AiStatusPayload | null;
  onNavigate: (id: string) => void;
  onAsk: (prompt: string) => void;
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function taskStatusLabel(task: TaskItem): string {
  if (task.status === "done") return "Completed";
  if (task.status === "in_progress") return "In progress";
  return "Pending";
}

export function CommandCenter({ data, isOnline, aiStatus, onNavigate, onAsk }: CommandCenterProps) {
  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null);
  const [prompt, setPrompt] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch("/api/analytics")
        .then((r) => (r.ok ? r.json() : null))
        .then((json) => {
          if (!cancelled && json) setAnalytics(json as AnalyticsPayload);
        })
        .catch(() => undefined);
    void load();
    const timer = window.setInterval(load, 45_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const activeTasks = useMemo(
    () => data.tasks.filter((t) => t.status !== "done").sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || "")),
    [data.tasks]
  );
  const completed = data.tasks.filter((t) => t.status === "done").length;
  const progress = data.tasks.length ? Math.round((completed / data.tasks.length) * 100) : 0;
  const aiState = aiStatus?.state || "untested";
  const aiLabel =
    aiState === "connected"
      ? "AI connected"
      : aiState === "degraded"
        ? "AI degraded — offline fallback ready"
        : aiState === "not_configured"
          ? "AI key not configured"
          : "AI not tested yet";
  const aiDot = aiState === "connected" ? "ok" : aiState === "degraded" ? "warn" : aiState === "not_configured" ? "error" : "idle";
  const ramUsed = data.telemetry.totalMemoryBytes - data.telemetry.freeMemoryBytes;
  const ramPct = data.telemetry.totalMemoryBytes ? Math.round((ramUsed / data.telemetry.totalMemoryBytes) * 100) : 0;
  const diskUsed = data.telemetry.diskTotalBytes - data.telemetry.diskFreeBytes;
  const diskPct = data.telemetry.diskTotalBytes ? Math.round((diskUsed / data.telemetry.diskTotalBytes) * 100) : 0;

  const quickCommands = [
    { label: "New conversation", icon: Sparkles, action: () => onNavigate("ai-workspace") },
    { label: "Create project", icon: FolderKanban, action: () => onNavigate("projects") },
    { label: "Write a note", icon: FileText, action: () => onNavigate("notes") },
    { label: "Set a reminder", icon: BellRing, action: () => onNavigate("reminders") },
    { label: "Open voice", icon: Mic, action: () => onNavigate("voice") },
    { label: "New automation", icon: Zap, action: () => onNavigate("automation") },
  ];

  return (
    <div className="space-y-4">
      <SectionHeader
        eyebrow="Command Center"
        title={`${greeting()}, Sir. AURIX is ready.`}
        description="One unified operations surface for your AI workspace — every figure below is read from the live local system or the real AI service."
        actions={
          <>
            <button type="button" className="ws-btn" onClick={() => onNavigate("voice")}>
              <Mic className="h-4 w-4" /> Voice
            </button>
            <button type="button" className="ws-btn ws-btn-primary" onClick={() => onNavigate("ai-workspace")}>
              <Sparkles className="h-4 w-4" /> New conversation
            </button>
          </>
        }
      />

      <div className="ws-card ws-noise relative overflow-hidden p-5">
        <div className="pointer-events-none absolute inset-0 ws-grid-bg opacity-70" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="ws-chip !border-[color-mix(in_srgb,var(--ws-accent)_35%,transparent)] !text-[var(--ws-accent)]">
                <StatusDot state={isOnline ? "ok" : "warn"} /> {isOnline ? "Online" : "Offline"}
              </span>
              <span className="ws-chip">
                <StatusDot state={aiDot} /> {aiLabel}
              </span>
              <span className="ws-chip">
                <Activity className="h-3 w-3" /> {data.telemetry.hardwareTier}
              </span>
            </div>
            <h2 className="font-display text-lg font-semibold text-[var(--ws-text)] sm:text-xl">
              What should we accomplish today?
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-[var(--ws-muted)]">
              {activeTasks.length} open task{activeTasks.length === 1 ? "" : "s"} · {data.projects.length} projects ·{" "}
              {data.conversations.length} conversations · {data.memories.length} approved memories. Model:{" "}
              <span className="font-mono text-[var(--ws-text)]">{data.settings.activeModel}</span>.
            </p>
            <form
              className="mt-4 flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!prompt.trim()) return;
                onAsk(prompt.trim());
                setPrompt("");
              }}
            >
              <input
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Ask AURIX anything, Sir..."
                className="ws-input flex-1"
              />
              <button type="submit" className="ws-btn ws-btn-primary !px-3" disabled={!prompt.trim()} aria-label="Send prompt">
                <ArrowUpRight className="h-4 w-4" />
              </button>
            </form>
          </div>
          <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
            {quickCommands.slice(0, 4).map((cmd) => (
              <button
                key={cmd.label}
                type="button"
                onClick={cmd.action}
                className="ws-inset flex items-center gap-2 px-3 py-2 text-left text-[10.5px] font-medium text-[var(--ws-muted)] transition-colors hover:text-[var(--ws-text)]"
              >
                <cmd.icon className="h-3.5 w-3.5 text-[var(--ws-accent)]" />
                {cmd.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Open tasks" value={activeTasks.length} hint={`${completed} completed`} icon={<ListChecks className="h-4 w-4" />} />
        <StatCard label="Projects" value={data.projects.length} hint={`${data.projects.filter((p) => p.status === "active").length} active`} icon={<FolderKanban className="h-4 w-4" />} tone="cyan" />
        <StatCard label="Conversations" value={data.conversations.length} hint={analytics ? `${analytics.totals.messages} messages` : "Loading count"} icon={<Sparkles className="h-4 w-4" />} />
        <StatCard label="Memories" value={data.memories.length} hint="Approved context entries" icon={<BrainCircuit className="h-4 w-4" />} tone="cyan" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="ws-card p-4 xl:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-[var(--ws-text)]">Today&apos;s execution queue</h3>
            <button type="button" className="ws-btn ws-btn-ghost !text-[10px]" onClick={() => onNavigate("tasks")}>
              Task Manager <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          {activeTasks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--ws-border-strong)] px-4 py-6 text-center text-[11px] text-[var(--ws-muted)]">
              Nothing is pending, Sir. Create a task or ask AURIX to plan one.
            </div>
          ) : (
            <div className="space-y-2">
              {activeTasks.slice(0, 5).map((task) => (
                <div key={task.id} className="ws-inset flex items-center gap-3 px-3 py-2.5">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{
                      background:
                        task.priority === "high" ? "#F0729B" : task.priority === "medium" ? "#E7B75C" : "var(--ws-accent)",
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[11.5px] font-medium text-[var(--ws-text)]">{task.title}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-[9.5px] text-[var(--ws-muted)]">
                      <span className="uppercase tracking-wide">{task.category}</span>
                      <span>·</span>
                      <span>{taskStatusLabel(task)}</span>
                      {task.dueDate && (
                        <>
                          <span>·</span>
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-2.5 w-2.5" /> {task.dueDate}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <span className="ws-chip !py-0.5">{task.priority}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="ws-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-[var(--ws-text)]">Productivity overview</h3>
            <span className="font-display text-lg font-semibold text-[var(--ws-accent)]">{progress}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--ws-surface-3)]">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,var(--ws-accent),var(--ws-accent-2))] transition-[width] duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {[
              { label: "Notes", value: data.notes.length },
              { label: "Documents", value: analytics?.totals.documents ?? "—" },
              { label: "Reminders", value: analytics?.totals.reminders ?? "—" },
              { label: "Automations", value: analytics?.totals.workflows ?? "—" },
            ].map((item) => (
              <div key={item.label} className="ws-inset px-2.5 py-2">
                <div className="text-[9px] uppercase tracking-[0.12em] text-[var(--ws-muted)]">{item.label}</div>
                <div className="mt-0.5 font-display text-sm font-semibold tabular-nums text-[var(--ws-text)]">{item.value}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {quickCommands.slice(4).map((cmd) => (
              <button key={cmd.label} type="button" className="ws-chip !cursor-pointer hover:!text-[var(--ws-text)]" onClick={cmd.action}>
                <Plus className="h-2.5 w-2.5" /> {cmd.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="ws-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-[var(--ws-text)]">Recent conversations</h3>
            <button type="button" className="ws-btn ws-btn-ghost !text-[10px]" onClick={() => onNavigate("history")}>
              History
            </button>
          </div>
          {data.conversations.length === 0 ? (
            <p className="py-4 text-center text-[11px] text-[var(--ws-muted)]">No conversations yet.</p>
          ) : (
            <div className="space-y-1.5">
              {data.conversations.slice(0, 4).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onNavigate("ai-workspace")}
                  className="block w-full rounded-lg px-2 py-2 text-left transition-colors hover:bg-[var(--ws-surface-2)]"
                >
                  <div className="truncate text-[11px] font-medium text-[var(--ws-text)]">{c.title}</div>
                  <div className="text-[9.5px] text-[var(--ws-muted)]">
                    {c.model} · {timeAgo(c.updatedAt)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="ws-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-[var(--ws-text)]">Projects</h3>
            <button type="button" className="ws-btn ws-btn-ghost !text-[10px]" onClick={() => onNavigate("projects")}>
              Open
            </button>
          </div>
          {data.projects.length === 0 ? (
            <p className="py-4 text-center text-[11px] text-[var(--ws-muted)]">No projects yet.</p>
          ) : (
            <div className="space-y-2.5">
              {data.projects.slice(0, 3).map((p) => (
                <div key={p.id}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[11px] font-medium text-[var(--ws-text)]">{p.name}</span>
                    <span className="font-mono text-[9.5px] text-[var(--ws-muted)]">{p.progress}%</span>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-[var(--ws-surface-3)]">
                    <div className="h-full rounded-full bg-[linear-gradient(90deg,var(--ws-accent),var(--ws-accent-2))]" style={{ width: `${p.progress}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="ws-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-[var(--ws-text)]">System snapshot</h3>
            <span className="ws-chip">
              <StatusDot state={isOnline ? "ok" : "warn"} /> {isOnline ? "live" : "offline"}
            </span>
          </div>
          <div className="space-y-2.5">
            {[
              { label: "Memory", value: `${ramPct}%`, hint: `${formatBytes(ramUsed)} of ${formatBytes(data.telemetry.totalMemoryBytes)}`, icon: Cpu },
              { label: "Storage", value: `${diskPct}%`, hint: `${formatBytes(diskUsed)} of ${formatBytes(data.telemetry.diskTotalBytes)}`, icon: HardDrive },
              { label: "CPU load", value: data.telemetry.loadAvg1m.toFixed(2), hint: `${data.telemetry.cpuCores} logical cores`, icon: Activity },
            ].map((row) => (
              <div key={row.label} className="flex items-center gap-2.5">
                <row.icon className="h-3.5 w-3.5 shrink-0 text-[var(--ws-muted)]" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-[var(--ws-muted)]">{row.label}</span>
                    <span className="font-mono text-[var(--ws-text)]">{row.value}</span>
                  </div>
                  <div className="text-[9px] text-[var(--ws-muted)]">{row.hint}</div>
                </div>
              </div>
            ))}
          </div>
          <button type="button" className="ws-btn ws-btn-ghost mt-3 w-full !text-[10px]" onClick={() => onNavigate("analytics")}>
            Open AI Analytics <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </div>

      <div className="ws-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-[var(--ws-text)]">Recent AI activity</h3>
          <button type="button" className="ws-btn ws-btn-ghost !text-[10px]" onClick={() => onNavigate("history")}>
            Full log
          </button>
        </div>
        {data.auditLogs.length === 0 ? (
          <p className="py-3 text-center text-[11px] text-[var(--ws-muted)]">No recorded activity yet.</p>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {data.auditLogs.slice(0, 6).map((entry) => (
              <div key={entry.id} className="flex items-start gap-2 rounded-lg px-2 py-1.5">
                <CheckCircle2
                  className="mt-0.5 h-3.5 w-3.5 shrink-0"
                  style={{ color: entry.severity === "security" ? "#E7B75C" : "var(--ws-accent)" }}
                />
                <div className="min-w-0">
                  <div className="truncate text-[10.5px] text-[var(--ws-text)]">{entry.detail}</div>
                  <div className="text-[9px] uppercase tracking-wide text-[var(--ws-muted)]">
                    {entry.eventType} · {timeAgo(entry.createdAt)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
