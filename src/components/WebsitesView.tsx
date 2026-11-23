import React, { useState } from "react";
import { Check, Globe, Plus, Save } from "lucide-react";
import type { ProjectStatus, WebsiteRecord } from "../types/aurix";

interface WebsitesViewProps {
  websites: WebsiteRecord[];
  onSaveWebsite: (w: WebsiteRecord) => Promise<void>;
}

export function WebsitesView({ websites, onSaveWebsite }: WebsitesViewProps) {
  const [selectedId, setSelectedId] = useState<string>(websites[0]?.id || "");
  const current = websites.find((w) => w.id === selectedId) || websites[0];
  const [draft, setDraft] = useState<WebsiteRecord | null>(current || null);
  const [newDomain, setNewDomain] = useState("");
  const [saving, setSaving] = useState(false);

  const selectSite = (site: WebsiteRecord) => {
    setSelectedId(site.id);
    setDraft(site);
  };

  const createNewSite = () => {
    const fresh: WebsiteRecord = {
      id: `web_${Date.now()}`,
      name: "New AM VEYRONIX Website",
      tagline: "",
      purpose: "",
      status: "planned",
      activeDomain: "",
      domains: [],
      hostingProviders: [],
      stack: [],
      files: [],
      features: [],
      pages: "",
      databaseNotes: "",
      apiIntegrations: "",
      deploymentHistory: "",
      knownBugs: "",
      pendingTasks: "",
      securityNotes: "",
      futureImprovements: "",
      updatedAt: new Date().toISOString(),
    };
    setSelectedId(fresh.id);
    setDraft(fresh);
  };

  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await onSaveWebsite(draft);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Isolated Website List */}
      <aside className="lg:col-span-4 bg-white dark:bg-[#0D1420] border border-slate-200 dark:border-slate-800/80 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Isolated Website Records
          </h2>
          <button
            type="button"
            onClick={createNewSite}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-cyan-700 hover:bg-cyan-600 text-white text-xs font-medium cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add</span>
          </button>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400 px-1">
          Each website maintains strict knowledge separation so stacks, domains, and files never mix.
        </p>

        <div className="space-y-1.5">
          {websites.map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => selectSite(w)}
              className={`w-full text-left p-3.5 rounded-lg border transition-colors cursor-pointer ${
                draft?.id === w.id
                  ? "border-cyan-500/70 bg-cyan-500/5"
                  : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm text-slate-900 dark:text-slate-100 truncate">
                  {w.name}
                </span>
                <span className="text-[11px] font-mono capitalize text-slate-500 dark:text-slate-400 shrink-0">
                  {w.status}
                </span>
              </div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 truncate">
                {w.activeDomain || w.purpose || "Domain pending"}
              </div>
            </button>
          ))}
        </div>
      </aside>

      {/* Selected Website Inspector & Editor */}
      {draft && (
        <section className="lg:col-span-8 bg-white dark:bg-[#0D1420] border border-slate-200 dark:border-slate-800/80 rounded-xl p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800/80">
            <div className="flex items-center gap-2.5">
              <Globe className="w-5 h-5 text-cyan-500" />
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {draft.name}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Last updated {draft.updatedAt.slice(0, 10)}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-700 hover:bg-cyan-600 text-white text-xs font-medium cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? "Saving..." : "Save Record"}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label className="block text-xs text-slate-500 dark:text-slate-400 md:col-span-2">
              <span>Website Name</span>
              <input
                type="text"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className="mt-1 w-full bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
              />
            </label>

            <label className="block text-xs text-slate-500 dark:text-slate-400">
              <span>Lifecycle Status</span>
              <select
                value={draft.status}
                onChange={(e) => setDraft({ ...draft, status: e.target.value as ProjectStatus })}
                className="mt-1 w-full bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
              >
                <option value="active">Active</option>
                <option value="planned">Planned</option>
                <option value="completed">Completed</option>
                <option value="abandoned">Abandoned</option>
              </select>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block text-xs text-slate-500 dark:text-slate-400">
              <span>Tagline</span>
              <input
                type="text"
                value={draft.tagline}
                onChange={(e) => setDraft({ ...draft, tagline: e.target.value })}
                className="mt-1 w-full bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
              />
            </label>

            <label className="block text-xs text-slate-500 dark:text-slate-400">
              <span>Purpose</span>
              <input
                type="text"
                value={draft.purpose}
                onChange={(e) => setDraft({ ...draft, purpose: e.target.value })}
                className="mt-1 w-full bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
              />
            </label>
          </div>

          {/* Domains & Active Domain Switcher */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800/80 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
                Domains & Active Domain Designation
              </span>
              <span className="text-xs font-mono text-accent">
                Active: {draft.activeDomain || "None marked"}
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              {draft.domains.map((dom) => {
                const isActive = draft.activeDomain === dom;
                return (
                  <button
                    key={dom}
                    type="button"
                    onClick={() => setDraft({ ...draft, activeDomain: dom })}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono cursor-pointer ${
                      isActive
                        ? "border-cyan-500 bg-cyan-500/10 text-cyan-500"
                        : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                    }`}
                  >
                    {isActive && <Check className="w-3.5 h-3.5" />}
                    <span>{dom}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                placeholder="Add domain (e.g., amveyronix.com)..."
                className="flex-1 bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100"
              />
              <button
                type="button"
                onClick={() => {
                  if (!newDomain.trim()) return;
                  const clean = newDomain.trim();
                  setDraft({
                    ...draft,
                    domains: Array.from(new Set([...draft.domains, clean])),
                    activeDomain: draft.activeDomain || clean,
                  });
                  setNewDomain("");
                }}
                className="px-3 py-2 rounded-lg bg-slate-900 dark:bg-slate-800 text-white text-xs font-medium cursor-pointer"
              >
                Add Domain
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block text-xs text-slate-500 dark:text-slate-400">
              <span>Technology Stack (comma separated)</span>
              <input
                type="text"
                value={draft.stack.join(", ")}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    stack: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                  })
                }
                className="mt-1 w-full bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
              />
            </label>

            <label className="block text-xs text-slate-500 dark:text-slate-400">
              <span>Hosting Providers (comma separated)</span>
              <input
                type="text"
                value={draft.hostingProviders.join(", ")}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    hostingProviders: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                  })
                }
                className="mt-1 w-full bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
              />
            </label>

            <label className="block text-xs text-slate-500 dark:text-slate-400">
              <span>Source Files (comma separated)</span>
              <input
                type="text"
                value={draft.files.join(", ")}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    files: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                  })
                }
                className="mt-1 w-full bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100"
              />
            </label>

            <label className="block text-xs text-slate-500 dark:text-slate-400">
              <span>Database & API Integrations</span>
              <input
                type="text"
                value={draft.databaseNotes}
                onChange={(e) => setDraft({ ...draft, databaseNotes: e.target.value })}
                className="mt-1 w-full bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block text-xs text-slate-500 dark:text-slate-400">
              <span>Pending Tasks</span>
              <textarea
                rows={2}
                value={draft.pendingTasks}
                onChange={(e) => setDraft({ ...draft, pendingTasks: e.target.value })}
                className="mt-1 w-full bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
              />
            </label>

            <label className="block text-xs text-slate-500 dark:text-slate-400">
              <span>Known Bugs & Security Notes</span>
              <textarea
                rows={2}
                value={draft.knownBugs}
                onChange={(e) => setDraft({ ...draft, knownBugs: e.target.value })}
                className="mt-1 w-full bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
              />
            </label>
          </div>

          <label className="block text-xs text-slate-500 dark:text-slate-400">
            <span>Deployment & Maintenance History</span>
            <textarea
              rows={2}
              value={draft.deploymentHistory}
              onChange={(e) => setDraft({ ...draft, deploymentHistory: e.target.value })}
              className="mt-1 w-full bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
            />
          </label>
        </section>
      )}
    </div>
  );
}
