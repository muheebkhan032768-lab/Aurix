import React, { useEffect, useState } from "react";
import { Code2, Download, FileCode, Play } from "lucide-react";
import type { DeliverableFile, WebsiteRecord } from "../types/aurix";

interface DeveloperViewProps {
  websites: WebsiteRecord[];
}

export function DeveloperView({ websites }: DeveloperViewProps) {
  const [tab, setTab] = useState<"assistant" | "deliverables">("assistant");
  const [languageTarget, setLanguageTarget] = useState("Python");
  const [projectScope, setProjectScope] = useState("Global");
  const [taskType, setTaskType] = useState("Architecture & Code Review");
  const [instruction, setInstruction] = useState("");
  const [codeSnippet, setCodeSnippet] = useState("");
  const [deepReasoning, setDeepReasoning] = useState(true);
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [files, setFiles] = useState<DeliverableFile[]>([]);
  const [activeFile, setActiveFile] = useState<DeliverableFile | null>(null);

  useEffect(() => {
    if (tab === "deliverables" && files.length === 0) {
      fetch("/api/deliverables")
        .then((r) => r.json())
        .then((data: DeliverableFile[]) => {
          setFiles(data);
          setActiveFile(data[0] || null);
        })
        .catch(() => {});
    }
  }, [tab, files.length]);

  const runAssist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!instruction.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dev/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          languageTarget,
          projectScope,
          taskType,
          codeSnippet,
          instruction,
          deepReasoning,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Engineering request failed.");
      setOutput(data.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Developer assist error.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-[#0D1420] border border-slate-200 dark:border-slate-800 rounded-lg">
          <button
            type="button"
            onClick={() => setTab("assistant")}
            className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              tab === "assistant"
                ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm"
                : "text-slate-600 dark:text-slate-400"
            }`}
          >
            AI Engineering Assistant
          </button>
          <button
            type="button"
            onClick={() => setTab("deliverables")}
            className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              tab === "deliverables"
                ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm"
                : "text-slate-600 dark:text-slate-400"
            }`}
          >
            Native Windows Python & C# WPF Suite
          </button>
        </div>

        <a
          href="/api/deliverables/download.zip"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium transition-colors whitespace-nowrap shrink-0"
        >
          <Download className="w-4 h-4" />
          <span>Download Windows Suite (.zip)</span>
        </a>
      </div>

      {tab === "assistant" ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={runAssist}
            className="lg:col-span-5 bg-white dark:bg-[#0D1420] border border-slate-200 dark:border-slate-800/80 rounded-xl p-6 space-y-4"
          >
            <div className="flex items-center gap-2">
              <Code2 className="w-4 h-4 text-cyan-500" />
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Engineering Context
              </h3>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs text-slate-500 dark:text-slate-400">
                <span>Language / Platform</span>
                <select
                  value={languageTarget}
                  onChange={(e) => setLanguageTarget(e.target.value)}
                  className="mt-1 w-full bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
                >
                  <option>Python</option>
                  <option>C# .NET WPF</option>
                  <option>C++</option>
                  <option>HTML5 / CSS3 / JS</option>
                  <option>WordPress / PHP</option>
                  <option>SQLite / Database</option>
                  <option>Git & Deployment</option>
                </select>
              </label>

              <label className="block text-xs text-slate-500 dark:text-slate-400">
                <span>Project Isolation</span>
                <select
                  value={projectScope}
                  onChange={(e) => setProjectScope(e.target.value)}
                  className="mt-1 w-full bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
                >
                  <option value="Global">General Engineering</option>
                  {websites.map((w) => (
                    <option key={w.id} value={w.name}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block text-xs text-slate-500 dark:text-slate-400">
              <span>Task Mode</span>
              <select
                value={taskType}
                onChange={(e) => setTaskType(e.target.value)}
                className="mt-1 w-full bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
              >
                <option>Architecture & Code Review</option>
                <option>Debug & Root Cause Fix</option>
                <option>Generate New Module</option>
                <option>Database Schema Design</option>
                <option>Generate Documentation</option>
              </select>
            </label>

            <label className="block text-xs text-slate-500 dark:text-slate-400">
              <span>Instruction</span>
              <textarea
                rows={3}
                required
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="Describe what to inspect, debug, or build..."
                className="mt-1 w-full bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
              />
            </label>

            <label className="block text-xs text-slate-500 dark:text-slate-400">
              <span>Source Code Snippet (Optional)</span>
              <textarea
                rows={6}
                value={codeSnippet}
                onChange={(e) => setCodeSnippet(e.target.value)}
                placeholder="Paste source code here..."
                className="mt-1 w-full font-mono bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
              />
            </label>

            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={deepReasoning}
                onChange={(e) => setDeepReasoning(e.target.checked)}
                className="accent-cyan-500"
              />
              <span>Enable High Reasoning Depth</span>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-medium cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{loading ? "Analyzing Architecture..." : "Run Engineering Analysis"}</span>
            </button>
          </form>

          <section className="lg:col-span-7 bg-white dark:bg-[#0D1420] border border-slate-200 dark:border-slate-800/80 rounded-xl p-6 flex flex-col">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-3">
              Planned Changes & Technical Output
            </h3>
            {error && (
              <div className="mb-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-500">
                {error}
              </div>
            )}
            <div className="flex-1 bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-800 rounded-lg p-4 overflow-auto max-h-[560px]">
              {output ? (
                <pre className="text-xs font-mono whitespace-pre-wrap text-slate-800 dark:text-slate-200 leading-relaxed">
                  {output}
                </pre>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  AURIX will outline planned changes before proposing code modifications.
                </p>
              )}
            </div>
          </section>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <aside className="lg:col-span-4 bg-white dark:bg-[#0D1420] border border-slate-200 dark:border-slate-800/80 rounded-xl p-4 space-y-2 max-h-[620px] overflow-y-auto">
            <div className="px-1 pb-2 text-xs text-slate-500 dark:text-slate-400">
              Complete native Windows 10/11 x64 Python + C# WPF source tree ready to compile with build_x64.ps1 and Inno Setup.
            </div>
            {files.map((f) => (
              <button
                key={f.path}
                type="button"
                onClick={() => setActiveFile(f)}
                className={`w-full text-left p-3 rounded-lg border transition-colors cursor-pointer ${
                  activeFile?.path === f.path
                    ? "border-cyan-500/70 bg-cyan-500/5"
                    : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
                }`}
              >
                <div className="flex items-center gap-2 text-xs font-mono text-slate-900 dark:text-slate-100 truncate">
                  <FileCode className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
                  <span className="truncate">{f.path}</span>
                </div>
                <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  {f.category}
                </div>
              </button>
            ))}
          </aside>

          <section className="lg:col-span-8 bg-white dark:bg-[#0D1420] border border-slate-200 dark:border-slate-800/80 rounded-xl p-6 flex flex-col">
            {activeFile ? (
              <>
                <div className="pb-3 mb-4 border-b border-slate-200 dark:border-slate-800/80 flex items-center justify-between gap-4">
                  <div>
                    <div className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {activeFile.path}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {activeFile.description}
                    </p>
                  </div>
                  <span className="text-xs font-mono text-cyan-600 dark:text-cyan-400 shrink-0">
                    {activeFile.category}
                  </span>
                </div>
                <pre className="flex-1 bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-800 rounded-lg p-4 overflow-auto max-h-[500px] text-xs font-mono text-slate-800 dark:text-slate-200 leading-relaxed">
                  {activeFile.content}
                </pre>
              </>
            ) : (
              <p className="text-sm text-slate-500">Loading native Windows source bundle...</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
