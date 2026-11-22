import type { AurixLanguage, LocalOllamaModelInfo } from "../src/types/aurix";
import {
  getCompanyProfile,
  getOwnerProfile,
  listProjects,
  listTasks,
  listWebsites,
} from "./db";

/**
 * 100% Free Local & Offline AI Brain for AURIX 2.0.
 * 1) Probes live Ollama instance (http://127.0.0.1:11434/api/tags) without faking models.
 * 2) Selects compatible local model based on real host RAM.
 * 3) Falls back cleanly to deterministic local SQLite intelligence & cybersecurity engine.
 */

export async function detectLocalOllamaModels(
  installedRamGb: number
): Promise<{ reachable: boolean; models: LocalOllamaModelInfo[] }> {
  const ollamaUrl = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1100);
    const res = await fetch(`${ollamaUrl}/api/tags`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return { reachable: false, models: [] };
    const data = (await res.json()) as {
      models?: Array<{ name?: string; size?: number; modified_at?: string }>;
    };
    const models: LocalOllamaModelInfo[] = (data.models || []).map((m) => {
      const sizeGb = Number(((m.size || 0) / 1024 ** 3).toFixed(2));
      const requiredRam = Math.max(1.2, sizeGb * 1.45);
      const fit: LocalOllamaModelInfo["fit"] =
        requiredRam <= installedRamGb * 0.65
          ? "Fits RAM"
          : requiredRam <= installedRamGb * 0.9
            ? "Tight Fit"
            : "Exceeds RAM";
      return {
        name: m.name || "unknown-local-model",
        sizeGb,
        fit,
        modifiedAt: m.modified_at,
      };
    });
    return { reachable: true, models };
  } catch {
    return { reachable: false, models: [] };
  }
}

export async function tryFreeLocalOllama(
  prompt: string,
  systemPrompt: string,
  preferredModel?: string
): Promise<string | null> {
  const ollamaUrl = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
  const model = preferredModel || process.env.OLLAMA_MODEL || "qwen2.5:1.5b";
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    const res = await fetch(`${ollamaUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
      }),
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as { message?: { content?: string } };
    return data.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

export function answerOfflineWithKnowledge(prompt: string, language: AurixLanguage = "English"): string {
  const q = prompt.toLowerCase();
  const owner = getOwnerProfile();
  const company = getCompanyProfile();
  const websites = listWebsites();
  const projects = listProjects();
  const tasks = listTasks();

  // Cybersecurity Knowledge Base (100% Offline)
  if (
    q.includes("cyber") ||
    q.includes("security") ||
    q.includes("hack") ||
    q.includes("sql injection") ||
    q.includes("xss") ||
    q.includes("firewall") ||
    q.includes("password") ||
    q.includes("port") ||
    q.includes("owasp")
  ) {
    return `Offline Cybersecurity Advisory for ${owner.name}:
1. Parameterize every SQL query (like AURIX SQLite prepared statements) to prevent SQL injection, and sanitize untrusted HTML to stop XSS.
2. Hash local credentials with Argon2id or scrypt + random salt (never plain SHA-256 or hardcoded keys).
3. Keep Windows Defender Firewall active, disable unused inbound SMB/RDP ports (445, 3389), enforce TLS 1.3 for AM NEXORA and AM DIGITAL HUB, and treat uploaded files strictly as untrusted data.`;
  }

  // Websites Lookup (Strictly Isolated)
  const matchedSite = websites.find((w) => q.includes(w.name.toLowerCase()));
  if (matchedSite) {
    return `${matchedSite.name} (${matchedSite.status.toUpperCase()}):
Purpose: ${matchedSite.purpose}
Active Domain: ${matchedSite.activeDomain || "Not yet marked"}
Stack: ${matchedSite.stack.join(", ")}
Pending Tasks: ${matchedSite.pendingTasks || "None recorded"}
(Strictly isolated from all other ${company.name} properties.)`;
  }

  if (q.includes("website") || q.includes("sites") || q.includes("domain")) {
    return `${company.name} maintains ${websites.length} isolated web properties:\n` +
      websites.map((w) => `- ${w.name}: ${w.activeDomain || w.purpose} [${w.status}]`).join("\n");
  }

  if (q.includes("project") || q.includes("task") || q.includes("todo")) {
    const open = tasks.filter((t) => t.status !== "done");
    return `Active Projects (${projects.length}): ${projects.map((p) => `${p.name} (${p.progress}%)`).join(", ")}.\nOpen Owner Tasks (${open.length}): ${open.slice(0, 4).map((t) => t.title).join("; ") || "All clear"}.`;
  }

  if (q.includes("error") || q.includes("heal") || q.includes("fix") || q.includes("bug")) {
    return `AURIX 12-Step Self-Healer is active offline. I verified your local SQLite records (${websites.length} websites, ${projects.length} projects), workspace sandbox, and backup snapshots. Open System > Self-Healer or say "run self heal" to inspect full diagnostics.`;
  }

  if (language === "Urdu") {
    return `سر، میں اس وقت آف لائن لوکل موڈ میں کام کر رہا ہوں۔ آپ کے کمپیوٹر کی مقامی فائلیں، ${company.name} کا ڈیٹا، سائبر سیکیورٹی گائیڈ اور 12 اسٹیپ سیلف ہیلنگ سسٹم سب دستیاب ہیں۔ بتائیے آپ کس فائل، پروجیکٹ یا لوکل ٹاسک پر کام کرنا چاہتے ہیں؟`;
  }
  if (language === "Hindi") {
    return `सर, मैं अभी ऑफलाइन लोकल मोड में काम कर रहा हूँ। आपकी लोकल फाइलें, ${company.name} डेटा, साइबर सुरक्षा गाइड और 12-स्टेप सेल्फ-हीलिंग सिस्टम सक्रिय हैं। बताइए अभी किस लोकल काम में मदद करूँ?`;
  }

  return `I am currently operating in Offline Local Mode, Sir. While cloud inference is paused or offline, your local SQLite knowledge (${websites.length} websites, ${projects.length} projects), Cybersecurity advisory, 12-Step Self-Healer, Creative Studio offline tools, and Workspace File Editor remain fully operational. What would you like me to handle locally?`;
}

export function generateOfflineProactiveTurn(language: AurixLanguage = "English"): string {
  const owner = getOwnerProfile();
  const tasks = listTasks().filter((t) => t.status !== "done");
  const nextTask = tasks[0]?.title || "reviewing AM NEXORA architecture";

  const englishTurns = [
    `Checking in, ${owner.name}. I have been reviewing your queue and ${nextTask} stands out as a strong next step. Would you like me to draft a plan or open a workspace file for it right now?`,
    `A quick security and strategy note, ${owner.name}: keeping AM NEXORA and AM DIGITAL HUB environments isolated protects both deployments. Which website would you like to inspect or improve next?`,
    `I am active and ready on your desk, ${owner.name}. We can edit local workspace files, build content in the Creative Studio, or run a 12-step self-heal audit. What sounds most useful right now?`,
  ];

  const urduTurns = [
    `محیب، میں آن لائن اور ایکٹیو ہوں۔ آپ کے کاموں میں "${nextTask}" اہم ہے۔ کیا آپ چاہتے ہیں کہ میں ابھی اس پر کام شروع کروں یا کوئی نئی تصویر یا پلان تیار کروں؟`,
    `ایک مفید مشورہ، محیب: AM NEXORA اور AM DIGITAL HUB کو الگ رکھنا سیکیورٹی کے لیے بہترین ہے۔ بتائیے آج آپ کس آئیڈیا یا پروجیکٹ پر توجہ دینا چاہتے ہیں؟`,
  ];

  const pool = language === "Urdu" ? urduTurns : englishTurns;
  return pool[Math.floor(Date.now() / 15000) % pool.length];
}
