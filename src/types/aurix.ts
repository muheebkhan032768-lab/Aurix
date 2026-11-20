export type AurixSectionId =
  | "home"
  | "chat"
  | "voice"
  | "company"
  | "websites"
  | "projects"
  | "developer"
  | "files"
  | "research"
  | "business"
  | "productivity"
  | "system"
  | "selfheal"
  | "creative"
  | "security"
  | "models"
  | "settings";

export type AurixLanguage = "English" | "Urdu" | "Hindi";
export type ThinkingDepth = "LOW" | "MEDIUM" | "HIGH" | "XHIGH";
export type ProjectStatus = "completed" | "active" | "planned" | "abandoned";
export type PerformanceMode = "auto" | "lightweight" | "balanced" | "advanced";

export interface OwnerProfile {
  name: string;
  role: string;
  company: string;
  background: string[];
  programmingSkills: string[];
  designSkills: string[];
  businessGoals: string[];
  learningGoals: string[];
  preferences: string;
  ongoingTasks: string[];
  updatedAt: string;
}

export interface CompanyDocument {
  id: string;
  title: string;
  category: string;
  content: string;
  addedAt: string;
}

export interface CompanyProfile {
  name: string;
  founder: string;
  vision: string;
  services: string[];
  strategy: string;
  marketingPlan: string;
  hiringPlan: string;
  futureProducts: string[];
  documents: CompanyDocument[];
  updatedAt: string;
}

export interface WebsiteRecord {
  id: string;
  name: string;
  tagline: string;
  purpose: string;
  status: ProjectStatus;
  activeDomain: string;
  domains: string[];
  hostingProviders: string[];
  stack: string[];
  files: string[];
  features: string[];
  pages: string;
  databaseNotes: string;
  apiIntegrations: string;
  deploymentHistory: string;
  knownBugs: string;
  pendingTasks: string;
  securityNotes: string;
  futureImprovements: string;
  updatedAt: string;
}

export interface ProjectRecord {
  id: string;
  name: string;
  category: string;
  description: string;
  status: ProjectStatus;
  progress: number;
  stack: string[];
  locationOrUrl: string;
  knownBugs: string;
  pendingTasks: string;
  securityNotes: string;
  updatedAt: string;
}

export interface MemoryItem {
  id: string;
  category: string;
  title: string;
  content: string;
  source: string;
  projectScope: string;
  approved: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  modelUsed?: string;
  language?: string;
  thinkingLevel?: string;
  sources?: { title: string; uri: string }[];
  createdAt: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  mode: string;
  model: string;
  language: string;
  createdAt: string;
  updatedAt: string;
}

export type BusinessItemKind =
  | "client"
  | "proposal"
  | "quotation"
  | "invoice"
  | "package"
  | "marketing";

export interface BusinessItem {
  id: string;
  kind: BusinessItemKind;
  title: string;
  clientName: string;
  status: string;
  amount: number;
  currency: string;
  details: string;
  verifiedEntry: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TaskItem {
  id: string;
  title: string;
  category: "daily" | "study" | "business" | "dev";
  priority: "low" | "medium" | "high";
  status: "todo" | "in_progress" | "done";
  dueDate: string;
  notes: string;
  createdAt: string;
}

export interface NoteItem {
  id: string;
  title: string;
  category: string;
  content: string;
  updatedAt: string;
}

export interface SecurityStatus {
  hasPin: boolean;
  isLockedOut: boolean;
  lockedUntil: string | null;
  failedAttempts: number;
  inactivityMinutes: number;
  requirePinOnBoot: boolean;
  windowsHelloStatus: string;
  updatedAt: string;
}

export interface AuditLogEntry {
  id: string;
  eventType: string;
  actor: string;
  detail: string;
  severity: "info" | "warning" | "security";
  createdAt: string;
}

export interface AppSettings {
  voiceName: "Charon" | "Fenrir" | "Puck";
  voiceSpeed: number;
  voicePitch: number;
  language: AurixLanguage;
  wakePhrase: string;
  voiceEnabled: boolean;
  pushToTalk: boolean;
  handsFreeVadEnabled: boolean;
  vadSensitivity: number;
  micSensitivity: number;
  theme: "dark" | "light";
  activeModel: "gemini-4-hydrogen" | "gemini-3.1-flash-lite";
  thinkingLevel: ThinkingDepth;
  performanceMode: PerformanceMode;
  offlineModeForced: boolean;
  cameraEnabled: boolean;
  lightweightAnimations: boolean;
  autoHealEnabled: boolean;
  autoLockEnabled: boolean;
  notificationsEnabled: boolean;
  startupBehavior: string;
  startupAnimationEnabled: boolean;
  startupDurationSeconds: number;
  startupSoundEnabled: boolean;
  startupSoundVolume: number;
  autoVoiceGreetingEnabled: boolean;
  greetingLanguage: AurixLanguage;
  greetingVolume: number;
  autoStartEnabled: boolean;
  proactiveTalkEnabled: boolean;
  proactiveIntervalSeconds: number;
  doNotDisturb: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
}

export interface SystemReadiness {
  aiProviderConnected: boolean;
  localModelsAvailable: boolean;
  ownerProfileLoaded: boolean;
  companyKnowledgeLoaded: boolean;
  securityVerified: boolean;
  microphoneStatus: "available" | "denied" | "unknown";
  checkedAt: string;
}

export interface LocalOllamaModelInfo {
  name: string;
  sizeGb: number;
  fit: "Fits RAM" | "Tight Fit" | "Exceeds RAM";
  modifiedAt?: string;
}

export interface SystemTelemetry {
  hostname: string;
  platform: string;
  release: string;
  arch: string;
  cpuModel: string;
  cpuCores: number;
  loadAvg1m: number;
  totalMemoryBytes: number;
  freeMemoryBytes: number;
  usedMemoryBytes: number;
  installedRamGb: number;
  diskTotalBytes: number;
  diskFreeBytes: number;
  uptimeSeconds: number;
  nodeVersion: string;
  hardwareTier: "Entry" | "Mid-Range" | "High-Performance";
  recommendedMode: "Lightweight" | "Balanced" | "Advanced";
  gpuAccelerationNote: string;
  hardwareSummaryNote: string;
  ollamaReachable: boolean;
  ollamaModels: LocalOllamaModelInfo[];
  emergencyStopActive: boolean;
}

export type HardwareAuditStatus = "Ready" | "Limited" | "Cloud-dependent" | "Requires setup";

export interface HardwareAuditReport {
  generatedAt: string;
  source: "windows-host" | "linux-host" | "other-host";
  isWindowsHost: boolean;
  machine: {
    hostname: string;
    osLabel: string;
    arch: string;
    cpuModel: string;
    physicalCores: number | null;
    logicalCores: number;
    installedRamGb: number;
    freeRamGb: number;
    diskTotalGb: number;
    diskFreeGb: number;
    gpuName: string | null;
    gpuVramGb: number | null;
    gpuKind: "Dedicated" | "Integrated/Unknown" | "Not detectable";
    windowsEdition: string | null;
  };
  score: number;
  tier: "Entry" | "Mid-Range" | "High-Performance";
  performanceMode: "ECO MODE" | "BALANCED MODE" | "PERFORMANCE MODE" | "CLOUD INTELLIGENCE MODE";
  cloudModeAvailable: boolean;
  recommendedLocalModel: { id: string; label: string; approxSizeGb: number; rationale: string };
  architecture: {
    headline: string;
    localLayer: string;
    cloudLayer: string;
    voiceLayer: string;
    visionLayer: string;
    automationLayer: string;
    storageLayer: string;
    rationale: string[];
  };
  subsystems: Array<{ id: string; label: string; status: HardwareAuditStatus; detail: string }>;
  checks: Array<{ label: string; verdict: "pass" | "warn" | "fail"; detail: string }>;
  warnings: string[];
}

export interface DeliverableFile {
  path: string;
  category: "Python Core" | "C# WPF Desktop" | "Build & Installer" | "Documentation";
  language: string;
  description: string;
  content: string;
}

export interface BootstrapPayload {
  owner: OwnerProfile;
  company: CompanyProfile;
  websites: WebsiteRecord[];
  projects: ProjectRecord[];
  memories: MemoryItem[];
  conversations: ConversationSummary[];
  business: BusinessItem[];
  tasks: TaskItem[];
  notes: NoteItem[];
  security: SecurityStatus;
  auditLogs: AuditLogEntry[];
  settings: AppSettings;
  telemetry: SystemTelemetry;
}

export type SubsystemHealthStatus = "healthy" | "repaired" | "warning" | "error";

export interface SelfHealCheck {
  id: string;
  component: "frontend" | "backend" | "database" | "voice" | "ai" | "filesystem" | "dependencies";
  name: string;
  status: SubsystemHealthStatus;
  detail: string;
  checkedAt: string;
}

export interface SelfHealStepTrace {
  step: number;
  name: string;
  status: "done" | "skipped" | "failed";
  detail: string;
}

export interface SelfHealProblem {
  id: string;
  component: string;
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  rootCause: string;
  proposedRepair: string;
  status: "detected" | "repaired" | "rolled_back" | "failed";
}

export interface SelfHealBackupEntry {
  id: string;
  filename: string;
  createdAt: string;
  sizeBytes: number;
  reason: string;
}

export interface SelfHealHistoryEntry {
  id: string;
  overallStatus: string;
  detectedCount: number;
  repairedCount: number;
  failedCount: number;
  summary: string;
  createdAt: string;
}

export interface SelfHealReport {
  overallStatus: "healthy" | "repaired" | "attention";
  lastRunAt: string;
  autoRepairsCount: number;
  detectedCount: number;
  repairedCount: number;
  failedCount: number;
  subsystems: {
    frontendHealth: SubsystemHealthStatus;
    backendHealth: SubsystemHealthStatus;
    databaseHealth: SubsystemHealthStatus;
    voiceHealth: SubsystemHealthStatus;
    aiHealth: SubsystemHealthStatus;
    filesystemHealth: SubsystemHealthStatus;
    dependencyHealth: SubsystemHealthStatus;
  };
  checks: SelfHealCheck[];
  problems: SelfHealProblem[];
  stepTrace: SelfHealStepTrace[];
  backups: SelfHealBackupEntry[];
  repairLog: string[];
}

export interface DesktopActionLog {
  id: string;
  action: string;
  target: string;
  status: "approved" | "blocked" | "stopped" | "executed_preview";
  executedIn: string;
  detail: string;
  createdAt: string;
}

export interface CreativeAsset {
  kind: "picture" | "video" | "prompt" | "writing" | "website";
  title: string;
  prompt: string;
  svgMarkup?: string;
  videoScenes?: Array<{
    caption: string;
    accentColor: string;
    bgTop: string;
    bgBottom: string;
    motion: "orbit" | "pulse" | "grid" | "wave";
  }>;
  engineeredPrompt?: string;
  writtenText?: string;
  websiteHtml?: string;
  source: "gemini-free" | "ollama-local" | "offline-engine";
}
