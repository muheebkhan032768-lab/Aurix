import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Building2,
  Code2,
  Home,
  Lock,
  Menu,
  Moon,
  OctagonAlert,
  Settings,
  ShieldCheck,
  Sun,
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
        <div className="min-h-screen bg-[#F6F5FB] text-[#1A1826] flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-2xl border border-violet-500/40 bg-white shadow-xl p-6 space-y-4">
            <div className="text-xs font-mono uppercase tracking-[0.2em] text-[#7C5CFF]">
              AURIX Self-Healing Recovery
            </div>
            <h1 className="text-lg font-semibold">Runtime Anomaly Contained</h1>
            <p className="text-xs text-[#6B6880] leading-relaxed">
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
              className="w-full py-2.5 rounded-xl bg-[#7C5CFF] hover:bg-violet-600 text-white font-semibold text-xs cursor-pointer"
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
  const [activeSection, setActiveSection] = useState<AurixSectionId>("home");
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
    return <div className="min-h-screen bg-[#F6F5FB]" aria-label="Launching AURIX 2.0" />;
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
    <div className="aurix-app-bg flex min-h-screen flex-col text-[#1A1826] dark:text-slate-100">
      {/* PIN Lock Gate */}
      {locked && (
        <div className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-md flex items-center justify-center p-4">
          <form
            onSubmit={handleUnlock}
            className="w-full max-w-sm bg-white dark:bg-[#12121A] border border-violet-500/40 rounded-2xl p-8 text-center space-y-5 shadow-2xl"
          >
            <img
              src="/src/assets/images/aurix_core_emblem_1795088206132.jpg"
              alt="AURIX Security Core"
              referrerPolicy="no-referrer"
              className="w-20 h-20 rounded-full mx-auto object-cover border-2 border-[#7C5CFF]"
            />
            <div>
              <h2 className="text-xl font-semibold text-[#1A1826] dark:text-white">AURIX Session Locked</h2>
              <p className="text-xs text-[#6B6880] dark:text-slate-400 mt-1">
                Enter Abdul Muheeb&apos;s personal PIN to unlock workspace.
              </p>
            </div>
            <input
              type="password"
              autoFocus
              value={pinAttempt}
              onChange={(e) => setPinAttempt(e.target.value)}
              placeholder="Enter PIN..."
              className="w-full text-center tracking-widest bg-[#EFEDF7] dark:bg-[#0B0B10] border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-3 text-sm text-[#1A1826] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#7C5CFF]"
            />
            {pinError && <p className="text-xs text-rose-600">{pinError}</p>}
            <button
              type="submit"
              className="w-full py-2.5 rounded-lg bg-[#7C5CFF] hover:bg-violet-600 text-white text-sm font-semibold cursor-pointer"
            >
              Unlock AURIX
            </button>
          </form>
        </div>
      )}

      {/* Premium application header */}
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-black/5 bg-white/80 px-3 backdrop-blur-xl sm:px-6 dark:border-white/10 dark:bg-[#0B0B10]/85">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open navigation"
            className="md:hidden p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-[#1A1826] dark:text-slate-200"
          >
            <Menu className="w-4 h-4" />
          </button>
          <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#7C5CFF_0%,#22D3EE_100%)] shadow-[0_10px_24px_-12px_rgba(124,92,255,0.9)]">
            <AurixLogo className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <div className="font-display text-[15px] font-semibold leading-tight tracking-tight text-[#1A1826] dark:text-white whitespace-nowrap">
              AURIX
            </div>
            <div className="hidden text-[9px] font-medium uppercase tracking-[0.2em] text-[#6B6880] sm:block dark:text-slate-400 whitespace-nowrap">
              Powered by AM Veyronix
            </div>
          </div>
        </div>

        {/* Clean 5-Item Single-Line Navigation Bar */}
        <nav className="hidden items-center gap-1 rounded-full border border-black/5 bg-white/70 p-1 shadow-[0_1px_0_rgba(255,255,255,0.6)_inset] md:flex dark:border-white/10 dark:bg-white/[0.04]">
          {TOP_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTopGroup.id === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveSection(item.sections[0])}
                className={`inline-flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                  active
                    ? "bg-[linear-gradient(135deg,#7C5CFF,#6D3EF5)] font-semibold text-white shadow-[0_8px_20px_-12px_rgba(124,92,255,0.9)]"
                    : "text-[#6B6880] hover:bg-black/[0.04] hover:text-[#1A1826] dark:text-slate-300 dark:hover:bg-white/[0.06] dark:hover:text-white"
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{item.name}</span>
              </button>
            );
          })}
        </nav>

        {/* Right HUD Status: Online/Offline + Emergency Stop + Clock + Owner */}
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() =>
              updateSettings({
                ...data.settings,
                theme: data.settings.theme === "dark" ? "light" : "dark",
              })
            }
            aria-label={data.settings.theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            title="Toggle light / dark theme"
            className="cursor-pointer rounded-full border border-black/5 bg-white/70 p-2 text-[#1A1826] transition-colors hover:border-[#7C5CFF]/40 hover:text-[#7C5CFF] dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200"
          >
            {data.settings.theme === "dark" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </button>

          <button
            type="button"
            onClick={() => toggleEmergencyStop(!data.telemetry.emergencyStopActive)}
            title="Emergency Stop — Halts all desktop automation & proactive voice output"
            className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
              data.telemetry.emergencyStopActive
                ? "bg-rose-600 border-rose-700 text-white"
                : "bg-white dark:bg-[#0B0B10] border-rose-300 dark:border-rose-700/70 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
            }`}
          >
            <OctagonAlert className="w-3.5 h-3.5 shrink-0" />
            <span>{data.telemetry.emergencyStopActive ? "STOPPED" : "Emergency Stop"}</span>
          </button>

          <div className="hidden lg:block text-right pr-2 border-r border-slate-200 dark:border-slate-800">
            <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#6B6880]">
              {effectiveOnline ? "ONLINE MODE" : "OFFLINE MODE"}
            </div>
            <div className="text-xs font-mono font-semibold text-[#7C5CFF] tabular-nums">
              {clockText}
            </div>
          </div>

          {data.security.hasPin && (
            <button
              type="button"
              onClick={() => setLocked(true)}
              title="Lock AURIX Session"
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-[#7C5CFF] text-[#1A1826] dark:text-slate-200 cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5 text-[#22D3EE]" />
            </button>
          )}

          <div className="flex items-center gap-2 pl-1.5 pr-2.5 py-1 rounded-full border border-slate-200 dark:border-slate-700 bg-[#EFEDF7] dark:bg-[#0B0B10]">
            <img
              src="/src/assets/images/avatar_abdul_muheeb_1795088206648.jpg"
              alt={data.owner.name}
              referrerPolicy="no-referrer"
              className="w-6 h-6 rounded-full object-cover shrink-0"
            />
            <span className="hidden sm:inline text-xs font-medium text-[#1A1826] dark:text-slate-200 whitespace-nowrap">
              {data.owner.name}
            </span>
          </div>
        </div>
      </header>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 md:hidden flex">
          <div className="w-64 bg-white dark:bg-[#12121A] border-r border-slate-200 dark:border-slate-800 p-4 overflow-y-auto space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-display font-bold text-base text-[#1A1826] dark:text-white">AURIX 2.0</span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 text-[#6B6880]"
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
                        ? "bg-[#7C5CFF] text-white font-semibold"
                        : "text-[#6B6880] dark:text-slate-300"
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
          <div className="w-full max-w-md bg-white dark:bg-[#12121A] border border-violet-500/40 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/35 flex items-center justify-center shrink-0">
                <Volume2 className="w-5 h-5 text-[#7C5CFF]" />
              </div>
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/35 flex items-center justify-center shrink-0">
                <Video className="w-5 h-5 text-[#06B6D4]" />
              </div>
              <div>
                <h2
                  id="aurix-media-consent-title"
                  className="text-base font-semibold text-[#1A1826] dark:text-white"
                >
                  Allow Microphone &amp; Camera Access?
                </h2>
                <p className="text-xs text-[#6B6880] dark:text-slate-400">
                  AURIX will welcome you aloud immediately after
                </p>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-[#6B6880] dark:text-slate-300 leading-relaxed">
              Grant Microphone &amp; Camera access for live voice conversation and vision snapshots, or select &quot;Continue &amp; Speak&quot; to proceed with voice greeting and text/upload control.
            </p>

            {mediaConsentMsg && (
              <div className="rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-[#22D3EE] px-3 py-2 text-xs text-[#1A1826] dark:text-amber-200">
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
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-xs font-medium text-[#1A1826] dark:text-slate-200 hover:bg-[#EFEDF7] dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
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
                className="px-4 py-2 rounded-lg bg-[#7C5CFF] hover:bg-violet-600 text-white font-semibold text-xs cursor-pointer whitespace-nowrap"
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
        <div className="mx-auto w-full max-w-[1560px] px-3 pt-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-black/5 bg-white/60 p-1.5 dark:border-white/10 dark:bg-white/[0.03]">
            {SUB_TABS[activeTopGroup.id].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveSection(tab.id)}
                className={`cursor-pointer whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-medium transition-colors ${
                  activeSection === tab.id
                    ? "bg-white font-semibold text-[#1A1826] shadow-sm dark:bg-white/10 dark:text-white"
                    : "text-[#6B6880] hover:bg-white/70 hover:text-[#1A1826] dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <main className="mx-auto w-full max-w-[1560px] flex-1 px-3 py-5 sm:px-6 sm:py-7">
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
