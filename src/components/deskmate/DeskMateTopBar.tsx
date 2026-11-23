import React, { useEffect, useRef, useState } from "react";
import { Bell, ChevronDown, Menu, Moon, Search, Sun } from "lucide-react";
import type { AppSettings, AurixSectionId, OwnerProfile, TaskItem } from "../../types/aurix";
import { ALL_NAV } from "./DeskMateSidebar";

const MODEL_LABELS: Record<string, string> = {
  "gemini-4-hydrogen": "Gemini 4 Hydrogen",
  "gemini-3.1-flash-lite": "Gemini 3.1 Flash Lite",
};

interface DeskMateTopBarProps {
  owner: OwnerProfile;
  settings: AppSettings;
  isOnline: boolean;
  tasks: TaskItem[];
  theme: "dark" | "light";
  onToggleTheme: () => void;
  onNavigate: (section: AurixSectionId) => void;
  onUpdateSettings: (next: AppSettings) => Promise<void>;
  onOpenMobileNav: () => void;
}

export function DeskMateTopBar({
  owner,
  settings,
  isOnline,
  tasks,
  theme,
  onToggleTheme,
  onNavigate,
  onUpdateSettings,
  onOpenMobileNav,
}: DeskMateTopBarProps) {
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
        setSearchOpen(true);
      }
      if (event.key === "Escape") setSearchOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const openTasks = tasks.filter((task) => task.status !== "done");
  const results = query.trim()
    ? ALL_NAV.filter((entry) => entry.label.toLowerCase().includes(query.trim().toLowerCase()))
    : [];

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--d-border-soft)] bg-[color-mix(in_srgb,var(--d-bg)_88%,transparent)] backdrop-blur-xl">
      <div className="flex h-16 items-center gap-3 px-3 sm:px-5">
        <button
          type="button"
          onClick={onOpenMobileNav}
          aria-label="Open navigation"
          className="rounded-lg border border-[var(--d-border)] p-2 text-[var(--d-muted)] md:hidden"
        >
          <Menu className="h-4 w-4" />
        </button>

        <div className="relative min-w-0 flex-1 max-w-[300px]">
          <div className="flex items-center gap-2 rounded-full border border-[var(--d-border)] bg-[color-mix(in_srgb,var(--d-panel)_85%,transparent)] px-3.5 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-[var(--d-dim)]" />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => window.setTimeout(() => setSearchOpen(false), 150)}
              placeholder="Search anything..."
              aria-label="Search modules"
              className="w-full min-w-0 bg-transparent text-[12px] text-[var(--d-text)] placeholder:text-[var(--d-dim)] outline-none"
            />
            <span className="hidden shrink-0 rounded border border-[var(--d-border)] px-1.5 py-0.5 text-[9px] font-mono text-[var(--d-dim)] sm:inline">
              Ctrl + K
            </span>
          </div>
          {searchOpen && results.length > 0 && (
            <div className="absolute left-0 right-0 top-[calc(100%+6px)] overflow-hidden rounded-xl border border-[var(--d-border)] bg-[var(--d-panel)] shadow-2xl">
              {results.map((entry) => {
                const Icon = entry.icon;
                return (
                  <button
                    key={entry.key}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      onNavigate(entry.id);
                      setQuery("");
                      setSearchOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] text-[var(--d-muted)] hover:bg-[var(--d-panel-2)] hover:text-[var(--d-text)]"
                  >
                    <Icon className="h-3.5 w-3.5 text-[var(--d-cyan)]" />
                    {entry.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-2.5">
          <label className="relative hidden items-center gap-1.5 rounded-lg border border-[var(--d-border)] bg-[color-mix(in_srgb,var(--d-panel)_85%,transparent)] px-2.5 py-1.5 sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--d-teal)]" aria-hidden="true" />
            <select
              value={settings.activeModel}
              onChange={(event) =>
                void onUpdateSettings({ ...settings, activeModel: event.target.value as AppSettings["activeModel"] })
              }
              aria-label="AI model"
              className="appearance-none bg-transparent pr-4 text-[11.5px] font-medium text-[var(--d-text)] outline-none"
            >
              {Object.entries(MODEL_LABELS).map(([value, label]) => (
                <option key={value} value={value} className="bg-[var(--d-panel)]">
                  {label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 h-3 w-3 text-[var(--d-dim)]" />
          </label>

          <span
            className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-medium lg:flex ${
              isOnline
                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-800 dark:text-emerald-300"
                : "border-amber-400/30 bg-amber-400/10 text-amber-700 dark:text-amber-300"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${isOnline ? "bg-emerald-400" : "bg-amber-400"} animate-pulse`} />
            {isOnline ? "Connected Online" : "Local Only"}
          </span>

          <div className="relative">
            <button
              type="button"
              onClick={() => setBellOpen((open) => !open)}
              aria-label="Notifications"
              className="relative rounded-lg border border-[var(--d-border)] p-2 text-[var(--d-muted)] hover:text-[var(--d-text)]"
            >
              <Bell className="h-4 w-4" />
              {openTasks.length > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--d-cyan)] px-1 text-[9px] font-bold text-[var(--d-bg)]">
                  {openTasks.length}
                </span>
              )}
            </button>
            {bellOpen && (
              <div className="absolute right-0 top-[calc(100%+8px)] z-40 w-72 rounded-xl border border-[var(--d-border)] bg-[var(--d-panel)] p-3 shadow-2xl">
                <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-[var(--d-dim)]">Open tasks</div>
                <div className="mt-2 space-y-1.5">
                  {openTasks.slice(0, 4).map((task) => (
                    <div key={task.id} className="rounded-lg bg-[var(--d-panel-2)] px-2.5 py-1.5">
                      <div className="truncate text-[11.5px] text-[var(--d-text)]">{task.title}</div>
                      <div className="text-[9px] uppercase tracking-[0.1em] text-[var(--d-dim)]">
                        {task.priority} · {task.status.replace("_", " ")}
                      </div>
                    </div>
                  ))}
                  {openTasks.length === 0 && <div className="text-[11px] text-[var(--d-dim)]">No open tasks.</div>}
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label="Toggle theme"
            className="rounded-lg border border-[var(--d-border)] p-2 text-[var(--d-muted)] hover:text-[var(--d-text)]"
          >
            {theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </button>

          <button
            type="button"
            onClick={() => onNavigate("settings")}
            className="flex items-center gap-2 rounded-full border border-[var(--d-border)] py-1 pl-1 pr-2.5 hover:border-[color-mix(in_srgb,var(--d-cyan)_45%,transparent)]"
            title={owner.name}
          >
            <img
              src="/src/assets/images/avatar_abdul_muheeb_1795088206648.jpg"
              alt={owner.name}
              referrerPolicy="no-referrer"
              className="h-6 w-6 rounded-full object-cover"
            />
            <span className="hidden text-[11.5px] font-medium text-[var(--d-text)] sm:inline">Sir</span>
          </button>
        </div>
      </div>
    </header>
  );
}
