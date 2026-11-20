import React from "react";
import {
  Bot,
  BrainCircuit,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  Code2,
  Eye,
  FolderSearch,
  Home,
  LayoutDashboard,
  Mic,
  Monitor,
  MoreHorizontal,
  ScanEye,
  Settings,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import type { AurixSectionId } from "../../types/aurix";

export interface CockpitNavItem {
  id: AurixSectionId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  hint: string;
  fileMode?: "summarize" | "ocr" | "vision" | "code-review" | "compare";
}

export const COCKPIT_NAV: CockpitNavItem[] = [
  { id: "home", label: "Command Center", icon: LayoutDashboard, hint: "Nexus overview" },
  { id: "chat", label: "AI Assistant", icon: Sparkles, hint: "Conversations" },
  { id: "voice", label: "Voice Center", icon: Mic, hint: "Speech engine" },
  { id: "developer", label: "Developer Workspace", icon: Code2, hint: "Code & review" },
  { id: "files", label: "File Intelligence", icon: FolderSearch, hint: "Documents", fileMode: "summarize" },
  { id: "business", label: "Business Intelligence", icon: Briefcase, hint: "AM VEYRONIX" },
  { id: "system", label: "Computer Control", icon: Monitor, hint: "Windows ops" },
  { id: "files", label: "Vision System", icon: ScanEye, hint: "Screen & OCR", fileMode: "vision" },
  { id: "memory", label: "Memory Center", icon: BrainCircuit, hint: "Saved context" },
  { id: "security", label: "Security Center", icon: ShieldCheck, hint: "Permissions" },
  { id: "automation", label: "Automation Center", icon: Bot, hint: "Approved actions" },
  { id: "settings", label: "Settings", icon: Settings, hint: "Configuration" },
];

export const SECONDARY_NAV: Array<{ id: AurixSectionId; label: string }> = [
  { id: "company", label: "Company" },
  { id: "websites", label: "Websites" },
  { id: "projects", label: "Projects" },
  { id: "creative", label: "Creative Studio" },
  { id: "research", label: "Research" },
  { id: "productivity", label: "Tasks & Notes" },
  { id: "models", label: "AI Models" },
  { id: "selfheal", label: "Self-Healer" },
];

interface NexusSidebarProps {
  activeSection: AurixSectionId;
  onNavigate: (item: CockpitNavItem) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  moreOpen: boolean;
  onToggleMore: () => void;
  onNavigateSecondary: (section: AurixSectionId) => void;
  fileMode: "summarize" | "ocr" | "vision" | "code-review" | "compare";
}

function NavButton({
  item,
  active,
  collapsed,
  onClick,
}: {
  item: CockpitNavItem;
  active: boolean;
  collapsed: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      title={collapsed ? item.label : undefined}
      className={`group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors cursor-pointer ${
        active
          ? "bg-[#00D9FF]/12 text-white"
          : "text-[#94A8B8] hover:bg-white/5 hover:text-white"
      }`}
    >
      <span
        className={`absolute left-0 top-1/2 h-6 -translate-y-1/2 rounded-r-full transition-all ${
          active ? "w-[3px] bg-[#00D9FF]" : "w-0 bg-transparent"
        }`}
      />
      <Icon className={`w-4 h-4 shrink-0 ${active ? "text-[#00D9FF]" : "text-[#5B7185] group-hover:text-[#A9C8D5]"}`} />
      {!collapsed && (
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium">{item.label}</span>
          <span className="block truncate text-[10px] text-[#5B7185]">{item.hint}</span>
        </span>
      )}
    </button>
  );
}

export function NexusSidebar({
  activeSection,
  onNavigate,
  collapsed,
  onToggleCollapsed,
  mobileOpen,
  onCloseMobile,
  moreOpen,
  onToggleMore,
  onNavigateSecondary,
  fileMode,
}: NexusSidebarProps) {
  const content = (isMobile: boolean) => (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-4 border-b border-[#00D9FF]/10">
        {!collapsed && (
          <div>
            <div className="font-display text-sm font-bold tracking-[0.2em] text-white">NEXUS</div>
            <div className="text-[9px] font-mono uppercase tracking-[0.24em] text-[#5B7185]">Cockpit v2.0</div>
          </div>
        )}
        <button
          type="button"
          onClick={isMobile ? onCloseMobile : onToggleCollapsed}
          className="rounded-lg p-1.5 text-[#5B7185] hover:bg-white/5 hover:text-white cursor-pointer"
          aria-label={isMobile ? "Close navigation" : collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isMobile ? <X className="w-4 h-4" /> : collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
        {COCKPIT_NAV.map((item, index) => {
          const active =
            item.id === "files"
              ? activeSection === "files" && (item.fileMode ?? "summarize") === fileMode
              : activeSection === item.id;
          return (
            <NavButton
              key={`${item.id}-${index}`}
              item={item}
              active={active}
              collapsed={collapsed && !isMobile}
              onClick={() => {
                onNavigate(item);
                if (isMobile) onCloseMobile();
              }}
            />
          );
        })}

        <div className="pt-2">
          <button
            type="button"
            onClick={onToggleMore}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-[10px] font-mono uppercase tracking-[0.16em] text-[#5B7185] hover:text-[#A9C8D5] cursor-pointer"
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
            {!collapsed && <span>More modules</span>}
          </button>
          {moreOpen && (
            <div className="mt-1 space-y-0.5">
              {SECONDARY_NAV.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => {
                    onNavigateSecondary(entry.id);
                    if (isMobile) onCloseMobile();
                  }}
                  className={`block w-full rounded-lg px-3 py-1.5 text-left text-[11px] transition-colors cursor-pointer ${
                    activeSection === entry.id
                      ? "text-[#00D9FF] bg-[#00D9FF]/8"
                      : "text-[#7A8FA0] hover:text-white hover:bg-white/5"
                  }`}
                >
                  {entry.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </nav>

      <div className="border-t border-[#00D9FF]/10 px-4 py-3">
        {collapsed && !isMobile ? (
          <div className="text-center text-[9px] font-mono text-[#5B7185]">AMV</div>
        ) : (
          <div>
            <div className="text-[9px] font-mono uppercase tracking-[0.2em] text-[#5B7185]">POWERED BY</div>
            <div className="text-[11px] font-semibold tracking-[0.16em] text-[#A9C8D5]">AM VEYRONIX</div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <aside
        className={`hidden md:block shrink-0 border-r border-[#00D9FF]/10 bg-[#071B2A]/60 backdrop-blur-xl transition-[width] duration-300 ${
          collapsed ? "w-[68px]" : "w-[236px]"
        }`}
      >
        {content(false)}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="w-[260px] bg-[#071B2A] border-r border-[#00D9FF]/15">{content(true)}</div>
          <div className="flex-1 bg-black/60" onClick={onCloseMobile} />
        </div>
      )}
    </>
  );
}
