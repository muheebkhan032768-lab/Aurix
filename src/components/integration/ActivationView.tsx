import React, { useState } from "react";
import { AlertTriangle, Chrome, Download, Lock, Mail, PlayCircle, RefreshCw, ShieldCheck, MonitorUp } from "lucide-react";
import type { BiometricSnapshot } from "../../types/aurix";

interface ActivationViewProps {
  snapshot: BiometricSnapshot;
  onRefresh: () => Promise<void>;
  onRequestAuth: () => void;
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-white/10 bg-[#05080D]/50 px-3 py-2.5">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 accent-[#00D9FF]" />
      <span className="min-w-0">
        <span className="block text-[11px] font-medium text-white">{label}</span>
        <span className="block text-[10px] leading-relaxed text-muted-ink">{hint}</span>
      </span>
    </label>
  );
}

export function ActivationView({ snapshot, onRefresh, onRequestAuth }: ActivationViewProps) {
  const { activation, settings } = snapshot;
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const save = async (patch: Partial<typeof settings>) => {
    setBusy("settings");
    try {
      const res = await fetch("/api/biometrics/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...settings, ...patch }),
      });
      if (res.ok) {
        setMessage("Activation preferences saved.");
        await onRefresh();
      } else {
        setMessage("Activation preferences were not saved.");
      }
    } finally {
      setBusy(null);
    }
  };

  const simulate = async (source: "chrome" | "gmail") => {
    setBusy(source);
    setMessage(null);
    try {
      const res = await fetch("/api/activation/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source,
          detail: source === "gmail" ? "Gmail opened in Chrome (test signal from DEX MADE)" : "Google Chrome started (test signal from DEX MADE)",
        }),
      });
      const data = await res.json();
      await onRefresh();
      if (data.action === "authenticate") {
        setMessage("DEX MADE is locked — the owner verification gate was requested.");
        onRequestAuth();
      } else if (data.action === "session_active") {
        setMessage("Session already verified — no repeated verification was requested.");
      } else if (data.action === "setup_required") {
        setMessage("Detected — but no owner face, voice or PIN is configured yet, so DEX MADE cannot verify anyone. Set up Personal Authentication first.");
      } else {
        setMessage("Detection is disabled in settings, so the signal was ignored.");
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <section className="nexus-panel rounded-2xl p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.22em] text-accent">
              <Chrome className="h-3.5 w-3.5" /> Automatic activation
            </div>
            <h1 className="mt-1 font-display text-lg font-bold tracking-wide text-slate-900 dark:text-white">Chrome & Gmail Activation</h1>
            <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-slate-600 dark:text-[#94A8B8]">
              DEX MADE records when Chrome starts or Gmail opens. If the personal session is locked, that only <em>requests</em> verification — the owner still has to pass face or voice. Opening Gmail never proves identity.
            </p>
          </div>
          <a
            href="/api/activation/extension.zip"
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#0B63D6] px-3 py-2 text-[11px] font-semibold text-white hover:bg-[#2E8DFF]"
          >
            <Download className="h-3.5 w-3.5" /> Download extension (.zip)
          </a>
        </div>

        {activation.pending && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-amber-400/35 bg-amber-400/10 px-3 py-2.5 text-[11px] text-amber-200">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span className="flex-1">
              Pending: {activation.pending.source === "gmail" ? "Gmail was opened" : "Chrome activity"} — {activation.pending.detail}
            </span>
            <button type="button" onClick={onRequestAuth} className="rounded-lg bg-amber-400 px-2.5 py-1 text-[10px] font-semibold text-[#05080D] cursor-pointer">
              Verify owner now
            </button>
          </div>
        )}

        {message && <p className="mt-2 rounded-xl border border-[#00D9FF]/25 bg-[#00D9FF]/10 px-3 py-2 text-[11px] text-[#A9E8F5]">{message}</p>}

        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Toggle label="Chrome launch detection" hint="Requests verification when Chrome starts and DEX MADE is locked." checked={settings.chromeActivationEnabled} onChange={(v) => void save({ chromeActivationEnabled: v })} />
          <Toggle label="Gmail detection" hint="Requests verification when mail.google.com is opened." checked={settings.gmailActivationEnabled} onChange={(v) => void save({ gmailActivationEnabled: v })} />
          <Toggle label="Start with Windows" hint="Preference flag for the provided Windows startup script." checked={settings.autoStartWithWindows} onChange={(v) => void save({ autoStartWithWindows: v })} />
          <div className="rounded-xl border border-white/10 bg-[#05080D]/50 px-3 py-2.5 text-[10px] leading-relaxed text-muted-ink">
            Session:{" "}
            <span className={activation.session.status === "unlocked" ? "text-emerald-800 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}>
              {activation.session.status === "unlocked" ? `unlocked (${activation.session.method})` : "locked"}
            </span>
            <br />
            Locked sessions never re-verify while already unlocked.
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void simulate("chrome")} disabled={busy !== null} className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-2 text-[11px] text-slate-600 dark:text-[#A9C8D5] hover:bg-white/5 disabled:opacity-40 cursor-pointer">
            <PlayCircle className="h-3.5 w-3.5" /> {busy === "chrome" ? "Sending…" : "Test Chrome launch signal"}
          </button>
          <button type="button" onClick={() => void simulate("gmail")} disabled={busy !== null} className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-2 text-[11px] text-slate-600 dark:text-[#A9C8D5] hover:bg-white/5 disabled:opacity-40 cursor-pointer">
            <Mail className="h-3.5 w-3.5" /> {busy === "gmail" ? "Sending…" : "Test Gmail opened signal"}
          </button>
          <button type="button" onClick={() => void onRefresh()} className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-2 text-[11px] text-slate-600 dark:text-[#A9C8D5] hover:bg-white/5 cursor-pointer">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh events
          </button>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="nexus-panel rounded-2xl p-4">
          <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.18em] text-slate-600 dark:text-[#A9C8D5]">
            <Chrome className="h-3.5 w-3.5" /> Chrome bridge (required for detection)
          </div>
          <ol className="mt-2 list-decimal space-y-1 pl-4 text-[11px] leading-relaxed text-slate-600 dark:text-[#94A8B8]">
            <li>Download the extension zip above and unzip it.</li>
            <li>Open <span className="font-mono text-slate-600 dark:text-[#A9C8D5]">chrome://extensions</span> and enable Developer mode.</li>
            <li>Choose <span className="text-white">Load unpacked</span> and select the unzipped folder.</li>
            <li>Open Gmail in a new tab — the event appears in the log below.</li>
          </ol>
          <p className="mt-2 text-[10px] leading-relaxed text-muted-ink">
            The bridge sends only “Chrome started” / “Gmail opened” to the local DEX MADE server. It cannot read messages, passwords or OTPs and does not touch Google sign-in or 2-step verification.
          </p>
        </section>

        <section className="nexus-panel rounded-2xl p-4">
          <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.18em] text-slate-600 dark:text-[#A9C8D5]">
            <MonitorUp className="h-3.5 w-3.5" /> Start with Windows
          </div>
          <ol className="mt-2 list-decimal space-y-1 pl-4 text-[11px] leading-relaxed text-slate-600 dark:text-[#94A8B8]">
            <li>Open <span className="font-mono text-slate-600 dark:text-[#A9C8D5]">desktop\windows\aurix-autostart.ps1</span> and set your DEX MADE folder.</li>
            <li>Press <span className="font-mono text-slate-600 dark:text-[#A9C8D5]">Win+R</span>, run <span className="font-mono text-slate-600 dark:text-[#A9C8D5]">shell:startup</span>.</li>
            <li>Put a shortcut to the script in that folder.</li>
          </ol>
          <p className="mt-2 text-[10px] leading-relaxed text-muted-ink">
            DEX MADE boots in a locked state with the identity gate — the personal dashboard is never shown before verification. Windows autostart is only active once that shortcut exists.
          </p>
        </section>
      </div>

      <section className="nexus-panel rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Activation event log</h2>
          <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-[0.12em] text-muted-ink">
            {activation.session.status === "unlocked" ? <ShieldCheck className="h-3 w-3 text-emerald-400" /> : <Lock className="h-3 w-3 text-amber-400" />}
            {activation.session.status}
          </span>
        </div>
        <div className="mt-2 divide-y divide-white/5">
          {activation.events.length === 0 && <p className="py-4 text-[11px] text-muted-ink">No activation events recorded yet.</p>}
          {activation.events.map((event) => (
            <div key={event.id} className="flex items-start justify-between gap-3 py-2">
              <div className="min-w-0">
                <div className="text-[11px] text-white">
                  <span className="font-mono uppercase tracking-[0.12em] text-muted-ink">{event.source}</span> ·{" "}
                  <span className={event.status === "authentication_required" ? "text-amber-700 dark:text-amber-300" : event.status === "ignored" ? "text-muted-ink" : "text-emerald-800 dark:text-emerald-300"}>
                    {event.status.replace(/_/g, " ")}
                  </span>
                </div>
                <div className="text-[10px] text-muted-ink">{event.detail}</div>
              </div>
              <span className="shrink-0 font-mono text-[9px] text-muted-ink">{event.createdAt.slice(0, 19).replace("T", " ")}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
