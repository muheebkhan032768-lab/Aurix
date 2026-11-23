import React from "react";
import { Bot, Facebook, Github, Linkedin, Mail, MessageCircle, Search, Youtube } from "lucide-react";
import type { AurixSectionId, SystemTelemetry, TaskItem } from "../../types/aurix";

interface DeskMateRightRailProps {
  tasks: TaskItem[];
  activity: Array<{ id: string; label: string; at: string }>;
  telemetry: SystemTelemetry;
  isOnline: boolean;
  onNavigate: (section: AurixSectionId) => void;
}

const QUICK_LINKS: Array<{ label: string; url: string; icon: React.ComponentType<{ className?: string }>; tone: string }> = [
  { label: "YouTube", url: "https://www.youtube.com", icon: Youtube, tone: "#ff4d4d" },
  { label: "Google", url: "https://www.google.com", icon: Search, tone: "#4d9bff" },
  { label: "Gmail", url: "https://mail.google.com", icon: Mail, tone: "#ff6b6b" },
  { label: "WhatsApp", url: "https://web.whatsapp.com", icon: MessageCircle, tone: "#3ddc84" },
  { label: "ChatGPT", url: "https://chat.openai.com", icon: Bot, tone: "#00e5f5" },
  { label: "GitHub", url: "https://github.com", icon: Github, tone: "#d7e3ec" },
  { label: "Facebook", url: "https://www.facebook.com", icon: Facebook, tone: "#4d8bff" },
  { label: "LinkedIn", url: "https://www.linkedin.com", icon: Linkedin, tone: "#3fa9f5" },
];

function taskProgress(task: TaskItem): number {
  if (task.status === "done") return 100;
  if (task.status === "in_progress") return 62;
  return 18;
}

function Ring({ value, label, tone }: { value: number; label: string; tone: string }) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative h-[52px] w-[52px]">
        <svg viewBox="0 0 44 44" className="h-full w-full -rotate-90">
          <circle cx="22" cy="22" r={radius} fill="none" stroke="color-mix(in srgb, var(--d-border) 80%, transparent)" strokeWidth="3" />
          <circle
            cx="22"
            cy="22"
            r={radius}
            fill="none"
            stroke={tone}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${(clamped / 100) * circumference} ${circumference}`}
          />
        </svg>
        <span className="absolute inset-0 grid place-items-center text-[10.5px] font-semibold text-[var(--d-text)]">
          {clamped}%
        </span>
      </div>
      <span className="text-[9.5px] uppercase tracking-[0.12em] text-[var(--d-dim)]">{label}</span>
    </div>
  );
}

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="aurix-panel min-w-0 overflow-hidden rounded-2xl p-3.5">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold tracking-[0.1em] text-[var(--d-text)]">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function DeskMateRightRail({ tasks, activity, telemetry, isOnline, onNavigate }: DeskMateRightRailProps) {
  const openTasks = tasks.filter((task) => task.status !== "done").slice(0, 3);

  const totalMem = telemetry.totalMemoryBytes || 1;
  const ramPct = ((totalMem - telemetry.freeMemoryBytes) / totalMem) * 100;
  const cpuPct = Math.min(100, (telemetry.loadAvg1m / Math.max(1, telemetry.cpuCores)) * 100);
  const diskTotal = telemetry.diskTotalBytes || 1;
  const storagePct = ((diskTotal - telemetry.diskFreeBytes) / diskTotal) * 100;

  return (
    <div className="grid min-w-0 content-start gap-3">
      <Panel
        title="Active Tasks"
        action={
          <button type="button" onClick={() => onNavigate("productivity")} className="text-[10px] text-[var(--d-cyan)] hover:underline">
            View all
          </button>
        }
      >
        <div className="space-y-3">
          {openTasks.map((task) => {
            const pct = taskProgress(task);
            return (
              <div key={task.id}>
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-[11.5px] text-[var(--d-muted)]">{task.title}</span>
                  <span className="shrink-0 text-[10px] font-semibold text-[var(--d-text)]">
                    {task.status === "todo" ? "Pending" : `${pct}%`}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--d-border)_70%,transparent)]">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,var(--d-blue),var(--d-cyan))]"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
          {openTasks.length === 0 && <p className="text-[11px] text-[var(--d-dim)]">All tasks complete.</p>}
        </div>
      </Panel>

      <Panel
        title="AI Activity"
        action={
          <span className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--d-teal)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--d-teal)] animate-pulse" />
            Live
          </span>
        }
      >
        <ul className="space-y-2">
          {activity.slice(0, 4).map((entry) => (
            <li key={entry.id} className="flex items-start gap-2">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--d-cyan)]/70" aria-hidden="true" />
              <div className="min-w-0">
                <p className="truncate text-[11px] text-[var(--d-muted)]">{entry.label}</p>
                <p className="text-[9px] text-[var(--d-dim)]">
                  {new Date(entry.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </li>
          ))}
          {activity.length === 0 && <li className="text-[11px] text-[var(--d-dim)]">Nothing logged yet.</li>}
        </ul>
      </Panel>

      <Panel title="Quick Actions">
        <div className="grid grid-cols-4 gap-2">
          {QUICK_LINKS.map((link) => {
            const Icon = link.icon;
            return (
              <button
                key={link.label}
                type="button"
                onClick={() => window.open(link.url, "_blank", "noopener,noreferrer")}
                title={`Open ${link.label}`}
                aria-label={`Open ${link.label}`}
                className="aurix-link-icon mx-auto"
                style={{ color: link.tone }}
              >
                <Icon className="h-4 w-4" />
              </button>
            );
          })}
        </div>
      </Panel>

      <Panel title="System Overview">
        <div className="grid grid-cols-3 gap-2">
          <Ring value={ramPct} label="RAM" tone="var(--d-cyan)" />
          <Ring value={cpuPct} label="CPU" tone="var(--d-blue)" />
          <Ring value={storagePct} label="Storage" tone="var(--d-teal)" />
        </div>
        <div className="mt-3 flex items-center justify-between rounded-xl border border-[var(--d-border-soft)] bg-[var(--d-panel-2)] px-3 py-2">
          <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--d-dim)]">Network</span>
          <span
            className={`inline-flex items-center gap-1.5 text-[10.5px] font-semibold ${
              isOnline ? "text-[var(--d-teal)]" : "text-amber-300"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${isOnline ? "bg-[var(--d-teal)]" : "bg-amber-300"}`} />
            {isOnline ? "Healthy" : "Offline"}
          </span>
        </div>
      </Panel>
    </div>
  );
}
