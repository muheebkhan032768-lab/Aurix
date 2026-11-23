import React, { useState } from "react";
import {
  Activity,
  BarChart3,
  BellRing,
  Bookmark,
  BookOpen,
  Bot,
  BrainCircuit,
  FileText,
  FolderKanban,
  Hexagon,
  History,
  LayoutDashboard,
  LifeBuoy,
  ListChecks,
  Mic,
  Settings,
  ShieldCheck,
  Sparkles,
  StickyNote,
  X,
} from "lucide-react";
import type { AurixSectionId } from "../../types/aurix";
import { BRAND } from "../../brand";

type IconType = React.ComponentType<{ className?: string }>;

export interface DeskNavEntry {
  key: string;
  id: AurixSectionId;
  label: string;
  icon: IconType;
}

export const NAV_GROUPS: Array<{ title: string; items: DeskNavEntry[] }> = [
  {
    title: "Main",
    items: [
      { key: "command", id: "home", label: "Command Center", icon: LayoutDashboard },
      { key: "workspace", id: "chat", label: "AI Workspace", icon: Sparkles },
      { key: "voice", id: "voice", label: "Voice Intelligence", icon: Mic },
      { key: "neural", id: "system", label: "Neural Activity", icon: Activity },
      { key: "analytics", id: "models", label: "AI Analytics", icon: BarChart3 },
    ],
  },
  {
    title: "Management",
    items: [
      { key: "projects", id: "projects", label: "Projects", icon: FolderKanban },
      { key: "links", id: "links", label: "Link Vault", icon: Bookmark },
      { key: "documents", id: "files", label: "Documents", icon: FileText },
      { key: "notes", id: "productivity", label: "Notes", icon: StickyNote },
      { key: "reminders", id: "productivity", label: "Reminders", icon: BellRing },
      { key: "tasks", id: "productivity", label: "Task Manager", icon: ListChecks },
      { key: "history", id: "memory", label: "History", icon: History },
    ],
  },
  {
    title: "Advanced",
    items: [
      { key: "memory", id: "memory", label: "Memory Center", icon: BrainCircuit },
      { key: "knowledge", id: "research", label: "Knowledge Center", icon: BookOpen },
      { key: "security", id: "security", label: "Security Center", icon: ShieldCheck },
      { key: "automation", id: "automation", label: "Automation Center", icon: Bot },
    ],
  },
];

export const BOTTOM_NAV: DeskNavEntry[] = [
  { key: "settings", id: "settings", label: "Settings", icon: Settings },
  { key: "help", id: "help", label: "Help & Support", icon: LifeBuoy },
];

export const ALL_NAV: DeskNavEntry[] = [...NAV_GROUPS.flatMap((group) => group.items), ...BOTTOM_NAV];

interface DeskMateSidebarProps {
  activeSection: AurixSectionId;
  onNavigate: (section: AurixSectionId) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

function NavRow({
  entry,
  active,
  onClick,
}: {
  entry: DeskNavEntry;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = entry.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`group relative flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[12.5px] transition-colors ${
        active
          ? "bg-[color-mix(in_srgb,var(--d-cyan)_14%,transparent)] font-semibold text-[var(--d-text)]"
          : "text-[var(--d-muted)] hover:bg-[color-mix(in_srgb,var(--d-panel-2)_75%,transparent)] hover:text-[var(--d-text)]"
      }`}
    >
      {active && (
        <span
          className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-r-full bg-[var(--d-cyan)]"
          aria-hidden="true"
        />
      )}
      <Icon className={`h-4 w-4 shrink-0 ${active ? "text-[var(--d-cyan)]" : "text-[var(--d-dim)] group-hover:text-[var(--d-cyan)]"}`} />
      <span className="truncate">{entry.label}</span>
    </button>
  );
}

export function DeskMateSidebar({ activeSection, onNavigate, mobileOpen, onCloseMobile }: DeskMateSidebarProps) {
  const [picked, setPicked] = useState<string | null>(null);

  const activeKey =
    picked && ALL_NAV.some((entry) => entry.key === picked && entry.id === activeSection)
      ? picked
      : ALL_NAV.find((entry) => entry.id === activeSection)?.key;

  const go = (entry: DeskNavEntry) => {
    setPicked(entry.key);
    onNavigate(entry.id);
  };

  const content = (isMobile: boolean) => (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-4 pb-4 pt-5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[color-mix(in_srgb,var(--d-cyan)_35%,transparent)] bg-[color-mix(in_srgb,var(--d-cyan)_12%,transparent)]">
          <Hexagon className="h-4 w-4 text-[var(--d-cyan)]" />
        </span>
        <div className="min-w-0">
          <div className="truncate font-display text-[15px] font-bold tracking-[0.08em] text-[var(--d-text)]">
            {BRAND.name}
          </div>
          <div className="truncate text-[8.5px] font-mono uppercase tracking-[0.18em] text-[var(--d-dim)]">
            Powered by {BRAND.vendor}
          </div>
        </div>
        {isMobile && (
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close navigation"
            className="ml-auto rounded-lg p-1.5 text-[var(--d-dim)] hover:bg-white/5 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-2.5 pb-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.title}>
            <div className="px-3 pb-1.5 text-[8.5px] font-mono uppercase tracking-[0.22em] text-[var(--d-dim)]">
              {group.title}
            </div>
            <div className="space-y-0.5">
              {group.items.map((entry) => (
                <NavRow
                  key={entry.key}
                  entry={entry}
                  active={activeKey === entry.key}
                  onClick={() => {
                    go(entry);
                    if (isMobile) onCloseMobile();
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="space-y-0.5 border-t border-[var(--d-border-soft)] px-2.5 py-3">
        {BOTTOM_NAV.map((entry) => (
          <NavRow
            key={entry.key}
            entry={entry}
            active={activeKey === entry.key}
            onClick={() => {
              go(entry);
              if (isMobile) onCloseMobile();
            }}
          />
        ))}
      </div>

      <div className="mx-3 mb-4 rounded-xl border border-[color-mix(in_srgb,var(--d-blue)_35%,transparent)] bg-[linear-gradient(150deg,color-mix(in_srgb,var(--d-blue)_22%,transparent),color-mix(in_srgb,var(--d-panel)_92%,transparent))] px-3 py-2.5">
        <div className="text-[10.5px] font-semibold tracking-[0.06em] text-[var(--d-text)]">
          {BRAND.upper} {BRAND.version}
        </div>
        <div className="mt-0.5 text-[9px] text-[var(--d-muted)]">{BRAND.tagline}</div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-[236px] shrink-0 border-r border-[var(--d-border-soft)] bg-[var(--d-sidebar)] md:block">
        {content(false)}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="h-full w-[262px] bg-[var(--d-sidebar)] border-r border-[var(--d-border)]">{content(true)}</div>
          <button type="button" aria-label="Close navigation" onClick={onCloseMobile} className="flex-1 bg-black/60" />
        </div>
      )}
    </>
  );
}
