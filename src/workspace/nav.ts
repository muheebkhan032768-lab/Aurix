import type { ComponentType } from "react";
import {
  Activity,
  BarChart3,
  BellRing,
  BookOpen,
  Bot,
  BrainCircuit,
  Briefcase,
  Building2,
  Code2,
  Database,
  FileSearch,
  FileText,
  Fingerprint,
  FolderKanban,
  FolderOpen,
  Gauge,
  Globe2,
  GraduationCap,
  Headphones,
  HelpCircle,
  History,
  Home,
  Layers,
  Link2,
  ListChecks,
  Mic,
  Monitor,
  Palette,
  Plug,
  Settings,
  ShieldCheck,
  Sparkles,
  StickyNote,
  Wrench,
} from "lucide-react";
import type { AurixSectionId } from "../types/aurix";

export type NavIcon = ComponentType<{ className?: string }>;

export interface WorkspaceNavItem {
  id: string;
  label: string;
  hint: string;
  icon: NavIcon;
  /** Renders an existing AURIX module instead of a workspace view. */
  legacy?: AurixSectionId;
  /** Extra legacy file mode (File Intelligence / Vision). */
  fileMode?: "summarize" | "ocr" | "vision" | "code-review" | "compare";
}

export interface WorkspaceNavGroup {
  id: string;
  label: string;
  items: WorkspaceNavItem[];
}

export const WORKSPACE_NAV: WorkspaceNavGroup[] = [
  {
    id: "main",
    label: "Main",
    items: [
      { id: "command-center", label: "Command Center", hint: "Live overview", icon: Home },
      { id: "ai-workspace", label: "AI Workspace", hint: "Chat & creation", icon: Sparkles },
      { id: "voice", label: "Voice Intelligence", hint: "Speak with AURIX", icon: Mic },
      { id: "neural", label: "Neural Activity", hint: "Live reasoning map", icon: Activity },
      { id: "analytics", label: "AI Analytics", hint: "Measured usage", icon: BarChart3 },
    ],
  },
  {
    id: "productivity",
    label: "Productivity",
    items: [
      { id: "projects", label: "Projects", hint: "Delivery portfolio", icon: FolderKanban },
      { id: "documents", label: "Documents", hint: "Drafts & specs", icon: FileText },
      { id: "notes", label: "Notes", hint: "Captured knowledge", icon: StickyNote },
      { id: "reminders", label: "Reminders", hint: "Scheduled nudges", icon: BellRing },
      { id: "tasks", label: "Task Manager", hint: "Execution queue", icon: ListChecks },
      { id: "history", label: "History", hint: "Conversations & events", icon: History },
    ],
  },
  {
    id: "intelligence",
    label: "Intelligence & Security",
    items: [
      { id: "memory", label: "Memory Center", hint: "Approved context", icon: BrainCircuit },
      { id: "knowledge", label: "Knowledge Center", hint: "Company & websites", icon: BookOpen },
      { id: "security", label: "Security Center", hint: "Auth & secrets", icon: ShieldCheck },
      { id: "automation", label: "Automation Center", hint: "Workflows & runs", icon: Bot },
    ],
  },
  {
    id: "system",
    label: "System",
    items: [
      { id: "integrations", label: "Integrations", hint: "Connections", icon: Plug },
      { id: "models", label: "Model Management", hint: "Models & hardware", icon: Layers },
      { id: "settings", label: "Settings", hint: "Workspace preferences", icon: Settings },
      { id: "help", label: "Help & Support", hint: "Shortcuts & limits", icon: HelpCircle },
    ],
  },
  {
    id: "advanced",
    label: "Advanced Modules",
    items: [
      { id: "legacy-developer", label: "Developer Workspace", hint: "Code & review", icon: Code2, legacy: "developer" },
      { id: "legacy-files", label: "File Intelligence", hint: "Documents & OCR", icon: FileSearch, legacy: "files", fileMode: "summarize" },
      { id: "legacy-vision", label: "Vision System", hint: "Screen & images", icon: FileSearch, legacy: "files", fileMode: "vision" },
      { id: "legacy-business", label: "Business Intelligence", hint: "Clients & proposals", icon: Briefcase, legacy: "business" },
      { id: "legacy-system", label: "Computer Control", hint: "Windows operations", icon: Monitor, legacy: "system" },
      { id: "legacy-creative", label: "Creative Studio", hint: "Visual generation", icon: Palette, legacy: "creative" },
      { id: "legacy-research", label: "Research", hint: "Grounded search", icon: Globe2, legacy: "research" },
      { id: "legacy-company", label: "Company Knowledge", hint: "AM VEYRONIX profile", icon: Building2, legacy: "company" },
      { id: "legacy-websites", label: "Website Registry", hint: "Domains & stacks", icon: Database, legacy: "websites" },
      { id: "legacy-identity", label: "Personal Authentication", hint: "Face & voice", icon: Fingerprint, legacy: "identity" },
      { id: "legacy-teach", label: "Teach AURIX", hint: "Visual learning", icon: GraduationCap, legacy: "teach" },
      { id: "legacy-training", label: "Training Memory", hint: "Approved examples", icon: Database, legacy: "training" },
      { id: "legacy-activation", label: "Chrome & Gmail", hint: "Activation bridge", icon: Link2, legacy: "activation" },
      { id: "legacy-selfheal", label: "Self-Healer", hint: "12-step repair", icon: Wrench, legacy: "selfheal" },
      { id: "legacy-productivity", label: "Productivity Studio", hint: "Original tasks & notes", icon: Headphones, legacy: "productivity" },
      { id: "legacy-chat", label: "Classic Chat", hint: "Original session view", icon: Bot, legacy: "chat" },
      { id: "legacy-voice", label: "Voice Command Deck", hint: "Original voice panel", icon: Gauge, legacy: "voice" },
      { id: "legacy-models", label: "Local Model Catalog", hint: "Ollama models", icon: FolderOpen, legacy: "models" },
      { id: "legacy-settings", label: "Advanced Settings", hint: "Full configuration", icon: Settings, legacy: "settings" },
    ],
  },
];

export const ALL_NAV_ITEMS = WORKSPACE_NAV.flatMap((group) => group.items);

export function findNavItem(id: string): WorkspaceNavItem {
  return ALL_NAV_ITEMS.find((item) => item.id === id) || ALL_NAV_ITEMS[0];
}

export const QUICK_ACTIONS: Array<{ label: string; url: string; hint: string }> = [
  { label: "YouTube", url: "https://www.youtube.com", hint: "Official site" },
  { label: "Google", url: "https://www.google.com", hint: "Official site" },
  { label: "Gmail", url: "https://mail.google.com", hint: "Official site" },
  { label: "WhatsApp Web", url: "https://web.whatsapp.com", hint: "Official site" },
  { label: "ChatGPT", url: "https://chatgpt.com", hint: "Official site" },
  { label: "GitHub", url: "https://github.com", hint: "Official site" },
  { label: "Fiverr", url: "https://www.fiverr.com", hint: "Official site" },
  { label: "LinkedIn", url: "https://www.linkedin.com", hint: "Official site" },
];
