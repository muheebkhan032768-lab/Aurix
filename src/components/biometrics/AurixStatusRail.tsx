import React from "react";
import { Camera, CameraOff, Lock, Mic, MicOff, ScanFace, ShieldCheck, Sparkles, Wifi, WifiOff } from "lucide-react";
import { useAurixRuntime } from "../../biometrics/runtime";

function Pill({
  active,
  tone,
  icon: Icon,
  label,
}: {
  active: boolean;
  tone: "emerald" | "cyan" | "amber" | "rose" | "slate";
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  const tones: Record<string, string> = {
    emerald: active ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-800 dark:text-emerald-300" : "border-white/10 bg-white/5 text-muted-ink",
    cyan: active ? "border-[#00D9FF]/40 bg-[#00D9FF]/10 text-[#7FE9FF]" : "border-white/10 bg-white/5 text-muted-ink",
    amber: active ? "border-amber-400/40 bg-amber-400/10 text-amber-700 dark:text-amber-300" : "border-white/10 bg-white/5 text-muted-ink",
    rose: active ? "border-rose-400/40 bg-rose-400/10 text-rose-300" : "border-white/10 bg-white/5 text-muted-ink",
    slate: active ? "border-white/15 bg-white/5 text-slate-600 dark:text-[#A9C8D5]" : "border-white/10 bg-white/5 text-muted-ink",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-[3px] text-[9px] font-mono uppercase tracking-[0.12em] ${tones[tone]}`}
    >
      {active && <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />}
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

/**
 * Honest live status: each pill reflects a real sensor/session fact. Nothing
 * shows a success state that did not happen.
 */
export function AurixStatusRail() {
  const runtime = useAurixRuntime();
  const cameraOn = runtime.camera === "active";
  const cameraPaused = runtime.camera === "paused";
  const micOn = runtime.mic === "active";
  const setupMode = runtime.sessionMethod === "setup";
  const verified = runtime.session === "unlocked";

  return (
    <div className="pointer-events-none fixed bottom-3 left-3 z-30 hidden max-w-[min(94vw,760px)] flex-wrap items-center gap-1.5 md:flex">
      <Pill active={runtime.serverOnline} tone={runtime.serverOnline ? "emerald" : "rose"} icon={runtime.serverOnline ? Wifi : WifiOff} label={runtime.serverOnline ? "DEX MADE online" : "DEX MADE offline"} />
      <Pill
        active={verified}
        tone={setupMode ? "slate" : verified ? "emerald" : "amber"}
        icon={verified ? ShieldCheck : Lock}
        label={setupMode ? "Setup mode" : verified ? "Owner verified" : "DEX MADE locked"}
      />
      <Pill active={cameraOn || cameraPaused} tone={cameraOn ? "rose" : "amber"} icon={cameraOn || cameraPaused ? Camera : CameraOff} label={cameraOn ? "Camera active" : cameraPaused ? "Camera paused" : "Camera off"} />
      <Pill active={micOn} tone="rose" icon={micOn ? Mic : MicOff} label={micOn ? "Microphone active" : "Microphone off"} />
      {/* Activity pills only exist while that activity is actually happening. */}
      {runtime.faceAuthActive && <Pill active tone="cyan" icon={ScanFace} label="Face auth active" />}
      {runtime.voiceAuthActive && <Pill active tone="cyan" icon={Mic} label="Voice auth active" />}
      {runtime.trainingMode && <Pill active tone="cyan" icon={Sparkles} label="Training mode active" />}
      {runtime.lastMemorySavedAt && <Pill active tone="emerald" icon={ShieldCheck} label="Memory saved" />}
    </div>
  );
}
