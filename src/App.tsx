import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Building2,
  Code2,
  Home,
  Lock,
  Menu,
  OctagonAlert,
  Settings,
  ShieldCheck,
  Video,
  Volume2,
  X,
} from "lucide-react";
import type {
  AppSettings,
  AurixLanguage,
  AurixSectionId,
  BootstrapPayload,
  BusinessItem,
  CompanyProfile,
  MemoryItem,
  NoteItem,
  OwnerProfile,
  ProjectRecord,
  SystemReadiness,
  TaskItem,
  WebsiteRecord,
} from "./types/aurix";
import { AurixLogo } from "./components/AurixLogo";
import { StartupSplash } from "./components/StartupSplash";
import { CommandHubView } from "./components/CommandHubView";
import { ChatView } from "./components/ChatView";
import { VoiceAssistantView } from "./components/VoiceAssistantView";
import { CompanyView } from "./components/CompanyView";
import { WebsitesView } from "./components/WebsitesView";
import { ProjectsView } from "./components/ProjectsView";
import { DeveloperView } from "./components/DeveloperView";
import { FileVisionView } from "./components/FileVisionView";
import { ResearchView } from "./components/ResearchView";
import { BusinessView } from "./components/BusinessView";
import { ProductivityView } from "./components/ProductivityView";
import { SystemMonitorView } from "./components/SystemMonitorView";
import { SecurityCenterView } from "./components/SecurityCenterView";
import { ModelsView } from "./components/ModelsView";
import { SettingsView } from "./components/SettingsView";
import { SelfHealView } from "./components/SelfHealView";
import { CreativePcView } from "./components/CreativePcView";
import { BlueprintView } from "./components/BlueprintView";

class SelfHealingErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; errorMsg: string; repairing: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMsg: "", repairing: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, errorMsg: error.message || "Unexpected UI runtime exception", repairing: false };
  }

  componentDidCatch(error: Error) {
    fetch("/api/self-heal/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deepCodeScan: false }),
    }).catch(() => {});
    console.error("[AURIX Self-Heal UI Shield]", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F8FAFC] text-[#202938] flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-2xl border border-emerald-500/40 bg-white shadow-xl p-6 space-y-4">
            <div className="text-xs font-mono uppercase tracking-[0.2em] text-[#10B981]">
              AURIX Self-Healing Recovery
            </div>
            <h1 className="text-lg font-semibold">Runtime Anomaly Contained</h1>
            <p className="text-xs text-[#64748B] leading-relaxed">
              AURIX intercepted a render anomaly before crash:{" "}
              <span className="font-mono text-rose-600">{this.state.errorMsg}</span>
            </p>
            <button
              type="button"
              onClick={async () => {
                this.setState({ repairing: true });
                await fetch("/api/self-heal/run", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ deepCodeScan: false }),
                }).catch(() => {});
                this.setState({ hasError: false, errorMsg: "", repairing: false });
              }}
              className="w-full py-2.5 rounded-xl bg-[#10B981] hover:bg-emerald-600 text-white font-semibold text-xs cursor-pointer"
            >
              {this.state.repairing ? "Running 12-Step Self-Heal..." : "Auto-Recover & Restore Dashboard"}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

type TopGroupId = "home" | "company" | "developer" | "security" | "settings";

const TOP_NAV_ITEMS: Array<{
  id: TopGroupId;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  sections: AurixSectionId[];
}> = [
  { id: "home", name: "Command Hub", icon: Home, sections: ["home"] },
  {
    id: "company",
    name: "AM VEYRONIX",
    icon: Building2,
    sections: ["company", "websites", "projects", "business"],
  },
  {
    id: "developer",
    name: "Workspace",
    icon: Code2,
    sections: ["creative", "developer", "chat", "voice", "files", "research", "productivity"],
  },
  {
    id: "security",
    name: "System",
    icon: ShieldCheck,
    sections: ["selfheal", "security", "system", "models", "blueprint"],
  },
  { id: "settings", name: "Settings", icon: Settings, sections: ["settings"] },
];

const SUB_TABS: Record<
  Exclude<TopGroupId, "home" | "settings">,
  Array<{ id: AurixSectionId; label: string }>
> = {
  company: [
    { id: "company", label: "Company" },
    { id: "websites", label: "Websites" },
    { id: "projects", label: "Projects" },
    { id: "business", label: "Business" },
  ],
  developer: [
    { id: "creative", label: "Creative Studio & Files" },
    { id: "developer", label: "Developer" },
    { id: "chat", label: "Chat Archive" },
    { id: "voice", label: "Voice Studio" },
    { id: "files", label: "File & Vision" },
    { id: "research", label: "Research" },
    { id: "productivity", label: "Tasks & Notes" },
  ],
  security: [
    { id: "selfheal", label: "Self-Healer (12-Step)" },
    { id: "security", label: "Security Center" },
    { id: "system", label: "System & PC Monitor" },
    { id: "models", label: "AI Models & Modes" },
    { id: "blueprint", label: "Architecture Blueprint" },
  ],
};

export default function App() {
  return (
    <SelfHealingErrorBoundary>
      <AurixShell />
    </SelfHealingErrorBoundary>
  );
}

function AurixShell() {
  const [data, setData] = useState<BootstrapPayload | null>(null);
  const [activeSection, setActiveSection] = useState<AurixSectionId>("blueprint");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [pendingQuickPrompt, setPendingQuickPrompt] = useState<string | null>(null);
  const [browserOnline, setBrowserOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [clockText, setClockText] = useState(() =>
    new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
  );

  // Startup & Post-Consent Voice Greeting State
  const [startupPhase, setStartupPhase] = useState<"loading" | "animating" | "ready">("loading");
  const [, setReadiness] = useState<SystemReadiness | null>(null);
  const [welcomeTriggerCount, setWelcomeTriggerCount] = useState(0);
  const [mediaConsentChoice, setMediaConsentChoice] = useState<string | null>(() => {
    try {
      return localStorage.getItem("aurix_media_consent");
    } catch {
      return null;
    }
  });
  const [mediaConsentMsg, setMediaConsentMsg] = useState<string | null>(null);
  const greetingAttemptedRef = useRef(false);

  // PIN Lock state
  const [locked, setLocked] = useState(false);
  const [pinAttempt, setPinAttempt] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  const loadBootstrap = useCallback(async () => {
    const res = await fetch("/api/bootstrap");
    const json = (await res.json()) as BootstrapPayload;
    setData(json);
    if (json.security.hasPin && json.security.requirePinOnBoot) {
      setLocked(true);
    }
    setStartupPhase(json.settings.startupAnimationEnabled ? "animating" : "ready");
  }, []);

  useEffect(() => {
    loadBootstrap();
  }, [loadBootstrap]);

  // Sync Bright Light (Default) / Dark theme class on <html>
  useEffect(() => {
    const theme = data?.settings.theme || "light";
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [data?.settings.theme]);

  useEffect(() => {
    const on = () => setBrowserOnline(true);
    const off = () => setBrowserOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    const clockTimer = setInterval(() => {
      setClockText(
        new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
      );
    }, 1000);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      clearInterval(clockTimer);
    };
  }, []);

  useEffect(() => {
    const bump = () => {
      lastActivityRef.current = Date.now();
    };
    window.addEventListener("mousemove", bump);
    window.addEventListener("keydown", bump);
    const timer = setInterval(() => {
      if (!data?.security.hasPin || !data?.settings.autoLockEnabled || locked) return;
      const limitMs = data.security.inactivityMinutes * 60 * 1000;
      if (Date.now() - lastActivityRef.current > limitMs) {
        setLocked(true);
      }
    }, 15000);
    return () => {
      window.removeEventListener("mousemove", bump);
      window.removeEventListener("keydown", bump);
      clearInterval(timer);
    };
  }, [data?.security.hasPin, data?.security.inactivityMinutes, data?.settings.autoLockEnabled, locked]);

  // Post-Startup Readiness & Automatic Immediate Voice Greeting
  useEffect(() => {
    if (!data || startupPhase !== "ready" || locked || !mediaConsentChoice) return;
    if (greetingAttemptedRef.current) return;
    if (sessionStorage.getItem("aurix_greeted_this_launch") === "1") return;

    greetingAttemptedRef.current = true;
    sessionStorage.setItem("aurix_greeted_this_launch", "1");

    const runReadinessAndGreet = async () => {
      try {
        const rRes = await fetch("/api/readiness");
        const sysReady = (await rRes.json()) as SystemReadiness;
        setReadiness({
          ...sysReady,
          microphoneStatus: mediaConsentChoice === "granted" ? "available" : "unknown",
        });
      } catch {
        // Offline resilience
      }
      if (data.settings.autoVoiceGreetingEnabled && data.settings.voiceEnabled && !data.settings.doNotDisturb) {
        setWelcomeTriggerCount((c) => c + 1);
      }
    };

    runReadinessAndGreet();
  }, [data, startupPhase, locked, mediaConsentChoice]);

  if (!data || startupPhase === "loading") {
    return <div className="min-h-screen bg-[#F8FAFC]" aria-label="Launching AURIX 2.0" />;
  }

  if (startupPhase === "animating") {
    return (
      <StartupSplash
        durationSeconds={data.settings.startupDurationSeconds}
        soundEnabled={data.settings.startupSoundEnabled}
        soundVolume={data.settings.startupSoundVolume}
        lightweight={
          data.settings.lightweightAnimations ||
          data.settings.performanceMode === "lightweight" ||
          (data.settings.performanceMode === "auto" && data.telemetry.recommendedMode === "Lightweight")
        }
        onComplete={() => setStartupPhase("ready")}
      />
    );
  }

  const effectiveOnline = browserOnline && !data.settings.offlineModeForced;
  const activeTopGroup =
    TOP_NAV_ITEMS.find((g) => g.sections.includes(activeSection)) || TOP_NAV_ITEMS[0];

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError(null);
    const res = await fetch("/api/security/verify-pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: pinAttempt }),
    });
    const out = await res.json();
    setData((prev) => (prev ? { ...prev, security: out.status } : prev));
    if (out.ok) {
      setLocked(false);
      setPinAttempt("");
      lastActivityRef.current = Date.now();
    } else {
      setPinError(out.message || "Incorrect PIN.");
    }
  };

  const updateSettings = async (next: AppSettings) => {
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    const saved = await res.json();
    setData((prev) => (prev ? { ...prev, settings: saved } : prev));
  };

  const saveOwner = async (owner: OwnerProfile) => {
    const res = await fetch("/api/owner", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(owner),
    });
    const saved = await res.json();
    setData((prev) => (prev ? { ...prev, owner: saved } : prev));
  };

  const saveCompany = async (company: CompanyProfile) => {
    const res = await fetch("/api/company", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(company),
    });
    const saved = await res.json();
    setData((prev) => (prev ? { ...prev, company: saved } : prev));
  };

  const saveWebsite = async (website: WebsiteRecord) => {
    const res = await fetch("/api/websites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(website),
    });
    const saved = (await res.json()) as WebsiteRecord;
    setData((prev) => {
      if (!prev) return prev;
      const exists = prev.websites.some((w) => w.id === saved.id);
      const websites = exists
        ? prev.websites.map((w) => (w.id === saved.id ? saved : w))
        : [...prev.websites, saved];
      return { ...prev, websites };
    });
  };

  const saveProject = async (project: ProjectRecord) => {
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(project),
    });
    const saved = (await res.json()) as ProjectRecord;
    setData((prev) => {
      if (!prev) return prev;
      const exists = prev.projects.some((p) => p.id === saved.id);
      const projects = exists
        ? prev.projects.map((p) => (p.id === saved.id ? saved : p))
        : [saved, ...prev.projects];
      return { ...prev, projects };
    });
  };

  const saveMemory = async (mem: Omit<MemoryItem, "id" | "createdAt" | "updatedAt"> & { id?: string }) => {
    const res = await fetch("/api/memories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mem),
    });
    const saved = (await res.json()) as MemoryItem;
    setData((prev) => (prev ? { ...prev, memories: [saved, ...prev.memories.filter((m) => m.id !== saved.id)] } : prev));
  };

  const deleteMemory = async (id: string) => {
    await fetch(`/api/memories/${id}`, { method: "DELETE" });
    setData((prev) => (prev ? { ...prev, memories: prev.memories.filter((m) => m.id !== id) } : prev));
  };

  const saveBusinessItem = async (
    item: Omit<BusinessItem, "id" | "createdAt" | "updatedAt"> & { id?: string }
  ) => {
    const res = await fetch("/api/business", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    });
    const saved = (await res.json()) as BusinessItem;
    setData((prev) => (prev ? { ...prev, business: [saved, ...prev.business.filter((b) => b.id !== saved.id)] } : prev));
  };

  const saveTask = async (task: Omit<TaskItem, "id" | "createdAt"> & { id?: string }) => {
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(task),
    });
    const saved = (await res.json()) as TaskItem;
    setData((prev) => (prev ? { ...prev, tasks: [saved, ...prev.tasks.filter((t) => t.id !== saved.id)] } : prev));
  };

  const deleteTask = async (id: string) => {
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    setData((prev) => (prev ? { ...prev, tasks: prev.tasks.filter((t) => t.id !== id) } : prev));
  };

  const saveNote = async (note: Omit<NoteItem, "id" | "updatedAt"> & { id?: string }) => {
    const res = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(note),
    });
    const saved = (await res.json()) as NoteItem;
    setData((prev) => (prev ? { ...prev, notes: [saved, ...prev.notes.filter((n) => n.id !== saved.id)] } : prev));
  };

  const deleteNote = async (id: string) => {
    await fetch(`/api/notes/${id}`, { method: "DELETE" });
    setData((prev) => (prev ? { ...prev, notes: prev.notes.filter((n) => n.id !== id) } : prev));
  };

  const refreshTelemetry = async () => {
    const [telRes, audRes] = await Promise.all([
      fetch("/api/system/telemetry"),
      fetch("/api/security/audit"),
    ]);
    const telemetry = await telRes.json();
    const auditLogs = await audRes.json();
    setData((prev) => (prev ? { ...prev, telemetry, auditLogs } : prev));
  };

  const toggleEmergencyStop = async (active: boolean) => {
    const res = await fetch("/api/desktop/emergency-stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    const out = await res.json();
    setData((prev) =>
      prev
        ? {
            ...prev,
            telemetry: { ...prev.telemetry, emergencyStopActive: out.emergencyStopActive },
            auditLogs: out.entry ? [out.entry, ...prev.auditLogs] : prev.auditLogs,
          }
        : prev
    );
  };

  const logApprovedAction = async (actionLabel: string, commandPreview: string) => {
    const res = await fetch("/api/system/log-action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actionLabel, commandPreview, confirmed: true }),
    });
    const out = await res.json();
    if (out.entry) {
      setData((prev) => (prev ? { ...prev, auditLogs: [out.entry, ...prev.auditLogs] } : prev));
    }
  };

  const handleSetPin = async (pin: string) => {
    const res = await fetch("/api/security/set-pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    const security = await res.json();
    const audRes = await fetch("/api/security/audit");
    const auditLogs = await audRes.json();
    setData((prev) => (prev ? { ...prev, security, auditLogs } : prev));
  };

  const handleSecurityPrefs = async (inactivityMinutes: number, requirePinOnBoot: boolean) => {
    const res = await fetch("/api/security/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inactivityMinutes, requirePinOnBoot }),
    });
    const security = await res.json();
    setData((prev) => (prev ? { ...prev, security } : prev));
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0D1117] text-[#202938] dark:text-slate-100 flex flex-col">
      {/* PIN Lock Gate */}
      {locked && (
        <div className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-md flex items-center justify-center p-4">
          <form
            onSubmit={handleUnlock}
            className="w-full max-w-sm bg-white dark:bg-[#0F1724] border border-emerald-500/40 rounded-2xl p-8 text-center space-y-5 shadow-2xl"
          >
            <img
              src="/src/assets/images/aurix_core_emblem_1795088206132.jpg"
              alt="AURIX Security Core"
              referrerPolicy="no-referrer"
              className="w-20 h-20 rounded-full mx-auto object-cover border-2 border-[#10B981]"
            />
            <div>
              <h2 className="text-xl font-semibold text-[#202938] dark:text-white">AURIX Session Locked</h2>
              <p className="text-xs text-[#64748B] dark:text-slate-400 mt-1">
                Enter Abdul Muheeb&apos;s personal PIN to unlock workspace.
              </p>
            </div>
            <input
              type="password"
              autoFocus
              value={pinAttempt}
              onChange={(e) => setPinAttempt(e.target.value)}
              placeholder="Enter PIN..."
              className="w-full text-center tracking-widest bg-[#EEF2F7] dark:bg-[#0B111B] border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-3 text-sm text-[#202938] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#10B981]"
            />
            {pinError && <p className="text-xs text-rose-600">{pinError}</p>}
            <button
              type="submit"
              className="w-full py-2.5 rounded-lg bg-[#10B981] hover:bg-emerald-600 text-white text-sm font-semibold cursor-pointer"
            >
              Unlock AURIX
            </button>
          </form>
        </div>
      )}

      {/* Bright Glassmorphism Top HUD Command Header */}
      <header className="h-16 px-4 sm:px-6 bg-white/90 dark:bg-[#0F1724]/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 sticky top-0 z-30">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open navigation"
            className="md:hidden p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-[#202938] dark:text-slate-200"
          >
            <Menu className="w-4 h-4" />
          </button>
          <AurixLogo className="w-7 h-7 text-[#10B981] shrink-0" />
          <div className="min-w-0">
            <div className="font-display text-sm sm:text-base font-bold tracking-wider text-[#202938] dark:text-white whitespace-nowrap">
              AURIX 2.0
            </div>
            <div className="hidden sm:block text-[10px] font-mono tracking-[0.18em] text-[#D6AD60] font-semibold uppercase truncate">
              POWERED BY AM VEYRONIX
            </div>
          </div>
        </div>

        {/* Clean 5-Item Single-Line Navigation Bar */}
        <nav className="hidden md:flex items-center gap-1 p-1 rounded-xl bg-[#EEF2F7] dark:bg-[#0B111B] border border-slate-200 dark:border-slate-800">
          {TOP_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTopGroup.id === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveSection(item.sections[0])}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  active
                    ? "bg-[#10B981] text-white font-semibold shadow-sm"
                    : "text-[#64748B] dark:text-slate-300 hover:text-[#202938] dark:hover:text-white hover:bg-white/80 dark:hover:bg-slate-800/80"
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{item.name}</span>
              </button>
            );
          })}
        </nav>

        {/* Right HUD Status: Online/Offline + Emergency Stop + Clock + Owner */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => toggleEmergencyStop(!data.telemetry.emergencyStopActive)}
            title="Emergency Stop — Halts all desktop automation & proactive voice output"
            className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
              data.telemetry.emergencyStopActive
                ? "bg-rose-600 border-rose-700 text-white"
                : "bg-white dark:bg-[#0B111B] border-rose-300 dark:border-rose-700/70 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
            }`}
          >
            <OctagonAlert className="w-3.5 h-3.5 shrink-0" />
            <span>{data.telemetry.emergencyStopActive ? "STOPPED" : "Emergency Stop"}</span>
          </button>

          <div className="hidden lg:block text-right pr-2 border-r border-slate-200 dark:border-slate-800">
            <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#64748B]">
              {effectiveOnline ? "ONLINE MODE" : "OFFLINE MODE"}
            </div>
            <div className="text-xs font-mono font-semibold text-[#10B981] tabular-nums">
              {clockText}
            </div>
          </div>

          {data.security.hasPin && (
            <button
              type="button"
              onClick={() => setLocked(true)}
              title="Lock AURIX Session"
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-[#10B981] text-[#202938] dark:text-slate-200 cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5 text-[#D6AD60]" />
            </button>
          )}

          <div className="flex items-center gap-2 pl-1.5 pr-2.5 py-1 rounded-full border border-slate-200 dark:border-slate-700 bg-[#EEF2F7] dark:bg-[#0B111B]">
            <img
              src="/src/assets/images/avatar_abdul_muheeb_1795088206648.jpg"
              alt={data.owner.name}
              referrerPolicy="no-referrer"
              className="w-6 h-6 rounded-full object-cover shrink-0"
            />
            <span className="hidden sm:inline text-xs font-medium text-[#202938] dark:text-slate-200 whitespace-nowrap">
              {data.owner.name}
            </span>
          </div>
        </div>
      </header>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 md:hidden flex">
          <div className="w-64 bg-white dark:bg-[#0F1724] border-r border-slate-200 dark:border-slate-800 p-4 overflow-y-auto space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-display font-bold text-base text-[#202938] dark:text-white">AURIX 2.0</span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 text-[#64748B]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-1">
              {TOP_NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activeTopGroup.id === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveSection(item.sections[0]);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium ${
                      active
                        ? "bg-[#10B981] text-white font-semibold"
                        : "text-[#64748B] dark:text-slate-300"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex-1 bg-slate-900/50" onClick={() => setMobileMenuOpen(false)} />
        </div>
      )}

      {/* Post-Startup Hardware Consent Modal — Strictly Appears ONLY AFTER Splash Finishes */}
      {startupPhase === "ready" && !locked && !mediaConsentChoice && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/55 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="aurix-media-consent-title"
        >
          <div className="w-full max-w-md bg-white dark:bg-[#0F1724] border border-emerald-500/40 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/35 flex items-center justify-center shrink-0">
                <Volume2 className="w-5 h-5 text-[#10B981]" />
              </div>
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/35 flex items-center justify-center shrink-0">
                <Video className="w-5 h-5 text-[#06B6D4]" />
              </div>
              <div>
                <h2
                  id="aurix-media-consent-title"
                  className="text-base font-semibold text-[#202938] dark:text-white"
                >
                  Allow Microphone &amp; Camera Access?
                </h2>
                <p className="text-xs text-[#64748B] dark:text-slate-400">
                  AURIX will welcome you aloud immediately after
                </p>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-[#64748B] dark:text-slate-300 leading-relaxed">
              Grant Microphone &amp; Camera access for live voice conversation and vision snapshots, or select &quot;Continue &amp; Speak&quot; to proceed with voice greeting and text/upload control.
            </p>

            {mediaConsentMsg && (
              <div className="rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-[#D6AD60] px-3 py-2 text-xs text-[#202938] dark:text-amber-200">
                {mediaConsentMsg}
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  try {
                    localStorage.setItem("aurix_media_consent", "declined");
                  } catch {
                    // Ignore storage error
                  }
                  setMediaConsentChoice("declined");
                  setWelcomeTriggerCount((c) => c + 1);
                }}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-xs font-medium text-[#202938] dark:text-slate-200 hover:bg-[#EEF2F7] dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
              >
                Continue &amp; Speak
              </button>
              <button
                type="button"
                onClick={async () => {
                  setMediaConsentMsg(null);
                  try {
                    if (!navigator.mediaDevices?.getUserMedia) {
                      throw new Error("Media devices unavailable");
                    }
                    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
                    stream.getTracks().forEach((t) => t.stop());
                    try {
                      localStorage.setItem("aurix_media_consent", "granted");
                    } catch {
                      // Ignore storage error
                    }
                    setMediaConsentChoice("granted");
                    setReadiness((prev) => (prev ? { ...prev, microphoneStatus: "available" } : prev));
                    setWelcomeTriggerCount((c) => c + 1);
                  } catch {
                    setMediaConsentMsg(
                      "Live Mic/Camera is blocked by the browser or preview frame. Click 'Continue & Speak' — AURIX will welcome you aloud immediately."
                    );
                  }
                }}
                className="px-4 py-2 rounded-lg bg-[#10B981] hover:bg-emerald-600 text-white font-semibold text-xs cursor-pointer whitespace-nowrap"
              >
                Allow Access
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sub-Tabs inside AM VEYRONIX, Workspace, or System */}
      {(activeTopGroup.id === "company" ||
        activeTopGroup.id === "developer" ||
        activeTopGroup.id === "security") && (
        <div className="px-4 sm:px-6 pt-4 max-w-[1440px] w-full mx-auto">
          <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 dark:border-slate-800 pb-3">
            {SUB_TABS[activeTopGroup.id].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveSection(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  activeSection === tab.id
                    ? "bg-[#10B981]/12 border border-[#10B981]/45 text-emerald-700 dark:text-emerald-300 font-semibold"
                    : "border border-transparent text-[#64748B] dark:text-slate-400 hover:text-[#202938] dark:hover:text-slate-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto">
        {activeSection === "home" && (
          <CommandHubView
            owner={data.owner}
            company={data.company}
            websites={data.websites}
            projects={data.projects}
            tasks={data.tasks}
            conversations={data.conversations}
            settings={data.settings}
            telemetry={data.telemetry}
            isOnline={effectiveOnline}
            welcomeTriggerSignal={welcomeTriggerCount}
            onNavigate={setActiveSection}
            onUpdateSettings={updateSettings}
            onEmergencyStop={toggleEmergencyStop}
            onConversationsUpdated={(conversations) =>
              setData((prev) => (prev ? { ...prev, conversations } : prev))
            }
          />
        )}

        {activeSection === "creative" && <CreativePcView websites={data.websites} />}

        {activeSection === "selfheal" && <SelfHealView />}

        {activeSection === "chat" && (
          <ChatView
            conversations={data.conversations}
            websites={data.websites}
            settings={data.settings}
            pendingQuickPrompt={pendingQuickPrompt}
            onClearPendingQuickPrompt={() => setPendingQuickPrompt(null)}
            onConversationsUpdated={(conversations) =>
              setData((prev) => (prev ? { ...prev, conversations } : prev))
            }
          />
        )}

        {activeSection === "voice" && (
          <VoiceAssistantView settings={data.settings} onUpdateSettings={updateSettings} />
        )}

        {activeSection === "company" && (
          <CompanyView company={data.company} onSaveCompany={saveCompany} />
        )}

        {activeSection === "websites" && (
          <WebsitesView websites={data.websites} onSaveWebsite={saveWebsite} />
        )}

        {activeSection === "projects" && (
          <ProjectsView projects={data.projects} onSaveProject={saveProject} />
        )}

        {activeSection === "developer" && <DeveloperView websites={data.websites} />}

        {activeSection === "files" && <FileVisionView onSaveMemory={saveMemory} />}

        {activeSection === "research" && <ResearchView language={data.settings.language} />}

        {activeSection === "business" && (
          <BusinessView items={data.business} onSaveItem={saveBusinessItem} />
        )}

        {activeSection === "productivity" && (
          <ProductivityView
            tasks={data.tasks}
            notes={data.notes}
            onSaveTask={saveTask}
            onDeleteTask={deleteTask}
            onSaveNote={saveNote}
            onDeleteNote={deleteNote}
          />
        )}

        {activeSection === "system" && (
          <SystemMonitorView
            telemetry={data.telemetry}
            auditLogs={data.auditLogs}
            onRefreshTelemetry={refreshTelemetry}
            onLogApprovedAction={logApprovedAction}
            onEmergencyStop={toggleEmergencyStop}
          />
        )}

        {activeSection === "security" && (
          <SecurityCenterView
            security={data.security}
            auditLogs={data.auditLogs}
            onSetPin={handleSetPin}
            onUpdatePrefs={handleSecurityPrefs}
            onLockNow={() => setLocked(true)}
          />
        )}

        {activeSection === "models" && (
          <ModelsView
            settings={data.settings}
            telemetry={data.telemetry}
            isOnline={effectiveOnline}
            onUpdateSettings={updateSettings}
          />
        )}

        {activeSection === "blueprint" && <BlueprintView />}

        {activeSection === "settings" && (
          <SettingsView
            owner={data.owner}
            settings={data.settings}
            memories={data.memories}
            websites={data.websites}
            telemetry={data.telemetry}
            onSaveOwner={saveOwner}
            onUpdateSettings={updateSettings}
            onSaveMemory={saveMemory}
            onDeleteMemory={deleteMemory}
            onReplayStartup={() => {
              sessionStorage.removeItem("aurix_greeted_this_launch");
              greetingAttemptedRef.current = false;
              setStartupPhase("animating");
            }}
          />
        )}
      </main>
    </div>
  );
}
