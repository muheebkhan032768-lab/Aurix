import React, { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, Bot, Code2, Mic, ShieldCheck, Sparkles, Volume2, VolumeX } from "lucide-react";
import type {
  AppSettings,
  AurixLanguage,
  AurixSectionId,
  ConversationSummary,
  OwnerProfile,
  PerformanceMode,
  ProjectRecord,
  SystemTelemetry,
  TaskItem,
} from "../../types/aurix";
import { speakWithCompanionVoice } from "../../utils/companionVoice";
import { speakWithOfflineBritishVoice } from "../../utils/offlineVoice";
import { formatShortcut } from "../../utils/shortcuts";
import { useVoiceSnapshot } from "../../utils/voiceBus";
import { BlueprintSchematics } from "./BlueprintSchematics";
import { CockpitReactor, type ReactorState } from "./CockpitReactor";
import { ExplodedView } from "./ExplodedView";
import { CockpitTelemetry } from "./CockpitTelemetry";
import { CockpitVoiceBar } from "./CockpitVoiceBar";
import { ModuleTable } from "./ModuleTable";
import { SystemFlow } from "./SystemFlow";

interface CommandCenterViewProps {
  owner: OwnerProfile;
  settings: AppSettings;
  telemetry: SystemTelemetry;
  tasks: TaskItem[];
  projects: ProjectRecord[];
  conversations: ConversationSummary[];
  isOnline: boolean;
  welcomeTriggerSignal?: number;
  onNavigate: (section: AurixSectionId) => void;
  onUpdateSettings: (next: AppSettings) => Promise<void>;
}

const stateDetail: Record<ReactorState, string> = {
  idle: "NEXUS CORE",
  listening: "MIC LIVE",
  thinking: "ROUTING INTENT",
  speaking: "VOICE OUT",
  processing: "TASK RUNNING",
  offline: "LOCAL ONLY",
  error: "CHECK SYSTEM",
};

const VOICE_STATE_LABEL: Record<string, string> = {
  idle: "SYSTEM READY",
  listening: "LISTENING",
  processing: "PROCESSING",
  speaking: "SPEAKING",
  error: "MIC ATTENTION",
};

type CockpitMode = "eco" | "balanced" | "performance";

const MODE_OPTIONS: Array<{ key: CockpitMode; label: string; value: PerformanceMode }> = [
  { key: "eco", label: "ECO", value: "lightweight" },
  { key: "balanced", label: "BALANCED", value: "balanced" },
  { key: "performance", label: "PERFORMANCE", value: "advanced" },
];

function greetingFor(date: Date): string {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function spokenGreeting(language: AurixLanguage, firstName: string): string {
  const hour = new Date().getHours();
  if (language === "Urdu") {
    const salutation = hour < 12 ? "صبح بخیر" : hour < 18 ? "دوپہر بخیر" : "شام بخیر";
    return `${salutation}، ${firstName}۔ اورکس آن لائن ہے، تمام نظام تیار ہیں۔ آج میں آپ کی کیا مدد کروں؟`;
  }
  if (language === "Hindi") {
    const salutation = hour < 12 ? "सुप्रभात" : hour < 18 ? "नमस्कार" : "शुभ संध्या";
    return `${salutation}, ${firstName}। ऑरिक्स ऑनलाइन है, सभी सिस्टम तैयार हैं। आज मैं आपकी क्या सहायता करूँ?`;
  }
  const period = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return `${period}, ${firstName}. AURIX is online. All systems are ready. How may I assist you today?`;
}

function effectiveMode(settings: AppSettings, telemetry: SystemTelemetry): CockpitMode {
  if (settings.performanceMode === "lightweight") return "eco";
  if (settings.performanceMode === "advanced") return "performance";
  if (settings.performanceMode === "balanced") return "balanced";
  if (telemetry.recommendedMode === "Lightweight") return "eco";
  if (telemetry.recommendedMode === "Advanced") return "performance";
  return "balanced";
}

export function CommandCenterView({
  owner,
  settings,
  telemetry,
  tasks,
  projects,
  conversations,
  isOnline,
  welcomeTriggerSignal = 0,
  onNavigate,
  onUpdateSettings,
}: CommandCenterViewProps) {
  const [signal, setSignal] = useState<{ state: ReactorState; level: number }>({ state: "idle", level: 0 });
  const handleSignal = useCallback((next: { state: ReactorState; level: number }) => setSignal(next), []);

  // The global push-to-talk session owns the reactor while it is active.
  const voice = useVoiceSnapshot();
  const reactorState: ReactorState = voice.state === "idle" ? signal.state : voice.state;
  const reactorLevel = voice.state === "idle" ? signal.level : voice.level;
  const handledWelcomeRef = useRef(0);
  const firstNameForGreeting = (owner.name.split(" ")[0] || owner.name).trim();

  // Startup / manual greeting — the only place the welcome line is spoken.
  useEffect(() => {
    if (!welcomeTriggerSignal || welcomeTriggerSignal === handledWelcomeRef.current) return;
    handledWelcomeRef.current = welcomeTriggerSignal;
    const text = spokenGreeting(settings.language, firstNameForGreeting);
    if (!settings.voiceEnabled || settings.doNotDisturb) return;
    let cancelled = false;
    void (async () => {
      const spoken = await speakWithCompanionVoice(text, { speed: settings.voiceSpeed });
      if (!spoken && !cancelled) {
        await speakWithOfflineBritishVoice(text, settings.language, settings.voiceSpeed);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [welcomeTriggerSignal, settings.language, settings.voiceEnabled, settings.voiceSpeed, settings.doNotDisturb, firstNameForGreeting]);

  const openTasks = tasks.filter((t) => t.status !== "done");
  const activeProjects = projects.filter((p) => p.status === "active");
  const firstName = owner.name.split(" ")[0] || owner.name;
  const engineLabel = settings.offlineModeForced ? "Local engine" : settings.activeModel;
  const mode = effectiveMode(settings, telemetry);
  const calm =
    settings.lightweightAnimations ||
    settings.performanceMode === "lightweight" ||
    (settings.performanceMode === "auto" && telemetry.recommendedMode === "Lightweight");
  const pushToTalkLabel = formatShortcut(settings.voiceShortcuts?.pushToTalk || "Space");

  const quickActions: Array<{ label: string; hint: string; icon: React.ReactNode; section: AurixSectionId }> = [
    { label: "Ask AURIX", hint: "Conversation", icon: <Sparkles className="w-3.5 h-3.5" />, section: "chat" },
    { label: "Voice", hint: "Speech engine", icon: <Mic className="w-3.5 h-3.5" />, section: "voice" },
    { label: "Developer", hint: "Code workspace", icon: <Code2 className="w-3.5 h-3.5" />, section: "developer" },
    { label: "Automation", hint: "Approved actions", icon: <Bot className="w-3.5 h-3.5" />, section: "automation" },
    { label: "Security", hint: "Permissions", icon: <ShieldCheck className="w-3.5 h-3.5" />, section: "security" },
  ];

  return (
    <div className={`nexus-cockpit relative flex flex-col gap-3 ${calm ? "nexus-calm" : ""}`}>
      <span className="pointer-events-none absolute left-0 top-0 hidden h-4 w-4 border-l border-t border-[#00F2FF]/35 sm:block" aria-hidden="true" />
      <span className="pointer-events-none absolute right-0 top-0 hidden h-4 w-4 border-r border-t border-[#00F2FF]/35 sm:block" aria-hidden="true" />
      <span className="pointer-events-none absolute bottom-0 left-0 hidden h-4 w-4 border-b border-l border-[#00F2FF]/35 sm:block" aria-hidden="true" />
      <span className="pointer-events-none absolute bottom-0 right-0 hidden h-4 w-4 border-b border-r border-[#00F2FF]/35 sm:block" aria-hidden="true" />
      {/* Command strip */}
      <div className="nexus-panel-soft flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3">
        <div className="min-w-0">
          <p className="text-[8px] font-mono uppercase tracking-[0.28em] text-[#00F2FF]/70">
            AURIX — Personal AI Assistant
          </p>
          <h1 className="font-display text-base font-bold tracking-wide text-white sm:text-lg">
            {greetingFor(new Date())}, {firstName}.
          </h1>
          <p className="mt-0.5 truncate text-[10px] font-mono uppercase tracking-[0.14em] text-[#5B7185]">
            {openTasks.length} open task{openTasks.length === 1 ? "" : "s"} · {activeProjects.length} active project
            {activeProjects.length === 1 ? "" : "s"} · {conversations.length} archived
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex items-center rounded-lg border border-[#00D9FF]/15 bg-[#05080D]/60 p-0.5"
            role="group"
            aria-label="Performance mode"
          >
            {MODE_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => void onUpdateSettings({ ...settings, performanceMode: option.value })}
                aria-pressed={mode === option.key}
                className={`rounded-md px-2 py-1 text-[9px] font-mono uppercase tracking-[0.12em] transition-colors cursor-pointer ${
                  mode === option.key
                    ? "bg-[#00D9FF]/15 text-[#00D9FF]"
                    : "text-[#5B7185] hover:text-[#A9C8D5]"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <span className="hidden items-center gap-1.5 rounded-full border border-[#00D9FF]/20 px-2.5 py-1 text-[9px] font-mono uppercase tracking-[0.12em] text-[#A9C8D5] sm:flex">
            {engineLabel}
          </span>

          <span className="hidden items-center gap-1.5 rounded-full border border-[#00D9FF]/25 bg-[#00D9FF]/5 px-2.5 py-1 text-[9px] font-mono uppercase tracking-[0.12em] text-[#A9C8D5] lg:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-[#00D9FF] animate-pulse" aria-hidden="true" />
            Say “{settings.wakePhrase}”
          </span>

          <span
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-mono uppercase tracking-[0.12em] ${
              isOnline
                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                : "border-amber-400/30 bg-amber-400/10 text-amber-300"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${isOnline ? "bg-emerald-400" : "bg-amber-400"} animate-pulse`} />
            {isOnline ? "Link active" : "Local only"}
          </span>
        </div>
      </div>

      <div className="grid flex-1 gap-3 md:grid-cols-[minmax(0,1fr)_272px] xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* Center stage */}
        <section className="nexus-panel nexus-stage relative flex flex-col overflow-hidden rounded-2xl px-4 py-4 sm:px-5">
          <div className="nexus-grid pointer-events-none absolute inset-0" aria-hidden="true" />
          <span className="nexus-bracket left-2 top-2 border-l border-t" aria-hidden="true" />
          <span className="nexus-bracket right-2 top-2 border-r border-t" aria-hidden="true" />
          <span className="nexus-bracket bottom-2 left-2 border-b border-l" aria-hidden="true" />
          <span className="nexus-bracket bottom-2 right-2 border-b border-r" aria-hidden="true" />

          <div className="relative z-10 flex items-center justify-between">
            <div className="min-w-0">
              <h2 className="text-[11px] font-mono uppercase tracking-[0.24em] text-[#A9C8D5]">Nexus Core</h2>
              <p className="mt-0.5 truncate text-[8px] font-mono uppercase tracking-[0.22em] text-[#3F5567]">
                3D system architecture · live deck
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-mono uppercase tracking-[0.14em] text-[#5B7185]">
                {pushToTalkLabel} push-to-talk
              </span>
              <button
                type="button"
                onClick={() => void onUpdateSettings({ ...settings, voiceEnabled: !settings.voiceEnabled })}
                aria-pressed={!settings.voiceEnabled}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-mono uppercase tracking-[0.12em] cursor-pointer ${
                  settings.voiceEnabled
                    ? "border-[#00D9FF]/35 text-[#00D9FF] hover:bg-[#00D9FF]/10"
                    : "border-rose-400/50 bg-rose-500/10 text-rose-200"
                }`}
              >
                {settings.voiceEnabled ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
                {settings.voiceEnabled ? "Voice on" : "Muted"}
              </button>
            </div>
          </div>

          <div className="relative z-10 flex flex-1 items-center justify-center py-2">
            <CockpitReactor
              state={reactorState}
              level={reactorLevel}
              detailLabel={stateDetail[reactorState]}
              size={520}
            />
          </div>

          <div className="relative z-10 mt-1">
            <BlueprintSchematics state={reactorState} />
          </div>

          <div className="relative z-10 mt-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {(["idle", "listening", "thinking", "speaking"] as ReactorState[]).map((state) => (
                <span
                  key={state}
                  className={`rounded-full border px-2 py-0.5 text-[9px] font-mono uppercase tracking-[0.14em] ${
                    reactorState === state
                      ? "border-[#00D9FF]/60 bg-[#00D9FF]/10 text-[#00D9FF]"
                      : "border-[#00D9FF]/10 text-[#5B7185]"
                  }`}
                >
                  {state}
                </span>
              ))}
            </div>
            <span
              className={`flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-[0.16em] ${
                voice.state === "error" ? "text-rose-300" : "text-[#94A8B8]"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  voice.state === "idle"
                    ? "bg-emerald-400"
                    : voice.state === "error"
                      ? "bg-rose-400"
                      : "bg-[#00D9FF] animate-pulse"
                }`}
              />
              {VOICE_STATE_LABEL[voice.state] ?? "SYSTEM READY"}
            </span>
          </div>
        </section>

        {/* Instrument rail */}
        <CockpitTelemetry telemetry={telemetry} settings={settings} isOnline={isOnline} />
      </div>

      {/* Blueprint deck: exploded architecture + signal path + module registry */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <ExplodedView state={reactorState} />
        <div className="grid min-w-0 gap-3">
          <SystemFlow voiceState={voice.state} />
          <ModuleTable
            isOnline={isOnline}
            voiceState={voice.state}
            engineLabel={engineLabel}
            memoryCount={conversations.length}
            automationCount={openTasks.length}
            voiceEnabled={settings.voiceEnabled}
          />
        </div>
      </div>

      {/* Quick access modules */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {quickActions.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={() => onNavigate(action.section)}
            className="nexus-panel-soft group flex items-center gap-2 rounded-xl px-3 py-2.5 text-left hover:border-[#00D9FF]/40 cursor-pointer"
          >
            <span className="text-[#00D9FF]">{action.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[11px] font-semibold text-white">{action.label}</span>
              <span className="block truncate text-[9px] text-[#5B7185]">{action.hint}</span>
            </span>
            <ArrowUpRight className="w-3 h-3 shrink-0 text-[#5B7185] group-hover:text-[#00D9FF]" />
          </button>
        ))}
      </div>

      {/* Voice console */}
      <CockpitVoiceBar settings={settings} onSignal={handleSignal} />

      <div className="flex items-center justify-between gap-3 px-1 text-[9px] font-mono uppercase tracking-[0.2em] text-[#3F5567]">
        <span className="truncate">AURIX/ core/ voice/ brain/ memory/ agents/ tools/ security/ interface/</span>
        <span className="shrink-0">Powered by AM VEYRONIX</span>
      </div>
    </div>
  );
}
