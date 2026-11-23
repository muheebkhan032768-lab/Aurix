import React, { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Camera, KeyRound, Lock, Mic, ScanFace, ShieldCheck, X } from "lucide-react";
import type { BiometricSnapshot } from "../../types/aurix";
import { useCamera, waitForVideo } from "../../biometrics/camera";
import { observeFace, runLivenessCheck, VisionError } from "../../biometrics/vision";
import { recordVoiceSample, recognizeOnce, speechRecognitionSupported, VoiceError } from "../../biometrics/voice";
import { patchRuntime } from "../../biometrics/runtime";

type Tab = "face" | "voice" | "pin";
type Phase = "idle" | "running" | "denied" | "granted" | "error";

interface AuthGateProps {
  ownerName: string;
  snapshot: BiometricSnapshot;
  pendingActivation: { source: string; detail: string } | null;
  onVerified: (method: string) => void;
  onRefresh: () => Promise<void>;
  onDismissPending: () => Promise<void>;
}

export function AuthGate({ ownerName, snapshot, pendingActivation, onVerified, onRefresh, onDismissPending }: AuthGateProps) {
  const { settings, enrollment } = snapshot;
  const camera = useCamera();
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const defaultTab: Tab =
    settings.faceEnabled && enrollment.face.enrolled
      ? "face"
      : settings.voiceEnabled && enrollment.voice.enrolled
        ? "voice"
        : snapshot.hasPin
          ? "pin"
          : "face";
  const [tab, setTab] = useState<Tab>(defaultTab);
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [details, setDetails] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);

  const [challenge, setChallenge] = useState<{ id: string; text: string } | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [pinBusy, setPinBusy] = useState(false);

  const faceReady = settings.faceEnabled && enrollment.face.enrolled;
  const voiceReady = settings.voiceEnabled && enrollment.voice.enrolled;
  const speechOk = speechRecognitionSupported();

  useEffect(() => {
    patchRuntime({ session: snapshot.session.status, sessionMethod: snapshot.session.method });
  }, [snapshot.session.status, snapshot.session.method]);

  const loadChallenge = useCallback(async () => {
    setChallenge(null);
    try {
      const res = await fetch("/api/biometrics/challenge");
      const data = await res.json();
      if (data?.id && data?.text) setChallenge({ id: data.id, text: data.text });
    } catch {
      setMessage("Could not reach the local Desk Mate challenge service.");
    }
  }, []);

  useEffect(() => {
    if (tab === "voice" && !challenge) void loadChallenge();
  }, [tab, challenge, loadChallenge]);

  const finishGranted = (method: string) => {
    setPhase("granted");
    patchRuntime({ session: "unlocked", sessionMethod: method, faceAuthActive: false, voiceAuthActive: false });
    window.setTimeout(() => onVerified(method), 850);
  };

  const runFace = async () => {
    if (phase === "running") return;
    setPhase("running");
    setMessage(null);
    setDetails([]);
    setProgress(0);
    patchRuntime({ faceAuthActive: true });
    let video: HTMLVideoElement | null = null;
    try {
      video = await camera.start();
      if (!video || !(await waitForVideo(video))) {
        throw new VisionError("no-frames", camera.error ?? "The camera did not start. Check the camera permission and try again.");
      }
      const live = await runLivenessCheck(video, 2800);
      setProgress(0.5);
      if (!live.blinkDetected) {
        setPhase("denied");
        setMessage("Liveness check failed: no blink was detected. A photo or still image cannot unlock Desk Mate. Blink once and try again.");
        return;
      }
      const observation = await observeFace(video);
      setProgress(0.8);
      const res = await fetch("/api/biometrics/verify/face", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          embedding: observation.embedding,
          geometry: observation.geometry,
          liveness: { blinkDetected: live.blinkDetected, frames: live.frames },
        }),
      });
      const result = await res.json();
      setDetails(Array.isArray(result.details) ? result.details : []);
      if (result.granted) {
        finishGranted("face");
      } else {
        setPhase("denied");
        setMessage(result.reason ?? "Face verification was rejected.");
        void onRefresh();
      }
    } catch (err) {
      setPhase("error");
      setMessage(err instanceof Error ? err.message : "Face verification failed.");
    } finally {
      camera.stop();
      patchRuntime({ faceAuthActive: false });
      setProgress(0);
    }
  };

  const runVoice = async () => {
    if (phase === "running" || !challenge) return;
    setPhase("running");
    setMessage(null);
    setDetails([]);
    setTranscript(null);
    setProgress(0);
    patchRuntime({ voiceAuthActive: true });
    try {
      const transcriptPromise = speechOk ? recognizeOnce(9000) : Promise.resolve(null);
      const sample = await recordVoiceSample(2800, setProgress);
      const spoken = await transcriptPromise;
      setTranscript(spoken);
      if (sample.voicedFrames < 20) {
        setPhase("denied");
        setMessage("Not enough speech was captured. Say the challenge phrase clearly and try again.");
        return;
      }
      if (!sample.f0) {
        setPhase("denied");
        setMessage("No clear pitch was detected in that recording. Speak at a normal volume and try again.");
        return;
      }
      const res = await fetch("/api/biometrics/verify/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frames: sample.frames, f0: sample.f0, transcript: spoken, challengeId: challenge.id }),
      });
      const result = await res.json();
      setDetails(Array.isArray(result.details) ? result.details : []);
      if (result.granted) {
        finishGranted("voice");
      } else {
        setPhase("denied");
        setMessage(result.reason ?? "Voice verification was rejected.");
        void onRefresh();
      }
    } catch (err) {
      setPhase("error");
      setMessage(
        err instanceof VoiceError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Voice verification failed."
      );
    } finally {
      patchRuntime({ voiceAuthActive: false });
      setProgress(0);
      void loadChallenge();
    }
  };

  const submitPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin.trim()) return;
    setPinBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/biometrics/session/unlock-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (data.ok) {
        setPin("");
        finishGranted("pin");
      } else {
        setPhase("denied");
        setMessage(data.error ?? "PIN verification failed.");
      }
    } finally {
      setPinBusy(false);
    }
  };

  const reset = () => {
    setPhase("idle");
    setMessage(null);
    setDetails([]);
    camera.stop();
  };

  const tabs: Array<{ id: Tab; label: string; icon: React.ComponentType<{ className?: string }>; available: boolean }> = [
    { id: "face", label: "Face", icon: ScanFace, available: faceReady },
    { id: "voice", label: "Voice", icon: Mic, available: voiceReady },
    { id: "pin", label: "Owner PIN", icon: KeyRound, available: snapshot.hasPin },
  ];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-[#05080D] bg-[radial-gradient(900px_520px_at_50%_-10%,rgba(0,217,255,0.14),transparent_65%)] p-4">
      <div className="w-full max-w-2xl space-y-4">
        <div className="nexus-panel rounded-2xl p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <img
              src="/src/assets/images/aurix_core_emblem_1795088206132.jpg"
              alt="AURIX security core"
              className="h-16 w-16 shrink-0 rounded-2xl border-2 border-[#00D9FF]/50 object-cover"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.22em] text-[#00D9FF]">
                <Lock className="h-3 w-3" /> Personal session locked
              </div>
              <h1 className="mt-1 font-display text-xl font-bold tracking-wide text-white">Desk Mate Identity Gate</h1>
              <p className="mt-1 text-[11px] leading-relaxed text-[#94A8B8]">
                Verify {ownerName || "the owner"} with face <span className="text-[#A9C8D5]">or</span> voice — one successful method opens the session. Nothing personal is shown until then.
              </p>
            </div>
          </div>

          {pendingActivation && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-400/35 bg-amber-400/10 px-3 py-2.5 text-[11px] text-amber-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div className="flex-1">
                <span className="font-semibold">{pendingActivation.source === "gmail" ? "Gmail opened in Chrome" : "Chrome activity detected"}.</span>{" "}
                {pendingActivation.detail} — verify the owner to activate Desk Mate.
              </div>
              <button type="button" onClick={() => void onDismissPending()} aria-label="Dismiss activation request" className="cursor-pointer text-amber-300 hover:text-amber-100">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <div className="mt-4 grid grid-cols-3 gap-1.5 rounded-xl border border-white/10 bg-[#05080D]/70 p-1">
            {tabs.map((entry) => {
              const Icon = entry.icon;
              const active = tab === entry.id;
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => {
                    reset();
                    setTab(entry.id);
                  }}
                  className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[11px] font-medium transition-colors cursor-pointer ${
                    active ? "bg-[#00D9FF]/15 text-white" : "text-[#7A8FA0] hover:text-white"
                  }`}
                >
                  <Icon className={`h-3.5 w-3.5 ${active ? "text-[#00D9FF]" : ""}`} />
                  {entry.label}
                  {!entry.available && <span className="text-[9px] text-[#5B7185]">off</span>}
                </button>
              );
            })}
          </div>

          {tab === "face" && (
            <div className="mt-4 space-y-3">
              <div className="relative overflow-hidden rounded-xl border border-[#00D9FF]/20 bg-black">
                <video ref={(node) => {
                  camera.videoRef.current = node;
                  videoRef.current = node;
                }} playsInline muted className="aspect-video w-full object-contain" />
                <div className="pointer-events-none absolute left-2 top-2 flex items-center gap-1.5 rounded-full bg-black/60 px-2 py-1 text-[9px] font-mono uppercase tracking-[0.14em]">
                  <span className={`h-1.5 w-1.5 rounded-full ${camera.status === "active" ? "bg-rose-400 animate-pulse" : "bg-slate-500"}`} />
                  <span className={camera.status === "active" ? "text-rose-300" : "text-slate-400"}>
                    {camera.status === "active" ? "Camera active" : camera.status === "paused" ? "Camera paused" : "Camera off"}
                  </span>
                </div>
                {camera.status !== "active" && phase !== "granted" && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/45 text-center">
                    <Camera className="h-6 w-6 text-[#00D9FF]" />
                    <p className="px-6 text-[11px] text-[#A9C8D5]">The camera opens only after you press the button below.</p>
                  </div>
                )}
                {phase === "running" && (
                  <div className="absolute inset-x-0 bottom-0 h-1 bg-white/10">
                    <div className="h-full bg-[#00D9FF] transition-all" style={{ width: `${Math.max(8, progress * 100)}%` }} />
                  </div>
                )}
              </div>

              {!faceReady ? (
                <p className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-[11px] text-amber-200">
                  {settings.faceEnabled
                    ? "No face profile is enrolled. Enroll it in Personal Authentication, or verify with voice."
                    : "Face authentication is switched off in Desk Mate settings. Use voice or the owner PIN."}
                </p>
              ) : phase === "granted" ? (
                <p className="flex items-center gap-2 rounded-xl border border-emerald-400/35 bg-emerald-400/10 px-3 py-2 text-[11px] font-semibold text-emerald-300">
                  <ShieldCheck className="h-4 w-4" /> Owner verified — unlocking Desk Mate.
                </p>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void runFace()}
                    disabled={phase === "running"}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#00D9FF] px-4 py-2.5 text-xs font-semibold text-[#05080D] hover:bg-[#33E3FF] disabled:opacity-50 cursor-pointer"
                  >
                    <ScanFace className="h-4 w-4" />
                    {phase === "running" ? "Verifying… blink once" : "Verify my face"}
                  </button>
                  <span className="text-[10px] text-[#5B7185]">Liveness: a blink is required. Photos are rejected.</span>
                </div>
              )}
            </div>
          )}

          {tab === "voice" && (
            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-[#147DFF]/25 bg-[#147DFF]/10 px-3 py-3">
                <div className="text-[9px] font-mono uppercase tracking-[0.2em] text-[#7FB6FF]">Say this challenge phrase</div>
                <p className="mt-1 text-sm font-semibold text-white">{challenge?.text ?? "Loading challenge…"}</p>
                <p className="mt-1 text-[10px] text-[#94A8B8]">
                  A fresh phrase is generated every attempt, so a recorded replay cannot pass. Only voice features are compared — the audio itself is not stored.
                </p>
              </div>

              {!voiceReady ? (
                <p className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-[11px] text-amber-200">
                  {settings.voiceEnabled
                    ? "No voice profile is enrolled. Enroll it in Personal Authentication, or verify with face."
                    : "Voice authentication is switched off in Desk Mate settings. Use face or the owner PIN."}
                </p>
              ) : !speechOk ? (
                <p className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-[11px] text-amber-200">
                  This browser has no speech recognition, so the anti-replay challenge cannot be checked. Use face verification or the owner PIN.
                </p>
              ) : phase === "granted" ? (
                <p className="flex items-center gap-2 rounded-xl border border-emerald-400/35 bg-emerald-400/10 px-3 py-2 text-[11px] font-semibold text-emerald-300">
                  <ShieldCheck className="h-4 w-4" /> Owner verified — unlocking Desk Mate.
                </p>
              ) : (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void runVoice()}
                      disabled={phase === "running" || !challenge}
                      className="inline-flex items-center gap-2 rounded-xl bg-[#147DFF] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#2E8DFF] disabled:opacity-50 cursor-pointer"
                    >
                      <Mic className="h-4 w-4" />
                      {phase === "running" ? "Listening…" : "Verify my voice"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void loadChallenge()}
                      className="rounded-xl border border-white/15 px-3 py-2 text-[11px] text-[#A9C8D5] hover:bg-white/5 cursor-pointer"
                    >
                      New phrase
                    </button>
                  </div>
                  {phase === "running" && (
                    <div className="h-1 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full bg-[#147DFF] transition-all" style={{ width: `${Math.max(6, progress * 100)}%` }} />
                    </div>
                  )}
                  {transcript && (
                    <p className="text-[10px] text-[#94A8B8]">
                      Heard: <span className="text-white">“{transcript}”</span>
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {tab === "pin" && (
            <form onSubmit={submitPin} className="mt-4 space-y-3">
              {!snapshot.hasPin ? (
                <p className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-[11px] text-amber-200">
                  No owner PIN is configured, so PIN unlock is unavailable. Verify with face or voice — Desk Mate will not accept an arbitrary PIN.
                </p>
              ) : (
                <>
                  <label className="block text-[11px] text-[#94A8B8]">
                    <span>Owner PIN (recovery method)</span>
                    <input
                      type="password"
                      value={pin}
                      autoFocus
                      onChange={(e) => setPin(e.target.value)}
                      placeholder="Enter PIN…"
                      className="mt-1 w-full rounded-xl border border-[#00D9FF]/20 bg-[#05080D]/80 px-3 py-2.5 text-center text-sm tracking-[0.3em] text-white outline-none focus:border-[#00D9FF]/60"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={pinBusy || !pin.trim()}
                    className="w-full rounded-xl bg-[#10B981] px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-50 cursor-pointer"
                  >
                    {pinBusy ? "Checking…" : "Unlock with PIN"}
                  </button>
                  <p className="text-[10px] text-[#5B7185]">
                    A PIN is only a recovery path. It does not replace biometric verification when a sensor is available.
                  </p>
                </>
              )}
            </form>
          )}

          {message && (
            <div
              className={`mt-3 rounded-xl border px-3 py-2 text-[11px] ${
                phase === "granted"
                  ? "border-emerald-400/35 bg-emerald-400/10 text-emerald-300"
                  : "border-rose-400/30 bg-rose-400/10 text-rose-200"
              }`}
            >
              {message}
            </div>
          )}

          {details.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-[10px] text-[#5B7185]">
              {details.map((line) => (
                <li key={line}>· {line}</li>
              ))}
            </ul>
          )}
        </div>

        <p className="px-2 text-center text-[10px] leading-relaxed text-[#5B7185]">
          Camera and microphone open only for the verification you start. Sensors are released the moment it ends. Biometric templates stay encrypted on this machine.
        </p>
      </div>
    </div>
  );
}
