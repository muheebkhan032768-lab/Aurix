import React, { useState } from "react";
import { FolderKanban, Plus, Save } from "lucide-react";
import type { ProjectRecord, ProjectStatus } from "../types/aurix";

interface ProjectsViewProps {
  projects: ProjectRecord[];
  onSaveProject: (p: ProjectRecord) => Promise<void>;
}

export function ProjectsView({ projects, onSaveProject }: ProjectsViewProps) {
  const [filter, setFilter] = useState<"all" | ProjectStatus>("all");
  const [editing, setEditing] = useState<ProjectRecord | null>(null);

  const visible = filter === "all" ? projects : projects.filter((p) => p.status === filter);

  const startNew = () => {
    setEditing({
      id: `prj_${Date.now()}`,
      name: "",
      category: "Software Project",
      description: "",
      status: "planned",
      progress: 0,
      stack: [],
      locationOrUrl: "",
      knownBugs: "",
      pendingTasks: "",
      securityNotes: "",
      updatedAt: new Date().toISOString(),
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || !editing.name.trim()) return;
    await onSaveProject(editing);
    setEditing(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-[#0D1420] border border-slate-200 dark:border-slate-800 rounded-lg">
          {(["all", "active", "planned", "completed", "abandoned"] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setFilter(st)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                filter === st
                  ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={startNew}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium cursor-pointer whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>New Project</span>
        </button>
      </div>

      {editing && (
        <form
          onSubmit={handleSave}
          className="bg-white dark:bg-[#0D1420] border border-cyan-500/50 rounded-xl p-6 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {projects.some((p) => p.id === editing.id) ? `Edit ${editing.name}` : "Create Project Record"}
            </h3>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              Cancel
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <label className="block text-xs text-slate-500 dark:text-slate-400 md:col-span-2">
              <span>Project Name</span>
              <input
                type="text"
                required
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                className="mt-1 w-full bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
              />
            </label>
            <label className="block text-xs text-slate-500 dark:text-slate-400">
              <span>Status</span>
              <select
                value={editing.status}
                onChange={(e) => setEditing({ ...editing, status: e.target.value as ProjectStatus })}
                className="mt-1 w-full bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
              >
                <option value="active">Active</option>
                <option value="planned">Planned</option>
                <option value="completed">Completed</option>
                <option value="abandoned">Abandoned</option>
              </select>
            </label>
            <label className="block text-xs text-slate-500 dark:text-slate-400">
              <span>Progress ({editing.progress}%)</span>
              <input
                type="range"
                min="0"
                max="100"
                value={editing.progress}
                onChange={(e) => setEditing({ ...editing, progress: Number(e.target.value) })}
                className="mt-3 w-full accent-cyan-500"
              />
            </label>
          </div>

          <label className="block text-xs text-slate-500 dark:text-slate-400">
            <span>Description</span>
            <textarea
              rows={2}
              value={editing.description}
              onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              className="mt-1 w-full bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
            />
          </label>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block text-xs text-slate-500 dark:text-slate-400">
              <span>Tech Stack (comma separated)</span>
              <input
                type="text"
                value={editing.stack.join(", ")}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    stack: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                  })
                }
                className="mt-1 w-full bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
              />
            </label>
            <label className="block text-xs text-slate-500 dark:text-slate-400">
              <span>Pending Tasks</span>
              <input
                type="text"
                value={editing.pendingTasks}
                onChange={(e) => setEditing({ ...editing, pendingTasks: e.target.value })}
                className="mt-1 w-full bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
              />
            </label>
          </div>

          <button
            type="submit"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>Save Project</span>
          </button>
        </form>
      )}

      {visible.length === 0 ? (
        <div className="bg-white dark:bg-[#0D1420] border border-slate-200 dark:border-slate-800/80 rounded-xl p-10 text-center text-sm text-slate-500 dark:text-slate-400">
          No projects match the "{filter}" status filter.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {visible.map((p) => (
            <div
              key={p.id}
              className="bg-white dark:bg-[#0D1420] border border-slate-200 dark:border-slate-800/80 rounded-xl p-6 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <FolderKanban className="w-4 h-4 text-cyan-500 shrink-0" />
                    <h3 className="font-semibold text-base text-slate-900 dark:text-slate-100">
                      {p.name}
                    </h3>
                  </div>
                  <span className="text-xs font-mono capitalize text-slate-500 dark:text-slate-400 shrink-0">
                    {p.status}
                  </span>
                </div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {p.category} · {p.locationOrUrl || "Local"}
                </div>
                <p className="mt-3 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  {p.description}
                </p>
                <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                  Stack: {p.stack.join(", ") || "Unspecified"}
                </div>
              </div>

              <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800/80 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 dark:text-slate-400">Progress</span>
                  <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                    {p.progress}%
                  </span>
                </div>
                <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-cyan-500 rounded-full" style={{ width: `${p.progress}%` }} />
                </div>
                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[70%]">
                    Next: {p.pendingTasks || "None"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditing(p)}
                    className="text-xs font-medium text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer shrink-0"
                  >
                    Edit
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
