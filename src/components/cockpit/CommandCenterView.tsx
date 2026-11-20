import React, { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, Bot, Code2, Mic, ShieldCheck, Sparkles } from "lucide-react";
import type {
  AppSettings,
  AurixLanguage,
  AurixSectionId,
  ConversationSummary,
  OwnerProfile,
  ProjectRecord,
  SystemTelemetry,
  TaskItem,
} from "../../types/aurix";
import { speakWithCompanionVoice } from "../../utils/companionVoice";
import { speakWithOfflineBritishVoice } from "../../utils/offlineVoice";
import { CockpitReactor, type ReactorState } from "./CockpitReactor";
import { CockpitTelemetry } from "./CockpitTelemetry";
import { CockpitVoiceBar } from "./CockpitVoiceBar";

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
}: CommandCenterViewProps) {
  const [signal, setSignal] = useState<{ state: ReactorState; level: number }>({ state: "idle", level: 0 });
  const handleSignal = useCallback((next: { state: ReactorState; level: number }) => setSignal(next), []);
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

  const quickActions: Array<{ label: string; hint: string; icon: React.ReactNode; section: AurixSectionId }> = [
    { label: "Ask AURIX", hint: "Open conversation", icon: <Sparkles className="w-3.5 h-3.5" />, section: "chat" },
    { label: "Voice Center", hint: "Speech engine", icon: <Mic className="w-3.5 h-3.5" />, section: "voice" },
    { label: "Developer", hint: "Code workspace", icon: <Code2 className="w-3.5 h-3.5" />, section: "developer" },
    { label: "Automation", hint: "Approved actions", icon: <Bot className="w-3.5 h-3.5" />, section: "automation" },
    { label: "Security", hint: "Permissions", icon: <ShieldCheck className="w-3.5 h-3.5" />, section: "security" },
  ];

  return (
    <div className="space-y-4">
      {/* greeting */}
      <div className="nexus-panel rounded-2xl px-4 py-3.5 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-lg sm:text-xl font-bold tracking-wide text-white">
              {greetingFor(new Date())}, {firstName}.
            </h1>
            <p className="mt-1 text-[11px] sm:text-xs text-[#94A8B8]">
              AURIX is online. {openTasks.length} open task{openTasks.length === 1 ? "" : "s"} ·{" "}
              {activeProjects.length} active project{activeProjects.length === 1 ? "" : "s"} · {conversations.length}{" "}
              conversation{conversations.length === 1 ? "" : "s"} archived.
            </p>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.14em]">
            <span className="rounded-full border border-[#00D9FF]/25 bg-[#00D9FF]/8 px-2.5 py-1 text-[#00D9FF]">
              {telemetry.recommendedMode || settings.performanceMode}
            </span>
            <span className="rounded-full border border-[#A9C8D5]/20 px-2.5 py-1 text-[#A9C8D5]">{engineLabel}</span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
        {/* reactor column */}
        <div className="space-y-4">
          <div className="nexus-panel rounded-2xl px-4 py-5 sm:px-6">
            <div className="flex items-center justify-between">
              <h2 className="text-[11px] font-mono uppercase tracking-[0.22em] text-[#A9C8D5]">Holographic Core</h2>
              <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#5B7185]">
                {isOnline ? "cloud link ready" : "local execution"}
              </span>
            </div>
            <div className="mt-2">
              <CockpitReactor
                state={signal.state}
                level={signal.level}
                detailLabel={stateDetail[signal.state]}
                size={440}
              />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(["idle", "listening", "thinking", "speaking"] as ReactorState[]).map((state) => (
                <div
                  key={state}
                  className={`rounded-lg border px-2.5 py-1.5 text-center text-[9px] font-mono uppercase tracking-[0.14em] ${
                    signal.state === state
                      ? "border-[#00D9FF]/60 bg-[#00D9FF]/10 text-[#00D9FF]"
                      : "border-[#00D9FF]/10 text-[#5B7185]"
                  }`}
                >
                  {state}
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {quickActions.map((action) => (
              <button
                key={action.label}
                type="button"
                onClick={() => onNavigate(action.section)}
                className="nexus-panel-soft group flex flex-col items-start gap-1.5 rounded-xl px-3 py-2.5 text-left hover:border-[#00D9FF]/40 cursor-pointer"
              >
                <span className="flex w-full items-center justify-between text-[#00D9FF]">
                  {action.icon}
                  <ArrowUpRight className="w-3 h-3 text-[#5B7185] group-hover:text-[#00D9FF]" />
                </span>
                <span className="text-[11px] font-semibold text-white">{action.label}</span>
                <span className="text-[9px] text-[#5B7185]">{action.hint}</span>
              </button>
            ))}
          </div>
        </div>

        {/* telemetry column */}
        <CockpitTelemetry telemetry={telemetry} settings={settings} isOnline={isOnline} />
      </div>

      <CockpitVoiceBar settings={settings} onSignal={handleSignal} />
    </div>
  );
}
