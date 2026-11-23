import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Archive,
  CheckCircle2,
  Cpu,
  History,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Stethoscope,
  Wrench,
} from "lucide-react";
import type { SelfHealHistoryEntry, SelfHealReport, SubsystemHealthStatus } from "../types/aurix";

export function SelfHealView() {
  const [report, setReport] = useState<SelfHealReport | null>(null);
  const [historyLogs, setHistoryLogs] = useState<SelfHealHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [errorMessage, setErrorMessage] = useState("");
  const [codeContext, setCodeContext] = useState("");
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnosis, setDiagnosis] = useState<{
    rootCause: string;
    patchExplanation: string;
    repairedCode?: string;
    securityNote?: string;
    source?: string;
  } | null>(null);

  const diagnoseSectionRef = useRef<HTMLDivElement>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [statusRes, logsRes] = await Promise.all([
        fetch("/api/self-heal/status"),
        fetch("/api/self-heal/logs"),
      ]);
      const statusJson = (await statusRes.json()) as SelfHealReport;
      setReport(statusJson);
      const logsJson = (await logsRes.json()) as SelfHealHistoryEntry[];
      if (Array.isArray(logsJson)) setHistoryLogs(logsJson);
    } catch {
      // Keep UI resilient
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const runHeal = async (deepCodeScan: boolean) => {
    setScanning(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/self-heal/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deepCodeScan }),
      });
      const json = (await res.json()) as SelfHealReport;
      setReport(json);
      const logsRes = await fetch("/api/self-heal/logs");
      const logsJson = (await logsRes.json()) as SelfHealHistoryEntry[];
      if (Array.isArray(logsJson)) setHistoryLogs(logsJson);
      setFeedback(
        deepCodeScan
          ? `12-Step Deep Self-Heal completed (${json.overallStatus.toUpperCase()}).`
          : `System scan completed (${json.overallStatus.toUpperCase()}).`
      );
    } finally {
      setScanning(false);
    }
  };

  const createBackup = async () => {
    setBackingUp(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/self-heal/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Manual Owner Recovery Snapshot" }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || "Backup creation failed.");
      setFeedback(`Backup snapshot created: ${out.entry?.filename}`);
      await loadAll();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Could not create backup.");
    } finally {
      setBackingUp(false);
    }
  };

  const restoreBackup = async (id: string) => {
    setRestoringId(id);
    setFeedback(null);
    try {
      const res = await fetch("/api/self-heal/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backupId: id, id }),
      });
      const out = await res.json();
      setFeedback(out.detail || out.message || "Backup verified.");
      await loadAll();
    } finally {
      setRestoringId(null);
    }
  };

  const handleDiagnose = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!errorMessage.trim() || diagnosing) return;
    setDiagnosing(true);
    try {
      const res = await fetch("/api/self-heal/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ errorMessage, codeContext }),
      });
      const json = await res.json();
      setDiagnosis(json);
      await loadAll();
    } finally {
      setDiagnosing(false);
    }
  };

  const badgeTone = (status: SubsystemHealthStatus | string) => {
    if (status === "healthy") return "bg-emerald-50 dark:bg-emerald-700/15 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700";
    if (status === "repaired") return "bg-amber-50 dark:bg-amber-500/15 text-warn dark:text-amber-300 border-[#D6AD60]";
    if (status === "warning") return "bg-amber-50 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-300";
    return "bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-300";
  };

  const subsystemCards = report
    ? [
        { label: "Frontend UI", status: report.subsystems.frontendHealth },
        { label: "Backend API", status: report.subsystems.backendHealth },
        { label: "SQLite Database", status: report.subsystems.databaseHealth },
        { label: "Voice Engine", status: report.subsystems.voiceHealth },
        { label: "AI Provider", status: report.subsystems.aiHealth },
        { label: "File System", status: report.subsystems.filesystemHealth },
        { label: "Dependencies", status: report.subsystems.dependencyHealth },
      ]
    : [];

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F1724] p-6 shadow-sm space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-700/15 border border-emerald-200 dark:border-emerald-700 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-6 h-6 text-positive" />
            </div>
            <div>
              <div className="text-xs font-mono uppercase tracking-[0.16em] text-accent font-semibold">
                12-Step Self-Healing Architecture
              </div>
              <h1 className="text-xl font-bold text-[#202938] dark:text-white mt-0.5">
                Autonomous Watchdog &amp; Safe Patch Recovery
              </h1>
              <p className="text-xs text-muted-ink dark:text-slate-400 mt-1">
                Audits 7 subsystems, creates ZIP snapshots before deep repair, runs TypeScript verification, and automatically rolls back unsafe states.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={scanning}
              onClick={() => runHeal(false)}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B111B] hover:border-[#06B6D4] text-xs font-medium text-[#202938] dark:text-slate-200 cursor-pointer whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${scanning ? "animate-spin" : ""}`} />
              <span>Scan System</span>
            </button>
            <button
              type="button"
              onClick={() => diagnoseSectionRef.current?.scrollIntoView({ behavior: "smooth" })}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B111B] hover:border-[#D6AD60] text-xs font-medium text-[#202938] dark:text-slate-200 cursor-pointer whitespace-nowrap"
            >
              <Stethoscope className="w-3.5 h-3.5 text-accent" />
              <span>Diagnose Code</span>
            </button>
            <button
              type="button"
              disabled={backingUp}
              onClick={createBackup}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-[#D6AD60] bg-amber-50 dark:bg-amber-500/10 text-xs font-semibold text-warn dark:text-amber-300 cursor-pointer whitespace-nowrap"
            >
              <Archive className="w-3.5 h-3.5" />
              <span>{backingUp ? "Creating Snapshot..." : "Create Backup"}</span>
            </button>
            <button
              type="button"
              disabled={scanning}
              onClick={() => runHeal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#047857] hover:bg-emerald-600 text-white font-semibold text-xs cursor-pointer whitespace-nowrap"
            >
              <Wrench className="w-3.5 h-3.5" />
              <span>{scanning ? "Executing 12 Steps..." : "Repair & TypeCheck"}</span>
            </button>
          </div>
        </div>

        {feedback && (
          <div className="rounded-lg bg-emerald-50 dark:bg-emerald-700/15 border border-emerald-200 dark:border-emerald-700 px-3.5 py-2 text-xs text-emerald-800 dark:text-emerald-200 font-medium">
            {feedback}
          </div>
        )}

        {/* Top KPI Strip */}
        {report && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
            <div>
              <div className="text-[11px] text-muted-ink">Overall Status</div>
              <div className="mt-1 text-sm font-bold uppercase text-positive">{report.overallStatus}</div>
            </div>
            <div>
              <div className="text-[11px] text-muted-ink">Last Scan</div>
              <div className="mt-1 text-xs font-mono tabular-nums text-[#202938] dark:text-slate-100">
                {report.lastRunAt.slice(0, 19).replace("T", " ")}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-muted-ink">Detected</div>
              <div className="mt-1 text-sm font-mono font-bold tabular-nums text-[#202938] dark:text-white">
                {report.detectedCount}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-muted-ink">Repaired</div>
              <div className="mt-1 text-sm font-mono font-bold tabular-nums text-positive">
                {report.repairedCount}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-muted-ink">Failed</div>
              <div className="mt-1 text-sm font-mono font-bold tabular-nums text-rose-700 dark:text-rose-400">
                {report.failedCount}
              </div>
            </div>
          </div>
        )}
      </section>

      {loading || !report ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F1724] p-6 text-sm text-muted-ink">
          Running 7-subsystem diagnostic sweep...
        </div>
      ) : (
        <>
          {/* 7 Subsystem Health Grid */}
          <section className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {subsystemCards.map((sub) => (
              <div
                key={sub.label}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F1724] p-3.5 space-y-2"
              >
                <div className="text-xs font-semibold text-[#202938] dark:text-white truncate">{sub.label}</div>
                <div
                  className={`inline-block px-2 py-0.5 rounded border text-[10px] font-mono uppercase ${badgeTone(
                    sub.status
                  )}`}
                >
                  {sub.status}
                </div>
              </div>
            ))}
          </section>

          {/* 12-Step Execution Pipeline & Detected Problems */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <section className="lg:col-span-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F1724] p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-positive" />
                <h2 className="text-sm font-semibold text-[#202938] dark:text-white">
                  12-Step Autonomous Execution Pipeline
                </h2>
              </div>
              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                {report.stepTrace.map((st) => (
                  <div
                    key={st.step}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 bg-[#F8FAFC] dark:bg-[#0B111B] px-3 py-2.5 flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[#202938] dark:text-white">
                        <span className="font-mono text-accent mr-1.5">Step {st.step}.</span>
                        {st.name}
                      </div>
                      <div className="text-xs text-muted-ink dark:text-slate-400 mt-0.5">{st.detail}</div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded border text-[10px] font-mono uppercase shrink-0 ${
                        st.status === "done"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-700/15 dark:text-emerald-300 dark:border-emerald-700"
                          : st.status === "failed"
                            ? "bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300"
                            : "bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700"
                      }`}
                    >
                      {st.status}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            {/* Subsystem Detailed Checks + Problems */}
            <section className="lg:col-span-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F1724] p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-accent" />
                  <h2 className="text-sm font-semibold text-[#202938] dark:text-white">
                    Live Checks &amp; Detected Issues
                  </h2>
                </div>
                <span className="text-xs font-mono text-muted-ink tabular-nums">
                  {report.autoRepairsCount} lifetime repairs
                </span>
              </div>

              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                {report.checks.map((chk) => (
                  <div
                    key={chk.id}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 bg-[#F8FAFC] dark:bg-[#0B111B] p-3 flex items-start justify-between gap-3"
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      {chk.status === "healthy" ? (
                        <CheckCircle2 className="w-4 h-4 text-positive mt-0.5 shrink-0" />
                      ) : chk.status === "repaired" ? (
                        <Wrench className="w-4 h-4 text-[#D6AD60] mt-0.5 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-rose-700 dark:text-rose-400 mt-0.5 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-[#202938] dark:text-white">{chk.name}</div>
                        <div className="text-xs text-muted-ink dark:text-slate-400 mt-0.5 break-words">
                          {chk.detail}
                        </div>
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded border text-[10px] font-mono uppercase shrink-0 ${badgeTone(chk.status)}`}>
                      {chk.status}
                    </span>
                  </div>
                ))}

                {report.problems.length > 0 && (
                  <div className="pt-2 space-y-2">
                    <div className="text-xs font-semibold text-[#202938] dark:text-white">
                      Detected Anomaly Records
                    </div>
                    {report.problems.map((p) => (
                      <div
                        key={p.id}
                        className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50/70 dark:bg-rose-950/30 p-3 text-xs space-y-1"
                      >
                        <div className="font-semibold text-rose-800 dark:text-rose-200">{p.title}</div>
                        <div className="text-muted-ink dark:text-slate-300">Cause: {p.rootCause}</div>
                        <div className="text-[#202938] dark:text-slate-200">Plan: {p.proposedRepair}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* Backup Snapshots + Self-Heal History Logs */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <section className="lg:col-span-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F1724] p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Archive className="w-4 h-4 text-[#D6AD60]" />
                  <h2 className="text-sm font-semibold text-[#202938] dark:text-white">
                    Backup Snapshots &amp; Rollback Points
                  </h2>
                </div>
                <span className="text-xs font-mono text-muted-ink">./data/backups</span>
              </div>

              {report.backups.length === 0 ? (
                <p className="text-xs text-muted-ink">
                  No backup snapshots yet. Click &ldquo;Create Backup&rdquo; above or run Deep Self-Heal.
                </p>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-slate-800 max-h-60 overflow-y-auto">
                  {report.backups.map((b) => (
                    <div key={b.id} className="py-2.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-mono font-semibold text-[#202938] dark:text-white truncate">
                          {b.filename}
                        </div>
                        <div className="text-[11px] text-muted-ink tabular-nums">
                          {(b.sizeBytes / 1024).toFixed(1)} KB · {b.createdAt.slice(0, 19).replace("T", " ")}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={restoringId === b.id}
                        onClick={() => restoreBackup(b.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 hover:border-[#10B981] text-xs font-medium text-[#202938] dark:text-slate-200 cursor-pointer shrink-0"
                      >
                        <RotateCcw className="w-3 h-3 text-positive" />
                        <span>{restoringId === b.id ? "Checking..." : "Verify / Restore"}</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="lg:col-span-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F1724] p-5 space-y-3">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-accent" />
                <h2 className="text-sm font-semibold text-[#202938] dark:text-white">
                  Persistent Self-Heal Audit Ledger
                </h2>
              </div>

              {historyLogs.length === 0 ? (
                <p className="text-xs text-muted-ink">No recorded audit cycles yet.</p>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-slate-800 max-h-60 overflow-y-auto">
                  {historyLogs.map((entry) => (
                    <div key={entry.id} className="py-2.5 flex items-start justify-between gap-3 text-xs">
                      <div className="min-w-0">
                        <div className="font-semibold text-[#202938] dark:text-white">
                          {entry.overallStatus.toUpperCase()} · {entry.summary}
                        </div>
                        <div className="text-[11px] font-mono text-muted-ink mt-0.5 tabular-nums">
                          Detected: {entry.detectedCount} · Repaired: {entry.repairedCount} · Failed: {entry.failedCount}
                        </div>
                      </div>
                      <span className="text-[11px] font-mono text-muted-ink shrink-0 tabular-nums">
                        {entry.createdAt.slice(0, 19).replace("T", " ")}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </>
      )}

      {/* Interactive Error & Code Auto-Diagnoser */}
      <section
        ref={diagnoseSectionRef}
        className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F1724] p-5 space-y-4 shadow-sm"
      >
        <div>
          <h2 className="text-sm font-semibold text-[#202938] dark:text-white">
            AI Code &amp; Runtime Error Auto-Diagnoser (Online Gemini or Offline Engine)
          </h2>
          <p className="text-xs text-muted-ink dark:text-slate-400 mt-0.5">
            Paste any exception, stack trace, or broken code snippet — DEX MADE identifies root cause, security risk, and patched replacement code.
          </p>
        </div>

        <form onSubmit={handleDiagnose} className="space-y-3">
          <input
            type="text"
            value={errorMessage}
            onChange={(e) => setErrorMessage(e.target.value)}
            placeholder="Describe error or paste stack trace (e.g., TypeError: Cannot read properties of undefined...)"
            className="w-full rounded-xl bg-[#F8FAFC] dark:bg-[#0B111B] border border-slate-300 dark:border-slate-700 px-3.5 py-2.5 text-xs sm:text-sm text-[#202938] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#10B981]"
          />
          <textarea
            rows={4}
            value={codeContext}
            onChange={(e) => setCodeContext(e.target.value)}
            placeholder="Optional source code snippet to inspect & harden..."
            className="w-full rounded-xl bg-[#F8FAFC] dark:bg-[#0B111B] border border-slate-300 dark:border-slate-700 px-3.5 py-2.5 font-mono text-xs text-[#202938] dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#10B981]"
          />
          <button
            type="submit"
            disabled={diagnosing || !errorMessage.trim()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#047857] hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold text-xs cursor-pointer"
          >
            <Wrench className="w-3.5 h-3.5" />
            <span>{diagnosing ? "Analyzing & Generating Patch..." : "Diagnose & Generate Patch"}</span>
          </button>
        </form>

        {diagnosis && (
          <div className="rounded-xl border border-emerald-200 dark:border-emerald-700 bg-[#F8FAFC] dark:bg-[#0B111B] p-4 space-y-3 text-xs">
            <div>
              <span className="font-mono uppercase text-accent font-semibold">Root Cause:</span>
              <p className="mt-1 text-[#202938] dark:text-slate-200">{diagnosis.rootCause}</p>
            </div>
            <div>
              <span className="font-mono uppercase text-positive font-semibold">Patch Plan:</span>
              <p className="mt-1 text-[#202938] dark:text-slate-200">{diagnosis.patchExplanation}</p>
            </div>
            {diagnosis.securityNote && (
              <div>
                <span className="font-mono uppercase text-warn dark:text-[#D6AD60] font-semibold">
                  Cybersecurity Note:
                </span>
                <p className="mt-1 text-muted-ink dark:text-slate-300">{diagnosis.securityNote}</p>
              </div>
            )}
            {diagnosis.repairedCode && (
              <pre className="p-3 rounded-lg bg-slate-900 text-emerald-800 dark:text-emerald-300 font-mono text-[11px] overflow-x-auto border border-slate-700">
                {diagnosis.repairedCode}
              </pre>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
