import React, { useCallback, useEffect, useState } from "react";
import { Activity, OctagonAlert, RefreshCw, ShieldAlert, Terminal } from "lucide-react";
import type { AuditLogEntry, DesktopActionLog, SystemTelemetry } from "../types/aurix";
import { HardwareAuditPanel } from "./HardwareAuditPanel";

interface SystemMonitorViewProps {
  telemetry: SystemTelemetry;
  auditLogs: AuditLogEntry[];
  onRefreshTelemetry: () => Promise<void>;
  onLogApprovedAction: (actionLabel: string, commandPreview: string) => Promise<void>;
  onEmergencyStop: (active: boolean) => Promise<void>;
}

function formatGb(bytes: number): string {
  return (bytes / 1024 ** 3).toFixed(2);
}

export function SystemMonitorView({
  telemetry,
  auditLogs,
  onRefreshTelemetry,
  onLogApprovedAction,
  onEmergencyStop,
}: SystemMonitorViewProps) {
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState("Disk & Storage Audit");
  const [customTarget, setCustomTarget] = useState("C:\\Users\\AbdulMuheeb\\Projects");
  const [confirmed, setConfirmed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [desktopActions, setDesktopActions] = useState<DesktopActionLog[]>([]);
  const [logTab, setLogTab] = useState<"desktop" | "security">("desktop");

  const loadDesktopActions = useCallback(async () => {
    try {
      const res = await fetch("/api/desktop/actions");
      const json = await res.json();
      const list = Array.isArray(json) ? json : json?.actions;
      if (Array.isArray(list)) setDesktopActions(list);
    } catch {
      // Offline resilient
    }
  }, []);

  useEffect(() => {
    loadDesktopActions();
  }, [loadDesktopActions]);

  const ramPct = Math.round((telemetry.usedMemoryBytes / telemetry.totalMemoryBytes) * 100);
  const diskUsed = Math.max(0, telemetry.diskTotalBytes - telemetry.diskFreeBytes);
  const diskPct = telemetry.diskTotalBytes > 0 ? Math.round((diskUsed / telemetry.diskTotalBytes) * 100) : 0;

  const commandMap: Record<string, string> = {
    "Disk & Storage Audit": `Get-PSDrive -PSProvider FileSystem | Select-Object Name, Used, Free`,
    "Search Project Files": `Get-ChildItem -Path "${customTarget}" -Recurse -File | Select-Object FullName, Length`,
    "Startup Apps Review": `Get-CimInstance Win32_StartupCommand | Select-Object Name, Command, Location`,
    "Organize Downloads Folder": `python windows_native/python_core/pc_controller.py --organize-downloads`,
    "Capture Safe Screenshot": `python windows_native/python_core/pc_controller.py --screenshot`,
    "Check Windows Firewall": `netsh advfirewall show allprofiles`,
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([onRefreshTelemetry(), loadDesktopActions()]);
    } finally {
      setRefreshing(false);
    }
  };

  const approveAndLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmed) return;
    if (telemetry.emergencyStopActive) {
      setNotice("Emergency Stop is currently active. Resume normal operations first.");
      return;
    }

    const res = await fetch("/api/desktop/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: selectedPreset,
        target: customTarget,
        confirmed: true,
      }),
    });
    const out = await res.json();
    await onLogApprovedAction(selectedPreset, commandMap[selectedPreset] || selectedPreset);
    await loadDesktopActions();
    setConfirmed(false);
    setNotice(out.entry?.detail || "Action approved and recorded safely.");
    setTimeout(() => setNotice(null), 5000);
  };

  return (
    <div className="space-y-6">
      {/* Live Host Telemetry & Emergency Stop Banner */}
      <div className="bg-white dark:bg-[#0F1724] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2 text-xs text-[#64748B] dark:text-slate-400">
              <Activity className="w-4 h-4 text-[#06B6D4]" />
              <span>Live Host Runtime Telemetry · {telemetry.platform} ({telemetry.arch})</span>
            </div>
            <h2 className="mt-1 text-lg font-bold text-[#202938] dark:text-white">
              {telemetry.cpuModel}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => onEmergencyStop(!telemetry.emergencyStopActive)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                telemetry.emergencyStopActive
                  ? "bg-rose-600 hover:bg-rose-700 text-white"
                  : "border border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300"
              }`}
            >
              <OctagonAlert className="w-4 h-4" />
              <span>{telemetry.emergencyStopActive ? "Emergency Stop ENGAGED (Click to Resume)" : "Activate Emergency Stop"}</span>
            </button>

            <button
              type="button"
              onClick={refresh}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:border-[#10B981] text-xs font-medium text-[#202938] dark:text-slate-200 cursor-pointer whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-5">
          <div>
            <div className="text-xs text-[#64748B]">CPU Cores &amp; Load (1m)</div>
            <div className="mt-1 font-mono text-lg font-bold tabular-nums text-[#202938] dark:text-white">
              {telemetry.cpuCores} cores · {telemetry.loadAvg1m}
            </div>
          </div>
          <div>
            <div className="text-xs text-[#64748B]">RAM Usage</div>
            <div className="mt-1 font-mono text-lg font-bold tabular-nums text-[#202938] dark:text-white">
              {formatGb(telemetry.usedMemoryBytes)} / {telemetry.installedRamGb} GB ({ramPct}%)
            </div>
          </div>
          <div>
            <div className="text-xs text-[#64748B]">Disk Free</div>
            <div className="mt-1 font-mono text-lg font-bold tabular-nums text-[#202938] dark:text-white">
              {telemetry.diskTotalBytes > 0
                ? `${formatGb(telemetry.diskFreeBytes)} GB free (${100 - diskPct}%)`
                : "Unavailable"}
            </div>
          </div>
          <div>
            <div className="text-xs text-[#64748B]">Recommended Mode</div>
            <div className="mt-1 font-mono text-lg font-bold text-[#10B981]">
              {telemetry.recommendedMode} ({telemetry.hardwareTier})
            </div>
          </div>
        </div>

        <p className="mt-4 text-xs text-[#64748B] dark:text-slate-400">
          {telemetry.hardwareSummaryNote}
        </p>
      </div>

      <HardwareAuditPanel />

      {/* Confirmed Computer Control Builder & Desktop/Security Logs */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <form
          onSubmit={approveAndLog}
          className="lg:col-span-5 bg-white dark:bg-[#0F1724] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4 shadow-sm"
        >
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-[#06B6D4]" />
            <h3 className="text-base font-bold text-[#202938] dark:text-white">
              Windows PC Operations Builder (Permission-Gated)
            </h3>
          </div>
          <p className="text-xs text-[#64748B] dark:text-slate-400 leading-relaxed">
            In browser preview, commands are logged &amp; validated safely without touching host OS files. When installed on Windows 10/11, <code className="font-mono">pc_controller.py</code> executes whitelisted actions only with explicit owner approval.
          </p>

          <label className="block text-xs text-[#64748B]">
            <span>Operation Preset</span>
            <select
              value={selectedPreset}
              onChange={(e) => setSelectedPreset(e.target.value)}
              className="mt-1 w-full bg-[#F8FAFC] dark:bg-[#0B111B] border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-[#202938] dark:text-white"
            >
              {Object.keys(commandMap).map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>

          {selectedPreset === "Search Project Files" && (
            <label className="block text-xs text-[#64748B]">
              <span>Target Windows Path</span>
              <input
                type="text"
                value={customTarget}
                onChange={(e) => setCustomTarget(e.target.value)}
                className="mt-1 w-full font-mono bg-[#F8FAFC] dark:bg-[#0B111B] border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-[#202938] dark:text-white"
              />
            </label>
          )}

          <div className="p-3 rounded-lg bg-[#F8FAFC] dark:bg-[#0B111B] border border-slate-200 dark:border-slate-800">
            <div className="text-[11px] text-[#64748B] mb-1">Command Preview</div>
            <code className="text-xs font-mono text-cyan-700 dark:text-cyan-400 break-all">
              {commandMap[selectedPreset]}
            </code>
          </div>

          <label className="flex items-start gap-2 text-xs text-[#202938] dark:text-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 accent-[#10B981]"
            />
            <span>I confirm this operation is safe and authorize logging/executing it.</span>
          </label>

          <button
            type="submit"
            disabled={!confirmed || telemetry.emergencyStopActive}
            className="w-full py-2.5 rounded-lg bg-[#10B981] hover:bg-emerald-600 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
          >
            Approve &amp; Queue Safe Operation
          </button>

          {notice && (
            <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-300 text-xs text-emerald-800 dark:text-emerald-200">
              {notice}
            </div>
          )}
        </form>

        <section className="lg:col-span-7 bg-white dark:bg-[#0F1724] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-[#06B6D4]" />
              <h3 className="text-base font-bold text-[#202938] dark:text-white">
                Execution &amp; Security Audit Trails
              </h3>
            </div>

            <div className="inline-flex rounded-lg p-1 bg-[#EEF2F7] dark:bg-[#0B111B] border border-slate-200 dark:border-slate-800 gap-1">
              <button
                type="button"
                onClick={() => setLogTab("desktop")}
                className={`px-3 py-1 rounded text-xs font-medium cursor-pointer ${
                  logTab === "desktop" ? "bg-[#10B981] text-white font-semibold" : "text-[#64748B]"
                }`}
              >
                Desktop Actions ({desktopActions.length})
              </button>
              <button
                type="button"
                onClick={() => setLogTab("security")}
                className={`px-3 py-1 rounded text-xs font-medium cursor-pointer ${
                  logTab === "security" ? "bg-[#10B981] text-white font-semibold" : "text-[#64748B]"
                }`}
              >
                Security Audit ({auditLogs.length})
              </button>
            </div>
          </div>

          <div className="divide-y divide-slate-200 dark:divide-slate-800 max-h-[380px] overflow-y-auto">
            {logTab === "desktop" ? (
              desktopActions.length === 0 ? (
                <p className="text-xs text-[#64748B] py-4">No desktop control actions logged yet.</p>
              ) : (
                desktopActions.map((act) => (
                  <div key={act.id} className="py-3 flex items-start justify-between gap-4">
                    <div>
                      <div className="text-xs font-mono font-semibold text-[#10B981]">
                        {act.action} · {act.status.toUpperCase()} ({act.executedIn})
                      </div>
                      <div className="text-xs text-[#202938] dark:text-slate-300 mt-0.5">{act.detail}</div>
                    </div>
                    <span className="text-[11px] font-mono tabular-nums text-[#64748B] shrink-0">
                      {act.createdAt.slice(0, 19).replace("T", " ")}
                    </span>
                  </div>
                ))
              )
            ) : (
              auditLogs.slice(0, 25).map((log) => (
                <div key={log.id} className="py-3 flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xs font-mono font-semibold text-cyan-700 dark:text-cyan-400">
                      {log.eventType} · {log.actor}
                    </div>
                    <div className="text-xs text-[#202938] dark:text-slate-300 mt-0.5">{log.detail}</div>
                  </div>
                  <span className="text-[11px] font-mono tabular-nums text-[#64748B] shrink-0">
                    {log.createdAt.slice(0, 19).replace("T", " ")}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
