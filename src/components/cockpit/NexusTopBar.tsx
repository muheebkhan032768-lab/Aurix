import React, { useEffect, useState } from "react";
import { Bell, Cpu, Menu, OctagonAlert, Settings, Wifi, WifiOff } from "lucide-react";
import { AurixLogo } from "../AurixLogo";
import type { AppSettings, AurixSectionId, OwnerProfile, TaskItem } from "../../types/aurix";

interface NexusTopBarProps {
  owner: OwnerProfile;
  settings: AppSettings;
  isOnline: boolean;
  tasks: TaskItem[];
  activity: Array<{ id: string; label: string; at: string }>;
  emergencyStopActive: boolean;
  onToggleEmergencyStop: (active: boolean) => void;
  onNavigate: (section: AurixSectionId) => void;
  onOpenMobileNav: () => void;
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

export function NexusTopBar({
  owner,
  settings,
  isOnline,
  tasks,
  activity,
  emergencyStopActive,
  onToggleEmergencyStop,
  onNavigate,
  onOpenMobileNav,
}: NexusTopBarProps) {
  const now = useClock();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const openTasks = tasks.filter((t) => t.status !== "done");
  const notificationCount = openTasks.length;

  return (
    <header className="sticky top-0 z-30 border-b border-[#00D9FF]/10 bg-[#05080D]/85 backdrop-blur-xl">
      <div className="flex h-16 items-center gap-3 px-3 sm:px-5">
        <button
          type="button"
          onClick={onOpenMobileNav}
          aria-label="Open navigation"
          className="md:hidden rounded-lg border border-[#00D9FF]/20 p-2 text-[#A9C8D5] cursor-pointer"
        >
          <Menu className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2.5 min-w-0">
          <AurixLogo className="w-8 h-8 text-[#00D9FF] shrink-0" />
          <div className="min-w-0">
            <div className="font-display text-sm font-bold tracking-[0.14em] text-white whitespace-nowrap">
              DEX MADE 2.0
            </div>
            <div className="hidden sm:block text-[9px] font-mono uppercase tracking-[0.24em] text-[#00D9FF]/70 whitespace-nowrap">
              Nexus Cockpit · AM VEYRONIX
            </div>
          </div>
        </div>

        <div className="ml-2 hidden lg:flex items-center gap-3 border-l border-[#00D9FF]/10 pl-4">
          <span
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.14em] ${
              isOnline
                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                : "border-amber-400/30 bg-amber-400/10 text-amber-300"
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? "bg-emerald-400" : "bg-amber-400"} animate-pulse`} />
            {isOnline ? "System online" : "Offline mode"}
          </span>
          <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-[#5B7185]">
            {now.toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <div className="text-right">
            <div className="font-mono text-sm font-semibold tabular-nums text-white leading-none">
              {now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </div>
            <div className="mt-1 hidden sm:flex items-center justify-end gap-1 text-[9px] font-mono uppercase tracking-[0.12em] text-[#5B7185]">
              {isOnline ? <Wifi className="w-2.5 h-2.5" /> : <WifiOff className="w-2.5 h-2.5" />}
              {isOnline ? "Network" : "No network"}
            </div>
          </div>

          <div className="hidden xl:flex items-center gap-1.5 rounded-lg border border-[#00D9FF]/15 px-2.5 py-1.5">
            <Cpu className="w-3 h-3 text-[#00D9FF]" />
            <span className="text-[10px] font-mono text-[#A9C8D5]">
              {settings.offlineModeForced ? "local-only" : settings.activeModel}
            </span>
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setNotificationsOpen((v) => !v)}
              className="relative rounded-lg border border-[#00D9FF]/15 p-2 text-[#A9C8D5] hover:border-[#00D9FF]/45 cursor-pointer"
              aria-label="Notifications"
            >
              <Bell className="w-4 h-4" />
              {notificationCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#00D9FF] px-1 text-[9px] font-bold text-[#05080D]">
                  {notificationCount}
                </span>
              )}
            </button>
            {notificationsOpen && (
              <div className="absolute right-0 mt-2 w-72 nexus-panel rounded-xl p-3 z-40">
                <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-[#5B7185]">Open tasks</div>
                <div className="mt-2 space-y-1.5">
                  {openTasks.slice(0, 4).map((task) => (
                    <div key={task.id} className="rounded-lg bg-white/5 px-2.5 py-1.5">
                      <div className="truncate text-[11px] text-white">{task.title}</div>
                      <div className="text-[9px] font-mono uppercase tracking-[0.1em] text-[#5B7185]">
                        {task.priority} · {task.status.replace("_", " ")}
                      </div>
                    </div>
                  ))}
                  {openTasks.length === 0 && (
                    <div className="text-[11px] text-[#5B7185]">No open tasks.</div>
                  )}
                </div>
                <div className="mt-3 text-[10px] font-mono uppercase tracking-[0.18em] text-[#5B7185]">Recent activity</div>
                <div className="mt-2 space-y-1">
                  {activity.slice(0, 3).map((entry) => (
                    <div key={entry.id} className="truncate text-[10px] text-[#94A8B8]">
                      {entry.label}
                    </div>
                  ))}
                  {activity.length === 0 && <div className="text-[11px] text-[#5B7185]">Nothing logged yet.</div>}
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => onToggleEmergencyStop(!emergencyStopActive)}
            title="Emergency stop — halts desktop automation and proactive voice"
            className={`hidden sm:inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] cursor-pointer ${
              emergencyStopActive
                ? "border-rose-400 bg-rose-500 text-white"
                : "border-rose-400/40 text-rose-300 hover:bg-rose-500/10"
            }`}
          >
            <OctagonAlert className="w-3.5 h-3.5" />
            {emergencyStopActive ? "Stopped" : "Stop"}
          </button>

          <button
            type="button"
            onClick={() => onNavigate("settings")}
            aria-label="Settings"
            className="rounded-lg border border-[#00D9FF]/15 p-2 text-[#A9C8D5] hover:border-[#00D9FF]/45 cursor-pointer"
          >
            <Settings className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => onNavigate("settings")}
            className="flex items-center gap-2 rounded-full border border-[#00D9FF]/15 py-1 pl-1 pr-2.5 hover:border-[#00D9FF]/45 cursor-pointer"
            title={`${owner.name} — profile & settings`}
          >
            <img
              src="/src/assets/images/avatar_abdul_muheeb_1795088206648.jpg"
              alt={owner.name}
              referrerPolicy="no-referrer"
              className="h-6 w-6 rounded-full object-cover"
            />
            <span className="hidden sm:inline text-[11px] text-[#A9C8D5] whitespace-nowrap">{owner.name}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
