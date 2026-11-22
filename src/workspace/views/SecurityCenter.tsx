import React, { useEffect, useState } from "react";
import { Fingerprint, KeyRound, Lock, ShieldCheck, ShieldAlert, UserCheck, ScanFace, Mic2, Server } from "lucide-react";
import type { AiStatusPayload, AuditLogEntry, BiometricSnapshot, SecurityStatus } from "../../types/aurix";
import { InlineError, SectionHeader, StatCard, StatusDot, timeAgo } from "../ui";

interface SecurityCenterProps {
  security: SecurityStatus;
  auditLogs: AuditLogEntry[];
  biometrics: BiometricSnapshot | null;
  onSetPin: (pin: string) => Promise<void>;
  onUpdatePrefs: (inactivityMinutes: number, requirePinOnBoot: boolean) => Promise<void>;
  onLockNow: () => void;
  onNavigate: (id: string) => void;
}

export function SecurityCenter({ security, auditLogs, biometrics, onSetPin, onUpdatePrefs, onLockNow, onNavigate }: SecurityCenterProps) {
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [inactivity, setInactivity] = useState(security.inactivityMinutes);
  const [requireBoot, setRequireBoot] = useState(security.requirePinOnBoot);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiStatus, setAiStatus] = useState<AiStatusPayload | null>(null);
  const [savingPin, setSavingPin] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);

  useEffect(() => {
    fetch("/api/ai/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setAiStatus(data))
      .catch(() => undefined);
  }, []);

  const savePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setError(null);
    if (newPin.length < 4) {
      setError("PIN must be at least 4 characters.");
      return;
    }
    if (newPin !== confirmPin) {
      setError("The PIN confirmation does not match.");
      return;
    }
    setSavingPin(true);
    try {
      await onSetPin(newPin);
      setNewPin("");
      setConfirmPin("");
      setMessage("Personal PIN updated and hashed with a scrypt-derived key on the server.");
    } catch {
      setError("The PIN could not be saved.");
    } finally {
      setSavingPin(false);
    }
  };

  const savePrefs = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPrefs(true);
    setError(null);
    try {
      await onUpdatePrefs(inactivity, requireBoot);
      setMessage("Session lock preferences updated.");
    } catch {
      setError("Preferences could not be saved.");
    } finally {
      setSavingPrefs(false);
    }
  };

  const session = biometrics?.session;
  const faceEnrolled = biometrics?.enrollment.face.enrolled;
  const voiceEnrolled = biometrics?.enrollment.voice.enrolled;
  const securityEvents = auditLogs.filter((e) => e.severity === "security" || /AUTH|SECURITY|PIN|SESSION|LOCK/i.test(e.eventType));

  return (
    <div className="space-y-4">
      <SectionHeader
        eyebrow="Security Center"
        title="Real protection, no theatre."
        description="Local PIN authentication, server-held secrets and explicit session controls. AURIX does not claim webcam biometrics, and no credential is ever sent to the browser."
        actions={
          <button type="button" className="ws-btn" onClick={onLockNow} disabled={!security.hasPin && !faceEnrolled && !voiceEnrolled}>
            <Lock className="h-4 w-4" /> Lock session
          </button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Session" value={session?.status === "unlocked" ? "Unlocked" : session ? "Locked" : "PIN only"} hint={session?.method ? `via ${session.method}` : "Owner verification"} icon={<UserCheck className="h-4 w-4" />} />
        <StatCard label="PIN" value={security.hasPin ? "Configured" : "Not set"} hint={security.isLockedOut ? "Temporarily locked out" : `${security.failedAttempts} failed attempt(s)`} icon={<KeyRound className="h-4 w-4" />} tone="cyan" />
        <StatCard label="Auto-lock" value={`${security.inactivityMinutes} min`} hint={security.requirePinOnBoot ? "PIN required on boot" : "Boot PIN not required"} icon={<Lock className="h-4 w-4" />} />
        <StatCard label="Face / voice" value={`${faceEnrolled ? "Face" : "—"} / ${voiceEnrolled ? "Voice" : "—"}`} hint="Optional local authentication" icon={<Fingerprint className="h-4 w-4" />} tone="cyan" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <form onSubmit={savePin} className="ws-card space-y-3 p-4">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-[var(--ws-text)]">
            <KeyRound className="h-3.5 w-3.5 text-[var(--ws-accent)]" /> {security.hasPin ? "Change personal PIN" : "Set a personal PIN"}
          </h3>
          <input type="password" className="ws-input" placeholder="New PIN (minimum 4 characters)" value={newPin} onChange={(e) => setNewPin(e.target.value)} autoComplete="new-password" />
          <input type="password" className="ws-input" placeholder="Confirm new PIN" value={confirmPin} onChange={(e) => setConfirmPin(e.target.value)} autoComplete="new-password" />
          <button type="submit" className="ws-btn ws-btn-primary w-full" disabled={savingPin}>
            <ShieldCheck className="h-4 w-4" /> {savingPin ? "Saving..." : security.hasPin ? "Update PIN" : "Set PIN"}
          </button>
          <p className="text-[9.5px] leading-relaxed text-[var(--ws-muted)]">
            The PIN never leaves this device unhashed: the server stores a scrypt hash and enforces a five-attempt lockout.
          </p>
        </form>

        <form onSubmit={savePrefs} className="ws-card space-y-3 p-4">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-[var(--ws-text)]">
            <Lock className="h-3.5 w-3.5 text-[var(--ws-accent)]" /> Session policy
          </h3>
          <label className="block text-[10px] text-[var(--ws-muted)]">
            Auto-lock after inactivity
            <select className="ws-input mt-1" value={inactivity} onChange={(e) => setInactivity(Number(e.target.value))}>
              {[5, 10, 15, 30, 60, 120].map((m) => (
                <option key={m} value={m}>{m} minutes</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-[10.5px] text-[var(--ws-muted)]">
            <input type="checkbox" checked={requireBoot} onChange={(e) => setRequireBoot(e.target.checked)} className="accent-[var(--ws-accent)]" />
            Require PIN when AURIX starts
          </label>
          <button type="submit" className="ws-btn ws-btn-primary w-full" disabled={savingPrefs}>
            {savingPrefs ? "Saving..." : "Save policy"}
          </button>
          <button type="button" className="ws-btn w-full" onClick={() => onNavigate("legacy-identity")}>
            <ScanFace className="h-4 w-4" /> Personal authentication settings
          </button>
        </form>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="ws-card p-4">
          <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-[var(--ws-text)]">
            <Server className="h-3.5 w-3.5 text-[var(--ws-accent)]" /> Server-side secret status
          </h3>
          <div className="space-y-2 text-[11px]">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--ws-border)] pb-2">
              <span className="text-[var(--ws-muted)]">Gemini API key</span>
              <span className={`inline-flex items-center gap-1.5 font-mono text-[10px] ${aiStatus?.configured ? "text-[var(--ws-accent)]" : "text-[#F0729B]"}`}>
                <StatusDot state={aiStatus?.configured ? "ok" : "error"} /> {aiStatus?.configured ? "Configured on server" : "Not configured"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-[var(--ws-border)] pb-2">
              <span className="text-[var(--ws-muted)]">Browser exposure</span>
              <span className="font-mono text-[10px] text-[var(--ws-accent)]">No key in client bundle</span>
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-[var(--ws-border)] pb-2">
              <span className="text-[var(--ws-muted)]">AI connection</span>
              <span className="font-mono text-[10px] text-[var(--ws-text)]">{aiStatus?.state || "untested"}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[var(--ws-muted)]">Last AI error</span>
              <span className="max-w-[60%] truncate font-mono text-[10px] text-[var(--ws-muted)]">{aiStatus?.lastError || "None this session"}</span>
            </div>
          </div>
          <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-[var(--ws-border)] px-2.5 py-2 text-[9px] leading-relaxed text-[var(--ws-muted)]">
            <ShieldAlert className="mt-0.5 h-3 w-3 shrink-0" />
            Secrets live only in the server environment. The browser receives configuration status, never values.
          </p>
        </div>

        <div className="ws-card p-4">
          <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-[var(--ws-text)]">
            <Mic2 className="h-3.5 w-3.5 text-[var(--ws-accent)]" /> Authentication activity
          </h3>
          {biometrics?.authEvents?.length ? (
            <div className="mb-3 space-y-1.5">
              {biometrics.authEvents.slice(0, 4).map((event) => (
                <div key={event.id} className="flex items-center justify-between gap-2 text-[10px]">
                  <span className="text-[var(--ws-text)]">{event.method} · {event.outcome}</span>
                  <span className="text-[var(--ws-muted)]">{timeAgo(event.createdAt)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mb-3 text-[10px] text-[var(--ws-muted)]">No face or voice authentication events recorded.</p>
          )}
          <div className="ws-divider my-2" />
          {securityEvents.length === 0 ? (
            <p className="py-2 text-[10.5px] text-[var(--ws-muted)]">No security events recorded yet.</p>
          ) : (
            <div className="ws-scroll max-h-48 space-y-1.5 overflow-y-auto">
              {securityEvents.slice(0, 10).map((event) => (
                <div key={event.id} className="rounded-lg px-2 py-1.5 hover:bg-[var(--ws-surface-2)]">
                  <div className="text-[10.5px] text-[var(--ws-text)]">{event.detail}</div>
                  <div className="text-[9px] uppercase tracking-wide text-[var(--ws-muted)]">{event.eventType} · {timeAgo(event.createdAt)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {(message || error) && (
        <div className="ws-card p-3">
          {message && <p className="text-[11px] text-[var(--ws-accent)]">{message}</p>}
          {error && <InlineError message={error} />}
        </div>
      )}
    </div>
  );
}
