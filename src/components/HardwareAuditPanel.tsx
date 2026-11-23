import React, { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Gauge,
  HardDrive,
  MemoryStick,
  MonitorSmartphone,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import type { HardwareAuditReport, HardwareAuditStatus } from "../types/aurix";

const statusStyles: Record<HardwareAuditStatus, string> = {
  Ready: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
  Limited: "bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800",
  "Cloud-dependent": "bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800",
  "Requires setup": "bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700",
};

const verdictDot: Record<"pass" | "warn" | "fail", string> = {
  pass: "bg-emerald-700",
  warn: "bg-amber-500",
  fail: "bg-rose-500",
};

export function HardwareAuditPanel() {
  const [report, setReport] = useState<HardwareAuditReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/system/hardware-audit");
      if (!res.ok) throw new Error(`Audit request failed (${res.status})`);
      setReport((await res.json()) as HardwareAuditReport);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Hardware audit unavailable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="bg-white dark:bg-[#0F1724] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-ink dark:text-slate-400">
            <Gauge className="w-4 h-4 text-accent" />
            <span>Phase 1 · Hardware &amp; Environment Audit</span>
          </div>
          <h2 className="mt-1 text-lg font-bold text-[#202938] dark:text-white">Hardware Compatibility Report</h2>
          <p className="mt-1 text-xs text-muted-ink dark:text-slate-400">
            Measured live from the machine running DEX MADE — every figure below is read from the host, none are estimated.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {report && (
            <span
              className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border ${
                report.isWindowsHost
                  ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
                  : "bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800"
              }`}
            >
              Source: {report.isWindowsHost ? "Windows host" : `${report.machine.osLabel} container`}
            </span>
          )}
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:border-[#10B981] text-xs font-medium text-[#202938] dark:text-slate-200 cursor-pointer whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Re-run audit</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 p-3 text-xs text-rose-700 dark:text-rose-300">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!report && loading && (
        <p className="mt-6 text-xs text-muted-ink dark:text-slate-400">Probing CPU, memory, GPU and storage…</p>
      )}

      {report && (
        <div className="mt-5 space-y-6">
          {/* Score + verdict */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B1220] p-4">
              <div className="text-xs text-muted-ink dark:text-slate-400">Compatibility score</div>
              <div className="mt-1 flex items-end gap-2">
                <span className="font-mono text-3xl font-bold tabular-nums text-positive">{report.score}</span>
                <span className="pb-1 text-xs text-muted-ink dark:text-slate-400">/ 100 · {report.tier}</span>
              </div>
              <div className="mt-2 h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                <div className="h-full rounded-full bg-[#047857]" style={{ width: `${report.score}%` }} />
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B1220] p-4">
              <div className="text-xs text-muted-ink dark:text-slate-400">Recommended performance mode</div>
              <div className="mt-1 font-mono text-lg font-bold text-[#202938] dark:text-white">{report.performanceMode}</div>
              <div className="mt-1 text-[11px] text-muted-ink dark:text-slate-400">
                Cloud intelligence mode {report.cloudModeAvailable ? "available (key configured)" : "unlocks once a cloud key is stored"}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B1220] p-4">
              <div className="text-xs text-muted-ink dark:text-slate-400">Selected local model</div>
              <div className="mt-1 text-sm font-bold text-[#202938] dark:text-white">{report.recommendedLocalModel.label}</div>
              <div className="mt-1 text-[11px] text-muted-ink dark:text-slate-400">
                ~{report.recommendedLocalModel.approxSizeGb} GB · {report.recommendedLocalModel.rationale}
              </div>
            </div>
          </div>

          {/* Measured machine */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {[
              {
                icon: <Cpu className="w-4 h-4 text-accent" />,
                label: "Processor",
                value: report.machine.cpuModel,
                detail: `${report.machine.physicalCores ?? "?"} physical · ${report.machine.logicalCores} logical cores`,
              },
              {
                icon: <MemoryStick className="w-4 h-4 text-accent" />,
                label: "Memory",
                value: `${report.machine.installedRamGb} GB installed`,
                detail: `${report.machine.freeRamGb} GB free right now`,
              },
              {
                icon: <Sparkles className="w-4 h-4 text-accent" />,
                label: "Graphics",
                value: report.machine.gpuName ?? "No GPU probe available",
                detail: `${report.machine.gpuKind}${report.machine.gpuVramGb ? ` · ${report.machine.gpuVramGb} GB VRAM` : ""}`,
              },
              {
                icon: <HardDrive className="w-4 h-4 text-accent" />,
                label: "Storage",
                value: `${report.machine.diskFreeGb} GB free`,
                detail: `of ${report.machine.diskTotalGb} GB · ${report.machine.arch}`,
              },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-slate-200 dark:border-slate-800 p-4">
                <div className="flex items-center gap-2 text-xs text-muted-ink dark:text-slate-400">
                  {item.icon}
                  <span>{item.label}</span>
                </div>
                <div className="mt-1.5 text-sm font-bold text-[#202938] dark:text-white break-words">{item.value}</div>
                <div className="mt-1 text-[11px] text-muted-ink dark:text-slate-400">{item.detail}</div>
              </div>
            ))}
          </div>

          {/* Architecture decision */}
          <div className="rounded-xl border border-cyan-200 dark:border-cyan-900 bg-cyan-50/60 dark:bg-cyan-950/20 p-5">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-accent">
              <MonitorSmartphone className="w-4 h-4" />
              Selected AI architecture
            </div>
            <h3 className="mt-2 text-sm font-bold text-[#202938] dark:text-white">{report.architecture.headline}</h3>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-xs text-[#334155] dark:text-slate-300">
              <p><span className="font-semibold text-[#202938] dark:text-white">Local:</span> {report.architecture.localLayer}</p>
              <p><span className="font-semibold text-[#202938] dark:text-white">Cloud:</span> {report.architecture.cloudLayer}</p>
              <p><span className="font-semibold text-[#202938] dark:text-white">Voice:</span> {report.architecture.voiceLayer}</p>
              <p><span className="font-semibold text-[#202938] dark:text-white">Vision:</span> {report.architecture.visionLayer}</p>
              <p><span className="font-semibold text-[#202938] dark:text-white">Automation:</span> {report.architecture.automationLayer}</p>
              <p><span className="font-semibold text-[#202938] dark:text-white">Storage:</span> {report.architecture.storageLayer}</p>
            </div>
            <ul className="mt-3 space-y-1 text-[11px] text-[#475569] dark:text-slate-400">
              {report.architecture.rationale.map((line) => (
                <li key={line} className="flex gap-2">
                  <span className="text-positive">▸</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Subsystem readiness */}
          <div>
            <h3 className="text-sm font-bold text-[#202938] dark:text-white">Subsystem readiness on this machine</h3>
            <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
              {report.subsystems.map((sub) => (
                <div
                  key={sub.id}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 flex flex-col gap-1.5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold text-[#202938] dark:text-white">{sub.label}</span>
                    <span className={`px-2 py-0.5 rounded-md border text-[10px] font-semibold whitespace-nowrap ${statusStyles[sub.status]}`}>
                      {sub.status}
                    </span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-muted-ink dark:text-slate-400">{sub.detail}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Checks */}
          <div>
            <h3 className="text-sm font-bold text-[#202938] dark:text-white">Environment checks</h3>
            <ul className="mt-2 space-y-1.5">
              {report.checks.map((check) => (
                <li key={check.label} className="flex items-start gap-2 text-xs">
                  {check.verdict === "pass" ? (
                    <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 text-positive shrink-0" />
                  ) : (
                    <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${verdictDot[check.verdict]}`} />
                  )}
                  <span className="text-[#202938] dark:text-slate-200 font-medium">{check.label}</span>
                  <span className="text-muted-ink dark:text-slate-400">— {check.detail}</span>
                </li>
              ))}
            </ul>
          </div>

          {report.warnings.length > 0 && (
            <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-800 dark:text-amber-300">
                <AlertTriangle className="w-4 h-4" />
                Notes from this audit
              </div>
              <ul className="mt-2 space-y-1 text-[11px] text-amber-800 dark:text-amber-200">
                {report.warnings.map((w) => (
                  <li key={w}>• {w}</li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-[10px] font-mono text-muted-ink">
            Audit generated {new Date(report.generatedAt).toLocaleString()} · host {report.machine.hostname}
          </p>
        </div>
      )}
    </div>
  );
}
