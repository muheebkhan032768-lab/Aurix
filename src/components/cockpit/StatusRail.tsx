import React from "react";
import { Activity, Cpu, GraduationCap, Radar, Server, Volume2 } from "lucide-react";
import type { AppSettings, AuditLogEntry, AurixSectionId, MemoryItem, SystemTelemetry } from "../../types/aurix";
import { useVoiceSnapshot } from "../../utils/voiceBus";
import { DeckCard } from "./DashboardRail";

interface StatusRailProps {
  settings: AppSettings;
  telemetry: SystemTelemetry;
  isOnline: boolean;
  auditLogs: AuditLogEntry[];
  memories: MemoryItem[];
  onNavigate: (section: AurixSectionId) => void;
}

function gb(bytes: number): string {
  return `${Math.max(0, Math.round((bytes / 1024 ** 3) * 10) / 10)} GB`;
}

function shortTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "--:--";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const VOICE_LABEL: Record<string, string> = {
  idle: "STANDBY",
  listening: "LISTENING",
  processing: "THINKING",
  speaking: "SPEAKING",
  error: "ATTENTION",
};

/** Right rail: AI, connection, voice, training and system status. */
export function StatusRail({ settings, telemetry, isOnline, auditLogs, memories, onNavigate }: StatusRailProps) {
  const voice = useVoiceSnapshot();
  const usedRam = telemetry.usedMemoryBytes || telemetry.totalMemoryBytes - telemetry.freeMemoryBytes;
  const modelLabel = settings.activeModel.replace("gemini-", "Gemini ").replace("hydro", "H");
  const cloudLink = settings.offlineModeForced ? "Local only" : isOnline ? "Cloud link" : "Offline";
  const voiceDetail = settings.voiceEnabled
    ? `${settings.language} · mic ${voice.micPermission}`
    : "Voice output muted";
  const recent = auditLogs.slice(0, 4);

  return (
    <div className="grid grid-cols-1 content-start gap-2.5" aria-label="AURIX status">
      <DeckCard
        icon={<Activity className="h-3.5 w-3.5" />}
        label="AI Status"
        value={modelLabel}
        hint={`Thinking ${settings.thinkingLevel.toLowerCase()}`}
        onClick={() => onNavigate("models")}
      />
      <DeckCard
        icon={<Server className="h-3.5 w-3.5" />}
        label="API Connection"
        value={cloudLink}
        hint={settings.offlineModeForced ? "Offline mode forced" : isOnline ? "Primary AI reachable" : "Using local engine"}
        onClick={() => onNavigate("models")}
      />
      <DeckCard
        icon={<Volume2 className="h-3.5 w-3.5" />}
        label="Voice Status"
        value={VOICE_LABEL[voice.state] ?? "STANDBY"}
        hint={voiceDetail}
        onClick={() => onNavigate("voice")}
      >
        <span className="mt-1.5 flex h-2 items-end gap-[2px]" aria-hidden="true">
          {Array.from({ length: 16 }).map((_, i) => (
            <span
              key={i}
              className="w-[3px] rounded-full bg-[#00D9FF]"
              style={{
                height: `${20 + Math.max(voice.level, 0.06) * (i % 4 === 0 ? 100 : 55)}%`,
                opacity: 0.25 + Math.max(voice.level, 0.06) * 0.65,
              }}
            />
          ))}
        </span>
      </DeckCard>
      <DeckCard
        icon={<GraduationCap className="h-3.5 w-3.5" />}
        label="Training Mode"
        value={`${memories.length} memories`}
        hint={settings.autoHealEnabled ? "Learning · self-heal armed" : "Learning · self-heal off"}
        onClick={() => onNavigate("memory")}
      />
      <DeckCard
        icon={<Cpu className="h-3.5 w-3.5" />}
        label="System Information"
        value={telemetry.hardwareTier}
        hint={`${telemetry.platform} · ${gb(usedRam)}/${gb(telemetry.totalMemoryBytes)} · ${telemetry.cpuCores} cores`}
        onClick={() => onNavigate("system")}
      />
      <DeckCard
        icon={<Radar className="h-3.5 w-3.5" />}
        label="Recent Activity"
        value={recent[0] ? recent[0].eventType.replace(/_/g, " ") : "No activity"}
        hint={recent[0] ? recent[0].detail : "Audit log is clear"}
        onClick={() => onNavigate("automation")}
      >
        {recent.length > 1 && (
          <ul className="mt-1.5 space-y-0.5">
            {recent.slice(1).map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-2 text-[8px] font-mono text-[#5B7185]">
                <span className="truncate">{entry.eventType.replace(/_/g, " ")}</span>
                <span className="shrink-0 tabular-nums">{shortTime(entry.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </DeckCard>
    </div>
  );
}
