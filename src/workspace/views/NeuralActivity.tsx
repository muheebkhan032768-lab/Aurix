import React, { useEffect, useRef, useState } from "react";
import { Activity, BrainCircuit, Cpu, Radio, ShieldCheck } from "lucide-react";
import { useVoiceSnapshot } from "../../utils/voiceBus";
import type { AiStatusPayload, SystemTelemetry } from "../../types/aurix";
import { SectionHeader, StatCard, StatusDot } from "../ui";

interface NeuralActivityProps {
  telemetry: SystemTelemetry;
  aiStatus: AiStatusPayload | null;
  isOnline: boolean;
  activeModel: string;
}

interface Node {
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  r: number;
  phase: number;
}

export function NeuralActivity({ telemetry, aiStatus, isOnline, activeModel }: NeuralActivityProps) {
  const voice = useVoiceSnapshot();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef({ state: voice.state, level: voice.level, online: isOnline });
  const [fps, setFps] = useState(0);

  useEffect(() => {
    stateRef.current = { state: voice.state, level: voice.level, online: isOnline };
  }, [voice.state, voice.level, isOnline]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let nodes: Node[] = [];
    let frame = 0;
    let raf = 0;
    let lastFps = performance.now();
    let frames = 0;
    let pulse = 0;

    const seedNodes = () => {
      const count = Math.max(26, Math.min(46, Math.round((width * height) / 9000)));
      nodes = Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2;
        const radius = 0.18 + ((i * 37) % 30) / 100;
        return {
          x: width / 2 + Math.cos(angle) * radius * width * 0.42,
          y: height / 2 + Math.sin(angle) * radius * height * 0.4,
          baseX: width / 2 + Math.cos(angle) * radius * width * 0.42,
          baseY: height / 2 + Math.sin(angle) * radius * height * 0.4,
          r: 1.4 + ((i * 13) % 7) / 3,
          phase: i * 0.7,
        };
      });
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seedNodes();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const styles = getComputedStyle(document.documentElement);
    const accent = styles.getPropertyValue("--ws-accent").trim() || "#20C997";
    const accent2 = styles.getPropertyValue("--ws-accent-2").trim() || "#42D9E8";

    const draw = (time: number) => {
      frame += 1;
      pulse += 0.012;
      const { state, level, online } = stateRef.current;
      const energy = state === "listening" ? 0.7 + level : state === "processing" ? 0.9 : state === "speaking" ? 0.8 : 0.32;
      ctx.clearRect(0, 0, width, height);

      // Ambient glow behind the network.
      const glow = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.max(width, height) * 0.55);
      glow.addColorStop(0, `${accent}${Math.round(18 + energy * 16).toString(16).padStart(2, "0")}`);
      glow.addColorStop(1, "transparent");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);

      nodes.forEach((node, i) => {
        node.x = node.baseX + Math.sin(time * 0.0004 + node.phase) * (6 + energy * 8);
        node.y = node.baseY + Math.cos(time * 0.00035 + node.phase) * (5 + energy * 7);
        if (i === 0) return;
      });

      // Connections between nearby nodes, drawn with a slow travelling pulse.
      for (let i = 0; i < nodes.length; i += 1) {
        for (let j = i + 1; j < nodes.length; j += 1) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.hypot(dx, dy);
          if (dist > Math.min(width, height) * 0.27) continue;
          const alpha = (1 - dist / (Math.min(width, height) * 0.27)) * (0.1 + energy * 0.22);
          ctx.strokeStyle = i % 2 === 0 ? accent : accent2;
          ctx.globalAlpha = alpha;
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();

          if ((i * 7 + j * 13 + frame) % 190 < 6) {
            const t = ((pulse + i * 0.13) % 1);
            const px = a.x + (b.x - a.x) * t;
            const py = a.y + (b.y - a.y) * t;
            ctx.globalAlpha = 0.85;
            ctx.fillStyle = i % 2 === 0 ? accent2 : accent;
            ctx.beginPath();
            ctx.arc(px, py, 1.6, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      nodes.forEach((node, i) => {
        const breathing = 0.55 + Math.sin(time * 0.002 + node.phase) * 0.35;
        ctx.globalAlpha = online ? 0.55 + breathing * 0.45 : 0.25;
        ctx.fillStyle = i % 3 === 0 ? accent2 : accent;
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.r * (0.8 + energy * 0.5), 0, Math.PI * 2);
        ctx.fill();
        if (i % 5 === 0) {
          ctx.globalAlpha = 0.16 * energy;
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.r * 6, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      // Core signal ring.
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, 26 + Math.sin(time * 0.0015) * 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.3;
      ctx.strokeStyle = accent2;
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, 42 + energy * 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;

      frames += 1;
      if (time - lastFps > 1000) {
        setFps(Math.round((frames * 1000) / (time - lastFps)));
        frames = 0;
        lastFps = time;
      }
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  const stateLabel =
    voice.state === "listening"
      ? "Receiving speech"
      : voice.state === "processing"
        ? "Processing intent"
        : voice.state === "speaking"
          ? "Speaking response"
          : voice.state === "error"
            ? "Signal interrupted"
            : "Idle — listening for a command";

  return (
    <div className="space-y-4">
      <SectionHeader
        eyebrow="Neural Activity"
        title="Live reasoning map"
        description="A two-dimensional signal map of AURIX's real activity state. Every pulse follows the microphone, processing or speech state reported by the voice engine — no simulated neural telemetry."
        actions={<span className="ws-chip"><StatusDot state={isOnline ? "ok" : "warn"} /> {isOnline ? "Core online" : "Core offline"}</span>}
      />

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <div className="ws-card relative min-h-[420px] overflow-hidden p-3">
          <canvas ref={canvasRef} className="h-[400px] w-full" aria-label="Animated two-dimensional neural activity map" />
          <div className="pointer-events-none absolute left-4 top-4 flex flex-wrap gap-1.5">
            <span className="ws-chip"><Radio className="h-3 w-3" /> {stateLabel}</span>
            <span className="ws-chip">signal {Math.round((voice.level || 0) * 100)}%</span>
          </div>
          <div className="pointer-events-none absolute bottom-4 left-4 flex flex-wrap gap-1.5">
            <span className="ws-chip">{fps} fps</span>
            <span className="ws-chip">2D canvas</span>
            <span className="ws-chip">no camera</span>
          </div>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="AI state" value={aiStatus?.state === "connected" ? "Connected" : aiStatus?.state === "degraded" ? "Degraded" : aiStatus?.state === "not_configured" ? "No key" : "Untested"} icon={<BrainCircuit className="h-4 w-4" />} />
            <StatCard label="Active model" value={<span className="text-[13px]">{activeModel.replace("gemini-", "")}</span>} icon={<Cpu className="h-4 w-4" />} tone="cyan" />
          </div>
          <div className="ws-card p-4">
            <h3 className="mb-2 text-xs font-semibold text-[var(--ws-text)]">System signals</h3>
            <div className="space-y-2 text-[11px]">
              {[
                { label: "Host", value: telemetry.hostname },
                { label: "Platform", value: telemetry.platform },
                { label: "CPU", value: `${telemetry.cpuCores} cores · load ${telemetry.loadAvg1m.toFixed(2)}` },
                { label: "AI provider", value: aiStatus?.provider || "Google Gemini" },
                { label: "Last success", value: aiStatus?.lastSuccessAt ? new Date(aiStatus.lastSuccessAt).toLocaleString() : "Not yet this session" },
                { label: "Last error", value: aiStatus?.lastError || "None" },
              ].map((row) => (
                <div key={row.label} className="flex items-start justify-between gap-3">
                  <span className="shrink-0 text-[var(--ws-muted)]">{row.label}</span>
                  <span className="min-w-0 truncate text-right font-mono text-[10px] text-[var(--ws-text)]">{row.value}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="ws-card p-4">
            <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-[var(--ws-text)]">
              <ShieldCheck className="h-3.5 w-3.5 text-[var(--ws-accent)]" /> Privacy boundary
            </h3>
            <p className="text-[10.5px] leading-relaxed text-[var(--ws-muted)]">
              The map reads state flags only. It never opens the camera, never renders a human figure, and never records
              audio on its own. Microphone capture begins only on an explicit push-to-talk gesture.
            </p>
          </div>
          <div className="ws-card flex items-center gap-2 p-3 text-[10px] text-[var(--ws-muted)]">
            <Activity className="h-3.5 w-3.5 text-[var(--ws-accent)]" />
            Rendering on real hardware: {telemetry.hardwareTier} · {telemetry.recommendedMode} mode
          </div>
        </div>
      </div>
    </div>
  );
}
