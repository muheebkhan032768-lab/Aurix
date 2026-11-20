import React, { useEffect, useRef, useState } from "react";
import { Activity, BatteryCharging, Cpu, HardDrive, MemoryStick, Radio, Wifi, WifiOff } from "lucide-react";
import type { AppSettings, SystemTelemetry } from "../../types/aurix";

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
  const circumference = 2 * Math.PI * 26;
  return (
    <div className="nexus-panel rounded-xl p-3.5">
      <div className="flex items-center gap-3">
        <svg viewBox="0 0 64 64" className="w-14 h-14 shrink-0">
          <circle cx="32" cy="32" r="26" fill="none" stroke="rgba(169,200,213,0.16)" strokeWidth="5" />
          <circle
            cx="32"
            cy="32"
            r="26"
            fill="none"
            stroke={accent}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={`${(pct / 100) * circumference} ${circumference}`}
            transform="rotate(-90 32 32)"
          />
          <text
            x="32"
            y="36"
            textAnchor="middle"
            fill="#FFFFFF"
            fontSize="13"
            fontFamily="JetBrains Mono, monospace"
          >
            {Math.round(pct)}%
          </text>
        </svg>
        <div className="min-w-0">
          <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-[#94A8B8]">{label}</div>
          <div className="mt-0.5 text-sm font-semibold text-white tabular-nums truncate">{valueText}</div>
          <div className="text-[10px] text-[#5B7185] truncate">{detail}</div>
        </div>
      </div>
    </div>
  );
}

function Row({
  icon,
  label,
  value,
  tone = "text-white",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 border-b border-[#00D9FF]/8 last:border-b-0">
      <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.14em] text-[#94A8B8]">
        {icon}
        <span>{label}</span>
      </div>
      <span className={`text-[11px] font-semibold tabular-nums text-right ${tone}`}>{value}</span>
    </div>
  );
}

/**
 * Right-hand spacecraft telemetry stack.
 * Every number comes from the live host: /api/system/telemetry, the Battery
 * Status API and the browser's network state. Nothing is synthesised.
 */
export function CockpitTelemetry({ telemetry: initial, settings, isOnline }: CockpitTelemetryProps) {
  const [telemetry, setTelemetry] = useState<SystemTelemetry>(initial);
  const [battery, setBattery] = useState<{ level: number; charging: boolean } | null>(null);
  const [batterySupported, setBatterySupported] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const poll = async () => {
      try {
        const res = await fetch("/api/system/telemetry");
        if (!res.ok) return;
        const next = (await res.json()) as SystemTelemetry;
        if (mounted.current) setTelemetry(next);
      } catch {
        // keep the last known values; the panel marks itself offline separately
      }
    };
    const timer = window.setInterval(poll, 5000);
    return () => {
      mounted.current = false;
      window.clearInterval(timer);
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

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-mono uppercase tracking-[0.22em] text-[#A9C8D5]">System Telemetry</h3>
        <span className={`flex items-center gap-1.5 text-[10px] font-mono ${isOnline ? "text-emerald-300" : "text-amber-300"}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? "bg-emerald-400" : "bg-amber-400"} animate-pulse`} />
          {isOnline ? "LINK ACTIVE" : "LOCAL ONLY"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Gauge
          value={cpuPct}
          label="CPU Load"
          valueText={`${telemetry.loadAvg1m.toFixed(2)} avg`}
          detail={`${telemetry.cpuCores} threads`}
        />
        <Gauge
          value={ramPct}
          label="Memory"
          valueText={`${(telemetry.usedMemoryBytes / 1024 ** 3).toFixed(1)} / ${telemetry.installedRamGb} GB`}
          detail={`${(telemetry.freeMemoryBytes / 1024 ** 3).toFixed(1)} GB free`}
          accent="#147DFF"
        />
        <Gauge
          value={diskPct}
          label="Storage"
          valueText={`${diskFreeGb} GB free`}
          detail={`of ${(telemetry.diskTotalBytes / 1024 ** 3).toFixed(0)} GB`}
          accent="#2FE9C6"
        />
        <Gauge
          value={battery ? battery.level : 0}
          label="Battery"
          valueText={battery ? `${battery.level}%` : batterySupported ? "Reading…" : "Not reported"}
          detail={
            battery
              ? battery.charging
                ? "Charging"
                : "On battery"
              : batterySupported
                ? "Battery Status API"
                : "Desktop has no battery sensor"
          }
          accent={battery && battery.level < 20 && !battery.charging ? "#FB7185" : "#A9C8D5"}
        />
      </div>

      <div className="nexus-panel rounded-xl overflow-hidden">
        <Row
          icon={<Cpu className="w-3 h-3 text-[#00D9FF]" />}
          label="Processor"
          value={`${telemetry.cpuCores} threads`}
        />
        <Row
          icon={<MemoryStick className="w-3 h-3 text-[#00D9FF]" />}
          label="Installed RAM"
          value={`${telemetry.installedRamGb} GB`}
        />
        <Row
          icon={<HardDrive className="w-3 h-3 text-[#00D9FF]" />}
          label="Disk free"
          value={`${diskFreeGb} GB`}
        />
        <Row
          icon={<BatteryCharging className="w-3 h-3 text-[#00D9FF]" />}
          label="Power"
          value={battery ? (battery.charging ? "Charging" : "Battery") : batterySupported ? "—" : "No sensor"}
        />
        <Row
          icon={isOnline ? <Wifi className="w-3 h-3 text-[#00D9FF]" /> : <WifiOff className="w-3 h-3 text-amber-300" />}
          label="Network"
          value={isOnline ? "Connected" : "Offline"}
          tone={isOnline ? "text-emerald-300" : "text-amber-300"}
        />
        <Row
          icon={<Radio className="w-3 h-3 text-[#00D9FF]" />}
          label="AI engine"
          value={settings.offlineModeForced ? "Local only" : settings.activeModel}
        />
        <Row
          icon={<Activity className="w-3 h-3 text-[#00D9FF]" />}
          label="System health"
          value={health}
          tone={healthTone}
        />
      </div>

      <div className="nexus-panel-soft rounded-xl px-3.5 py-2.5">
        <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-[#5B7185]">Runtime</div>
        <div className="mt-1 text-[11px] text-[#94A8B8] leading-relaxed">
          {telemetry.hostname} · {telemetry.platform} · {telemetry.arch} · up{" "}
          {Math.floor(telemetry.uptimeSeconds / 3600)}h {Math.floor((telemetry.uptimeSeconds % 3600) / 60)}m
        </div>
      </div>
    </div>
  );
}
