import React, { useState } from "react";
import { ArrowRight, Globe, Mic, ShieldCheck, Sparkles, Terminal } from "lucide-react";
import type {
  AppSettings,
  AurixSectionId,
  CompanyProfile,
  OwnerProfile,
  ProjectRecord,
  SystemTelemetry,
  TaskItem,
  WebsiteRecord,
} from "../types/aurix";

interface HomeViewProps {
  owner: OwnerProfile;
  company: CompanyProfile;
  websites: WebsiteRecord[];
  projects: ProjectRecord[];
  tasks: TaskItem[];
  settings: AppSettings;
  telemetry: SystemTelemetry;
  isOnline: boolean;
  onNavigate: (section: AurixSectionId) => void;
  onQuickPrompt: (prompt: string) => void;
}

export function HomeView({
  owner,
  company,
  websites,
  projects,
  tasks,
  settings,
  telemetry,
  isOnline,
  onNavigate,
  onQuickPrompt,
}: HomeViewProps) {
  const [quickInput, setQuickInput] = useState("");
  const openTasks = tasks.filter((t) => t.status !== "done");
  const ramPct = Math.round((telemetry.usedMemoryBytes / telemetry.totalMemoryBytes) * 100);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickInput.trim()) return;
    onQuickPrompt(quickInput.trim());
    setQuickInput("");
  };

  return (
    <div className="space-y-8">
      {/* Central Command Hero */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-8 bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-700/80 rounded-xl p-6 sm:p-8 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-3">
              <span>{company.name}</span>
              <span aria-hidden="true">·</span>
              <span>Owner: {owner.name}</span>
              <span aria-hidden="true">·</span>
              <span>{isOnline ? "Cloud AI Connected" : "Offline Local Mode"}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">{settings.activeModel}</span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 text-balance">
              Good day, {owner.name}. AURIX intelligence is ready.
            </h1>
            <p className="mt-2 text-sm sm:text-base text-slate-600 dark:text-slate-300 max-w-2xl leading-relaxed">
              Unified workspace for {company.name} operations, isolated website architecture, voice synthesis, file vision, and native Windows desktop engineering.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-6">
            <label htmlFor="aurix-quick-command" className="sr-only">
              Ask AURIX anything
            </label>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                id="aurix-quick-command"
                type="text"
                value={quickInput}
                onChange={(e) => setQuickInput(e.target.value)}
                placeholder="Ask AURIX about AM NEXORA, code architecture, business plans, or research..."
                className="flex-1 bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-700/80 rounded-lg px-4 py-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span>Engage AURIX</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onNavigate("voice")}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700/80 hover:border-cyan-500/60 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Mic className="w-3.5 h-3.5 text-cyan-500" />
              <span>Voice Assistant ({settings.wakePhrase})</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate("developer")}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700/80 hover:border-cyan-500/60 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Terminal className="w-3.5 h-3.5 text-cyan-500" />
              <span>Developer & Windows Suite</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate("security")}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700/80 hover:border-cyan-500/60 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-cyan-500" />
              <span>Security Center</span>
            </button>
          </div>
        </div>

        {/* Core Identity Panel */}
        <div className="lg:col-span-4 bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-700/80 rounded-xl p-6 flex flex-col items-center justify-between text-center">
          <div className="w-36 h-36 rounded-full overflow-hidden border border-slate-200 dark:border-slate-700/80 bg-[#070B12] flex items-center justify-center">
            <img
              src="/src/assets/images/aurix_core_emblem_1795088206132.jpg"
              alt="AURIX precision geometric AI core"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="mt-4">
            <div className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
              AURIX Core
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Voice: {settings.voiceName} (Male) · Language: {settings.language}
            </p>
          </div>
          <div className="w-full pt-4 mt-4 border-t border-slate-200 dark:border-slate-800/80 grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">CPU Cores</div>
              <div className="font-mono text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100 mt-0.5">
                {telemetry.cpuCores}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">RAM Used</div>
              <div className="font-mono text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100 mt-0.5">
                {ramPct}%
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">HW Tier</div>
              <div className="font-mono text-sm font-semibold text-cyan-600 dark:text-cyan-400 mt-0.5">
                {telemetry.hardwareTier.split("-")[0]}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Operational KPI Row */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => onNavigate("websites")}
          className="text-left bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-700/80 hover:border-cyan-500/50 rounded-xl p-5 transition-colors cursor-pointer"
        >
          <div className="text-xs text-slate-500 dark:text-slate-400">Isolated Websites</div>
          <div className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
            {websites.length}
          </div>
          <div className="mt-1 text-xs text-cyan-600 dark:text-cyan-400">Manage domain records</div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate("projects")}
          className="text-left bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-700/80 hover:border-cyan-500/50 rounded-xl p-5 transition-colors cursor-pointer"
        >
          <div className="text-xs text-slate-500 dark:text-slate-400">Active Projects</div>
          <div className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
            {projects.filter((p) => p.status === "active").length}
          </div>
          <div className="mt-1 text-xs text-cyan-600 dark:text-cyan-400">{projects.length} total tracked</div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate("productivity")}
          className="text-left bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-700/80 hover:border-cyan-500/50 rounded-xl p-5 transition-colors cursor-pointer"
        >
          <div className="text-xs text-slate-500 dark:text-slate-400">Open Tasks</div>
          <div className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
            {openTasks.length}
          </div>
          <div className="mt-1 text-xs text-cyan-600 dark:text-cyan-400">Daily & engineering queue</div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate("company")}
          className="text-left bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-700/80 hover:border-cyan-500/50 rounded-xl p-5 transition-colors cursor-pointer"
        >
          <div className="text-xs text-slate-500 dark:text-slate-400">Company Services</div>
          <div className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
            {company.services.length}
          </div>
          <div className="mt-1 text-xs text-cyan-600 dark:text-cyan-400">{company.name} catalog</div>
        </button>
      </section>

      {/* Websites & Priority Tasks */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-700/80 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              AM VEYRONIX Website Registry
            </h2>
            <button
              type="button"
              onClick={() => onNavigate("websites")}
              className="text-xs font-medium text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer whitespace-nowrap shrink-0"
            >
              Open Website Manager
            </button>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-800/80">
            {websites.map((w) => (
              <div key={w.id} className="py-3.5 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-cyan-500 shrink-0" />
                    <span className="font-medium text-sm text-slate-900 dark:text-slate-100 truncate">
                      {w.name}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">
                    {w.activeDomain ? `Active domain: ${w.activeDomain}` : w.purpose}
                  </p>
                </div>
                <span className="text-xs font-mono text-slate-500 dark:text-slate-400 capitalize whitespace-nowrap shrink-0">
                  {w.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-5 bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-700/80 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Owner Action Queue
            </h2>
            <button
              type="button"
              onClick={() => onNavigate("productivity")}
              className="text-xs font-medium text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer whitespace-nowrap shrink-0"
            >
              View Planner
            </button>
          </div>
          {openTasks.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
              All scheduled tasks completed.
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800/80">
              {openTasks.slice(0, 5).map((t) => (
                <div key={t.id} className="py-3">
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {t.title}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="capitalize">{t.category}</span>
                    <span aria-hidden="true">·</span>
                    <span className="capitalize">{t.priority} priority</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">{t.dueDate}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
