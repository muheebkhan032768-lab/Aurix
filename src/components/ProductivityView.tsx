import React, { useState } from "react";
import { CheckCircle2, Circle, Plus, Sparkles, Trash2 } from "lucide-react";
import type { NoteItem, TaskItem } from "../types/aurix";

interface ProductivityViewProps {
  tasks: TaskItem[];
  notes: NoteItem[];
  onSaveTask: (t: Omit<TaskItem, "id" | "createdAt"> & { id?: string }) => Promise<void>;
  onDeleteTask: (id: string) => Promise<void>;
  onSaveNote: (n: Omit<NoteItem, "id" | "updatedAt"> & { id?: string }) => Promise<void>;
  onDeleteNote: (id: string) => Promise<void>;
}

export function ProductivityView({
  tasks,
  notes,
  onSaveTask,
  onDeleteTask,
  onSaveNote,
  onDeleteNote,
}: ProductivityViewProps) {
  const [taskTitle, setTaskTitle] = useState("");
  const [taskCat, setTaskCat] = useState<TaskItem["category"]>("daily");
  const [taskPriority, setTaskPriority] = useState<TaskItem["priority"]>("medium");
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [filterCat, setFilterCat] = useState<"all" | TaskItem["category"]>("all");

  const [noteTitle, setNoteTitle] = useState("");
  const [noteCat, setNoteCat] = useState("Learning");
  const [noteContent, setNoteContent] = useState("");

  const [briefing, setBriefing] = useState("");
  const [loadingBrief, setLoadingBrief] = useState(false);

  const filteredTasks = filterCat === "all" ? tasks : tasks.filter((t) => t.category === filterCat);

  const addTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim()) return;
    await onSaveTask({
      title: taskTitle.trim(),
      category: taskCat,
      priority: taskPriority,
      status: "todo",
      dueDate,
      notes: "",
    });
    setTaskTitle("");
  };

  const toggleTaskDone = async (t: TaskItem) => {
    await onSaveTask({
      ...t,
      status: t.status === "done" ? "todo" : "done",
    });
  };

  const addNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteTitle.trim() || !noteContent.trim()) return;
    await onSaveNote({
      title: noteTitle.trim(),
      category: noteCat,
      content: noteContent.trim(),
    });
    setNoteTitle("");
    setNoteContent("");
  };

  const generateDailySummary = async () => {
    setLoadingBrief(true);
    try {
      const openList = tasks
        .filter((t) => t.status !== "done")
        .map((t) => `- [${t.category}/${t.priority}] ${t.title} (due ${t.dueDate})`)
        .join("\n");
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Generate a concise daily focus briefing and prioritized time-block plan for Abdul Muheeb based on these open tasks:\n${
            openList || "No pending tasks currently."
          }`,
          mode: "productivity",
        }),
      });
      const data = await res.json();
      if (res.ok) setBriefing(data.assistantMessage.content);
    } finally {
      setLoadingBrief(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-[#101018] border border-slate-200 dark:border-slate-800/80 rounded-xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Personal Productivity, Study & Daily Planner
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Track daily execution, learning goals, and notes stored in local SQLite.
          </p>
        </div>
        <button
          type="button"
          onClick={generateDailySummary}
          disabled={loadingBrief}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium cursor-pointer whitespace-nowrap shrink-0"
        >
          <Sparkles className="w-4 h-4" />
          <span>{loadingBrief ? "Preparing Briefing..." : "Generate Daily Summary"}</span>
        </button>
      </div>

      {briefing && (
        <div className="bg-white dark:bg-[#101018] border border-cyan-500/40 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-cyan-600 dark:text-cyan-400 mb-2">
            AURIX Daily Focus Briefing
          </h3>
          <div className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
            {briefing}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Tasks */}
        <section className="lg:col-span-6 bg-white dark:bg-[#101018] border border-slate-200 dark:border-slate-800/80 rounded-xl p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Task & Study Queue
            </h3>
            <div className="flex gap-1">
              {(["all", "daily", "study", "business", "dev"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setFilterCat(c)}
                  className={`px-2.5 py-1 rounded-md text-xs capitalize cursor-pointer ${
                    filterCat === c
                      ? "bg-cyan-600 text-white"
                      : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={addTask} className="space-y-2.5">
            <input
              type="text"
              required
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="New task or study milestone..."
              className="w-full bg-slate-50 dark:bg-[#0B0B10] border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
            />
            <div className="grid grid-cols-3 gap-2">
              <select
                value={taskCat}
                onChange={(e) => setTaskCat(e.target.value as TaskItem["category"])}
                className="bg-slate-50 dark:bg-[#0B0B10] border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-2 text-xs text-slate-900 dark:text-slate-100"
              >
                <option value="daily">Daily</option>
                <option value="study">Study</option>
                <option value="business">Business</option>
                <option value="dev">Dev</option>
              </select>
              <select
                value={taskPriority}
                onChange={(e) => setTaskPriority(e.target.value as TaskItem["priority"])}
                className="bg-slate-50 dark:bg-[#0B0B10] border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-2 text-xs text-slate-900 dark:text-slate-100"
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="bg-slate-50 dark:bg-[#0B0B10] border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-2 text-xs font-mono text-slate-900 dark:text-slate-100"
              />
            </div>
            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg bg-slate-900 dark:bg-slate-800 text-white text-xs font-medium cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Task</span>
            </button>
          </form>

          <div className="divide-y divide-slate-200 dark:divide-slate-800/80">
            {filteredTasks.map((t) => (
              <div key={t.id} className="py-3 flex items-start justify-between gap-3">
                <button
                  type="button"
                  onClick={() => toggleTaskDone(t)}
                  className="flex items-start gap-2.5 text-left cursor-pointer"
                >
                  {t.status === "done" ? (
                    <CheckCircle2 className="w-4 h-4 text-violet-500 mt-0.5 shrink-0" />
                  ) : (
                    <Circle className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                  )}
                  <div>
                    <div
                      className={`text-sm ${
                        t.status === "done"
                          ? "line-through text-slate-400"
                          : "text-slate-900 dark:text-slate-100"
                      }`}
                    >
                      {t.title}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                      {t.category} · {t.priority} · {t.dueDate}
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteTask(t.id)}
                  aria-label="Delete task"
                  className="text-slate-400 hover:text-red-500 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Notes */}
        <section className="lg:col-span-6 bg-white dark:bg-[#101018] border border-slate-200 dark:border-slate-800/80 rounded-xl p-6 space-y-4">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Knowledge Notes & Reminders
          </h3>

          <form onSubmit={addNote} className="space-y-2.5">
            <div className="grid grid-cols-3 gap-2">
              <input
                type="text"
                required
                value={noteTitle}
                onChange={(e) => setNoteTitle(e.target.value)}
                placeholder="Note title..."
                className="col-span-2 bg-slate-50 dark:bg-[#0B0B10] border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
              />
              <select
                value={noteCat}
                onChange={(e) => setNoteCat(e.target.value)}
                className="bg-slate-50 dark:bg-[#0B0B10] border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-2 text-xs text-slate-900 dark:text-slate-100"
              >
                <option>Learning</option>
                <option>Company</option>
                <option>Technical</option>
                <option>Reminder</option>
              </select>
            </div>
            <textarea
              rows={3}
              required
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              placeholder="Write note..."
              className="w-full bg-slate-50 dark:bg-[#0B0B10] border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
            />
            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg bg-slate-900 dark:bg-slate-800 text-white text-xs font-medium cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Save Note</span>
            </button>
          </form>

          <div className="divide-y divide-slate-200 dark:divide-slate-800/80">
            {notes.map((n) => (
              <div key={n.id} className="py-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {n.title}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-slate-400">
                      {n.category} · {n.updatedAt.slice(0, 10)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onDeleteNote(n.id)}
                      aria-label="Delete note"
                      className="text-slate-400 hover:text-red-500 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
                  {n.content}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
