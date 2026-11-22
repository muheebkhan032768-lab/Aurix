import React, { useEffect, useRef, useState } from "react";
import { Activity, BatteryCharging, Cpu, HardDrive, MemoryStick, Radio, Wifi, WifiOff } from "lucide-react";
import type { AppSettings, HardwareAuditReport, SystemTelemetry } from "../../types/aurix";

interface CockpitTelemetryProps {
  telemetry: SystemTelemetry;
  settings: AppSettings;
  isOnline: boolean;
}

interface BatteryLike {
  level: number;
  charging: boolean;
  addEventListener: (type: string, listener: () => void) => void;
}

const GAUGE_TICKS = Array.from({ length: 28 }, (_, i) => i);

function Gauge({
  value,
  label,
  valueText,
  detail,
  accent = "#00D9FF",
}: {
  value: number;
  label: string;
  valueText: string;
  detail: string;
  accent?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="flex min-w-0 flex-col items-center gap-0.5 text-center">
      <svg viewBox="0 0 56 56" className="h-14 w-14" aria-hidden="true">
        <circle cx="28" cy="28" r="26" fill="none" stroke="rgba(169,200,213,0.1)" strokeWidth="0.8" />
        {GAUGE_TICKS.map((i) => {
          const angle = (i / GAUGE_TICKS.length) * Math.PI * 2 - Math.PI / 2;
          const major = i % 7 === 0;
          return (
            <line
              key={i}
              x1={28 + Math.cos(angle) * (major ? 22.5 : 24)}
              y1={28 + Math.sin(angle) * (major ? 22.5 : 24)}
              x2={28 + Math.cos(angle) * 26}
              y2={28 + Math.sin(angle) * 26}
              stroke={accent}
              strokeOpacity={major ? 0.55 : 0.22}
              strokeWidth={major ? 1 : 0.6}
            />
          );
        })}
        <circle cx="28" cy="28" r={radius} fill="none" stroke="rgba(169,200,213,0.12)" strokeWidth="2.4" />
        <circle
          cx="28"
          cy="28"
          r={radius}
          fill="none"
          stroke={accent}
          strokeWidth="2.4"
          strokeDasharray={`${(pct / 100) * circumference} ${circumference}`}
          strokeLinecap="round"
          transform="rotate(-90 28 28)"
        />
        <text
          x="28"
          y="30.5"
          textAnchor="middle"
          fill="#FFFFFF"
          fontFamily="JetBrains Mono, ui-monospace, monospace"
          fontSize="10"
          fontWeight="600"
        >
          {valueText}
        </text>
      </svg>
      <span className="text-[8px] font-mono uppercase tracking-[0.14em] text-[#94A8B8]">{label}</span>
      <span className="w-full truncate text-[7.5px] text-[#5B7185]">{detail}</span>
    </div>
  );
}

function Row({
  icon,
  label,
  value,
  detail,
  tone = "text-white",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail?: string;
  tone?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-2 border-b border-[#00D9FF]/8 px-0.5 py-2 last:border-b-0">
      <div className="flex min-w-0 items-center gap-1.5 text-[9px] font-mono uppercase tracking-[0.14em] text-[#94A8B8]">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className="min-w-0 text-right">
        <div className={`truncate text-[10px] font-semibold tabular-nums ${tone}`}>{value}</div>
        {detail && <div className="truncate text-[9px] text-[#5B7185]">{detail}</div>}
      </div>
    </div>
  );
}

function HistoryBars({ values, accent = "#00F2FF" }: { values: number[]; accent?: string }) {
  const padded = [...Array<number>(Math.max(0, 24 - values.length)).fill(0), ...values.slice(-24)];
  return (
    <div className="flex h-10 items-end gap-[2px]" aria-hidden="true">
      {padded.map((value, i) => (
        <span
          key={i}
          className="flex-1 rounded-[1px]"
          style={{
            height: `${Math.max(6, Math.min(100, value))}%`,
            background: accent,
            opacity: value > 0 ? 0.35 + (value / 100) * 0.65 : 0.12,
          }}
        />
      ))}
    </div>
  );
}

function MemoryDonut({ usedPct, usedGb, freeGb }: { usedPct: number; usedGb: number; freeGb: number }) {
  const pct = Math.max(0, Math.min(100, usedPct));
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="flex items-center gap-2">
      <svg viewBox="0 0 56 56" className="h-14 w-14 shrink-0" aria-hidden="true">
        <circle cx="28" cy="28" r={radius} fill="none" stroke="rgba(169,200,213,0.12)" strokeWidth="6" />
        <circle
          cx="28"
          cy="28"
          r={radius}
          fill="none"
          stroke="#00F2FF"
          strokeWidth="6"
          strokeDasharray={`${(pct / 100) * circumference} ${circumference}`}
          transform="rotate(-90 28 28)"
        />
        <text
          x="28"
          y="31"
          textAnchor="middle"
          fill="#FFFFFF"
          fontFamily="JetBrains Mono, ui-monospace, monospace"
          fontSize="9"
          fontWeight="600"
        >
          {Math.round(pct)}%
        </text>
      </svg>
      <div className="space-y-0.5 text-[8px] font-mono uppercase tracking-[0.12em] text-[#5B7185]">
        <div className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-[1px] bg-[#00F2FF]" />
          used {usedGb} GB
        </div>
        <div className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-[1px] bg-[#A9C8D5]/25" />
          free {freeGb} GB
        </div>
      </div>
    </div>
  );
}

function Sparkline({ values, accent }: { values: number[]; accent: string }) {
  const points =
    values.length > 1
      ? values
          .map((v, i) => {
            const x = (i / (values.length - 1)) * 100;
            const y = 27 - (Math.max(0, Math.min(100, v)) / 100) * 26;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .join(" ")
      : "";
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="h-6 w-full" aria-hidden="true">
      <line x1="0" y1="27" x2="100" y2="27" stroke="rgba(169,200,213,0.12)" strokeWidth="0.6" />
      {points && <polyline points={points} fill="none" stroke={accent} strokeWidth="1.1" strokeLinejoin="round" />}
    </svg>
  );
}

/**
 * Right-hand spacecraft instrument rail.
 * Every number comes from the live host: /api/system/telemetry, the hardware
 * audit probe (CPU/GPU details), the Battery Status API and the browser's
 * network state. Nothing is synthesised.
 */
export function CockpitTelemetry({ telemetry: initial, settings, isOnline }: CockpitTelemetryProps) {
  const [telemetry, setTelemetry] = useState<SystemTelemetry>(initial);
  const [battery, setBattery] = useState<{ level: number; charging: boolean } | null>(null);
  const [batterySupported, setBatterySupported] = useState(true);
  const [audit, setAudit] = useState<HardwareAuditReport | null>(null);
  const [history, setHistory] = useState<Array<{ cpu: number; ram: number }>>([]);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const poll = async () => {
      try {
        const res = await fetch("/api/system/telemetry");
        if (!res.ok) return;
        const next = (await res.json()) as SystemTelemetry;
        if (!mounted.current) return;
        setTelemetry(next);
        const cpu = Math.min(100, (next.loadAvg1m / Math.max(1, next.cpuCores)) * 100);
        const ram = next.totalMemoryBytes > 0 ? (next.usedMemoryBytes / next.totalMemoryBytes) * 100 : 0;
        setHistory((prev) => [...prev.slice(-23), { cpu, ram }]);
      } catch {
        // keep the last known values; the panel marks itself offline separately
      }
    };
    void poll();
    const timer = window.setInterval(poll, 5000);
    return () => {
      mounted.current = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/system/hardware-audit")
      .then((res) => (res.ok ? (res.json() as Promise<HardwareAuditReport>) : null))
      .then((report) => {
        if (!cancelled && report) setAudit(report);
      })
      .catch(() => {
        // GPU probe unavailable — the row reports that honestly
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryLike> };
    if (!nav.getBattery) {
      setBatterySupported(false);
      return;
    }
    let batt: BatteryLike | null = null;
    const sync = () => {
      if (batt) setBattery({ level: Math.round(batt.level * 100), charging: batt.charging });
    };
    nav
      .getBattery()
      .then((b) => {
        batt = b;
        sync();
        b.addEventListener("levelchange", sync);
        b.addEventListener("chargingchange", sync);
      })
      .catch(() => setBatterySupported(false));
    return () => {
      batt = null;
    };
  }, []);

  const ramPct = telemetry.totalMemoryBytes > 0 ? (telemetry.usedMemoryBytes / telemetry.totalMemoryBytes) * 100 : 0;
  const diskUsed = Math.max(0, telemetry.diskTotalBytes - telemetry.diskFreeBytes);
  const diskPct = telemetry.diskTotalBytes > 0 ? (diskUsed / telemetry.diskTotalBytes) * 100 : 0;
  const cpuPct = Math.min(100, (telemetry.loadAvg1m / Math.max(1, telemetry.cpuCores)) * 100);
  const diskFreeGb = Number((telemetry.diskFreeBytes / 1024 ** 3).toFixed(1));
  const health =
    ramPct > 88 || diskFreeGb < 3 ? "Stressed" : ramPct > 70 || diskFreeGb < 10 ? "Watch" : "Nominal";
  const healthTone = health === "Nominal" ? "text-emerald-300" : health === "Watch" ? "text-amber-300" : "text-rose-300";
  const uptimeH = Math.floor(telemetry.uptimeSeconds / 3600);
  const uptimeM = Math.floor((telemetry.uptimeSeconds % 3600) / 60);

  const gpuName = audit?.machine.gpuName ?? null;
  const gpuDetail = audit
    ? `${audit.machine.gpuKind}${audit.machine.gpuVramGb ? ` · ${audit.machine.gpuVramGb} GB VRAM` : ""}`
    : "Probing hardware…";
  const last = history[history.length - 1];

  return (
    <aside className="nexus-panel flex flex-col gap-3 rounded-2xl p-3.5" aria-label="System telemetry">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-mono uppercase tracking-[0.22em] text-[#A9C8D5]">System Telemetry</h3>
        <span className={`flex items-center gap-1.5 text-[9px] font-mono ${isOnline ? "text-emerald-300" : "text-amber-300"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${isOnline ? "bg-emerald-400" : "bg-amber-400"} animate-pulse`} />
          {isOnline ? "LINK ACTIVE" : "LOCAL ONLY"}
        </span>
      </div>

      <div className="rounded-xl border border-[#00F2FF]/12 bg-[#05080D]/45 px-2.5 py-2">
        <div className="flex items-center justify-between text-[8px] font-mono uppercase tracking-[0.18em] text-[#3F5567]">
          <span>Signal trend</span>
          <span>{history.length > 1 ? `${history.length} samples` : "sampling…"}</span>
        </div>
        <div className="mt-1 grid grid-cols-2 gap-2">
          <div>
            <div className="flex items-baseline justify-between text-[8px] font-mono uppercase tracking-[0.14em]">
              <span className="text-[#5B7185]">CPU</span>
              <span className="tabular-nums text-[#00FF9D]">{Math.round(last?.cpu ?? 0)}%</span>
            </div>
            <Sparkline values={history.map((sample) => sample.cpu)} accent="#00FF9D" />
          </div>
          <div>
            <div className="flex items-baseline justify-between text-[8px] font-mono uppercase tracking-[0.14em]">
              <span className="text-[#5B7185]">MEM</span>
              <span className="tabular-nums text-[#00F2FF]">{Math.round(last?.ram ?? 0)}%</span>
            </div>
            <Sparkline values={history.map((sample) => sample.ram)} accent="#00F2FF" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1">
        <Gauge
          value={cpuPct}
          label="CPU"
          valueText={`${Math.round(cpuPct)}%`}
          detail={`${telemetry.cpuCores} thr`}
        />
        <Gauge
          value={ramPct}
          label="MEM"
          valueText={`${Math.round(ramPct)}%`}
          detail={`${(telemetry.usedMemoryBytes / 1024 ** 3).toFixed(1)} GB`}
          accent="#147DFF"
        />
        <Gauge
          value={diskPct}
          label="DISK"
          valueText={`${Math.round(diskPct)}%`}
          detail={`${diskFreeGb} GB free`}
          accent="#00FF9D"
        />
        <Gauge
          value={battery ? battery.level : 0}
          label="BATT"
          valueText={battery ? `${battery.level}%` : "—"}
          detail={battery ? (battery.charging ? "charging" : "battery") : batterySupported ? "reading" : "none"}
          accent={battery && battery.level < 20 && !battery.charging ? "#FB7185" : "#A9C8D5"}
        />
      </div>

      <div className="rounded-xl border border-[#00F2FF]/12 bg-[#05080D]/45 px-2.5 py-2">
        <div className="flex items-center justify-between text-[8px] font-mono uppercase tracking-[0.18em] text-[#3F5567]">
          <span>Load profile</span>
          <span>{history.length > 1 ? `${history.length} samples` : "sampling…"}</span>
        </div>
        <div className="mt-1.5 flex items-end justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-baseline justify-between text-[8px] font-mono uppercase tracking-[0.14em]">
              <span className="text-[#5B7185]">CPU</span>
              <span className="tabular-nums text-[#00F2FF]">{Math.round(cpuPct)}%</span>
            </div>
            <HistoryBars values={history.map((sample) => sample.cpu)} />
          </div>
          <MemoryDonut
            usedPct={ramPct}
            usedGb={Number((telemetry.usedMemoryBytes / 1024 ** 3).toFixed(1))}
            freeGb={Number((telemetry.freeMemoryBytes / 1024 ** 3).toFixed(1))}
          />
        </div>
      </div>

      <div className="rounded-xl border border-[#00D9FF]/10 px-2.5">
        <Row
          icon={<Cpu className="h-3 w-3 text-[#00D9FF]" />}
          label="GPU"
          value={gpuName ?? "Not detected"}
          detail={gpuDetail}
          tone={gpuName ? "text-white" : "text-[#5B7185]"}
        />
        <Row
          icon={<MemoryStick className="h-3 w-3 text-[#00D9FF]" />}
          label="Processor"
          value={`${telemetry.cpuCores} threads`}
          detail={telemetry.cpuModel}
        />
        <Row
          icon={<HardDrive className="h-3 w-3 text-[#00D9FF]" />}
          label="Installed RAM"
          value={`${telemetry.installedRamGb} GB`}
        />
        <Row
          icon={<BatteryCharging className="h-3 w-3 text-[#00D9FF]" />}
          label="Power"
          value={battery ? (battery.charging ? "Charging" : "Battery") : batterySupported ? "—" : "No sensor"}
        />
        <Row
          icon={isOnline ? <Wifi className="h-3 w-3 text-[#00D9FF]" /> : <WifiOff className="h-3 w-3 text-amber-300" />}
          label="Network"
          value={isOnline ? "Connected" : "Offline"}
          tone={isOnline ? "text-emerald-300" : "text-amber-300"}
        />
        <Row
          icon={<Radio className="h-3 w-3 text-[#00D9FF]" />}
          label="AI engine"
          value={settings.offlineModeForced ? "Local only" : settings.activeModel}
          detail={telemetry.ollamaReachable ? "Local model online" : "Cloud routing · local model offline"}
        />
        <Row
          icon={<Activity className="h-3 w-3 text-[#00D9FF]" />}
          label="System health"
          value={health}
          tone={healthTone}
        />
      </div>

      <div className="rounded-xl border border-[#00D9FF]/10 bg-[#05080D]/40 px-3 py-2">
        <div className="text-[9px] font-mono uppercase tracking-[0.16em] text-[#5B7185]">Runtime</div>
        <div className="mt-0.5 text-[10px] leading-relaxed text-[#94A8B8]">
          {telemetry.hostname} · {telemetry.platform} · {telemetry.arch}
        </div>
        <div className="text-[10px] tabular-nums text-[#5B7185]">
          up {uptimeH}h {uptimeM}m · tier {telemetry.hardwareTier}
        </div>
      </div>
    </aside>
  );
}
