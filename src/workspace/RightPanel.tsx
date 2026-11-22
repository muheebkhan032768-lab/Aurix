import React, { useMemo } from "react";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  BellRing,
  Bot,
  CheckCircle2,
  ChevronRight,
  Cpu,
  ExternalLink,
  FileText,
  HardDrive,
  ListChecks,
  Mic,
  Plus,
  Sparkles,
  Wifi,
} from "lucide-react";
import type { AiStatusPayload, AuditLogEntry, ReminderItem, SystemTelemetry, TaskItem } from "../types/aurix";
import { QUICK_ACTIONS } from "./nav";
import { formatBytes, StatusDot, timeAgo } from "./ui";

interface RightPanelProps {
  tasks: TaskItem[];
  reminders: ReminderItem[];
  auditLogs: AuditLogEntry[];
  aiStatus: AiStatusPayload | null;
  telemetry: SystemTelemetry;
  isOnline: boolean;
  onNavigate: (id: string) => void;
  onCollapse: () => void;
}

export function RightPanel({ tasks, reminders, auditLogs, aiStatus, telemetry, isOnline, onNavigate, onCollapse }: RightPanelProps) {
  const pending = tasks.filter((t) => t.status === "todo").length;
  const progress = tasks.filter((t) => t.status === "in_progress").length;
  const completed = tasks.filter((t) => t.status === "done").length;
  const total = tasks.length || 1;
  const ramUsed = telemetry.totalMemoryBytes - telemetry.freeMemoryBytes;
  const ramPct = telemetry.totalMemoryBytes ? Math.round((ramUsed / telemetry.totalMemoryBytes) * 100) : 0;
  const diskUsed = telemetry.diskTotalBytes - telemetry.diskFreeBytes;
  const diskPct = telemetry.diskTotalBytes ? Math.round((diskUsed / telemetry.diskTotalBytes) * 100) : 0;

  const dueReminders = useMemo(
    () => reminders.filter((r) => r.status === "pending" && new Date(r.dueAt).getTime() <= Date.now()),
    [reminders]
  );

  return (
    <aside className="ws-right-panel ws-scroll flex h-full w-[292px] shrink-0 flex-col overflow-y-auto border-l border-[var(--ws-border)] bg-[color-mix(in_srgb,var(--ws-surface)_55%,transparent)]">
      <div className="flex items-center justify-between border-b border-[var(--ws-border)] px-3.5 py-2.5">
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--ws-muted)]">Operations</div>
          <div className="text-[11px] font-semibold text-[var(--ws-text)]">Live control rail</div>
        </div>
        <button type="button" className="ws-btn ws-btn-ghost !p-1.5" onClick={onCollapse} aria-label="Collapse right panel">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-3 p-3">
        {dueReminders.length > 0 && (
          <button
            type="button"
            onClick={() => onNavigate("reminders")}
            className="w-full rounded-xl border border-[#E7B75C]/45 bg-[#E7B75C]/10 px-3 py-2 text-left"
          >
            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-[#E7B75C]">
              <BellRing className="h-3.5 w-3.5" /> {dueReminders.length} reminder{dueReminders.length > 1 ? "s" : ""} due
            </div>
            <div className="mt-0.5 truncate text-[10px] text-[var(--ws-muted)]">{dueReminders[0].title}</div>
          </button>
        )}

        <section className="ws-card p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-[10.5px] font-semibold text-[var(--ws-text)]">
              <ListChecks className="h-3.5 w-3.5 text-[var(--ws-accent)]" /> Active tasks
            </h3>
            <button type="button" className="text-[9px] text-[var(--ws-muted)] hover:text-[var(--ws-text)]" onClick={() => onNavigate("tasks")}>View all</button>
          </div>
          <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-[var(--ws-surface-3)]">
            <div className="h-full rounded-full bg-[linear-gradient(90deg,var(--ws-accent),var(--ws-accent-2))]" style={{ width: `${(completed / total) * 100}%` }} />
          </div>
          <div className="mb-2 grid grid-cols-3 gap-1 text-center">
            {[
              { label: "Pending", value: pending, color: "var(--ws-accent-2)" },
              { label: "Active", value: progress, color: "#E7B75C" },
              { label: "Done", value: completed, color: "var(--ws-accent)" },
            ].map((s) => (
              <div key={s.label} className="ws-inset py-1.5">
                <div className="font-display text-[13px] font-semibold tabular-nums" style={{ color: s.color }}>{s.value}</div>
                <div className="text-[8px] uppercase tracking-wide text-[var(--ws-muted)]">{s.label}</div>
              </div>
            ))}
          </div>
          <div className="space-y-1">
            {tasks.filter((t) => t.status !== "done").slice(0, 4).map((task) => (
              <button key={task.id} type="button" onClick={() => onNavigate("tasks")} className="flex w-full items-start gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-[var(--ws-surface-2)]">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: task.priority === "high" ? "#F0729B" : task.priority === "medium" ? "#E7B75C" : "var(--ws-accent)" }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[10px] text-[var(--ws-text)]">{task.title}</span>
                  <span className="block text-[8.5px] uppercase tracking-wide text-[var(--ws-muted)]">{task.status.replace("_", " ")}</span>
                </span>
              </button>
            ))}
            {tasks.filter((t) => t.status !== "done").length === 0 && (
              <p className="py-2 text-center text-[9.5px] text-[var(--ws-muted)]">Nothing pending, Sir.</p>
            )}
          </div>
        </section>

        <section className="ws-card p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-[10.5px] font-semibold text-[var(--ws-text)]">
              <Bot className="h-3.5 w-3.5 text-[var(--ws-accent)]" /> AI activity monitor
            </h3>
            <StatusDot state={aiStatus?.state === "connected" ? "ok" : aiStatus?.state === "degraded" ? "warn" : aiStatus?.state === "not_configured" ? "error" : "idle"} />
          </div>
          <div className="mb-2 rounded-lg bg-[var(--ws-surface-2)] px-2 py-1.5 text-[9.5px]">
            <div className="flex items-center justify-between">
              <span className="text-[var(--ws-muted)]">Model</span>
              <span className="truncate font-mono text-[9px] text-[var(--ws-text)]">{aiStatus?.lastModel || "no request yet"}</span>
            </div>
            <div className="mt-0.5 flex items-center justify-between">
              <span className="text-[var(--ws-muted)]">State</span>
              <span className="font-mono text-[9px] text-[var(--ws-text)]">{aiStatus?.state || "untested"}</span>
            </div>
          </div>
          <div className="space-y-1">
            {auditLogs.slice(0, 4).map((entry) => (
              <div key={entry.id} className="flex items-start gap-1.5">
                <CheckCircle2 className="mt-0.5 h-2.5 w-2.5 shrink-0 text-[var(--ws-accent)]" />
                <div className="min-w-0">
                  <div className="truncate text-[9.5px] text-[var(--ws-text)]">{entry.detail}</div>
                  <div className="text-[8px] uppercase tracking-wide text-[var(--ws-muted)]">{timeAgo(entry.createdAt)}</div>
                </div>
              </div>
            ))}
            {auditLogs.length === 0 && <p className="text-[9.5px] text-[var(--ws-muted)]">No activity yet.</p>}
          </div>
          {aiStatus?.lastError && (
            <div className="mt-2 flex items-start gap-1 rounded-lg border border-[#F0729B]/30 bg-[#F0729B]/8 px-1.5 py-1 text-[8.5px] leading-relaxed text-[#F0729B]">
              <AlertCircle className="mt-0.5 h-2.5 w-2.5 shrink-0" /> <span className="line-clamp-2">{aiStatus.lastError}</span>
            </div>
          )}
        </section>

        <section className="ws-card p-3">
          <h3 className="mb-2 flex items-center gap-1.5 text-[10.5px] font-semibold text-[var(--ws-text)]">
            <Sparkles className="h-3.5 w-3.5 text-[var(--ws-accent)]" /> Quick actions
          </h3>
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { label: "New Chat", icon: Sparkles, action: () => onNavigate("ai-workspace") },
              { label: "Project", icon: Plus, action: () => onNavigate("projects") },
              { label: "Note", icon: FileText, action: () => onNavigate("notes") },
              { label: "Reminder", icon: BellRing, action: () => onNavigate("reminders") },
              { label: "Voice", icon: Mic, action: () => onNavigate("voice") },
            ].map((action) => (
              <button key={action.label} type="button" className="ws-inset flex items-center gap-1.5 px-2 py-1.5 text-[9.5px] text-[var(--ws-muted)] transition-colors hover:text-[var(--ws-text)]" onClick={action.action}>
                <action.icon className="h-3 w-3 text-[var(--ws-accent)]" /> {action.label}
              </button>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1">
            {QUICK_ACTIONS.map((link) => (
              <a
                key={link.label}
                href={link.url}
                target="_blank"
                rel="noreferrer noopener"
                className="flex items-center justify-between gap-1 rounded-lg px-1.5 py-1 text-[9px] text-[var(--ws-muted)] transition-colors hover:bg-[var(--ws-surface-2)] hover:text-[var(--ws-text)]"
                title={link.url}
              >
                <span className="truncate">{link.label}</span>
                <ExternalLink className="h-2.5 w-2.5 shrink-0" />
              </a>
            ))}
          </div>
        </section>

        <section className="ws-card p-3">
          <h3 className="mb-2 flex items-center gap-1.5 text-[10.5px] font-semibold text-[var(--ws-text)]">
            <Activity className="h-3.5 w-3.5 text-[var(--ws-accent)]" /> System overview
          </h3>
          <div className="space-y-2">
            {[
              { label: "CPU load", value: telemetry.loadAvg1m.toFixed(2), hint: `${telemetry.cpuCores} cores`, icon: Cpu, pct: Math.min(100, (telemetry.loadAvg1m / Math.max(1, telemetry.cpuCores)) * 100) },
              { label: "RAM", value: `${ramPct}%`, hint: `${formatBytes(ramUsed)} / ${formatBytes(telemetry.totalMemoryBytes)}`, icon: Cpu, pct: ramPct },
              { label: "Storage", value: `${diskPct}%`, hint: `${formatBytes(diskUsed)} / ${formatBytes(telemetry.diskTotalBytes)}`, icon: HardDrive, pct: diskPct },
            ].map((row) => (
              <div key={row.label}>
                <div className="flex items-center justify-between text-[9.5px]">
                  <span className="flex items-center gap-1 text-[var(--ws-muted)]"><row.icon className="h-2.5 w-2.5" /> {row.label}</span>
                  <span className="font-mono text-[9px] text-[var(--ws-text)]">{row.value}</span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-[var(--ws-surface-3)]">
                  <div className="h-full rounded-full bg-[linear-gradient(90deg,var(--ws-accent),var(--ws-accent-2))]" style={{ width: `${Math.max(2, row.pct)}%` }} />
                </div>
                <div className="mt-0.5 text-[8px] text-[var(--ws-muted)]">{row.hint}</div>
              </div>
            ))}
            <div className="ws-divider" />
            {[
              { label: "Network", value: isOnline ? "Online" : "Offline", ok: isOnline, icon: Wifi },
              { label: "Throughput", value: "Data unavailable", ok: false, icon: Wifi },
              { label: "AI service", value: aiStatus?.state === "connected" ? "Healthy" : aiStatus?.state === "degraded" ? "Degraded" : aiStatus?.configured ? "Untested" : "No key", ok: aiStatus?.state === "connected", icon: Bot },
              { label: "App health", value: telemetry ? "Responsive" : "Unknown", ok: Boolean(telemetry), icon: Activity },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between text-[9px]">
                <span className="flex items-center gap-1 text-[var(--ws-muted)]"><row.icon className="h-2.5 w-2.5" /> {row.label}</span>
                <span className={`inline-flex items-center gap-1 font-mono text-[8.5px] ${row.ok ? "text-[var(--ws-accent)]" : "text-[var(--ws-muted)]"}`}>
                  <StatusDot state={row.ok ? "ok" : row.label === "Throughput" ? "idle" : "warn"} /> {row.value}
                </span>
              </div>
            ))}
          </div>
          <button type="button" className="ws-btn ws-btn-ghost mt-2 w-full !text-[9.5px]" onClick={() => onNavigate("analytics")}>
            Full analytics <ArrowRight className="h-3 w-3" />
          </button>
        </section>
      </div>
    </aside>
  );
}
