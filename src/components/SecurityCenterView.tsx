import React, { useState } from "react";
import { KeyRound, Lock, ShieldCheck } from "lucide-react";
import type { AuditLogEntry, SecurityStatus } from "../types/aurix";

interface SecurityCenterViewProps {
  security: SecurityStatus;
  auditLogs: AuditLogEntry[];
  onSetPin: (pin: string) => Promise<void>;
  onUpdatePrefs: (inactivityMinutes: number, requirePinOnBoot: boolean) => Promise<void>;
  onLockNow: () => void;
  onResetSecurity: () => Promise<void>;
}

export function SecurityCenterView({
  security,
  auditLogs,
  onSetPin,
  onUpdatePrefs,
  onLockNow,
  onResetSecurity,
}: SecurityCenterViewProps) {
  const [newPin, setNewPin] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [confirmPin, setConfirmPin] = useState("");
  const [inactivity, setInactivity] = useState(security.inactivityMinutes);
  const [requireBoot, setRequireBoot] = useState(security.requirePinOnBoot);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const savePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    if (newPin.length < 4) {
      setErr("PIN must be at least 4 characters.");
      return;
    }
    if (newPin !== confirmPin) {
      setErr("PIN confirmation does not match.");
      return;
    }
    await onSetPin(newPin);
    setNewPin("");
    setConfirmPin("");
    setMsg("Personal PIN hashed with scrypt KDF and saved.");
  };

  const savePrefs = async (e: React.FormEvent) => {
    e.preventDefault();
    await onUpdatePrefs(inactivity, requireBoot);
    setMsg("Session lock preferences updated.");
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-[#0D1420] border border-slate-200 dark:border-slate-800/80 rounded-xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <ShieldCheck className="w-4 h-4 text-cyan-500" />
            <span>Cryptographic PIN KDF · 5-Attempt Lockout · Least-Privilege Controls</span>
          </div>
          <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
            AURIX Security Center
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Biometric Status: {security.windowsHelloStatus}
          </p>
        </div>

        <button
          type="button"
          onClick={onLockNow}
          disabled={!security.hasPin}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-40 text-white text-xs font-medium cursor-pointer whitespace-nowrap shrink-0"
        >
          <Lock className="w-4 h-4 text-cyan-400" />
          <span>{security.hasPin ? "Lock Session Now" : "Configure PIN to Enable Lock"}</span>
        </button>
      </div>

      {msg && (
        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-500">
          {msg}
        </div>
      )}
      {err && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-500">
          {err}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <form
          onSubmit={savePin}
          className="lg:col-span-6 bg-white dark:bg-[#0D1420] border border-slate-200 dark:border-slate-800/80 rounded-xl p-6 space-y-4"
        >
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-cyan-500" />
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {security.hasPin ? "Update Personal PIN" : "Create Personal Owner PIN"}
            </h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            PINs are salted and hashed server-side using scrypt (and Argon2id in the Python Windows daemon). Plaintext PINs are never stored.
          </p>

          <label className="block text-xs text-slate-500 dark:text-slate-400">
            <span>New PIN (4+ digits/characters)</span>
            <input
              type="password"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value)}
              className="mt-1 w-full bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
            />
          </label>

          <label className="block text-xs text-slate-500 dark:text-slate-400">
            <span>Confirm PIN</span>
            <input
              type="password"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value)}
              className="mt-1 w-full bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
            />
          </label>

          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium cursor-pointer"
          >
            {security.hasPin ? "Update PIN" : "Set Personal PIN"}
          </button>
        </form>

        <form
          onSubmit={savePrefs}
          className="lg:col-span-6 bg-white dark:bg-[#0D1420] border border-slate-200 dark:border-slate-800/80 rounded-xl p-6 space-y-4"
        >
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Session Locking & Biometric Policy
          </h3>

          <label className="block text-xs text-slate-500 dark:text-slate-400">
            <span>Inactivity Auto-Lock Timeout (Minutes)</span>
            <input
              type="number"
              min="1"
              max="120"
              value={inactivity}
              onChange={(e) => setInactivity(Number(e.target.value))}
              className="mt-1 w-full font-mono bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
            />
          </label>

          <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={requireBoot}
              onChange={(e) => setRequireBoot(e.target.checked)}
              className="accent-cyan-500"
            />
            <span>Require PIN verification immediately on AURIX startup</span>
          </label>

          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Face recognition never uses ordinary webcam snapshots as identity verification. Biometric face unlock runs exclusively through Windows Hello hardware (`UserConsentVerifier`) in the native Windows 10/11 desktop shell.
          </p>

          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-slate-800 text-white text-xs font-medium cursor-pointer"
          >
            Save Security Policy
          </button>
        </form>
      </div>

      {/* Security reset — recovery path when the enrolled voice/face no longer matches */}
      <section className="bg-white dark:bg-[#0D1420] border border-rose-300/60 dark:border-rose-500/30 rounded-xl p-6 space-y-3">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Reset Security System
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          Deletes the enrolled face template, voice template and PIN, and clears every lockout and
          authentication record. Use this when your enrolled voice or face no longer matches, then
          enroll again from the Identity Center. Projects, notes and memories are not touched.
        </p>
        {!confirmReset ? (
          <button
            type="button"
            onClick={() => setConfirmReset(true)}
            className="px-4 py-2 rounded-lg border border-rose-400/60 text-rose-500 hover:bg-rose-500/10 text-xs font-medium cursor-pointer"
          >
            Reset Security System
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={resetting}
              onClick={async () => {
                setResetting(true);
                setErr(null);
                try {
                  await onResetSecurity();
                  setMsg("Security system reset. Face and voice enrollment is now empty — enroll again in the Identity Center.");
                } finally {
                  setResetting(false);
                  setConfirmReset(false);
                }
              }}
              className="px-4 py-2 rounded-lg bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
            >
              {resetting ? "Resetting…" : "Yes, reset everything"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmReset(false)}
              className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        )}
      </section>

      {/* Audit Log */}
      <section className="bg-white dark:bg-[#0D1420] border border-slate-200 dark:border-slate-800/80 rounded-xl p-6">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4">
          Security & Access Audit Log
        </h3>
        <div className="divide-y divide-slate-200 dark:divide-slate-800/80 max-h-80 overflow-y-auto">
          {auditLogs.map((log) => (
            <div key={log.id} className="py-3 flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-mono text-slate-900 dark:text-slate-100">
                  [{log.severity.toUpperCase()}] {log.eventType}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{log.detail}</div>
              </div>
              <span className="text-[11px] font-mono tabular-nums text-slate-400 shrink-0">
                {log.createdAt.slice(0, 19).replace("T", " ")}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
