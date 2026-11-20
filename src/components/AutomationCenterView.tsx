import React, { useCallback, useEffect, useState } from "react";
import { Bot, CircleSlash, Laptop, Play, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import type { AuditLogEntry } from "../types/aurix";

interface DesktopActionLog {
  id: string;
  action: string;
  target: string;
  status: string;
  executedIn: string;
  detail: string;
  createdAt: string;
}

interface AutomationCenterViewProps {
  auditLogs: AuditLogEntry[];
  emergencyStopActive: boolean;
  onToggleEmergencyStop: (active: boolean) => Promise<void>;
}

const PRESETS = [
  { action: "Open application", placeholder: "e.g. notepad.exe or Code" },
  { action: "Search files", placeholder: "e.g. report.pdf in Documents" },
  { action: "Open folder", placeholder: "e.g. C:\\Users\\Muheeb\\Projects" },
  { action: "Open website", placeholder: "e.g. https://amveyronix.com" },
];

/**
 * Automation Center — every desktop action passes the safety gate: the owner
 * ticks an explicit confirmation, Emergency Stop blocks execution, and the
 * result is written to the audit trail. In the browser preview actions are
 * queued for the native Windows controller instead of being executed.
 */
export function AutomationCenterView({ auditLogs, emergencyStopActive, onToggleEmergencyStop }: AutomationCenterViewProps) {
  const [logs, setLogs] = useState<DesktopActionLog[]>([]);
  const [action, setAction] = useState(PRESETS[0].action);
  const [target, setTarget] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [laptop, setLaptop] = useState<{ available: boolean; platform: string; reason: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/desktop/actions");
      const json = await res.json();
      setLogs(Array.isArray(json?.actions) ? json.actions : []);
    } catch {
      setLogs([]);
    }
    try {
      const res = await fetch("/api/laptop/status");
      setLaptop(await res.json());
    } catch {
      setLaptop(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!target.trim()) {
      setFeedback({ ok: false, text: "Describe the target of this action first." });
      return;
    }
    if (!confirmed) {
      setFeedback({ ok: false, text: "Tick the confirmation box — AURIX never runs an action you did not approve." });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/desktop/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, target: target.trim(), confirmed: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "The action was refused.");
      setFeedback({ ok: true, text: json?.entry?.detail || "Action approved and recorded." });
      setTarget("");
      setConfirmed(false);
      await load();
    } catch (err) {
      setFeedback({ ok: false, text: err instanceof Error ? err.message : "The action failed." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="nexus-panel rounded-2xl px-4 py-3.5 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <Bot className="w-4 h-4 text-[#00D9FF]" />
          <h1 className="font-display text-base font-bold tracking-wide text-white">Automation Center</h1>
          <button
            type="button"
            onClick={() => void onToggleEmergencyStop(!emergencyStopActive)}
            className={`ml-auto inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] cursor-pointer ${
              emergencyStopActive
                ? "border-rose-400 bg-rose-500 text-white"
                : "border-rose-400/40 text-rose-300 hover:bg-rose-500/10"
            }`}
          >
            <CircleSlash className="w-3.5 h-3.5" />
            {emergencyStopActive ? "Emergency stop active" : "Emergency stop"}
          </button>
        </div>
        <p className="mt-1 text-[11px] text-[#94A8B8]">
          Sensitive operations require explicit approval. When AURIX runs on your own computer these actions execute
          for real; the hosted browser preview only queues them.
        </p>
      </div>

      <div className="nexus-panel rounded-2xl px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Laptop className="w-4 h-4 text-[#00D9FF]" />
          <span className="text-[11px] font-mono uppercase tracking-[0.2em] text-[#A9C8D5]">Laptop control</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[9px] font-mono uppercase tracking-[0.12em] ${
              laptop?.available ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"
            }`}
          >
            {laptop ? (laptop.available ? `live · ${laptop.platform}` : "not on this machine") : "checking"}
          </span>
        </div>
        <p className="mt-1 text-[11px] text-[#94A8B8]">
          {laptop?.reason || "Checking whether AURIX can reach this computer…"}
        </p>
        <p className="mt-1 text-[11px] text-[#5B7185]">
          Say: “open YouTube”, “play my favourite music”, “open my company website”, “open my Downloads folder”,
          “search my laptop for report”, “edit my file notes”, “what is my company growth today”.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="nexus-panel rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-mono uppercase tracking-[0.2em] text-[#A9C8D5]">Action queue</h2>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-1 rounded-lg border border-[#00D9FF]/20 px-2 py-1 text-[10px] text-[#A9C8D5] hover:border-[#00D9FF]/50 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              Refresh
            </button>
          </div>
          <div className="mt-3 space-y-2">
            {logs.map((log) => (
              <div key={log.id} className="rounded-xl border border-[#00D9FF]/10 bg-[#0B1520]/70 px-3.5 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-white">{log.action}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[9px] font-mono uppercase tracking-[0.12em] ${
                      log.status === "blocked" || log.status === "stopped"
                        ? "bg-rose-500/15 text-rose-300"
                        : "bg-emerald-500/15 text-emerald-300"
                    }`}
                  >
                    {log.status}
                  </span>
                </div>
                <div className="mt-1 truncate text-[11px] text-[#94A8B8]">{log.target}</div>
                <div className="mt-0.5 text-[9px] font-mono uppercase tracking-[0.1em] text-[#5B7185]">
                  {log.executedIn} · {new Date(log.createdAt).toLocaleString()}
                </div>
              </div>
            ))}
            {logs.length === 0 && (
              <p className="rounded-xl border border-dashed border-[#00D9FF]/15 px-4 py-8 text-center text-[11px] text-[#5B7185]">
                No desktop actions recorded yet.
              </p>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <form onSubmit={run} className="nexus-panel rounded-2xl p-4 space-y-2.5">
            <h2 className="text-[11px] font-mono uppercase tracking-[0.2em] text-[#A9C8D5]">New approved action</h2>
            <select
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="w-full rounded-xl border border-[#00D9FF]/15 bg-[#05080D]/70 px-3 py-2 text-xs text-white outline-none focus:border-[#00D9FF]/50"
            >
              {PRESETS.map((preset) => (
                <option key={preset.action} value={preset.action}>
                  {preset.action}
                </option>
              ))}
            </select>
            <input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder={PRESETS.find((p) => p.action === action)?.placeholder}
              className="w-full rounded-xl border border-[#00D9FF]/15 bg-[#05080D]/70 px-3 py-2 text-xs text-white placeholder:text-[#5B7185] outline-none focus:border-[#00D9FF]/50"
            />
            <label className="flex items-start gap-2 rounded-xl border border-[#00D9FF]/15 px-3 py-2 text-[11px] text-[#94A8B8]">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 accent-[#00D9FF]"
              />
              <span>I approve this action on my machine.</span>
            </label>
            {feedback && (
              <p className={`text-[11px] ${feedback.ok ? "text-emerald-300" : "text-rose-300"}`}>{feedback.text}</p>
            )}
            <button
              type="submit"
              disabled={busy || emergencyStopActive}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#147DFF] px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-50 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              {busy ? "Submitting…" : "Queue action"}
            </button>
            {emergencyStopActive && (
              <p className="flex items-center gap-1.5 text-[10px] text-rose-300">
                <ShieldAlert className="w-3 h-3" />
                Emergency stop is active — actions are blocked.
              </p>
            )}
          </form>

          <div className="nexus-panel rounded-2xl p-4">
            <h2 className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.2em] text-[#A9C8D5]">
              <ShieldCheck className="w-3.5 h-3.5 text-[#00D9FF]" />
              Recent security events
            </h2>
            <div className="mt-2 space-y-1.5">
              {auditLogs.slice(0, 5).map((entry) => (
                <div key={entry.id} className="rounded-lg bg-white/5 px-2.5 py-1.5">
                  <div className="truncate text-[10px] text-[#D6E6EE]">{entry.detail}</div>
                  <div className="text-[9px] font-mono uppercase tracking-[0.1em] text-[#5B7185]">
                    {entry.eventType} · {new Date(entry.createdAt).toLocaleTimeString()}
                  </div>
                </div>
              ))}
              {auditLogs.length === 0 && <p className="text-[11px] text-[#5B7185]">No events logged yet.</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
