import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, KeyRound, Loader2, RefreshCw, ShieldCheck } from "lucide-react";

type KeyStatus = "active" | "cooldown" | "unavailable" | "missing";

interface KeyStatusRow {
  slot: number;
  envName: string;
  role: string;
  masked: string;
  duplicateOfSlot: number | null;
  status: KeyStatus;
  requests: number;
  successes: number;
  failures: number;
  lastSuccessAt: string | null;
  lastError: string | null;
  lastErrorKind: "quota" | "invalid_key" | "transient" | "model_unavailable" | "bad_request" | "other" | null;
  cooldownRemainingSeconds: number;
  modelCooldowns?: { model: string; kind: string | null; remainingSeconds: number }[];
}

interface PoolStatus {
  provider: string;
  configuredKeys: number;
  preferredModel: string | null;
  activeModel: string | null;
  lastResponseMs: number | null;
  currentKeySlot: number | null;
  currentKeyMasked: string | null;
  keys: KeyStatusRow[];
  lastSuccessfulRequestAt: string | null;
  lastError: {
    at: string;
    model: string;
    masked: string;
    kind: string;
    message: string;
  } | null;
  quota: {
    officialQuotaApiAvailable: boolean;
    note: string;
    sharedPoolSuspected: boolean;
  };
  checkedAt: string;
}

interface KeyTestResult {
  model: string;
  results: { slot: number; role: string; masked: string; ok: boolean; detail: string }[];
}

const STATUS_STYLES: Record<KeyStatus, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30" },
  cooldown: { label: "Cooling down", className: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30" },
  unavailable: { label: "Unavailable", className: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/30" },
  missing: { label: "Not configured", className: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700" },
};

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

export function ApiKeysPanel() {
  const [status, setStatus] = useState<PoolStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<KeyTestResult | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/keys");
      if (!res.ok) throw new Error("Could not read the API key status.");
      setStatus((await res.json()) as PoolStatus);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read the API key status.");
    }
  }, []);

  useEffect(() => {
    void loadStatus();
    const timer = window.setInterval(() => void loadStatus(), 15000);
    return () => window.clearInterval(timer);
  }, [loadStatus]);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/ai/keys/test", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "Key test failed.");
      setTestResult(body as KeyTestResult);
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Key test failed.");
    } finally {
      setTesting(false);
    }
  };

  const handleReset = async (slot: number) => {
    try {
      const res = await fetch(`/api/ai/keys/${slot}/reset`, { method: "POST" });
      const body = await res.json();
      if (body?.status) setStatus(body.status as PoolStatus);
    } catch {
      // The next poll picks up the real state.
    }
  };

  return (
    <section className="bg-white dark:bg-[#0F1724] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-start gap-2">
          <KeyRound className="w-4 h-4 text-[#10B981] mt-0.5" />
          <div>
            <h2 className="text-base font-bold text-[#202938] dark:text-white">
              Gemini API Key Failover
            </h2>
            <p className="text-xs text-[#64748B] dark:text-slate-400 mt-0.5">
              Five-key priority routing. Requests start on the primary key and switch automatically on quota, rate limits or provider errors.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void loadStatus()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-[#202938] dark:text-white hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {error && (
        <p className="text-xs text-rose-600 dark:text-rose-400 inline-flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" /> {error}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
          <p className="text-[11px] uppercase tracking-wide text-[#64748B]">Keys configured</p>
          <p className="text-lg font-bold text-[#202938] dark:text-white">
            {status ? `${status.configuredKeys} / 5` : "—"}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
          <p className="text-[11px] uppercase tracking-wide text-[#64748B]">Current key</p>
          <p className="text-sm font-semibold text-[#202938] dark:text-white font-mono break-all">
            {status?.currentKeyMasked
              ? `API ${status.currentKeySlot} · ${status.currentKeyMasked}`
              : "None available"}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
          <p className="text-[11px] uppercase tracking-wide text-[#64748B]">Active model</p>
          <p className="text-sm font-semibold text-[#202938] dark:text-white font-mono break-all">
            {status?.activeModel ?? status?.preferredModel ?? "—"}
          </p>
          {status?.activeModel && status.preferredModel && status.activeModel !== status.preferredModel && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
              Fallback from {status.preferredModel}
            </p>
          )}
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
          <p className="text-[11px] uppercase tracking-wide text-[#64748B]">Response time</p>
          <p className="text-sm font-semibold text-[#202938] dark:text-white tabular-nums">
            {typeof status?.lastResponseMs === "number" ? `${status.lastResponseMs} ms` : "—"}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
          <p className="text-[11px] uppercase tracking-wide text-[#64748B]">Last successful request</p>
          <p className="text-sm font-semibold text-[#202938] dark:text-white">
            {formatWhen(status?.lastSuccessfulRequestAt ?? null)}
          </p>
        </div>
      </div>

      {status?.lastError && (
        <p className="text-[11px] text-[#64748B] dark:text-slate-400">
          <span className="font-semibold text-rose-600 dark:text-rose-400">Last error</span>{" "}
          {formatWhen(status.lastError.at)} · {status.lastError.masked} · {status.lastError.model} ·{" "}
          {status.lastError.kind} — {status.lastError.message.slice(0, 160)}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="text-[11px] uppercase tracking-wide text-[#64748B]">
            <tr>
              <th className="py-2 pr-3 font-semibold">Key</th>
              <th className="py-2 pr-3 font-semibold">Identifier</th>
              <th className="py-2 pr-3 font-semibold">Status</th>
              <th className="py-2 pr-3 font-semibold">Requests</th>
              <th className="py-2 pr-3 font-semibold">Last success</th>
              <th className="py-2 font-semibold">Last provider error</th>
            </tr>
          </thead>
          <tbody>
            {(status?.keys ?? []).map((key) => {
              const style = STATUS_STYLES[key.status];
              return (
                <tr key={key.slot} className="border-t border-slate-200 dark:border-slate-800 align-top">
                  <td className="py-2.5 pr-3">
                    <p className="font-semibold text-[#202938] dark:text-white">API {key.slot}</p>
                    <p className="text-[11px] text-[#64748B]">{key.role}</p>
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-[11px] text-[#202938] dark:text-slate-300">
                    {key.masked}
                    {key.duplicateOfSlot && (
                      <p className="font-sans text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                        Same key as API {key.duplicateOfSlot}
                      </p>
                    )}
                  </td>
                  <td className="py-2.5 pr-3">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${style.className}`}>
                      {style.label}
                    </span>
                    {(key.modelCooldowns ?? []).length > 0 && (
                      <p className="text-[11px] text-[#64748B] mt-1">
                        {(key.modelCooldowns ?? [])
                          .slice(0, 2)
                          .map((c) => `${c.model}: ${Math.max(1, Math.ceil(c.remainingSeconds / 60))}m`)
                          .join(" · ")}
                      </p>
                    )}
                    {key.status !== "active" && key.status !== "missing" && (
                      <button
                        type="button"
                        onClick={() => void handleReset(key.slot)}
                        className="mt-1 text-[11px] font-semibold text-[#06B6D4] hover:underline"
                      >
                        Retry now
                      </button>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-[#202938] dark:text-slate-300">
                    {key.requests}
                    <span className="text-[11px] text-[#64748B]"> · {key.successes} ok / {key.failures} failed</span>
                  </td>
                  <td className="py-2.5 pr-3 text-[#202938] dark:text-slate-300">{formatWhen(key.lastSuccessAt)}</td>
                  <td className="py-2.5 text-[11px] text-[#64748B] max-w-[240px]">
                    {key.lastError ? (
                      <span title={key.lastError}>
                        {key.lastErrorKind ? `[${key.lastErrorKind}] ` : ""}
                        {key.lastError.slice(0, 120)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void handleTest()}
          disabled={testing}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#10B981] text-white text-xs font-semibold hover:bg-emerald-600 disabled:opacity-60"
        >
          {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
          {testing ? "Testing each key…" : "Test all keys"}
        </button>
        <p className="text-[11px] text-[#64748B]">
          Sends one tiny request per key with the active model. Full keys are never sent to the browser.
        </p>
      </div>

      {testResult && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 space-y-1.5">
          <p className="text-[11px] uppercase tracking-wide text-[#64748B]">Test results · model {testResult.model}</p>
          {testResult.results.map((r) => (
            <p key={r.slot} className="text-xs text-[#202938] dark:text-slate-300 inline-flex items-start gap-1.5">
              {r.ok ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981] mt-0.5 shrink-0" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
              )}
              <span>
                <strong>API {r.slot}</strong> ({r.masked}): {r.detail}
              </span>
            </p>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-[#F8FAFC] dark:bg-[#0B111B] p-3 space-y-1">
        <p className="text-[11px] uppercase tracking-wide text-[#64748B]">Usage &amp; quota</p>
        <p className="text-xs text-[#64748B] dark:text-slate-400">
          {status?.quota.note ??
            "Google does not expose remaining Gemini quota through the API, so only locally counted requests and detected rate limits are shown."}
        </p>
        {status?.quota.sharedPoolSuspected && (
          <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 inline-flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            Several keys hit quota at the same time — they may share one Google project quota, so switching keys adds no extra capacity.
          </p>
        )}
      </div>
    </section>
  );
}
