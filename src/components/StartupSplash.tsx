import React, { useEffect, useRef, useState } from "react";
import { Volume2 } from "lucide-react";
import { playProceduralStartupSound, type StartupAudioController } from "../utils/startupAudio";

interface StartupSplashProps {
  durationSeconds: number;
  soundEnabled: boolean;
  soundVolume: number;
  lightweight?: boolean;
  onComplete: () => void;
}

const NAME_LETTERS = ["D", "E", "X", " ", "M", "A", "D", "E"];
const VERSION_CHARS = ["v", "2", ".", "0"];

const BOOT_STEPS = [
  { label: "System", value: "initializing…", at: 0.2 },
  { label: "Voice system", value: "ready", at: 0.4 },
  { label: "AI core", value: "online", at: 0.62 },
  { label: "All systems", value: "operational", at: 0.82 },
];

export function StartupSplash({
  durationSeconds,
  soundEnabled,
  soundVolume,
  lightweight = false,
  onComplete,
}: StartupSplashProps) {
  const totalMs = Math.max(4000, Math.min(15000, (durationSeconds || 8) * 1000));
  const [progress, setProgress] = useState(0);
  const [exiting, setExiting] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<StartupAudioController | null>(null);
  const completedRef = useRef(false);
  const exitingRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    const start = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const elapsed = now - start;
      const pct = Math.min(1, elapsed / totalMs);
      setProgress(pct);

      if (pct >= 0.94 && !exitingRef.current) {
        exitingRef.current = true;
        setExiting(true);
      }
      if (pct >= 1 && !completedRef.current) {
        completedRef.current = true;
        onCompleteRef.current();
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [totalMs]);

  useEffect(() => {
    if (!soundEnabled) return;
    const ctrl = playProceduralStartupSound(soundVolume, durationSeconds);
    audioRef.current = ctrl;

    const checkTimer = window.setTimeout(() => {
      if (ctrl.isSuspended) {
        setAudioBlocked(true);
      }
    }, 220);

    const unlockOnGesture = async () => {
      if (audioRef.current?.isSuspended) {
        const ok = await audioRef.current.resume();
        if (ok) setAudioBlocked(false);
      }
    };

    window.addEventListener("pointerdown", unlockOnGesture, { once: true });
    window.addEventListener("keydown", unlockOnGesture, { once: true });

    return () => {
      window.clearTimeout(checkTimer);
      window.removeEventListener("pointerdown", unlockOnGesture);
      window.removeEventListener("keydown", unlockOnGesture);
      ctrl.stop();
    };
  }, [soundEnabled, soundVolume, durationSeconds]);

  // Polished Futuristic Startup Backdrop matching bright silver/cyan/emerald DEX MADE 2.0 identity
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = lightweight ? 1 : window.devicePixelRatio || 1;
    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const particleCount = lightweight ? 36 : 95;
    const particles = Array.from({ length: particleCount }, () => ({
      angle: Math.random() * Math.PI * 2,
      dist: 50 + Math.random() * Math.max(window.innerWidth, window.innerHeight) * 0.55,
      speed: 0.35 + Math.random() * 0.85,
      radius: Math.random() * 2 + 0.7,
      alpha: Math.random() * 0.7 + 0.2,
      cyan: Math.random() > 0.35,
    }));

    let raf = 0;
    const startTime = performance.now();

    const render = (now: number) => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const cx = w / 2;
      const cy = h / 2;
      const elapsedSec = (now - startTime) / 1000;
      const tNorm = Math.min(1, elapsedSec / (totalMs / 1000));

      // Clean dark-slate studio stage for glowing metallic silver & cyan emergence
      ctx.fillStyle = "#080B10";
      ctx.fillRect(0, 0, w, h);

      const impactBoost =
        tNorm >= 0.3 && tNorm <= 0.52 ? 1 + (1 - Math.abs(tNorm - 0.34) / 0.18) * 0.85 : 1;
      const auraIntensity = Math.min(1, tNorm / 0.18) * (tNorm > 0.88 ? 1 - (tNorm - 0.88) * 3 : 1);

      const grad = ctx.createRadialGradient(cx, cy, 12, cx, cy, Math.max(w, h) * 0.54);
      grad.addColorStop(0, `rgba(0, 217, 255, ${0.26 * auraIntensity * impactBoost})`);
      grad.addColorStop(0.32, `rgba(20, 125, 255, ${0.16 * auraIntensity * impactBoost})`);
      grad.addColorStop(0.65, `rgba(169, 200, 213, ${0.07 * auraIntensity})`);
      grad.addColorStop(1, "rgba(5, 8, 13, 0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.strokeStyle = `rgba(0, 217, 255, ${0.14 * auraIntensity})`;
      ctx.lineWidth = 1;
      for (const rMult of [0.22, 0.36]) {
        ctx.beginPath();
        ctx.arc(cx, cy, Math.min(w, h) * rMult, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();

      if (tNorm >= 0.26 && tNorm <= 0.64) {
        const waveP = (tNorm - 0.26) / 0.38;
        const maxR = Math.max(w, h) * 0.58;
        const ringR = 28 + waveP * maxR;
        const ringAlpha = Math.max(0, (1 - waveP) * 0.85);

        ctx.beginPath();
        ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0, 217, 255, ${ringAlpha})`;
        ctx.lineWidth = 2.8 * (1 - waveP) + 0.6;
        ctx.stroke();

        if (waveP > 0.08) {
          const r2 = 18 + (waveP - 0.08) * maxR * 0.85;
          ctx.beginPath();
          ctx.arc(cx, cy, r2, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(20, 125, 255, ${ringAlpha * 0.72})`;
          ctx.lineWidth = 1.6;
          ctx.stroke();
        }
      }

      if (tNorm >= 0.28 && tNorm <= 0.9) {
        const flareAlpha =
          tNorm < 0.36 ? (tNorm - 0.28) / 0.08 : tNorm < 0.6 ? 1 - (tNorm - 0.36) * 1.4 : 0.55;
        const beam = ctx.createLinearGradient(w * 0.08, cy, w * 0.92, cy);
        beam.addColorStop(0, "rgba(0, 217, 255, 0)");
        beam.addColorStop(0.5, `rgba(103, 232, 249, ${Math.max(0, flareAlpha * 0.62)})`);
        beam.addColorStop(1, "rgba(20, 125, 255, 0)");
        ctx.fillStyle = beam;
        ctx.fillRect(w * 0.08, cy - 1, w * 0.84, 2);
      }

      const particleFade = Math.min(1, elapsedSec / 0.8);
      for (const p of particles) {
        if (tNorm < 0.3) {
          p.dist -= p.speed * 2.0;
          if (p.dist < 18) p.dist = Math.max(w, h) * 0.55;
        } else {
          p.dist += p.speed * (tNorm < 0.42 ? 4.4 : 0.8);
          if (p.dist > Math.max(w, h) * 0.65) p.dist = 30 + Math.random() * 60;
        }
        p.angle += 0.002;
        const px = cx + Math.cos(p.angle) * p.dist;
        const py = cy + Math.sin(p.angle) * p.dist * 0.72;

        ctx.beginPath();
        ctx.arc(px, py, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = p.cyan
          ? `rgba(0, 217, 255, ${p.alpha * particleFade})`
          : `rgba(20, 125, 255, ${p.alpha * 0.82 * particleFade})`;
        ctx.fill();
      }

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [totalMs, lightweight]);

  const ringOpacity = Math.max(0, Math.min(1, (progress - 0.06) / 0.14));
  const ringRotate = progress * 200;
  const sweepPct = Math.max(-25, Math.min(125, ((progress - 0.58) / 0.26) * 150 - 25));
  const showSweep = progress >= 0.56 && progress <= 0.88;
  const taglineOpacity = Math.max(0, Math.min(1, (progress - 0.68) / 0.15));
  const versionProgress = Math.max(0, Math.min(1, (progress - 0.48) / 0.12));

  return (
    <div
      className={`fixed inset-0 z-50 bg-[#080B10] flex flex-col items-center justify-center overflow-hidden select-none transition-opacity duration-500 ${
        exiting ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
      role="dialog"
      aria-label="DEX MADE Startup Sequence"
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

      {/* Center Stage: Metallic Silver DEX MADE + Cyan & Emerald 2.0 */}
      <div className="relative z-10 flex flex-col items-center justify-center px-6 text-center">
        <div
          className="mb-7 transition-transform duration-300"
          style={{
            opacity: ringOpacity,
            transform: `scale(${0.75 + ringOpacity * 0.25})`,
          }}
        >
          <svg
            viewBox="0 0 112 112"
            className="w-24 h-24 sm:w-28 sm:h-28"
            style={{ filter: "drop-shadow(0 0 22px rgba(0, 217, 255, 0.6))" }}
            fill="none"
            aria-hidden="true"
          >
            <g style={{ transformOrigin: "56px 56px", transform: `rotate(${ringRotate}deg)` }}>
              <circle cx="56" cy="56" r="53" stroke="#00D9FF" strokeOpacity="0.35" strokeWidth="1" strokeDasharray="2 5" />
              <circle cx="56" cy="56" r="50" stroke="#147DFF" strokeOpacity="0.7" strokeWidth="1.5" strokeDasharray="18 10" />
              <circle cx="56" cy="56" r="41" stroke="#00D9FF" strokeWidth="2.2" strokeDasharray="135 90" />
            </g>
            <path
              d="M56 26L81 41V69L56 84L31 69V41L56 26Z"
              fill="none"
              stroke="url(#aurixSilverCyan)"
              strokeWidth="3.4"
              strokeLinejoin="round"
            />
            <circle cx="56" cy="55" r="7" fill="url(#aurixSilverCyan)" />
            <g className={`nexus-star ${showSweep ? "is-live" : ""}`}>
              <path d="M92 12 L94 20 L102 22 L94 24 L92 32 L90 24 L82 22 L90 20 Z" fill="#EAFBFF" fillOpacity="0.95" />
            </g>
            <defs>
              <linearGradient id="aurixSilverCyan" x1="32" y1="23" x2="80" y2="79" gradientUnits="userSpaceOnUse">
                <stop stopColor="#FFFFFF" />
                <stop offset="0.55" stopColor="#CBD5E1" />
                <stop offset="1" stopColor="#00D9FF" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        <div className="relative">
          <h1 className="font-display font-bold tracking-[0.06em] sm:tracking-[0.14em] text-4xl sm:text-6xl md:text-7xl leading-none flex items-baseline justify-center">
            <span className="inline-flex items-center">
              {NAME_LETTERS.map((ch, idx) => {
                if (ch === " ") return <span key={`sp_${idx}`} className="inline-block w-3 sm:w-5" />;
                const charStart = 0.34 + idx * 0.024;
                const p = Math.max(0, Math.min(1, (progress - charStart) / 0.11));
                const easeOut = 1 - Math.pow(1 - p, 3);
                const slamScale = 1.5 - easeOut * 0.5;
                const yShift = (1 - easeOut) * 18;
                return (
                  <span
                    key={`${ch}_${idx}`}
                    className="inline-block"
                    style={{
                      opacity: easeOut,
                      color: "#F8FAFC",
                      transform: `translateY(${yShift}px) scale(${slamScale})`,
                      textShadow:
                        "0 2px 0 #CBD5E1, 0 4px 0 #475569, 0 0 28px rgba(0, 217, 255, 0.75), 0 0 56px rgba(20, 125, 255, 0.4)",
                    }}
                  >
                    {ch}
                  </span>
                );
              })}
            </span>

            <span className="w-4 sm:w-7" />

            <span
              className="inline-flex items-center"
              style={{
                opacity: versionProgress,
                transform: `translateY(${(1 - versionProgress) * 16}px) scale(${0.82 + versionProgress * 0.18})`,
              }}
            >
              {VERSION_CHARS.map((ch, idx) => (
                <span
                  key={`v_${idx}`}
                  className="inline-block"
                  style={{
                    color: "#00D9FF",
                    textShadow:
                      "0 2px 0 #0E7490, 0 0 26px rgba(0, 217, 255, 0.9), 0 0 52px rgba(20, 125, 255, 0.55)",
                  }}
                >
                  {ch}
                </span>
              ))}
            </span>
          </h1>

          {showSweep && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 w-36 blur-md"
              style={{
                left: `${sweepPct}%`,
                background:
                  "linear-gradient(90deg, rgba(0,217,255,0) 0%, rgba(103,232,249,0.8) 50%, rgba(20,125,255,0) 100%)",
              }}
            />
          )}
        </div>

        <p
          className="mt-6 font-display text-sm sm:text-base md:text-lg font-semibold tracking-[0.42em] uppercase"
          style={{
            opacity: taglineOpacity,
            color: "#BAE6FD",
            transform: `translateY(${(1 - taglineOpacity) * 10}px)`,
            textShadow: "0 0 20px rgba(0, 217, 255, 0.75)",
          }}
        >
          PERSONAL AI ASSISTANT
        </p>

        <div className="mt-8 w-64 sm:w-80">
          <div className="h-1.5 w-full rounded-full bg-slate-800/90 overflow-hidden border border-cyan-500/35">
            <div
              className="h-full bg-gradient-to-r from-[#147DFF] via-[#00D9FF] to-[#A9C8D5] transition-[width] duration-75"
              style={{
                width: `${Math.round(progress * 100)}%`,
                boxShadow: "0 0 14px rgba(0, 217, 255, 0.85)",
              }}
            />
          </div>
          <div className="mt-2.5 text-[11px] font-mono tracking-[0.22em] text-slate-300 uppercase tabular-nums">
            Initializing DEX MADE Intelligence · {Math.round(progress * 100)}%
          </div>
        </div>

        <div className="mt-5 grid w-64 grid-cols-2 gap-x-6 gap-y-1 text-left sm:w-80">
          {BOOT_STEPS.map((step) => {
            const done = progress >= step.at;
            return (
              <div
                key={step.label}
                className="flex items-center justify-between gap-2 font-mono text-[9px] uppercase tracking-[0.16em] transition-opacity duration-500"
                style={{ opacity: done ? 1 : 0.22 }}
              >
                <span className="text-[#5B7185]">{step.label}</span>
                <span style={{ color: done ? "#2FE9C6" : "#3F5567" }}>{done ? step.value : "····"}</span>
              </div>
            );
          })}
        </div>

        <div
          className="mt-7 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.24em] text-[#7FA0B4]"
          style={{ opacity: Math.max(0, Math.min(1, (progress - 0.72) / 0.16)) }}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-[#2FE9C6] animate-pulse" aria-hidden="true" />
          Say “Hello Dex Made” to activate
        </div>
      </div>

      {soundEnabled && audioBlocked && (
        <button
          type="button"
          onClick={async () => {
            const ok = await audioRef.current?.resume();
            if (ok) setAudioBlocked(false);
          }}
          className="fixed bottom-9 left-8 z-20 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/60 text-xs font-medium text-cyan-200 transition-colors cursor-pointer"
        >
          <Volume2 className="w-3.5 h-3.5 text-cyan-300" />
          <span>Enable Startup Audio</span>
        </button>
      )}

      {/* PERMANENT BOTTOM-RIGHT AM VEYRONIX BRANDING */}
      <div className="fixed bottom-8 right-8 z-20 text-right pointer-events-none bg-slate-950/90 backdrop-blur-md border border-[#D6AD60]/60 rounded-xl px-5 py-3 shadow-[0_0_28px_rgba(6,182,212,0.22)]">
        <div className="text-[11px] sm:text-xs font-bold tracking-[0.28em] text-slate-200 uppercase">
          POWERED BY:
        </div>
        <div
          className="mt-0.5 font-display text-xl sm:text-2xl md:text-3xl font-bold tracking-[0.18em]"
          style={{
            color: "#D6AD60",
            textShadow: "0 0 16px rgba(214, 173, 96, 0.65)",
          }}
        >
          AM VEYRONIX
        </div>
        <div className="mt-1.5 ml-auto h-[2px] w-28 bg-gradient-to-r from-[#10B981] to-[#06B6D4]" />
      </div>
    </div>
  );
}
