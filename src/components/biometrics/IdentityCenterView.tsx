import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  KeyRound,
  Lock,
  LogOut,
  Mic,
  RefreshCw,
  ScanFace,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import type { AurixSectionId, BiometricSettings, BiometricSnapshot } from "../../types/aurix";
import { useCamera, waitForVideo } from "../../biometrics/camera";
import { observeFace, preloadVisionModels, runLivenessCheck } from "../../biometrics/vision";
import { recordVoiceSample } from "../../biometrics/voice";

interface IdentityCenterViewProps {
  snapshot: BiometricSnapshot;
  ownerName: string;
  onRefresh: () => Promise<void>;
  onLockNow: () => void;
  onLogout: () => void;
  onNavigate: (section: AurixSectionId) => void;
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`nexus-panel rounded-2xl p-4 sm:p-5 ${className}`}>{children}</section>;
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-white/10 bg-[#05080D]/50 px-3 py-2.5">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 accent-[#00D9FF]" />
      <span className="min-w-0">
        <span className="block text-[11px] font-medium text-white">{label}</span>
        <span className="block text-[10px] leading-relaxed text-[#5B7185]">{hint}</span>
      </span>
    </label>
  );
}

export function IdentityCenterView({ snapshot, ownerName, onRefresh, onLockNow, onLogout, onNavigate }: IdentityCenterViewProps) {
  const camera = useCamera();
  const { settings, enrollment, session } = snapshot;
  const [draft, setDraft] = useState<BiometricSettings>(settings);
  const [message, setMessage] = useState<{ tone: "ok" | "error" | "info"; text: string } | null>(null);
  const [faceBusy, setFaceBusy] = useState(false);
  const [faceProgress, setFaceProgress] = useState("");
  const [selfCheck, setSelfCheck] = useState<number | null>(null);
  const [faceConsent, setFaceConsent] = useState(false);
  const [voiceConsent, setVoiceConsent] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceSamples, setVoiceSamples] = useState<Array<{ frames: number[][]; f0: number }>>([]);
  const [voiceProgress, setVoiceProgress] = useState(0);
  const [models, setModels] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => setDraft(settings), [settings]);

  const saveSettings = async (patch?: Partial<BiometricSettings>) => {
    setSavingSettings(true);
    try {
      const res = await fetch("/api/biometrics/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, ...patch }),
      });
      if (!res.ok) throw new Error("Settings were not saved.");
      await onRefresh();
      setMessage({ tone: "ok", text: "Identity policy saved." });
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Could not save settings." });
    } finally {
      setSavingSettings(false);
    }
  };

  const enrollFace = async () => {
    setFaceBusy(true);
    setSelfCheck(null);
    setMessage(null);
    try {
      setFaceProgress("Opening the camera…");
      const video = await camera.start();
      if (!video || !(await waitForVideo(video))) throw new Error(camera.error ?? "The camera did not start.");
      setFaceProgress("Liveness check — blink once…");
      const live = await runLivenessCheck(video, 2800);
      if (!live.blinkDetected) throw new Error("No blink detected. A live face is required for enrollment — try again and blink once.");
      const samples: Array<{ embedding: number[]; geometry: number[] }> = [];
      for (let index = 0; index < 5; index += 1) {
        setFaceProgress(`Capturing sample ${index + 1} of 5…`);
        const observation = await observeFace(video);
        samples.push({ embedding: observation.embedding, geometry: observation.geometry });
        await new Promise((resolve) => setTimeout(resolve, 380));
      }
      setFaceProgress("Encrypting and saving the template…");
      const res = await fetch("/api/biometrics/enroll/face", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ samples, consent: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Face enrollment failed.");

      // Immediate self-check so the owner can see real matching quality.
      setFaceProgress("Self-check: matching the new template…");
      const check = await observeFace(video);
      const verifyRes = await fetch("/api/biometrics/verify/face", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          embedding: check.embedding,
          geometry: check.geometry,
          liveness: { blinkDetected: live.blinkDetected, frames: live.frames },
        }),
      });
      const verifyData = await verifyRes.json();
      setSelfCheck(Number(verifyData.score ?? 0));
      setMessage({
        tone: "ok",
        text: verifyData.granted
          ? `Face profile enrolled. Self-check similarity ${Number(verifyData.score).toFixed(3)} (threshold ${Number(verifyData.threshold).toFixed(2)}).`
          : `Face profile enrolled, but the self-check scored ${Number(verifyData.score).toFixed(3)} — below your ${Number(verifyData.threshold).toFixed(2)} threshold. Re-enroll in even lighting or lower the threshold slightly.`,
      });
      await onRefresh();
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Face enrollment failed." });
    } finally {
      camera.stop();
      setFaceProgress("");
      setFaceBusy(false);
    }
  };

  const recordVoice = async () => {
    setVoiceBusy(true);
    setMessage(null);
    try {
      const sample = await recordVoiceSample(2800, setVoiceProgress);
      setVoiceProgress(0);
      if (sample.voicedFrames < 25 || !sample.f0) {
        setMessage({ tone: "error", text: "That recording was too quiet or had no measurable pitch. Say the phrase clearly and try again." });
        return;
      }
      const next = [...voiceSamples, { frames: sample.frames, f0: sample.f0 }];
      setVoiceSamples(next);
      setMessage({ tone: "info", text: `Voice sample ${next.length} of 3 captured (${sample.voicedFrames} frames).` });
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Voice recording failed." });
    } finally {
      setVoiceBusy(false);
    }
  };

  const saveVoiceProfile = async () => {
    setVoiceBusy(true);
    try {
      const res = await fetch("/api/biometrics/enroll/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ utterances: voiceSamples, phrase: draft.authPhrase, consent: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Voice enrollment failed.");
      setVoiceSamples([]);
      setMessage({ tone: "ok", text: "Voice profile enrolled. Lock AURIX and verify to test your match score." });
      await onRefresh();
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Voice enrollment failed." });
    } finally {
      setVoiceBusy(false);
    }
  };

  const deleteProfile = async (kind: "face" | "voice") => {
    const res = await fetch(`/api/biometrics/profile/${kind}`, { method: "DELETE" });
    if (res.ok) {
      setMessage({ tone: "ok", text: `${kind === "face" ? "Face" : "Voice"} template deleted from this machine.` });
      setSelfCheck(null);
      await onRefresh();
    }
  };

  const downloadModels = async () => {
    setModels("Downloading local models…");
    try {
      const result = await preloadVisionModels();
      setModels(
        `Local models ready — face ${result.face ? "✓" : "✗"}, embedder ${result.embedder ? "✓" : "✗"}, hands ${result.hand ? "✓" : "✗"}.`
      );
    } catch {
      setModels("Model preload failed. Check the server logs.");
    }
  };

  const statusLine = (label: string, ok: boolean, detail: string) => (
    <div className="flex items-start gap-2 rounded-xl border border-white/10 bg-[#05080D]/50 px-3 py-2.5">
      {ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />}
      <div className="min-w-0">
        <div className="text-[11px] font-medium text-white">{label}</div>
        <div className="text-[10px] text-[#5B7185]">{detail}</div>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.22em] text-[#00D9FF]">
              <ShieldCheck className="h-3.5 w-3.5" /> Personal authentication
            </div>
            <h1 className="mt-1 font-display text-lg font-bold tracking-wide text-white">Owner Identity & Biometrics</h1>
            <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-[#94A8B8]">
              Face <span className="text-[#A9C8D5]">or</span> voice unlocks AURIX. Templates are encrypted on this machine and matched locally by the AURIX server — they are never returned to the browser.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.12em] ${
                session.status === "unlocked"
                  ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
                  : "border-amber-400/40 bg-amber-400/10 text-amber-300"
              }`}
            >
              {session.status === "unlocked" ? <ShieldCheck className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
              {session.status === "unlocked" ? `Owner verified${session.method ? ` · ${session.method}` : ""}` : "AURIX locked"}
            </span>
            <button type="button" onClick={onLockNow} className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-1.5 text-[11px] text-[#A9C8D5] hover:bg-white/5 cursor-pointer">
              <Lock className="h-3.5 w-3.5" /> Lock now
            </button>
            <button type="button" onClick={onLogout} className="inline-flex items-center gap-1.5 rounded-xl border border-rose-400/30 px-3 py-1.5 text-[11px] text-rose-300 hover:bg-rose-500/10 cursor-pointer">
              <LogOut className="h-3.5 w-3.5" /> Log out
            </button>
          </div>
        </div>

        {message && (
          <div
            className={`mt-3 rounded-xl border px-3 py-2 text-[11px] ${
              message.tone === "ok"
                ? "border-emerald-400/35 bg-emerald-400/10 text-emerald-300"
                : message.tone === "error"
                  ? "border-rose-400/30 bg-rose-400/10 text-rose-200"
                  : "border-[#00D9FF]/25 bg-[#00D9FF]/10 text-[#A9E8F5]"
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {statusLine("Face profile", enrollment.face.enrolled, enrollment.face.enrolled ? `${enrollment.face.samples} encrypted samples` : "Not enrolled")}
          {statusLine("Voice profile", enrollment.voice.enrolled, enrollment.voice.enrolled ? `${enrollment.voice.samples} phrase recordings` : "Not enrolled")}
          {statusLine("Face method", settings.faceEnabled, settings.faceEnabled ? "Enabled" : "Switched off")}
          {statusLine("Voice method", settings.voiceEnabled, settings.voiceEnabled ? "Enabled" : "Switched off")}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="flex items-center gap-2">
            <ScanFace className="h-4 w-4 text-[#00D9FF]" />
            <h2 className="text-sm font-semibold text-white">Face recognition</h2>
          </div>
          <div className="mt-3 overflow-hidden rounded-xl border border-[#00D9FF]/20 bg-black">
            <video ref={camera.videoRef} playsInline muted className="aspect-video w-full object-contain" />
          </div>
          <div className="mt-3 flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.14em]">
            <span className={`h-1.5 w-1.5 rounded-full ${camera.status === "active" ? "bg-rose-400 animate-pulse" : "bg-slate-500"}`} />
            <span className={camera.status === "active" ? "text-rose-300" : "text-[#5B7185]"}>
              {camera.status === "active" ? "Camera active" : camera.status === "error" ? "Camera unavailable" : "Camera off"}
            </span>
          </div>
          {camera.error && <p className="mt-2 text-[11px] text-rose-300">{camera.error}</p>}
          <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-xl border border-white/10 bg-[#05080D]/50 px-3 py-2 text-[10px] leading-relaxed text-[#94A8B8]">
            <input type="checkbox" checked={faceConsent} onChange={(e) => setFaceConsent(e.target.checked)} className="mt-0.5 accent-[#00D9FF]" />
            <span>I allow AURIX to open the camera and create a face template for me on this device.</span>
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void enrollFace()}
              disabled={!faceConsent || faceBusy}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#00D9FF] px-3 py-2 text-[11px] font-semibold text-[#05080D] hover:bg-[#33E3FF] disabled:opacity-40 cursor-pointer"
            >
              <Camera className="h-3.5 w-3.5" />
              {faceBusy ? "Working…" : enrollment.face.enrolled ? "Re-enroll face" : "Enroll face"}
            </button>
            {enrollment.face.enrolled && (
              <button type="button" onClick={() => void deleteProfile("face")} className="inline-flex items-center gap-1.5 rounded-xl border border-rose-400/30 px-3 py-2 text-[11px] text-rose-300 hover:bg-rose-500/10 cursor-pointer">
                <Trash2 className="h-3.5 w-3.5" /> Delete face profile
              </button>
            )}
          </div>
          {faceProgress && <p className="mt-2 text-[11px] text-[#00D9FF]">{faceProgress}</p>}
          {selfCheck !== null && (
            <p className="mt-1 text-[10px] text-[#5B7185]">
              Last self-check similarity: <span className="text-white">{selfCheck.toFixed(3)}</span> · threshold {settings.faceThreshold.toFixed(2)}
            </p>
          )}
        </Card>

        <Card>
          <div className="flex items-center gap-2">
            <Mic className="h-4 w-4 text-[#147DFF]" />
            <h2 className="text-sm font-semibold text-white">Voice authentication</h2>
          </div>
          <label className="mt-3 block text-[11px] text-[#94A8B8]">
            <span>Authentication phrase (spoken during every verification)</span>
            <input
              value={draft.authPhrase}
              onChange={(e) => setDraft({ ...draft, authPhrase: e.target.value })}
              className="mt-1 w-full rounded-xl border border-[#147DFF]/25 bg-[#05080D]/70 px-3 py-2 text-xs text-white outline-none focus:border-[#147DFF]/60"
            />
          </label>
          <label className="mt-2 flex cursor-pointer items-start gap-2 rounded-xl border border-white/10 bg-[#05080D]/50 px-3 py-2 text-[10px] leading-relaxed text-[#94A8B8]">
            <input type="checkbox" checked={voiceConsent} onChange={(e) => setVoiceConsent(e.target.checked)} className="mt-0.5 accent-[#147DFF]" />
            <span>I allow AURIX to open the microphone and create a speaker template for me. Only MFCC features are kept — no audio recording is stored.</span>
          </label>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void recordVoice()}
              disabled={!voiceConsent || voiceBusy || voiceSamples.length >= 3}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#147DFF] px-3 py-2 text-[11px] font-semibold text-white hover:bg-[#2E8DFF] disabled:opacity-40 cursor-pointer"
            >
              <Mic className="h-3.5 w-3.5" />
              {voiceBusy ? "Listening…" : `Record sample ${Math.min(voiceSamples.length + 1, 3)} of 3`}
            </button>
            <button
              type="button"
              onClick={() => void saveVoiceProfile()}
              disabled={voiceSamples.length < 2 || voiceBusy}
              className="rounded-xl border border-[#147DFF]/40 px-3 py-2 text-[11px] text-[#9CC6FF] hover:bg-[#147DFF]/10 disabled:opacity-40 cursor-pointer"
            >
              Save voice profile
            </button>
            {enrollment.voice.enrolled && (
              <button type="button" onClick={() => void deleteProfile("voice")} className="inline-flex items-center gap-1.5 rounded-xl border border-rose-400/30 px-3 py-2 text-[11px] text-rose-300 hover:bg-rose-500/10 cursor-pointer">
                <Trash2 className="h-3.5 w-3.5" /> Delete voice profile
              </button>
            )}
          </div>
          {voiceProgress > 0 && (
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-[#147DFF]" style={{ width: `${voiceProgress * 100}%` }} />
            </div>
          )}
          <p className="mt-2 text-[10px] leading-relaxed text-[#5B7185]">
            Say the phrase the same way each time. Verification compares your vocal-tract envelope and pitch against {enrollment.voice.samples || 0} enrolled recording(s) — both stay on this machine.
          </p>
        </Card>
      </div>

      <Card>
        <h2 className="text-sm font-semibold text-white">Authentication policy</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <Toggle label="Face authentication" hint="Allow face verification to unlock AURIX." checked={draft.faceEnabled} onChange={(v) => setDraft({ ...draft, faceEnabled: v })} />
          <Toggle label="Voice authentication" hint="Allow voice verification to unlock AURIX." checked={draft.voiceEnabled} onChange={(v) => setDraft({ ...draft, voiceEnabled: v })} />
          <Toggle label="Require verification at boot" hint="AURIX starts locked and asks for the owner." checked={draft.requireBiometricOnBoot} onChange={(v) => setDraft({ ...draft, requireBiometricOnBoot: v })} />
          <Toggle label="Require challenge phrase" hint="Random phrase per attempt — replay protection for voice." checked={draft.requireChallengePhrase} onChange={(v) => setDraft({ ...draft, requireChallengePhrase: v })} />
          <Toggle label="Cloud vision labeling" hint="Send a captured image to Gemini for a suggested object name. Off = fully local." checked={draft.sendImagesToCloud} onChange={(v) => setDraft({ ...draft, sendImagesToCloud: v })} />
          <Toggle label="Start with Windows" hint="Preference flag for the desktop startup script (see Chrome & Gmail Activation)." checked={draft.autoStartWithWindows} onChange={(v) => setDraft({ ...draft, autoStartWithWindows: v })} />
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="block text-[11px] text-[#94A8B8]">
            <span>Face match threshold · {draft.faceThreshold.toFixed(2)}</span>
            <input type="range" min={0.6} max={0.98} step={0.01} value={draft.faceThreshold} onChange={(e) => setDraft({ ...draft, faceThreshold: Number(e.target.value) })} className="mt-1 w-full accent-[#00D9FF]" />
            <span className="block text-[10px] text-[#5B7185]">Higher = stricter. Tune with the self-check score above.</span>
          </label>
          <label className="block text-[11px] text-[#94A8B8]">
            <span>Voice match threshold · {draft.voiceThreshold.toFixed(2)}</span>
            <input type="range" min={0.4} max={0.95} step={0.01} value={draft.voiceThreshold} onChange={(e) => setDraft({ ...draft, voiceThreshold: Number(e.target.value) })} className="mt-1 w-full accent-[#147DFF]" />
            <span className="block text-[10px] text-[#5B7185]">Rejected attempts show their score in the event log below.</span>
          </label>
          <label className="block text-[11px] text-[#94A8B8]">
            <span>Training preview duration (seconds)</span>
            <input
              type="number"
              min={15}
              max={600}
              value={draft.trainingPreviewSeconds}
              onChange={(e) => setDraft({ ...draft, trainingPreviewSeconds: Number(e.target.value) })}
              className="mt-1 w-full rounded-xl border border-white/10 bg-[#05080D]/70 px-3 py-2 text-xs text-white outline-none focus:border-[#00D9FF]/50"
            />
            <span className="block text-[10px] text-[#5B7185]">The floating camera preview auto-minimizes after this time.</span>
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void saveSettings()}
            disabled={savingSettings}
            className="rounded-xl bg-[#10B981] px-4 py-2 text-[11px] font-semibold text-white hover:bg-emerald-600 disabled:opacity-50 cursor-pointer"
          >
            {savingSettings ? "Saving…" : "Save identity policy"}
          </button>
          <button type="button" onClick={() => void downloadModels()} className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-2 text-[11px] text-[#A9C8D5] hover:bg-white/5 cursor-pointer">
            <RefreshCw className="h-3.5 w-3.5" /> Preload local vision models
          </button>
          <button type="button" onClick={() => onNavigate("security")} className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-2 text-[11px] text-[#A9C8D5] hover:bg-white/5 cursor-pointer">
            <KeyRound className="h-3.5 w-3.5" /> PIN fallback & session timeout
          </button>
        </div>
        {models && <p className="mt-2 text-[10px] text-[#5B7185]">{models}</p>}
        <p className="mt-2 text-[10px] leading-relaxed text-[#5B7185]">
          Local models: {snapshot.models.filter((model) => model.downloaded).length} of {snapshot.models.length} downloaded.{" "}
          {snapshot.models.map((model) => `${model.name}${model.downloaded ? " ✓" : " —"}`).join(" · ")}
        </p>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-white">Verification event log</h2>
        <div className="mt-2 divide-y divide-white/5">
          {snapshot.authEvents.length === 0 && <p className="py-4 text-[11px] text-[#5B7185]">No verification attempts recorded yet.</p>}
          {snapshot.authEvents.map((event) => (
            <div key={event.id} className="flex items-start justify-between gap-3 py-2">
              <div className="min-w-0">
                <div className="text-[11px] text-white">
                  <span className="font-mono uppercase tracking-[0.12em] text-[#5B7185]">{event.method}</span> ·{" "}
                  <span className={event.outcome === "granted" ? "text-emerald-300" : "text-rose-300"}>{event.outcome}</span>
                  {event.score !== null && <span className="text-[#5B7185]"> · score {event.score.toFixed(3)}</span>}
                </div>
                <div className="text-[10px] text-[#5B7185]">{event.detail}</div>
              </div>
              <span className="shrink-0 font-mono text-[9px] text-[#5B7185]">{event.createdAt.slice(0, 19).replace("T", " ")}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
