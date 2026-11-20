import React, { useCallback, useEffect, useState } from "react";
import { Check, Copy, Cpu, RefreshCw, Wifi, WifiOff } from "lucide-react";
import type {
  AppSettings,
  LocalOllamaModelInfo,
  PerformanceMode,
  SystemTelemetry,
  ThinkingDepth,
} from "../types/aurix";

interface ModelsViewProps {
  settings: AppSettings;
  telemetry: SystemTelemetry;
  isOnline: boolean;
  onUpdateSettings: (next: AppSettings) => Promise<void>;
}

const RECOMMENDED_FREE_CATALOG = [
  { name: "qwen2.5:0.5b", minRamGb: 2, estSizeGb: 0.4, purpose: "Ultra-fast commands & low-RAM laptops (4 GB RAM)" },
  { name: "tinyllama", minRamGb: 3, estSizeGb: 0.6, purpose: "Compact offline Q&A & classification" },
  { name: "qwen2.5:1.5b", minRamGb: 4, estSizeGb: 1.1, purpose: "Balanced coding & general assistant (Recommended 4–8 GB)" },
  { name: "llama3.2:3b", minRamGb: 8, estSizeGb: 2.0, purpose: "Deeper offline reasoning & code review (8+ GB RAM)" },
];

export function ModelsView({ settings, telemetry, isOnline, onUpdateSettings }: ModelsViewProps) {
  const [localInfo, setLocalInfo] = useState<{
    ollamaReachable: boolean;
    installedRamGb: number;
    recommendedMode: string;
    hardwareSummaryNote: string;
    models: LocalOllamaModelInfo[];
  }>({
    ollamaReachable: telemetry.ollamaReachable,
    installedRamGb: telemetry.installedRamGb,
    recommendedMode: telemetry.recommendedMode,
    hardwareSummaryNote: telemetry.hardwareSummaryNote,
    models: telemetry.ollamaModels || [],
  });
  const [probing, setProbing] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  const probeLocalModels = useCallback(async () => {
    setProbing(true);
    try {
      const res = await fetch("/api/models/local");
      const json = await res.json();
      if (res.ok) setLocalInfo(json);
    } finally {
      setProbing(false);
    }
  }, []);

  useEffect(() => {
    probeLocalModels();
  }, [probeLocalModels]);

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-[#0F1724] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#64748B] dark:text-slate-400">
            {isOnline && !settings.offlineModeForced ? (
              <Wifi className="w-4 h-4 text-[#10B981]" />
            ) : (
              <WifiOff className="w-4 h-4 text-[#D6AD60]" />
            )}
            <span>
              {settings.offlineModeForced
                ? "Forced Offline Mode (Cloud Disabled)"
                : isOnline
                  ? "Hybrid Online + Local Ready"
                  : "Offline Local Engine"}
            </span>
            <span aria-hidden="true">·</span>
            <span>$0 Zero-Cost Model Architecture</span>
          </div>
          <h2 className="mt-1 text-lg font-bold text-[#202938] dark:text-white">
            Local Offline Brain, Hardware Profile &amp; Hybrid AI Router
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() =>
              onUpdateSettings({ ...settings, offlineModeForced: !settings.offlineModeForced })
            }
            className={`px-3.5 py-2 rounded-lg border text-xs font-semibold cursor-pointer whitespace-nowrap ${
              settings.offlineModeForced
                ? "bg-amber-50 dark:bg-amber-500/15 border-[#D6AD60] text-[#9A742E] dark:text-amber-300"
                : "bg-emerald-50 dark:bg-emerald-500/15 border-[#10B981] text-emerald-700 dark:text-emerald-300"
            }`}
          >
            {settings.offlineModeForced ? "Offline Mode Enforced (Switch Online)" : "Online + Offline Hybrid (Force Offline)"}
          </button>

          <button
            type="button"
            onClick={probeLocalModels}
            disabled={probing}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-[#202938] dark:text-slate-200 cursor-pointer whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${probing ? "animate-spin" : ""}`} />
            <span>Scan Ollama Local</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Hardware Adaptation & Performance Mode Selector */}
        <section className="bg-white dark:bg-[#0F1724] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-[#06B6D4]" />
              <h3 className="text-base font-bold text-[#202938] dark:text-white">
                Hardware Adaptation &amp; Performance Mode
              </h3>
            </div>
            <span className="text-xs font-mono font-semibold text-[#10B981]">
              Recommended: {localInfo.recommendedMode}
            </span>
          </div>

          <p className="text-xs text-[#64748B] dark:text-slate-400 leading-relaxed">
            {localInfo.hardwareSummaryNote}
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(
              [
                { id: "auto", label: "Auto Detect" },
                { id: "lightweight", label: "Lightweight" },
                { id: "balanced", label: "Balanced" },
                { id: "advanced", label: "Advanced" },
              ] as const
            ).map((pm) => (
              <button
                key={pm.id}
                type="button"
                onClick={() =>
                  onUpdateSettings({ ...settings, performanceMode: pm.id as PerformanceMode })
                }
                className={`px-3 py-2 rounded-lg border text-xs font-semibold cursor-pointer ${
                  settings.performanceMode === pm.id
                    ? "bg-[#10B981] border-[#10B981] text-white"
                    : "bg-[#F8FAFC] dark:bg-[#0B111B] border-slate-200 dark:border-slate-700 text-[#202938] dark:text-slate-200"
                }`}
              >
                {pm.label}
              </button>
            ))}
          </div>

          <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
            <div className="py-2.5 flex justify-between gap-4">
              <span className="text-[#64748B]">Installed System RAM</span>
              <span className="font-mono font-semibold tabular-nums text-[#202938] dark:text-white">
                {localInfo.installedRamGb} GB
              </span>
            </div>
            <div className="py-2.5 flex justify-between gap-4">
              <span className="text-[#64748B]">Ollama Local Runtime (127.0.0.1:11434)</span>
              <span
                className={`font-mono font-semibold ${
                  localInfo.ollamaReachable ? "text-[#10B981]" : "text-[#9A742E] dark:text-amber-300"
                }`}
              >
                {localInfo.ollamaReachable
                  ? `Connected (${localInfo.models.length} installed)`
                  : "Not detected on host"}
              </span>
            </div>
            <div className="py-2.5 flex justify-between gap-4">
              <span className="text-[#64748B]">SQLite Local Memory</span>
              <span className="font-mono font-semibold text-[#10B981]">Active Offline</span>
            </div>
          </div>

          {localInfo.models.length > 0 && (
            <div className="space-y-2 pt-2">
              <div className="text-xs font-semibold text-[#202938] dark:text-white">
                Detected Local Ollama Models
              </div>
              {localInfo.models.map((m) => (
                <div
                  key={m.name}
                  className="rounded-lg bg-[#F8FAFC] dark:bg-[#0B111B] border border-slate-200 dark:border-slate-800 px-3 py-2 flex items-center justify-between text-xs"
                >
                  <span className="font-mono font-semibold text-[#202938] dark:text-white">{m.name}</span>
                  <span className="font-mono text-[#64748B] tabular-nums">
                    {m.sizeGb} GB · <strong className="text-[#10B981]">{m.fit}</strong>
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Cloud Intelligence Routing + Free Recommended Pull Catalog */}
        <section className="bg-white dark:bg-[#0F1724] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4 shadow-sm">
          <h3 className="text-base font-bold text-[#202938] dark:text-white">
            Cloud Models &amp; $0 Free Local Pull Catalog
          </h3>

          <div className="space-y-2">
            {(
              [
                {
                  id: "gemini-4-hydrogen",
                  name: "Gemini 4 Hydrogen (Primary Core)",
                  desc: "Deep reasoning, multimodal OCR/vision, Search grounding.",
                },
                {
                  id: "gemini-3.1-flash-lite",
                  name: "Gemini 3.1 Flash Lite (Low-Latency)",
                  desc: "Ultra-fast responses for voice check-ins & lightweight hardware.",
                },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onUpdateSettings({ ...settings, activeModel: m.id })}
                className={`w-full text-left p-3.5 rounded-xl border transition-colors cursor-pointer ${
                  settings.activeModel === m.id
                    ? "border-[#10B981] bg-emerald-50/70 dark:bg-emerald-500/10"
                    : "border-slate-200 dark:border-slate-800 bg-[#F8FAFC] dark:bg-[#0B111B]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs text-[#202938] dark:text-white">{m.name}</span>
                  <span className="font-mono text-xs text-[#10B981] font-semibold">
                    {settings.activeModel === m.id ? "Active" : "Select"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[#64748B] dark:text-slate-400">{m.desc}</p>
              </button>
            ))}
          </div>

          <label className="block text-xs text-[#64748B] dark:text-slate-400">
            <span>Default Thinking Depth</span>
            <select
              value={settings.thinkingLevel}
              onChange={(e) =>
                onUpdateSettings({ ...settings, thinkingLevel: e.target.value as ThinkingDepth })
              }
              className="mt-1 w-full bg-[#F8FAFC] dark:bg-[#0B111B] border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-[#202938] dark:text-white"
            >
              <option value="LOW">LOW — Fastest Response</option>
              <option value="MEDIUM">MEDIUM — Balanced Daily Work</option>
              <option value="HIGH">HIGH — Engineering &amp; Architecture</option>
              <option value="XHIGH">XHIGH — Deep Multi-Document Analysis</option>
            </select>
          </label>

          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
            <div className="text-xs font-semibold text-[#202938] dark:text-white">
              Recommended $0 Free Offline Models (Run in Windows CMD after installing Ollama)
            </div>
            {RECOMMENDED_FREE_CATALOG.map((rec) => {
              const fits = localInfo.installedRamGb >= rec.minRamGb;
              const cmd = `ollama pull ${rec.name}`;
              return (
                <div
                  key={rec.name}
                  className="rounded-lg bg-[#F8FAFC] dark:bg-[#0B111B] border border-slate-200 dark:border-slate-800 p-2.5 flex items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <div className="font-mono font-semibold text-[#202938] dark:text-white">
                      {rec.name}{" "}
                      <span className={fits ? "text-[#10B981]" : "text-rose-600"}>
                        ({fits ? "Fits your RAM" : `Needs ${rec.minRamGb}+ GB RAM`})
                      </span>
                    </div>
                    <div className="text-[11px] text-[#64748B] truncate">{rec.purpose}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(cmd);
                      setCopiedCmd(rec.name);
                      setTimeout(() => setCopiedCmd(null), 1600);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F1724] text-[11px] font-mono text-[#202938] dark:text-slate-200 cursor-pointer shrink-0"
                  >
                    {copiedCmd === rec.name ? <Check className="w-3 h-3 text-[#10B981]" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedCmd === rec.name ? "Copied" : cmd}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
