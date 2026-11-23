import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * DEX MADE laptop control.
 *
 * When the DEX MADE server runs on the owner's own PC (the Windows portable
 * launcher or `npm run dev`), a spoken command can open websites, play music,
 * open folders, search files and open documents for editing. Inside the hosted
 * preview there is no owner desktop, so every plan is reported as unavailable
 * and the UI falls back to a clickable launcher link instead.
 */

export type LaptopKind =
  | "open_url"
  | "play_music"
  | "open_folder"
  | "search_files"
  | "open_file"
  | "open_app"
  | "navigate";

export interface LaptopPlan {
  kind: LaptopKind;
  label: string;
  /** URL, absolute path or search query, depending on the kind. */
  target: string;
  /** What DEX MADE says once the action really ran. */
  spoken: string;
  /** Browser link the UI can offer when this machine cannot run the action. */
  fallbackUrl?: string;
}

export interface LaptopStatus {
  platform: string;
  available: boolean;
  home: string;
  reason: string;
}

export interface LaptopRunResult {
  ok: boolean;
  detail: string;
}

const SOCIAL_INBOX: Record<string, { url: string; label: string }> = {
  instagram: { url: "https://www.instagram.com/direct/inbox/", label: "Instagram messages" },
  facebook: { url: "https://www.facebook.com/messages/", label: "Facebook Messenger" },
  tiktok: { url: "https://www.tiktok.com/messages", label: "TikTok inbox" },
  linkedin: { url: "https://www.linkedin.com/messaging/", label: "LinkedIn messages" },
  youtube: { url: "https://www.youtube.com/feed/you", label: "YouTube activity" },
};

const KNOWN_FOLDERS: Record<string, string> = {
  desktop: "Desktop",
  downloads: "Downloads",
  documents: "Documents",
  pictures: "Pictures",
  videos: "Videos",
  music: "Music",
  projects: "Projects",
};

/** Only these applications can be launched by voice, never arbitrary binaries. */
const ALLOWED_APPS: Record<string, string> = {
  notepad: "notepad",
  calculator: "calc",
  paint: "mspaint",
  explorer: "explorer",
  "file explorer": "explorer",
  chrome: "chrome",
  edge: "msedge",
  "vs code": "code",
  code: "code",
  terminal: "cmd",
  cmd: "cmd",
  powershell: "powershell",
  word: "winword",
  excel: "excel",
  spotify: "spotify",
  whatsapp: "whatsapp",
};

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "appdata",
  "windows",
  "program files",
  "program files (x86)",
  "programdata",
  "$recycle.bin",
  ".cache",
  "dist",
  "system volume information",
]);

export function laptopControlStatus(): LaptopStatus {
  const platform = process.platform;
  const hasDesktop = platform === "win32" || platform === "darwin" || Boolean(process.env.DISPLAY);
  return {
    platform,
    available: hasDesktop,
    home: os.homedir(),
    reason: hasDesktop
      ? "DEX MADE is running on this computer, so voice commands can open apps, folders and files here."
      : "This preview runs on a server, not on your PC. Start DEX MADE on your own computer (AURIX_Portable_Start.bat) to control it.",
  };
}

/* ------------------------------------------------------------------ */
/* Planning: spoken text -> a concrete action                          */
/* ------------------------------------------------------------------ */

function cleanQuery(raw: string): string {
  return raw
    .replace(/\b(aurix|please|kindly|for me|on my laptop|in my laptop|in my computer|on my computer|on this laptop)\b/gi, " ")
    .replace(/\b(laptop|computer|pc|for|and|then)\b/gi, " ")
    .replace(/\b(search|find|locate|dhoondo|dhundo)\b/gi, " ")
    .replace(/\b(open|show|launch|edit|modify|update|kholo|khol do)\b/gi, " ")
    .replace(/\b(the|my|this|that|folder|file|directory)\b/gi, " ")
    .replace(/[^\w\s.@/\\:-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function companySiteUrl(sites?: Array<{ name: string; activeDomain?: string | null }>): string | null {
  const site = sites?.find((entry) => /veyronix/i.test(entry.name));
  const domain = site?.activeDomain?.trim();
  if (!domain) return null;
  return domain.startsWith("http") ? domain : `https://${domain}`;
}

export function planLaptopCommand(
  text: string,
  sites?: Array<{ name: string; activeDomain?: string | null }>
): LaptopPlan | null {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const q = raw.toLowerCase();

  // 1. Messages / inboxes on the social platforms
  const platform =
    Object.keys(SOCIAL_INBOX).find((key) => q.includes(key)) ||
    (/\b(insta|ig)\b/.test(q) ? "instagram" : undefined) ||
    (/\bfb\b/.test(q) ? "facebook" : undefined);
  if (platform && /(message|inbox|dm|notification|چیٹ|میسج)/.test(q)) {
    const inbox = SOCIAL_INBOX[platform];
    return {
      kind: "open_url",
      label: inbox.label,
      target: inbox.url,
      fallbackUrl: inbox.url,
      spoken: `I have opened your ${inbox.label}. I can show the page, but reading the messages themselves needs that platform's own login inside the page.`,
    };
  }

  // 2. Music
  if (/(play|chalao|bajao)/.test(q) && /(music|song|gaana|track|playlist|favourite|favorite)/.test(q)) {
    const wanted = cleanQuery(raw.replace(/.*\b(play|chalao|bajao)\b/i, ""));
    const query = wanted || "my favourite music";
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    return {
      kind: "play_music",
      label: `Play music: ${query}`,
      target: url,
      fallbackUrl: url,
      spoken: `Playing ${query} on YouTube for you, sir.`,
    };
  }

  // 3. Company website
  if (/veyronix|company website|my website|business website/.test(q) && /(open|show|launch|kholo|go to)/.test(q)) {
    const url = companySiteUrl(sites);
    if (!url) {
      return {
        kind: "navigate",
        label: "Open Website Manager",
        target: "websites",
        spoken:
          "Your AM VEYRONIX website has no live domain saved yet, Muheeb. I have opened the Website Manager so you can add it.",
      };
    }
    return {
      kind: "open_url",
      label: "Open AM VEYRONIX website",
      target: url,
      fallbackUrl: url,
      spoken: `Opening the AM VEYRONIX website for you, sir.`,
    };
  }

  // 4. YouTube / known sites
  if (q.includes("youtube")) {
    const url = "https://www.youtube.com";
    return {
      kind: "open_url",
      label: "Open YouTube",
      target: url,
      fallbackUrl: url,
      spoken: "YouTube is open, sir.",
    };
  }
  const plainUrl = raw.match(/https?:\/\/[^\s]+/);
  if (plainUrl) {
    return {
      kind: "open_url",
      label: `Open ${plainUrl[0]}`,
      target: plainUrl[0],
      fallbackUrl: plainUrl[0],
      spoken: `Opening ${plainUrl[0]} for you, sir.`,
    };
  }

  // 5. Search the laptop for a file or folder
  if (
    /(search|find|locate|dhoondo|dhundo)/.test(q) &&
    !/(web|internet|google|online|error|fix|self.heal)/.test(q)
  ) {
    const query = cleanQuery(raw);
    if (query) {
      return {
        kind: "search_files",
        label: `Search laptop: ${query}`,
        target: query,
        spoken: `Searching your computer for ${query}, sir.`,
      };
    }
  }

  // 6. Open a known folder
  const knownKey = Object.keys(KNOWN_FOLDERS).find((key) => q.includes(key));
  if (knownKey && /(open|show|kholo)/.test(q)) {
    const folderPath = path.join(os.homedir(), KNOWN_FOLDERS[knownKey]);
    return {
      kind: "open_folder",
      label: `Open ${KNOWN_FOLDERS[knownKey]} folder`,
      target: folderPath,
      spoken: `Opening your ${KNOWN_FOLDERS[knownKey]} folder, sir.`,
    };
  }
  if (/open/.test(q) && /folder/.test(q)) {
    const query = cleanQuery(raw);
    const folderPath = query ? path.join(os.homedir(), query) : os.homedir();
    const label = query ? path.basename(folderPath) : "your home folder";
    return {
      kind: "open_folder",
      label: `Open folder: ${label}`,
      target: folderPath,
      spoken: `Opening ${label} for you, sir.`,
    };
  }

  // 7. Open a file for editing
  if (/(edit|open|modify|update)/.test(q) && /(file|document|code|script)/.test(q)) {
    const query = cleanQuery(raw);
    if (query) {
      return {
        kind: "open_file",
        label: `Open for editing: ${query}`,
        target: query,
        spoken: `Opening ${query} in your editor, sir.`,
      };
    }
  }

  // 8. Allow-listed applications
  const appKey = Object.keys(ALLOWED_APPS)
    .sort((a, b) => b.length - a.length)
    .find((key) => new RegExp(`\\b${key.replace(/ /g, "\\s")}\\b`).test(q));
  if (appKey && /(open|launch|start|kholo)/.test(q)) {
    return {
      kind: "open_app",
      label: `Open ${appKey}`,
      target: ALLOWED_APPS[appKey],
      spoken: `Opening ${appKey}, sir.`,
    };
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* Execution                                                           */
/* ------------------------------------------------------------------ */

function launch(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 10000, windowsHide: true }, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function openTarget(target: string): Promise<void> {
  if (process.platform === "win32") return launch("cmd", ["/c", "start", "", target]);
  if (process.platform === "darwin") return launch("open", [target]);
  return launch("xdg-open", [target]);
}

function revealInExplorer(filePath: string): Promise<void> {
  if (process.platform === "win32") return launch("explorer", [`/select,${filePath}`]);
  return openTarget(path.dirname(filePath));
}

/** Breadth-first search for a file or folder name, bounded in time and depth. */
function searchLaptop(query: string, root = os.homedir(), limit = 8): string[] {
  const needle = query.toLowerCase();
  const found: string[] = [];
  const queue: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }];
  const deadline = Date.now() + 3000;
  while (queue.length && found.length < limit && Date.now() < deadline) {
    const current = queue.shift();
    if (!current) break;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current.dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current.dir, entry.name);
      if (entry.name.toLowerCase().includes(needle)) found.push(full);
      if (found.length >= limit) break;
      if (entry.isDirectory() && current.depth < 4 && !SKIP_DIRS.has(entry.name.toLowerCase())) {
        queue.push({ dir: full, depth: current.depth + 1 });
      }
    }
  }
  return found;
}

export async function runLaptopPlan(plan: LaptopPlan): Promise<LaptopRunResult> {
  if (plan.kind === "navigate") {
    return { ok: true, detail: `Opened ${plan.target} inside DEX MADE.` };
  }
  const status = laptopControlStatus();
  if (!status.available) {
    return { ok: false, detail: status.reason };
  }

  try {
    if (plan.kind === "search_files") {
      const matches = searchLaptop(plan.target);
      if (!matches.length) {
        return { ok: false, detail: `I could not find anything named “${plan.target}” on this computer.` };
      }
      await revealInExplorer(matches[0]);
      return {
        ok: true,
        detail: `Found ${matches.length} match${matches.length === 1 ? "" : "es"}: ${matches
          .slice(0, 4)
          .map((entry) => path.basename(entry))
          .join(", ")}`,
      };
    }

    if (plan.kind === "open_file") {
      const matches = searchLaptop(plan.target, os.homedir(), 1);
      if (!matches.length) {
        return { ok: false, detail: `I could not find a file named “${plan.target}” on this computer.` };
      }
      await openTarget(matches[0]);
      return { ok: true, detail: `Opened ${matches[0]}` };
    }

    if (plan.kind === "open_folder") {
      if (!fs.existsSync(plan.target)) {
        return { ok: false, detail: `That folder does not exist on this computer: ${plan.target}` };
      }
      await openTarget(plan.target);
      return { ok: true, detail: `Opened ${plan.target}` };
    }

    await openTarget(plan.target);
    return { ok: true, detail: `Opened ${plan.target}` };
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : "The action could not be completed on this computer.",
    };
  }
}
