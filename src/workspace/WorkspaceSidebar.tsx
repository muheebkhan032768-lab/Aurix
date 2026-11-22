import React, { useEffect, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Sparkles, X } from "lucide-react";
import { WORKSPACE_NAV } from "./nav";
import { StatusDot } from "./ui";

interface WorkspaceSidebarProps {
  activeModule: string;
  onNavigate: (id: string) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  taskCount: number;
  reminderCount: number;
  aiState: string;
}

export function WorkspaceSidebar({
  activeModule,
  onNavigate,
  collapsed,
  onToggleCollapsed,
  mobileOpen,
  onCloseMobile,
  taskCount,
  reminderCount,
  aiState,
}: WorkspaceSidebarProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    if (activeModule.startsWith("legacy-")) setAdvancedOpen(true);
  }, [activeModule]);

  const content = (isMobile: boolean) => {
    const isCollapsed = collapsed && !isMobile;
    return (
      <div className="flex h-full flex-col">
        <div className={`flex items-center gap-2.5 border-b border-[var(--ws-border)] px-3.5 py-3.5 ${isCollapsed ? "justify-center" : "justify-between"}`}>
          {!isCollapsed && (
            <button type="button" onClick={() => onNavigate("command-center")} className="flex min-w-0 items-center gap-2.5 text-left">
              <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[linear-gradient(135deg,var(--ws-accent),var(--ws-accent-2))] shadow-[0_0_22px_color-mix(in_srgb,var(--ws-accent)_35%,transparent)]">
                <span className="font-display text-sm font-bold text-[var(--ws-accent-ink)]">A</span>
                <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border-2 border-[var(--ws-surface)] bg-[var(--ws-accent-2)]" />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-display text-sm font-bold tracking-[0.18em] text-[var(--ws-text)]">AURIX</span>
                <span className="block truncate text-[8.5px] uppercase tracking-[0.16em] text-[var(--ws-muted)]">Powered by AM VEYRONIX</span>
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={isMobile ? onCloseMobile : onToggleCollapsed}
            className="ws-btn ws-btn-ghost !p-1.5"
            aria-label={isMobile ? "Close navigation" : collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isMobile ? <X className="h-4 w-4" /> : collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {isCollapsed && (
          <button type="button" onClick={() => onNavigate("command-center")} className="mx-auto mt-3 flex h-9 w-9 items-center justify-center rounded-xl bg-[linear-gradient(135deg,var(--ws-accent),var(--ws-accent-2))]" aria-label="AURIX Command Center">
            <span className="font-display text-sm font-bold text-[var(--ws-accent-ink)]">A</span>
          </button>
        )}

        <nav className="ws-scroll flex-1 overflow-y-auto px-2 py-3">
          {WORKSPACE_NAV.map((group) => {
            const isAdvanced = group.id === "advanced";
            const open = !isAdvanced || advancedOpen;
            return (
              <div key={group.id} className={isAdvanced ? "mt-2 border-t border-[var(--ws-border)] pt-2" : "mb-2"}>
                {!isCollapsed && (
                  <button
                    type="button"
                    onClick={() => isAdvanced && setAdvancedOpen((v) => !v)}
                    className={`mb-1 flex w-full items-center justify-between px-2.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--ws-muted)] ${isAdvanced ? "cursor-pointer hover:text-[var(--ws-text)]" : "cursor-default"}`}
                  >
                    {group.label}
                    {isAdvanced && <ChevronDown className={`h-3 w-3 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />}
                  </button>
                )}
                {open && (
                  <div className="space-y-0.5">
                    {group.items.map((item) => {
                      const active = activeModule === item.id;
                      const Icon = item.icon;
                      const badge =
                        item.id === "tasks" ? taskCount : item.id === "reminders" ? reminderCount : 0;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            onNavigate(item.id);
                            if (isMobile) onCloseMobile();
                          }}
                          title={isCollapsed ? item.label : undefined}
                          className={`group relative flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-all duration-200 ${
                            active
                              ? "bg-[color-mix(in_srgb,var(--ws-accent)_12%,transparent)] text-[var(--ws-text)]"
                              : "text-[var(--ws-muted)] hover:bg-[var(--ws-surface-2)] hover:text-[var(--ws-text)]"
                          } ${isCollapsed ? "justify-center" : ""}`}
                        >
                          <span
                            className={`absolute left-0 top-1/2 h-5 -translate-y-1/2 rounded-r-full bg-[var(--ws-accent)] transition-all duration-200 ${
                              active ? "w-[3px] opacity-100" : "w-0 opacity-0"
                            }`}
                          />
                          <Icon className={`h-4 w-4 shrink-0 transition-colors ${active ? "text-[var(--ws-accent)]" : "text-[var(--ws-muted)] group-hover:text-[var(--ws-text)]"}`} />
                          {!isCollapsed && (
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[11.5px] font-medium">{item.label}</span>
                              {!active && <span className="block truncate text-[9px] text-[var(--ws-muted)]">{item.hint}</span>}
                            </span>
                          )}
                          {!isCollapsed && badge > 0 && <span className="ws-chip !px-1.5 !py-0 !text-[9px]">{badge}</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className={`border-t border-[var(--ws-border)] px-3 py-3 ${isCollapsed ? "text-center" : ""}`}>
          {isCollapsed ? (
            <StatusDot state={aiState === "connected" ? "ok" : aiState === "degraded" ? "warn" : aiState === "not_configured" ? "error" : "idle"} />
          ) : (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.14em] text-[var(--ws-muted)]">
                <span>Neural workspace</span>
                <span className="inline-flex items-center gap-1">
                  <StatusDot state={aiState === "connected" ? "ok" : aiState === "degraded" ? "warn" : aiState === "not_configured" ? "error" : "idle"} />
                  {aiState === "connected" ? "AI live" : aiState === "degraded" ? "Fallback" : aiState === "not_configured" ? "No key" : "Idle"}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.14em] text-[var(--ws-text)]">
                <Sparkles className="h-3 w-3 text-[var(--ws-accent)]" /> AM VEYRONIX
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <aside
        className={`hidden shrink-0 overflow-hidden border-r border-[var(--ws-border)] bg-[color-mix(in_srgb,var(--ws-surface)_72%,transparent)] backdrop-blur-xl transition-[width] duration-300 lg:block ${
          collapsed ? "w-[66px]" : "w-[236px]"
        }`}
      >
        {content(false)}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-[70] flex lg:hidden">
          <div className="w-[268px] border-r border-[var(--ws-border)] bg-[var(--ws-surface)] shadow-2xl">{content(true)}</div>
          <button type="button" className="flex-1 bg-black/55 backdrop-blur-sm" onClick={onCloseMobile} aria-label="Close navigation overlay" />
        </div>
      )}
    </>
  );
}
