import React, { useCallback, useEffect, useRef, useState } from "react";
import { Video, Volume2 } from "lucide-react";
import type {
  AppSettings,
  AurixLanguage,
  AurixSectionId,
  BiometricSnapshot,
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
import { ChatView } from "./components/ChatView";
import { VoiceAssistantView } from "./components/VoiceAssistantView";
import { VoiceCommandSystem } from "./components/VoiceCommandSystem";
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
import { NexusSidebar } from "./components/cockpit/NexusSidebar";
import { NexusTopBar } from "./components/cockpit/NexusTopBar";
import { CommandCenterView } from "./components/cockpit/CommandCenterView";
import { MemoryCenterView } from "./components/MemoryCenterView";
import { AutomationCenterView } from "./components/AutomationCenterView";
import { AuthGate } from "./components/biometrics/AuthGate";
import { AurixStatusRail } from "./components/biometrics/AurixStatusRail";
import { IdentityCenterView } from "./components/biometrics/IdentityCenterView";
import { TeachAurixView } from "./components/learning/TeachAurixView";
import { TrainingMemoryCenterView } from "./components/learning/TrainingMemoryCenterView";
import { ActivationView } from "./components/integration/ActivationView";
import { patchRuntime } from "./biometrics/runtime";

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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem("aurix_sidebar_collapsed") === "1";
    } catch {
      return false;
    }
  });
  const [moreOpen, setMoreOpen] = useState(false);
  const [fileMode, setFileMode] = useState<"summarize" | "ocr" | "vision" | "code-review" | "compare">("summarize");

  useEffect(() => {
    try {
      localStorage.setItem("aurix_sidebar_collapsed", sidebarCollapsed ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  }, [sidebarCollapsed]);
  const [pendingQuickPrompt, setPendingQuickPrompt] = useState<string | null>(null);
  const [browserOnline, setBrowserOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
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

  // Owner identity gate (face / voice / PIN, OR-based)
  const [biometrics, setBiometrics] = useState<BiometricSnapshot | null>(null);
  const [pendingActivation, setPendingActivation] = useState<{ source: string; detail: string; createdAt: string } | null>(null);
  const [unlockGreeting, setUnlockGreeting] = useState<string | null>(null);

  const refreshBiometrics = useCallback(async () => {
    try {
      const res = await fetch("/api/biometrics/status");
      if (!res.ok) throw new Error("status unavailable");
      const bio = (await res.json()) as BiometricSnapshot;
      setBiometrics(bio);
      setPendingActivation(bio.activation?.pending ?? null);
      patchRuntime({ serverOnline: true, session: bio.session.status, sessionMethod: bio.session.method });
      return bio;
    } catch {
      patchRuntime({ serverOnline: false });
      return null;
    }
  }, []);

  const loadBootstrap = useCallback(async () => {
    const res = await fetch("/api/bootstrap");
    const json = (await res.json()) as BootstrapPayload;
    setData(json);
    const bio = await refreshBiometrics();
    const biometricLocked = Boolean(
      bio &&
        (bio.enrollment.face.enrolled || bio.enrollment.voice.enrolled) &&
        bio.settings.requireBiometricOnBoot &&
        bio.session.status === "locked"
    );
    if (biometricLocked || (json.security.hasPin && json.security.requirePinOnBoot)) {
      setLocked(true);
    }
    setStartupPhase(json.settings.startupAnimationEnabled ? "animating" : "ready");
  }, [refreshBiometrics]);

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
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    const bump = () => {
      lastActivityRef.current = Date.now();
    };
    window.addEventListener("mousemove", bump);
    window.addEventListener("keydown", bump);
    const timer = setInterval(() => {
      if (locked || !data?.settings.autoLockEnabled) return;
      const bioEnrolled = Boolean(biometrics && (biometrics.enrollment.face.enrolled || biometrics.enrollment.voice.enrolled));
      if (!data?.security.hasPin && !bioEnrolled) return;
      const limitMs = data.security.inactivityMinutes * 60 * 1000;
      if (Date.now() - lastActivityRef.current > limitMs) {
        void fetch("/api/biometrics/session/lock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: `Inactivity auto-lock after ${data.security.inactivityMinutes} minutes.` }),
        })
          .then(() => refreshBiometrics())
          .finally(() => setLocked(true));
        patchRuntime({ session: "locked", sessionMethod: null });
      }
    }, 15000);
    return () => {
      window.removeEventListener("mousemove", bump);
      window.removeEventListener("keydown", bump);
      clearInterval(timer);
    };
  }, [data?.security.hasPin, data?.security.inactivityMinutes, data?.settings.autoLockEnabled, locked, biometrics, refreshBiometrics]);

  // While locked, watch for a Chrome/Gmail activation request so the gate can
  // explain why verification is being asked for.
  useEffect(() => {
    if (!locked) return;
    const timer = setInterval(async () => {
      try {
        const res = await fetch("/api/activation/status");
        if (!res.ok) return;
        const status = await res.json();
        setPendingActivation(status.pending ?? null);
      } catch {
        // Server briefly unavailable — keep the gate as-is.
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [locked]);

  useEffect(() => {
    if (!unlockGreeting) return;
    const timer = window.setTimeout(() => setUnlockGreeting(null), 9000);
    return () => window.clearTimeout(timer);
  }, [unlockGreeting]);

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
      // Open the server-side owner session too, so personal training memory is readable.
      await fetch("/api/biometrics/session/unlock-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pinAttempt }),
      }).catch(() => undefined);
      await refreshBiometrics();
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

  const handleBiometricVerified = async (method: string) => {
    await refreshBiometrics();
    setPendingActivation(null);
    setLocked(false);
    setPinError(null);
    lastActivityRef.current = Date.now();
    sessionStorage.removeItem("aurix_greeted_this_launch");
    greetingAttemptedRef.current = false;
    const hour = new Date().getHours();
    const partOfDay = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
    const firstName = (data?.owner.name || "Muheeb").split(" ")[0];
    setUnlockGreeting(`${partOfDay}, ${firstName}. AURIX systems are online — verified by ${method}. How may I assist you today?`);
    setWelcomeTriggerCount((count) => count + 1);
  };

  const lockAurixNow = async (reason: string) => {
    try {
      await fetch("/api/biometrics/session/lock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
    } finally {
      patchRuntime({ session: "locked", sessionMethod: null });
      await refreshBiometrics();
      setLocked(true);
    }
  };

  const logoutAurix = async () => {
    try {
      await fetch("/api/biometrics/session/logout", { method: "POST" });
    } finally {
      patchRuntime({ session: "locked", sessionMethod: null });
      await refreshBiometrics();
      setLocked(true);
    }
  };

  const dismissPendingActivation = async () => {
    await fetch("/api/activation/pending/clear", { method: "POST" }).catch(() => undefined);
    setPendingActivation(null);
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

  // Identity gate: no personal dashboard is rendered until the owner verifies.
  if (locked && biometrics) {
    return (
      <AuthGate
        ownerName={data.owner.name}
        snapshot={biometrics}
        pendingActivation={pendingActivation}
        onVerified={(method) => void handleBiometricVerified(method)}
        onRefresh={async () => {
          await refreshBiometrics();
        }}
        onDismissPending={dismissPendingActivation}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#05080D] bg-[radial-gradient(1200px_620px_at_50%_-10%,rgba(0,217,255,0.10),transparent_62%)] text-slate-100 flex flex-col">
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

      <div className="flex flex-1 min-h-0">
        <NexusSidebar
          activeSection={activeSection}
          onNavigate={(item) => {
            if (item.fileMode) setFileMode(item.fileMode);
            setActiveSection(item.id);
          }}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={() => setSidebarCollapsed((v) => !v)}
          mobileOpen={mobileMenuOpen}
          onCloseMobile={() => setMobileMenuOpen(false)}
          moreOpen={moreOpen}
          onToggleMore={() => setMoreOpen((v) => !v)}
          onNavigateSecondary={setActiveSection}
          fileMode={fileMode}
        />
        <div className="flex-1 min-w-0 flex flex-col">
          <NexusTopBar
            owner={data.owner}
            settings={data.settings}
            isOnline={effectiveOnline}
            tasks={data.tasks}
            activity={data.auditLogs.map((entry) => ({
              id: entry.id,
              label: `${entry.eventType} · ${entry.detail}`,
              at: entry.createdAt,
            }))}
            emergencyStopActive={data.telemetry.emergencyStopActive}
            onToggleEmergencyStop={toggleEmergencyStop}
            onNavigate={setActiveSection}
            onOpenMobileNav={() => setMobileMenuOpen(true)}
          />
          <main className="flex-1 w-full px-3 sm:px-5 py-4 pb-28 max-w-[1600px] mx-auto">
        {activeSection === "home" && (
          <CommandCenterView
            owner={data.owner}
            settings={data.settings}
            telemetry={data.telemetry}
            tasks={data.tasks}
            projects={data.projects}
            conversations={data.conversations}
            isOnline={effectiveOnline}
            welcomeTriggerSignal={welcomeTriggerCount}
            onNavigate={setActiveSection}
            onUpdateSettings={updateSettings}
          />
        )}

        {activeSection === "memory" && (
          <MemoryCenterView
            memories={data.memories}
            onSaveMemory={saveMemory}
            onDeleteMemory={deleteMemory}
          />
        )}

        {activeSection === "automation" && (
          <AutomationCenterView
            auditLogs={data.auditLogs}
            emergencyStopActive={data.telemetry.emergencyStopActive}
            onToggleEmergencyStop={toggleEmergencyStop}
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

        {activeSection === "files" && (
          <FileVisionView key={fileMode} initialMode={fileMode} onSaveMemory={saveMemory} />
        )}

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
            onLockNow={() => void lockAurixNow("Owner locked AURIX from the Security Center.")}
          />
        )}

        {activeSection === "identity" && biometrics && (
          <IdentityCenterView
            snapshot={biometrics}
            ownerName={data.owner.name}
            onRefresh={async () => {
              await refreshBiometrics();
            }}
            onLockNow={() => void lockAurixNow("Owner locked AURIX from Personal Authentication.")}
            onLogout={() => void logoutAurix()}
            onNavigate={setActiveSection}
          />
        )}

        {activeSection === "teach" && biometrics && (
          <TeachAurixView
            snapshot={biometrics}
            onRefresh={async () => {
              await refreshBiometrics();
            }}
            onOpenMemory={() => setActiveSection("training")}
          />
        )}

        {activeSection === "training" && <TrainingMemoryCenterView />}

        {activeSection === "activation" && biometrics && (
          <ActivationView
            snapshot={biometrics}
            onRefresh={async () => {
              await refreshBiometrics();
            }}
            onRequestAuth={() => setLocked(true)}
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
      </div>

      {/* Post-Startup Media Consent — appears only after the startup animation */}
      {startupPhase === "ready" && !locked && !mediaConsentChoice && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="aurix-media-consent-title"
        >
          <div className="nexus-panel w-full max-w-md space-y-4 rounded-2xl p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#00D9FF]/35 bg-[#00D9FF]/10">
                <Volume2 className="h-5 w-5 text-[#00D9FF]" />
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#147DFF]/35 bg-[#147DFF]/10">
                <Video className="h-5 w-5 text-[#147DFF]" />
              </div>
              <div>
                <h2 id="aurix-media-consent-title" className="text-base font-semibold text-white">
                  Allow Microphone &amp; Camera Access?
                </h2>
                <p className="text-xs text-[#94A8B8]">AURIX will welcome you aloud immediately after</p>
              </div>
            </div>

            <p className="text-xs leading-relaxed text-[#94A8B8] sm:text-sm">
              Grant Microphone &amp; Camera access for live voice conversation and vision snapshots, or select
              &quot;Continue &amp; Speak&quot; to proceed with voice greeting and text/upload control.
            </p>

            {mediaConsentMsg && (
              <div className="rounded-lg border border-[#D6AD60] bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
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
                className="whitespace-nowrap rounded-lg border border-[#A9C8D5]/30 px-4 py-2 text-xs font-medium text-[#D6E6EE] hover:bg-white/5 cursor-pointer"
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
                className="whitespace-nowrap rounded-lg bg-[#00D9FF] px-4 py-2 text-xs font-semibold text-[#05080D] hover:bg-[#33E3FF] cursor-pointer"
              >
                Allow Access
              </button>
            </div>
          </div>
        </div>
      )}

      {unlockGreeting && (
        <div className="pointer-events-none fixed left-1/2 top-4 z-40 w-[min(92vw,560px)] -translate-x-1/2 rounded-2xl border border-emerald-400/35 bg-[#071B2A]/95 px-4 py-3 text-center text-xs text-emerald-200 shadow-[0_18px_50px_rgba(0,0,0,0.55)] backdrop-blur-md">
          {unlockGreeting}
        </div>
      )}

      <AurixStatusRail />

      {startupPhase === "ready" && !locked && mediaConsentChoice && (
        <VoiceCommandSystem
          settings={data.settings}
          tasks={data.tasks}
          mediaConsent={mediaConsentChoice}
          emergencyStopActive={data.telemetry.emergencyStopActive}
          onNavigate={setActiveSection}
          onAddTask={saveTask}
          onAddNote={saveNote}
          onUpdateSettings={updateSettings}
          onEmergencyStop={toggleEmergencyStop}
          onLock={() => setLocked(true)}
          onRefreshSystem={refreshTelemetry}
        />
      )}
    </div>
  );
}
