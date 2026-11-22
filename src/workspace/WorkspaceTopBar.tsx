import React, { useMemo, useState } from "react";
import {
  Bell,
  ChevronDown,
  Command,
  Lock,
  Menu,
  Moon,
  PanelRight,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  User,
} from "lucide-react";
import type { AiStatusPayload, AppSettings, AuditLogEntry, SystemTelemetry } from "../types/aurix";
import { StatusDot, timeAgo } from "./ui";

interface WorkspaceTopBarProps {
  title: string;
  settings: AppSettings;
  aiStatus: AiStatusPayload | null;
  isOnline: boolean;
  telemetry: SystemTelemetry;
  notifications: AuditLogEntry[];
  ownerName: string;
  rightOpen: boolean;
  onToggleRightPanel: () => void;
  onOpenMobileNav: () => void;
  onOpenSearch: () => void;
  onNavigate: (id: string) => void;
  onToggleTheme: () => void;
  onUpdateSettings: (settings: AppSettings) => Promise<void>;
  onLock: () => void;
}

export function WorkspaceTopBar({
  title,
  settings,
  aiStatus,
  isOnline,
  telemetry,
  notifications,
  ownerName,
  rightOpen,
  onToggleRightPanel,
  onOpenMobileNav,
  onOpenSearch,
  onNavigate,
  onToggleTheme,
  onUpdateSettings,
  onLock,
}: WorkspaceTopBarProps) {
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [readIds, setReadIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("aurix_read_notifications") || "[]") as string[];
    } catch {
      return [];
    }
  });

  const unread = useMemo(() => notifications.filter((n) => !readIds.includes(n.id)).length, [notifications, readIds]);

  const markAllRead = () => {
    const ids = notifications.map((n) => n.id);
    setReadIds(ids);
    try {
      localStorage.setItem("aurix_read_notifications", JSON.stringify(ids.slice(0, 120)));
    } catch {
      /* storage unavailable */
    }
  };

  const aiLabel =
    aiStatus?.state === "connected"
      ? "AI connected"
      : aiStatus?.state === "degraded"
        ? "AI fallback"
        : aiStatus?.state === "not_configured"
          ? "AI key missing"
          : "AI untested";
  const aiDot = aiStatus?.state === "connected" ? "ok" : aiStatus?.state === "degraded" ? "warn" : aiStatus?.state === "not_configured" ? "error" : "idle";
  const load = telemetry.loadAvg1m;
  const systemState = !isOnline ? "error" : load > telemetry.cpuCores * 0.9 ? "warn" : "ok";
  const initials = ownerName
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "AM";

  return (
    <header className="relative z-30 flex h-14 shrink-0 items-center gap-2 border-b border-[var(--ws-border)] bg-[color-mix(in_srgb,var(--ws-bg)_82%,transparent)] px-3 backdrop-blur-xl sm:px-4">
      <button type="button" className="ws-btn ws-btn-ghost !p-2 lg:hidden" onClick={onOpenMobileNav} aria-label="Open navigation">
        <Menu className="h-4 w-4" />
      </button>

      <div className="hidden min-w-0 items-center gap-2 sm:flex">
        <span className="font-display text-[11px] font-bold tracking-[0.2em] text-[var(--ws-text)]">AURIX</span>
        <span className="h-3.5 w-px bg-[var(--ws-border-strong)]" />
        <h1 className="truncate text-[12px] font-semibold text-[var(--ws-text)]">{title}</h1>
      </div>

      <button
        type="button"
        onClick={onOpenSearch}
        className="ws-inset ml-auto flex h-8 items-center gap-2 px-2.5 text-[10.5px] text-[var(--ws-muted)] transition-colors hover:text-[var(--ws-text)] sm:ml-4 sm:w-56"
        aria-label="Quick search"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="hidden flex-1 text-left sm:block">Search modules, chats, notes…</span>
        <span className="hidden items-center gap-0.5 rounded border border-[var(--ws-border)] px-1 py-0.5 font-mono text-[8px] sm:flex">
          <Command className="h-2.5 w-2.5" />K
        </span>
      </button>

      <div className="hidden items-center gap-1.5 xl:flex">
        <button type="button" className="ws-chip !cursor-pointer hover:!text-[var(--ws-text)]" onClick={() => onNavigate("integrations")} title={aiStatus?.lastError || "AI connection status"}>
          <StatusDot state={aiDot} /> {aiLabel}
        </button>
        <span className="ws-chip" title={`${telemetry.hostname} · ${telemetry.platform}`}>
          <StatusDot state={systemState} /> {isOnline ? `load ${load.toFixed(2)}` : "offline"}
        </span>
      </div>

      <label className="relative hidden md:block">
        <select
          value={settings.activeModel}
          onChange={(e) => void onUpdateSettings({ ...settings, activeModel: e.target.value as AppSettings["activeModel"] })}
          className="ws-input !h-8 !w-[168px] !py-0 !pl-2 !pr-7 !text-[10.5px]"
          aria-label="AI model"
        >
          <option value="gemini-4-hydrogen">Gemini 4 Hydrogen</option>
          <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite</option>
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--ws-muted)]" />
      </label>

      <div className="flex items-center gap-0.5">
        <button type="button" className="ws-btn ws-btn-ghost !p-2" onClick={onOpenSearch} aria-label="Quick search">
          <Search className="h-4 w-4 sm:hidden" />
        </button>
        <button type="button" className="ws-btn ws-btn-ghost !p-2" onClick={onToggleTheme} aria-label={settings.theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} title={settings.theme === "dark" ? "Light mode" : "Dark mode"}>
          {settings.theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <button type="button" className="ws-btn ws-btn-ghost !p-2" onClick={() => onNavigate("settings")} aria-label="Open settings">
          <Settings className="h-4 w-4" />
        </button>

        <div className="relative">
          <button
            type="button"
            className="ws-btn ws-btn-ghost relative !p-2"
            onClick={() => {
              setNotificationsOpen((v) => !v);
              setProfileOpen(false);
            }}
            aria-label="Notification center"
          >
            <Bell className="h-4 w-4" />
            {unread > 0 && (
              <span className="absolute right-1 top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[var(--ws-accent)] px-0.5 text-[8px] font-bold text-[var(--ws-accent-ink)]">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>
          {notificationsOpen && (
            <>
              <button type="button" className="fixed inset-0 z-40 cursor-default" onClick={() => setNotificationsOpen(false)} aria-label="Close notifications" />
              <div className="ws-card absolute right-0 top-10 z-50 w-[320px] p-3">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-[11px] font-semibold text-[var(--ws-text)]">Notifications</h3>
                  <button type="button" className="ws-btn ws-btn-ghost !text-[9.5px]" onClick={markAllRead}>Mark all read</button>
                </div>
                <div className="ws-scroll max-h-72 space-y-1 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <p className="py-4 text-center text-[10.5px] text-[var(--ws-muted)]">No notifications yet.</p>
                  ) : (
                    notifications.slice(0, 12).map((n) => (
                      <div key={n.id} className={`rounded-lg px-2 py-1.5 ${readIds.includes(n.id) ? "opacity-60" : "bg-[var(--ws-surface-2)]"}`}>
                        <div className="text-[10.5px] text-[var(--ws-text)]">{n.detail}</div>
                        <div className="text-[9px] uppercase tracking-wide text-[var(--ws-muted)]">{n.eventType} · {timeAgo(n.createdAt)}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <button type="button" className={`ws-btn ws-btn-ghost !p-2 ${rightOpen ? "!text-[var(--ws-accent)]" : ""}`} onClick={onToggleRightPanel} aria-label="Toggle right panel" title="Toggle right panel">
          <PanelRight className="h-4 w-4" />
        </button>

        <div className="relative ml-0.5">
          <button
            type="button"
            className="flex h-8 items-center gap-1.5 rounded-full border border-[var(--ws-border)] pl-0.5 pr-1.5"
            onClick={() => {
              setProfileOpen((v) => !v);
              setNotificationsOpen(false);
            }}
            aria-label="User profile menu"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--ws-accent),var(--ws-accent-2))] text-[9.5px] font-bold text-[var(--ws-accent-ink)]">
              {initials}
            </span>
            <ChevronDown className="h-3 w-3 text-[var(--ws-muted)]" />
          </button>
          {profileOpen && (
            <>
              <button type="button" className="fixed inset-0 z-40 cursor-default" onClick={() => setProfileOpen(false)} aria-label="Close profile menu" />
              <div className="ws-card absolute right-0 top-10 z-50 w-56 p-2">
                <div className="border-b border-[var(--ws-border)] px-2 pb-2">
                  <div className="truncate text-[11px] font-semibold text-[var(--ws-text)]">{ownerName}</div>
                  <div className="text-[9.5px] text-[var(--ws-muted)]">Owner · AURIX workspace</div>
                </div>
                <div className="mt-1 space-y-0.5">
                  {[
                    { label: "Profile & preferences", icon: User, action: () => onNavigate("settings") },
                    { label: "Security center", icon: ShieldCheck, action: () => onNavigate("security") },
                    { label: "Lock session", icon: Lock, action: onLock },
                  ].map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[10.5px] text-[var(--ws-muted)] hover:bg-[var(--ws-surface-2)] hover:text-[var(--ws-text)]"
                      onClick={() => {
                        setProfileOpen(false);
                        item.action();
                      }}
                    >
                      <item.icon className="h-3.5 w-3.5" /> {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
