import React from "react";

interface ModuleTableProps {
  isOnline: boolean;
  voiceState: string;
  engineLabel: string;
  memoryCount: number;
  automationCount: number;
  voiceEnabled: boolean;
}

type ModuleRow = {
  module: string;
  description: string;
  type: "CONNECTOR" | "BRAIN" | "AGENTS" | "INTERFACE";
  status: string;
  tone: "ok" | "live" | "warn";
};

const typeTone: Record<ModuleRow["type"], string> = {
  CONNECTOR: "border-[#00F2FF]/35 text-[#7FE7F5]",
  BRAIN: "border-[#00FF9D]/35 text-[#9BFFCE]",
  AGENTS: "border-amber-300/35 text-amber-200",
  INTERFACE: "border-sky-300/35 text-sky-200",
};

const statusTone: Record<ModuleRow["tone"], string> = {
  ok: "bg-[#00FF9D]",
  live: "bg-[#00F2FF] animate-pulse",
  warn: "bg-amber-400",
};

const VOICE_STATUS: Record<string, string> = {
  idle: "READY",
  listening: "LISTENING",
  thinking: "ROUTING",
  processing: "RUNNING",
  speaking: "SPEAKING",
  error: "ATTENTION",
};

/**
 * NOVA module table: every subsystem with its role, category and the live
 * status derived from the same state the rest of the cockpit renders.
 */
export function ModuleTable({
  isOnline,
  voiceState,
  engineLabel,
  memoryCount,
  automationCount,
  voiceEnabled,
}: ModuleTableProps) {
  const rows: ModuleRow[] = [
    {
      module: "NEXUS CORE",
      description: "Holographic orchestration core",
      type: "CONNECTOR",
      status: isOnline ? "ONLINE" : "LOCAL",
      tone: isOnline ? "ok" : "warn",
    },
    {
      module: "VOICE RECOGNITION",
      description: "Wake phrase, push-to-talk, transcription",
      type: "CONNECTOR",
      status: VOICE_STATUS[voiceState] ?? "READY",
      tone: voiceState === "error" ? "warn" : voiceState === "idle" ? "ok" : "live",
    },
    {
      module: "BRAIN COGNITION",
      description: "Intent routing & reasoning engine",
      type: "BRAIN",
      status: engineLabel.toUpperCase(),
      tone: "live",
    },
    {
      module: "MEMORY STORAGE",
      description: "Conversations, tasks, projects",
      type: "CONNECTOR",
      status: `${memoryCount} RECORDS`,
      tone: "ok",
    },
    {
      module: "AGENTS / COMPUTER",
      description: "Approved automation & desktop tools",
      type: "AGENTS",
      status: `${automationCount} QUEUED`,
      tone: automationCount > 0 ? "warn" : "ok",
    },
    {
      module: "SECURITY INTERFACE",
      description: "Permissions, PIN & emergency stop",
      type: "CONNECTOR",
      status: "ARMED",
      tone: "ok",
    },
    {
      module: "OUTPUT DISPLAY",
      description: "Voice & visual response array",
      type: "INTERFACE",
      status: voiceEnabled ? "ACTIVE" : "MUTED",
      tone: voiceEnabled ? "live" : "warn",
    },
  ];

  return (
    <section className="nexus-panel-soft min-w-0 rounded-2xl px-3.5 py-3" aria-label="Module registry">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[10px] font-mono uppercase tracking-[0.22em] text-[#A9C8D5]">Module Registry</h3>
        <span className="text-[8px] font-mono uppercase tracking-[0.2em] text-[#3F5567]">{rows.length} modules</span>
      </div>

      <div className="mt-2 grid grid-cols-[minmax(0,1.15fr)_minmax(0,1.5fr)_auto_auto] gap-x-3 border-b border-[#00F2FF]/12 pb-1 text-[8px] font-mono uppercase tracking-[0.18em] text-[#3F5567]">
        <span>Module</span>
        <span className="hidden sm:block">Description</span>
        <span className="hidden sm:block">Type</span>
        <span className="text-right sm:text-left">Status</span>
      </div>

      <div className="divide-y divide-[#00F2FF]/8">
        {rows.map((row) => (
          <div
            key={row.module}
            className="grid grid-cols-[minmax(0,1.15fr)_minmax(0,1.5fr)_auto_auto] items-center gap-x-3 py-1.5"
          >
            <span className="truncate text-[9px] font-mono uppercase tracking-[0.1em] text-white">{row.module}</span>
            <span className="hidden truncate text-[9px] text-[#5B7185] sm:block">{row.description}</span>
            <span
              className={`hidden rounded border px-1.5 py-0.5 text-[7px] font-mono uppercase tracking-[0.16em] sm:inline-block ${typeTone[row.type]}`}
            >
              {row.type}
            </span>
            <span className="flex items-center justify-end gap-1.5 text-right text-[8px] font-mono uppercase tracking-[0.12em] text-[#94A8B8] sm:justify-start sm:text-left">
              <span className={`h-1 w-1 shrink-0 rounded-full ${statusTone[row.tone]}`} aria-hidden="true" />
              <span className="truncate">{row.status}</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
