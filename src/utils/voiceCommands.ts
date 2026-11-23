import type { AurixSectionId, TaskItem } from "../types/aurix";
import { matchWebsiteCommand, type WebsiteAccount, type WebsiteEntry } from "./websiteRegistry";

export type VoiceTheme = "dark" | "light";

export type VoiceActionId =
  | "self_heal"
  | "emergency_stop_on"
  | "emergency_stop_off"
  | "set_theme"
  | "mute_voice"
  | "unmute_voice"
  | "lock_session"
  | "refresh_system"
  | "task_summary"
  | "tell_time"
  | "open_external"
  | "help";

export type VoiceIntent =
  | { kind: "navigate"; section: AurixSectionId; label: string }
  | {
      kind: "add_task";
      title: string;
      priority: TaskItem["priority"];
      category: TaskItem["category"];
      label: string;
    }
  | { kind: "add_note"; title: string; content: string; label: string }
  | { kind: "action"; action: VoiceActionId; label: string; theme?: VoiceTheme; url?: string }
  | {
      kind: "open_website";
      entry: WebsiteEntry;
      account?: WebsiteAccount;
      needsAccount: boolean;
      label: string;
    }
  | { kind: "link_command"; text: string; label: string }
  | { kind: "cancel"; label: string }
  | { kind: "ask_ai"; text: string; label: string };

interface SectionCommand {
  section: AurixSectionId;
  label: string;
  keywords: string[];
}

const SECTION_COMMANDS: SectionCommand[] = [
  { section: "home", label: "Command Hub", keywords: ["home", "command hub", "dashboard", "main screen"] },
  { section: "chat", label: "Chat Archive", keywords: ["chat", "chat archive", "messages", "conversations"] },
  {
    section: "voice",
    label: "Voice Studio",
    keywords: ["voice studio", "voice settings", "voice engine", "voice assistant", "voice"],
  },
  { section: "company", label: "Company Profile", keywords: ["company", "am veyronix"] },
  {
    section: "links",
    label: "Link Vault",
    keywords: ["link vault", "saved links", "link manager", "saved websites", "bookmarks"],
  },
  { section: "websites", label: "Website Manager", keywords: ["websites", "website manager", "sites"] },
  { section: "projects", label: "Projects", keywords: ["projects", "project manager"] },
  { section: "developer", label: "Developer Workspace", keywords: ["developer", "dev studio", "workspace"] },
  {
    section: "creative",
    label: "Creative Studio",
    keywords: ["creative", "creative studio", "image studio", "video studio", "studio"],
  },
  { section: "files", label: "File & Vision", keywords: ["files", "file and vision", "file vision", "vision"] },
  { section: "research", label: "Research", keywords: ["research", "web research"] },
  { section: "business", label: "Business", keywords: ["business", "clients", "invoices"] },
  {
    section: "productivity",
    label: "Tasks & Notes",
    keywords: ["productivity", "tasks", "to do list", "todo list", "notes"],
  },
  {
    section: "system",
    label: "System Monitor",
    keywords: ["system", "system monitor", "pc monitor", "telemetry"],
  },
  {
    section: "selfheal",
    label: "Self-Healer",
    keywords: ["self healer", "self-healer", "self healing", "self-healing", "diagnostics"],
  },
  {
    section: "identity",
    label: "Personal Authentication",
    keywords: ["personal authentication", "biometrics", "identity", "face recognition", "voice authentication"],
  },
  { section: "teach", label: "Teach DEX MADE", keywords: ["teach aurix", "visual learning", "training mode", "teach"] },
  {
    section: "training",
    label: "Training Memory",
    keywords: ["training memory", "training history", "aurix memory center", "approved examples"],
  },
  {
    section: "activation",
    label: "Chrome & Gmail Activation",
    keywords: ["chrome activation", "gmail activation", "auto activation", "chrome and gmail"],
  },
  { section: "security", label: "Security Center", keywords: ["security", "security center", "audit log"] },
  { section: "models", label: "AI Models", keywords: ["models", "ai models", "model settings"] },
  { section: "settings", label: "Settings", keywords: ["settings", "preferences", "configuration"] },
];

const NAV_PREFIX = /^(?:open|go to|goto|show(?: me)?|take me to|navigate to|switch to|bring up|view|display)\s+/;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasPhrase(text: string, phrases: string[]): boolean {
  return phrases.some((phrase) => new RegExp(`\\b${escapeRegExp(phrase)}\\b`, "i").test(text));
}

function clean(text: string): string {
  let out = text.trim().replace(/\s+/g, " ");
  out = out.replace(/^(?:please|kindly)\s+/i, "");
  out = out.replace(/^(?:hey|ok|okay)\s+dex\s*made\b[,\s]*/i, "");
  out = out.replace(/^dex\s*made\b[,\s]*/i, "");
  out = out.replace(/^(?:can|could|would)\s+you\s+(?:please\s+)?/i, "");
  out = out.replace(/[.?!]+$/g, "");
  return out.trim();
}

function capitalize(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Phrases that belong to the Link Vault rather than the static website
 * registry. They are resolved against saved_links on the server, so a new
 * link added in the dashboard is immediately voice-accessible.
 */
const LINK_VAULT_PATTERNS: RegExp[] = [
  /\b(link vault|saved links?|saved websites?|saved sites?|my links)\b/,
  /\bsaved\b.*\b(links?|websites?|sites?|urls?)\b/,
  /\bhow many (saved )?(links?|websites?)\b/,
  /\blink count\b/,
  /\bfavou?rite (website|link|site)\b/,
  /\bcopy\b.*\b(url|link)\b/,
  /\bwhich\b.*\b(links?|websites?)\b.*\b(saved|have i)\b/,
  /\brecent(ly)? added\b.*\b(links?|websites?)\b/,
  /\b(find|search|dhoondo|dhundo)\b.*\b(my|saved)\b.*\b(links?|websites?)\b/,
  /\b(show|list|display|dikhao|batao)\b.*\b(my )?(saved )?(links?|websites?)\b/,
  /\b(links?|websites?) (?:in|for|about|under|tagged|with tag)\b/,
];

function looksLikeLinkVaultCommand(lower: string): boolean {
  return LINK_VAULT_PATTERNS.some((pattern) => pattern.test(lower));
}

function matchSection(text: string): SectionCommand | null {
  const lower = text.toLowerCase();
  const stripped = lower.replace(NAV_PREFIX, "").trim();
  const candidates = stripped === lower ? [lower] : [stripped, lower];

  for (const candidate of candidates) {
    for (const entry of SECTION_COMMANDS) {
      for (const keyword of entry.keywords) {
        if (candidate === keyword) return entry;
        if (new RegExp(`\\b${escapeRegExp(keyword)}\\b`).test(candidate)) return entry;
      }
    }
  }
  return null;
}

function parseTask(text: string): VoiceIntent | null {
  const match = text.match(
    /^(?:add|create|make|new|set)\s+(?:a\s+|an\s+)?(?:new\s+)?task(?:\s+(?:to|for|:))?\s*(.*)$/i
  ) ?? text.match(/^remind me to\s+(.*)$/i);
  if (!match) return null;

  let title = (match[1] || "").trim();
  let priority: TaskItem["priority"] = "medium";
  if (/\b(?:urgent|high priority|important)\b/i.test(title)) {
    priority = "high";
    title = title.replace(/\b(?:urgent|high priority|important)\b/gi, " ");
  } else if (/\blow priority\b/i.test(title)) {
    priority = "low";
    title = title.replace(/\blow priority\b/gi, " ");
  }

  let category: TaskItem["category"] = "daily";
  if (/\b(?:business|client|invoice)\b/i.test(title)) category = "business";
  else if (/\b(?:study|exam|revision)\b/i.test(title)) category = "study";
  else if (/\b(?:dev|code|coding|bug|deploy)\b/i.test(title)) category = "dev";

  title = capitalize(title.replace(/\s+/g, " ").trim());
  return { kind: "add_task", title, priority, category, label: "Add task" };
}

function parseNote(text: string): VoiceIntent | null {
  const match = text.match(
    /^(?:add|create|make|save|new)\s+(?:a\s+|an\s+)?(?:new\s+)?note(?:\s+(?:about|on|saying|that|:))?\s*(.*)$/i
  );
  if (!match) return null;

  const content = (match[1] || "").trim();
  const firstClause = content.split(/[,.;]/)[0].trim();
  const title = capitalize((firstClause || content).slice(0, 60));
  return { kind: "add_note", title, content: content || title, label: "Add note" };
}

/**
 * Maps a spoken or typed phrase onto an DEX MADE command intent.
 * The parser is intentionally local and deterministic so commands work offline.
 */
export function parseVoiceCommand(raw: string): VoiceIntent {
  const text = clean(raw);
  const lower = text.toLowerCase();

  if (!text) {
    return { kind: "ask_ai", text: "", label: "Empty command" };
  }

  if (hasPhrase(lower, ["help", "what can i say", "commands", "show commands", "voice commands"])) {
    return { kind: "action", action: "help", label: "Show commands" };
  }

  // "Hello Dex Made, enter training mode." opens the visual learning workspace.
  if (/\b(?:enter|start|begin|open|launch)\s+(?:the\s+)?(?:teach\s+aurix\s+|training\s+|visual\s+learning\s+)?(?:mode|training)\b/i.test(lower)) {
    return { kind: "navigate", section: "teach", label: "Teach DEX MADE" };
  }

  const task = parseTask(text);
  if (task) return task;

  const note = parseNote(text);
  if (note) return note;

  // "Open link vault" navigates to the dashboard; other saved-link phrases are
  // resolved against the saved_links table on the server.
  if (/\b(?:open|go to|goto|navigate to|switch to|take me to)\s+(?:the\s+)?link vault\b/i.test(lower)) {
    return { kind: "navigate", section: "links", label: "Link Vault" };
  }
  if (looksLikeLinkVaultCommand(lower)) {
    return { kind: "link_command", text, label: "Saved links" };
  }

  // Saved websites are matched before in-app sections so "open my Instagram
  // account" opens Instagram rather than a dashboard tab.
  const website = matchWebsiteCommand(text);
  if (website) {
    return {
      kind: "open_website",
      entry: website.entry,
      account: website.account,
      needsAccount: website.needsAccount,
      label: `Open ${website.entry.name}`,
    };
  }

  if (hasPhrase(lower, ["clear emergency stop", "cancel emergency stop", "deactivate emergency stop", "resume operations", "resume automation"])) {
    return { kind: "action", action: "emergency_stop_off", label: "Resume operations" };
  }
  if (hasPhrase(lower, ["emergency stop", "stop everything", "halt everything", "kill switch", "stop automation"])) {
    return { kind: "action", action: "emergency_stop_on", label: "Emergency stop" };
  }

  if (/\b(?:dark|night)\s+(?:mode|theme)\b/i.test(lower) || /\bswitch to dark\b/i.test(lower)) {
    return { kind: "action", action: "set_theme", theme: "dark", label: "Dark mode" };
  }
  if (/\b(?:light|bright|day)\s+(?:mode|theme)\b/i.test(lower) || /\bswitch to light\b/i.test(lower)) {
    return { kind: "action", action: "set_theme", theme: "light", label: "Light mode" };
  }

  if (hasPhrase(lower, ["unmute", "unmute voice", "speak again", "enable voice", "voice on"])) {
    return { kind: "action", action: "unmute_voice", label: "Unmute voice" };
  }
  if (hasPhrase(lower, ["mute", "mute voice", "mute yourself", "be quiet", "silence voice", "voice off"])) {
    return { kind: "action", action: "mute_voice", label: "Mute voice" };
  }

  if (hasPhrase(lower, ["lock session", "lock aurix", "lock the screen", "lock screen"]) || lower === "lock") {
    return { kind: "action", action: "lock_session", label: "Lock session" };
  }

  if (hasPhrase(lower, ["refresh system", "refresh telemetry", "system status", "check system", "system health"])) {
    return { kind: "action", action: "refresh_system", label: "Refresh system" };
  }

  if (hasPhrase(lower, ["read my tasks", "my tasks", "task summary", "what are my tasks", "list tasks", "how many tasks"])) {
    return { kind: "action", action: "task_summary", label: "Task summary" };
  }

  if (hasPhrase(lower, ["what time is it", "what is the time", "the time", "what's the date", "what is the date", "today's date", "what day is it"])) {
    return { kind: "action", action: "tell_time", label: "Time and date" };
  }

  const navPrefixed = NAV_PREFIX.test(lower);
  if (!navPrefixed && /self.?heal|fix errors|check errors|run diagnostics|diagnose/i.test(lower)) {
    return { kind: "action", action: "self_heal", label: "Run self-heal" };
  }

  if (hasPhrase(lower, ["new chat", "new conversation", "start a new chat"])) {
    return { kind: "navigate", section: "chat", label: "Chat Archive" };
  }

  const section = matchSection(text);
  if (section) {
    return { kind: "navigate", section: section.section, label: section.label };
  }

  return { kind: "ask_ai", text: text.replace(/^dex\s*made\b[,\s]*/i, "").trim(), label: "Ask DEX MADE" };
}

export const VOICE_COMMAND_REFERENCE: Array<{ title: string; commands: string[] }> = [
  {
    title: "Navigate",
    commands: ["Open command hub", "Open tasks", "Open voice studio", "Open system monitor", "Open settings"],
  },
  {
    title: "Websites",
    commands: [
      "Open Instagram",
      "Open my Fiverr gigs",
      "Open my Facebook",
      "Play my favourite song",
      "Open my YouTube channel",
    ],
  },
  {
    title: "Link Vault",
    commands: [
      "Open my saved Facebook link",
      "Show my saved links",
      "Show my AI tools links",
      "Open my favourite website",
      "How many links have I saved",
      "Copy my Facebook URL",
      "Find my saved Fiverr link",
    ],
  },
  {
    title: "Productivity",
    commands: ["Add task buy a domain for NEXORA", "Add note review Cloudflare DNS", "Read my tasks"],
  },
  {
    title: "System",
    commands: ["Run self-heal", "Refresh system", "Emergency stop", "Resume operations", "Lock session"],
  },
  {
    title: "Identity & learning",
    commands: [
      "Hello Dex Made, enter training mode",
      "Open personal authentication",
      "Open training memory",
      "Open Chrome and Gmail activation",
    ],
  },
  {
    title: "Voice & display",
    commands: ["Dark mode", "Light mode", "Mute voice", "Unmute voice", "What time is it"],
  },
];

export const VOICE_HELP_TEXT =
  "I can navigate the app, open your saved Link Vault websites, add tasks and notes, read your task list, run self-healing, refresh system status, switch themes, mute or unmute my voice, lock the session, and answer questions. Try: open my saved Instagram link, show my saved links, add task buy a domain, or run self-heal.";
