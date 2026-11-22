import React from "react";
import {
  ArrowUpRight,
  BrainCircuit,
  CheckSquare,
  Code2,
  FolderKanban,
  Globe2,
  LayoutDashboard,
  PanelsTopLeft,
  StickyNote,
} from "lucide-react";
import type {
  AurixSectionId,
  MemoryItem,
  NoteItem,
  ProjectRecord,
  TaskItem,
  WebsiteRecord,
} from "../../types/aurix";
import { WEBSITE_REGISTRY, openInNewTab } from "../../utils/websiteRegistry";

export interface DeckCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  active?: boolean;
  onClick?: () => void;
  children?: React.ReactNode;
}

/** One compact rectangular card used by both dashboard rails. */
export function DeckCard({ icon, label, value, hint, active = false, onClick, children }: DeckCardProps) {
  return (
    <div
      className={`nexus-panel-soft rounded-xl px-3 py-2.5 transition-colors ${
        active ? "border-[#00D9FF]/40 bg-[#00D9FF]/8" : ""
      } ${onClick ? "cursor-pointer hover:border-[#00D9FF]/35" : ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-[#00D9FF]">
          {icon}
          <span className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-[#A9C8D5]">
            {label}
          </span>
        </span>
        {onClick && <ArrowUpRight className="h-3 w-3 shrink-0 text-[#3F5567]" />}
      </div>
      <p className="mt-1 truncate font-display text-sm font-semibold text-white">{value}</p>
      <p className="truncate text-[9px] font-mono uppercase tracking-[0.12em] text-[#5B7185]">{hint}</p>
      {children}
    </div>
  );
}

interface DashboardRailProps {
  activeSection: AurixSectionId;
  onNavigate: (section: AurixSectionId) => void;
  memories: MemoryItem[];
  projects: ProjectRecord[];
  tasks: TaskItem[];
  notes: NoteItem[];
  websites: WebsiteRecord[];
}

const QUICK_SITES = ["chatgpt", "github", "youtube"]
  .map((id) => WEBSITE_REGISTRY.find((entry) => entry.id === id && entry.url))
  .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

/** Left rail: dashboard, workspace and personal-data navigation cards. */
export function DashboardRail({
  activeSection,
  onNavigate,
  memories,
  projects,
  tasks,
  notes,
  websites,
}: DashboardRailProps) {
  const openTasks = tasks.filter((task) => task.status !== "done");
  const activeProjects = projects.filter((project) => project.status === "active");
  const nextTask = openTasks[0]?.title ?? "Queue clear";

  return (
    <div className="grid grid-cols-1 content-start gap-2.5" aria-label="Dashboard navigation">
      <DeckCard
        icon={<LayoutDashboard className="h-3.5 w-3.5" />}
        label="Dashboard"
        value="Nexus core"
        hint="Command centre"
        active={activeSection === "home"}
        onClick={() => onNavigate("home")}
      />
      <DeckCard
        icon={<PanelsTopLeft className="h-3.5 w-3.5" />}
        label="Workspace"
        value="Live deck"
        hint={`${openTasks.length} open · ${activeProjects.length} active`}
        onClick={() => onNavigate("developer")}
      />
      <DeckCard
        icon={<BrainCircuit className="h-3.5 w-3.5" />}
        label="AI Memory"
        value={`${memories.length} saved`}
        hint="Approved context"
        onClick={() => onNavigate("memory")}
      />
      <DeckCard
        icon={<Code2 className="h-3.5 w-3.5" />}
        label="Developer Mode"
        value="Code deck"
        hint="Inspect, review, build"
        onClick={() => onNavigate("developer")}
      />
      <DeckCard
        icon={<Globe2 className="h-3.5 w-3.5" />}
        label="Quick Website Access"
        value={`${websites.length} tracked`}
        hint="Registry shortcuts"
        onClick={() => onNavigate("websites")}
      >
        <div className="mt-1.5 flex flex-wrap gap-1">
          {QUICK_SITES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                if (entry.url) openInNewTab(entry.url);
              }}
              className="rounded-md border border-[#00D9FF]/15 px-1.5 py-0.5 text-[8px] font-mono uppercase tracking-[0.1em] text-[#7DE9FF] hover:border-[#00D9FF]/45 cursor-pointer"
            >
              {entry.name}
            </button>
          ))}
        </div>
      </DeckCard>
      <DeckCard
        icon={<FolderKanban className="h-3.5 w-3.5" />}
        label="My Projects"
        value={`${activeProjects.length} active`}
        hint={`${projects.length} tracked in total`}
        onClick={() => onNavigate("projects")}
      />
      <DeckCard
        icon={<CheckSquare className="h-3.5 w-3.5" />}
        label="Daily Tasks"
        value={`${openTasks.length} open`}
        hint={nextTask}
        onClick={() => onNavigate("productivity")}
      />
      <DeckCard
        icon={<StickyNote className="h-3.5 w-3.5" />}
        label="Notes"
        value={`${notes.length} saved`}
        hint={notes[0]?.title ?? "Nothing pinned"}
        onClick={() => onNavigate("productivity")}
      />
    </div>
  );
}
