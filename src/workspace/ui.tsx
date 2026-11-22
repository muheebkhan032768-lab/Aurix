import React from "react";
import { AlertTriangle, X } from "lucide-react";

export function SectionHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--ws-muted)]">
            {eyebrow}
          </div>
        )}
        <h1 className="font-display text-xl font-semibold tracking-tight text-[var(--ws-text)] sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[var(--ws-muted)]">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "accent",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: React.ReactNode;
  tone?: "accent" | "cyan" | "muted";
}) {
  const color = tone === "cyan" ? "var(--ws-accent-2)" : tone === "muted" ? "var(--ws-muted)" : "var(--ws-accent)";
  return (
    <div className="ws-card relative overflow-hidden p-4">
      <div
        className="pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full opacity-20 blur-2xl"
        style={{ background: color }}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ws-muted)]">{label}</span>
        {icon && (
          <span className="rounded-lg p-1.5" style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}>
            {icon}
          </span>
        )}
      </div>
      <div className="mt-2 font-display text-2xl font-semibold tabular-nums text-[var(--ws-text)]">{value}</div>
      {hint && <div className="mt-1 text-[11px] text-[var(--ws-muted)]">{hint}</div>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--ws-border-strong)] px-6 py-10 text-center">
      {icon && <div className="mb-1 text-[var(--ws-accent)] opacity-80">{icon}</div>}
      <div className="text-sm font-semibold text-[var(--ws-text)]">{title}</div>
      {description && <p className="max-w-sm text-xs leading-relaxed text-[var(--ws-muted)]">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function StatusDot({ state }: { state: "ok" | "warn" | "error" | "idle" }) {
  const color =
    state === "ok"
      ? "var(--ws-accent)"
      : state === "warn"
        ? "#E7B75C"
        : state === "error"
          ? "#F0729B"
          : "var(--ws-muted)";
  return (
    <span className="relative inline-flex h-2 w-2 shrink-0">
      <span className="absolute inset-0 rounded-full" style={{ background: color, opacity: 0.35 }} />
      <span className="relative m-auto h-1.5 w-1.5 rounded-full" style={{ background: color }} />
    </span>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  tone = "danger",
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  tone?: "danger" | "primary";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={title}>
      <div className="ws-card w-full max-w-sm p-5">
        <div className="flex items-start gap-3">
          <span
            className="rounded-xl p-2"
            style={{
              background: tone === "danger" ? "rgba(240,114,155,0.14)" : "color-mix(in srgb, var(--ws-accent) 14%, transparent)",
              color: tone === "danger" ? "#F0729B" : "var(--ws-accent)",
            }}
          >
            <AlertTriangle className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-[var(--ws-text)]">{title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-[var(--ws-muted)]">{message}</p>
          </div>
          <button type="button" onClick={onCancel} className="ws-btn ws-btn-ghost !p-1.5" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="ws-btn" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className={`ws-btn ${tone === "danger" ? "!border-[#F0729B]/50 !bg-[#F0729B]/15 !text-[#F0729B]" : "ws-btn-primary"}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Working..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function InlineError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#F0729B]/35 bg-[#F0729B]/10 px-3 py-2 text-[11px] text-[#F0729B]">
      <span className="min-w-0 flex-1">{message}</span>
      {onRetry && (
        <button type="button" className="ws-btn !py-1 !text-[10px]" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function timeAgo(iso: string): string {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return "Unknown";
  const diff = Date.now() - time;
  if (diff < 45_000) return "just now";
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return `${Math.round(diff / 86_400_000)}d ago`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}
