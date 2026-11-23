import "dotenv/config";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import JSZip from "jszip";
import { createServer as createViteServer } from "vite";
import type { AurixLanguage, SystemTelemetry, ThinkingDepth } from "./src/types/aurix";
import { matchWebsiteCommand } from "./src/utils/websiteRegistry";
import {
  addAuditLog,
  addDesktopActionLog,
  addMessage,
  deleteMemory,
  deleteNote,
  deleteTask,
  ensureConversation,
  exportFullBackup,
  getAppSettings,
  getCompanyProfile,
  getConversationMessages,
  getOwnerProfile,
  getSecurityStatus,
  listAuditLogs,
  listBusinessItems,
  listConversations,
  listDesktopActionLogs,
  listMemories,
  listNotes,
  listProjects,
  listSelfHealHistory,
  listTasks,
  listWebsites,
  saveAppSettings,
  saveCompanyProfile,
  saveOwnerProfile,
  setSecurityPin,
  updateSecurityPreferences,
  upsertBusinessItem,
  upsertMemory,
  upsertNote,
  upsertProject,
  upsertTask,
  upsertWebsite,
  verifySecurityPin,
} from "./server/db";
import {
  analyzeFileOrImage,
  chatWithAurix,
  chatWithAurixStream,
  diagnoseAndRepairCode,
  draftBusinessDocument,
  generateFreeCreativeAsset,
  generateProactiveCompanionTurn,
  researchWebWithGrounding,
  runDeveloperAssistant,
  synthesizeAurixVoice,
  transcribeAudioInput,
} from "./server/gemini";
import {
  GeminiKeysExhaustedError,
  GeminiNotConfiguredError,
  getGeminiPoolStatus,
  hasAnyGeminiKey,
  resetGeminiKey,
  testGeminiKeys,
} from "./server/geminiPool";
import { NATIVE_WINDOWS_FILES } from "./server/nativeWindowsBundle";
import { registerBiometricRoutes } from "./server/biometricRoutes";
import { laptopControlStatus, planLaptopCommand, runLaptopPlan } from "./server/laptopControl";
import { detectLocalOllamaModels } from "./server/offlineBrain";
import { buildHardwareAudit } from "./server/hardwareAudit";
import {
  createSnapshotBackup,
  getLastSelfHealReport,
  listBackups,
  restoreBackupById,
  runSelfHealAudit,
} from "./server/selfHealer";

let emergencyStopActive = false;

async function getRealTelemetry(): Promise<SystemTelemetry> {
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  let diskTotal = 0;
  let diskFree = 0;
  try {
    const stat = fs.statfsSync(process.cwd());
    diskTotal = Number(stat.blocks) * Number(stat.bsize);
    diskFree = Number(stat.bavail) * Number(stat.bsize);
  } catch {
    diskTotal = 0;
    diskFree = 0;
  }

  const totalMemGb = Number((totalMem / 1024 ** 3).toFixed(2));
  const hardwareTier: SystemTelemetry["hardwareTier"] =
    totalMemGb >= 16 && cpus.length >= 8
      ? "High-Performance"
      : totalMemGb >= 8
        ? "Mid-Range"
        : "Entry";

  const recommendedMode: SystemTelemetry["recommendedMode"] =
    totalMemGb < 6 || cpus.length <= 2
      ? "Lightweight"
      : totalMemGb < 14
        ? "Balanced"
        : "Advanced";

  const ollama = await detectLocalOllamaModels(totalMemGb);

  return {
    hostname: os.hostname(),
    platform: `${os.platform()} (${os.type()})`,
    release: os.release(),
    arch: os.arch(),
    cpuModel: cpus[0]?.model || "Host Processor",
    cpuCores: cpus.length,
    loadAvg1m: Number(os.loadavg()[0].toFixed(2)),
    totalMemoryBytes: totalMem,
    freeMemoryBytes: freeMem,
    usedMemoryBytes: usedMem,
    installedRamGb: totalMemGb,
    diskTotalBytes: diskTotal,
    diskFreeBytes: diskFree,
    uptimeSeconds: Math.floor(os.uptime()),
    nodeVersion: process.version,
    hardwareTier,
    recommendedMode,
    gpuAccelerationNote:
      "Adapts automatically to CPU-only or GPU-accelerated systems; Windows native bundle switches cleanly between CUDA/DirectML and CPUExecutionProvider.",
    hardwareSummaryNote:
      recommendedMode === "Lightweight"
        ? `Detected ${totalMemGb} GB RAM & ${cpus.length} cores — Lightweight Mode recommended (compact UI effects & <=1.5B offline models).`
        : recommendedMode === "Balanced"
          ? `Detected ${totalMemGb} GB RAM & ${cpus.length} cores — Balanced Mode recommended.`
          : `Detected ${totalMemGb} GB RAM & ${cpus.length} cores — Advanced Mode supported.`,
    ollamaReachable: ollama.reachable,
    ollamaModels: ollama.models,
    emergencyStopActive,
  };
}

function collectCompleteProjectEntries(): Array<{ zipPath: string; content: Buffer }> {
  const entries: Array<{ zipPath: string; content: Buffer }> = [];
  const excludedTop = new Set(["node_modules", ".git", "dist", "data", "windows_native", ".aistudio"]);
  const excludedFiles = new Set(["server.js", ".env"]);

  const walk = (dir: string, relBase = "") => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const name = entry.name;
      if (!relBase && excludedTop.has(name)) continue;
      if (excludedFiles.has(name) || name.endsWith(".log")) continue;
      const full = path.join(dir, name);
      const rel = relBase ? `${relBase}/${name}` : name;
      if (entry.isDirectory()) {
        walk(full, rel);
      } else if (entry.isFile()) {
        entries.push({ zipPath: rel, content: fs.readFileSync(full) });
      }
    }
  };

  walk(process.cwd());

  for (const nf of NATIVE_WINDOWS_FILES) {
    entries.push({
      zipPath: `windows_native/${nf.path}`,
      content: Buffer.from(nf.content, "utf8"),
    });
  }

  return entries;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "25mb" }));

  // Chrome activation bridge (browser extension) posts a signal from its own
  // origin. It can only record that Chrome/Gmail was opened — it never unlocks
  // anything, so a permissive origin here does not weaken authentication.
  app.use("/api/activation", (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // On-device MediaPipe runtime (served from the installed package, not a CDN).
  app.use(
    "/mediapipe/wasm",
    express.static(path.resolve(process.cwd(), "node_modules/@mediapipe/tasks-vision/wasm"), { maxAge: "1d" })
  );

  registerBiometricRoutes(app);

  // Bootstrap entire state
  app.get("/api/bootstrap", async (_req, res) => {
    const telemetry = await getRealTelemetry();
    res.json({
      owner: getOwnerProfile(),
      company: getCompanyProfile(),
      websites: listWebsites(),
      projects: listProjects(),
      memories: listMemories(),
      conversations: listConversations(),
      business: listBusinessItems(),
      tasks: listTasks(),
      notes: listNotes(),
      security: getSecurityStatus(),
      auditLogs: listAuditLogs(),
      settings: getAppSettings(),
      telemetry,
    });
  });

  // System Readiness Check after Startup Animation
  app.get("/api/readiness", async (_req, res) => {
    const owner = getOwnerProfile();
    const company = getCompanyProfile();
    const sec = getSecurityStatus();
    const settings = getAppSettings();
    const ollama = await detectLocalOllamaModels(Number((os.totalmem() / 1024 ** 3).toFixed(2)));
    res.json({
      aiProviderConnected: hasAnyGeminiKey() && !settings.offlineModeForced,
      configuredGeminiKeys: getGeminiPoolStatus().configuredKeys,
      localModelsAvailable: ollama.reachable && ollama.models.length > 0,
      ownerProfileLoaded: Boolean(owner?.name),
      companyKnowledgeLoaded: Boolean(company?.name),
      securityVerified: !sec.isLockedOut,
      microphoneStatus: "unknown",
      checkedAt: new Date().toISOString(),
    });
  });

  // Gemini multi-key failover pool — masked identifiers only, never a full key.
  app.get("/api/ai/keys", (_req, res) =>
    res.json(getGeminiPoolStatus(getAppSettings().activeModel || "gemini-4-hydrogen"))
  );

  app.post("/api/ai/keys/test", async (_req, res) => {
    try {
      const settings = getAppSettings();
      const result = await testGeminiKeys(settings.activeModel || "gemini-4-hydrogen");
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Key test failed." });
    }
  });

  app.post("/api/ai/keys/:slot/reset", (req, res) => {
    const slot = Number(req.params.slot);
    const ok = resetGeminiKey(slot);
    res.status(ok ? 200 : 404).json({ ok, status: getGeminiPoolStatus() });
  });

  // Owner Profile
  app.put("/api/owner", (req, res) => {
    const saved = saveOwnerProfile(req.body);
    res.json(saved);
  });

  // Company Profile & Docs
  app.put("/api/company", (req, res) => {
    const saved = saveCompanyProfile(req.body);
    res.json(saved);
  });

  // Websites
  app.get("/api/websites", (_req, res) => res.json(listWebsites()));
  app.post("/api/websites", (req, res) => res.json(upsertWebsite(req.body)));
  app.put("/api/websites", (req, res) => res.json(upsertWebsite(req.body)));

  // Projects
  app.get("/api/projects", (_req, res) => res.json(listProjects()));
  app.post("/api/projects", (req, res) => res.json(upsertProject(req.body)));
  app.put("/api/projects", (req, res) => res.json(upsertProject(req.body)));

  // Memories
  app.get("/api/memories", (_req, res) => res.json(listMemories()));
  app.post("/api/memories", (req, res) => res.json(upsertMemory(req.body)));
  app.delete("/api/memories/:id", (req, res) => {
    deleteMemory(req.params.id);
    res.json({ ok: true });
  });

  // Conversations & AI Chat
  app.get("/api/conversations", (_req, res) => res.json(listConversations()));
  app.get("/api/conversations/:id/messages", (req, res) => {
    res.json(getConversationMessages(req.params.id));
  });

  const runChatRequest = async (payload: {
    conversationId?: string;
    message: string;
    model?: "gemini-4-hydrogen" | "gemini-3.1-flash-lite";
    language?: AurixLanguage;
    thinkingLevel?: ThinkingDepth;
    scopedWebsite?: string;
    mode?: string;
  }) => {
    const { conversationId, message, model, language, thinkingLevel, scopedWebsite, mode } = payload;
    const settings = getAppSettings();
    const activeConvId = ensureConversation(
      conversationId,
      message,
      mode || "chat",
      model || settings.activeModel,
      language || settings.language
    );
    const history = getConversationMessages(activeConvId);
    const userMsg = addMessage({
      conversationId: activeConvId,
      role: "user",
      content: message,
      language: language || settings.language,
    });

    const aiReply = await chatWithAurix({
      history,
      userMessage: message,
      model,
      language,
      thinkingLevel,
      scopedWebsite,
    });

    const assistantMsg = addMessage({
      conversationId: activeConvId,
      role: "assistant",
      content: aiReply.text,
      modelUsed: aiReply.modelUsed,
      language: language || settings.language,
      thinkingLevel: aiReply.thinkingLevel,
    });

    return {
      conversationId: activeConvId,
      userMessage: userMsg,
      assistantMessage: assistantMsg,
      conversations: listConversations(),
    };
  };

  // One in-flight reply per (conversation, message): a double submit or a
  // retried request joins the request already running instead of asking
  // Gemini twice for the same answer.
  const inFlightChats = new Map<string, Promise<unknown>>();

  app.post("/api/chat", async (req, res) => {
    const { conversationId, message } = req.body || {};
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Message text is required." });
    }

    const dedupeKey = `${conversationId || "new"}::${message.trim()}`;
    let pending = inFlightChats.get(dedupeKey);
    if (!pending) {
      pending = runChatRequest(req.body).finally(() => inFlightChats.delete(dedupeKey));
      inFlightChats.set(dedupeKey, pending);
    }

    try {
      res.json(await pending);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "AI chat request failed.";
      // An exhausted pool is a temporary outage, not a broken request.
      const status =
        err instanceof GeminiKeysExhaustedError || err instanceof GeminiNotConfiguredError ? 503 : 500;
      res.status(status).json({ error: msg });
    }
  });

  // Streaming chat: tokens arrive as server-sent events so the reply renders
  // while it is still being generated instead of after the whole answer.
  app.post("/api/chat/stream", async (req, res) => {
    const { conversationId, message, model, language, thinkingLevel, scopedWebsite, mode } = req.body || {};
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Message text is required." });
    }

    const settings = getAppSettings();
    const targetLanguage = language || settings.language;
    const activeConvId = ensureConversation(
      conversationId,
      message,
      mode || "chat",
      model || settings.activeModel,
      targetLanguage
    );
    const history = getConversationMessages(activeConvId);
    const userMsg = addMessage({
      conversationId: activeConvId,
      role: "user",
      content: message,
      language: targetLanguage,
    });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    send("start", { conversationId: activeConvId, userMessage: userMsg });

    let streamed = "";
    try {
      const aiReply = await chatWithAurixStream(
        {
          history,
          userMessage: message,
          model,
          language: targetLanguage,
          thinkingLevel,
          scopedWebsite,
        },
        (delta) => {
          streamed += delta;
          send("delta", { text: delta });
        }
      );
      const assistantMsg = addMessage({
        conversationId: activeConvId,
        role: "assistant",
        content: aiReply.text,
        modelUsed: aiReply.modelUsed,
        language: targetLanguage,
        thinkingLevel: aiReply.thinkingLevel,
      });
      send("done", {
        conversationId: activeConvId,
        assistantMessage: assistantMsg,
        conversations: listConversations(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "AI chat request failed.";
      if (streamed.trim()) {
        // Keep the words the user already saw instead of losing the answer.
        const assistantMsg = addMessage({
          conversationId: activeConvId,
          role: "assistant",
          content: streamed.trim(),
          modelUsed: model || settings.activeModel,
          language: targetLanguage,
          thinkingLevel: thinkingLevel || settings.thinkingLevel,
        });
        send("done", {
          conversationId: activeConvId,
          assistantMessage: assistantMsg,
          conversations: listConversations(),
          interrupted: true,
        });
      } else {
        send("error", { error: msg });
      }
    } finally {
      res.end();
    }
  });

  // Voice Synthesis (Male DEX MADE Voice via Gemini 3.8 TTS)
  app.post("/api/voice/tts", async (req, res) => {
    try {
      const settings = getAppSettings();
      if (settings.offlineModeForced) {
        return res.status(503).json({ error: "Offline mode forced; using local system voice." });
      }
      const { text, voiceName, language, speed } = req.body;
      if (!text || typeof text !== "string") {
        return res.status(400).json({ error: "Text is required for speech synthesis." });
      }
      const result = await synthesizeAurixVoice({ text, voiceName, language, speed });
      res.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Speech synthesis failed.";
      res.status(500).json({ error: msg });
    }
  });

  // Voice Transcription (Gemini 3.5 Transcribe)
  app.post("/api/voice/stt", async (req, res) => {
    try {
      const { audioBase64, mimeType, languageHint } = req.body;
      if (!audioBase64 || !mimeType) {
        return res.status(400).json({ error: "Audio payload and mimeType are required." });
      }
      const result = await transcribeAudioInput({ audioBase64, mimeType, languageHint });
      res.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Speech transcription failed.";
      res.status(500).json({ error: msg });
    }
  });

  // Always-On Proactive Companion Turn
  app.post("/api/proactive", async (req, res) => {
    try {
      const { conversationId, language, focusTopic, withVoice = true } = req.body || {};
      const settings = getAppSettings();
      const targetLang = language || settings.language || "English";
      const activeConvId = ensureConversation(
        conversationId,
        "DEX MADE Live Companion",
        "companion",
        "gemini-3.1-flash-lite",
        targetLang
      );
      const history = getConversationMessages(activeConvId);
      const turn = await generateProactiveCompanionTurn({
        recentMessages: history,
        language: targetLang,
        focusTopic,
      });

      const assistantMsg = addMessage({
        conversationId: activeConvId,
        role: "assistant",
        content: turn.text,
        modelUsed: turn.modelUsed,
        language: targetLang,
        thinkingLevel: "MINIMAL",
      });

      let audioBase64: string | undefined;
      let mimeType: string | undefined;
      if (withVoice && settings.voiceEnabled && !settings.offlineModeForced) {
        try {
          const tts = await synthesizeAurixVoice({
            text: turn.text,
            voiceName: settings.voiceName,
            language: targetLang,
            speed: settings.voiceSpeed,
          });
          audioBase64 = tts.audioBase64;
          mimeType = tts.mimeType;
        } catch {
          // Client falls back to offline British Male voice
        }
      }

      res.json({
        conversationId: activeConvId,
        assistantMessage: assistantMsg,
        topic: turn.topic,
        audioBase64,
        mimeType,
        conversations: listConversations(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Proactive companion failed.";
      res.status(500).json({ error: msg });
    }
  });

  // File & Vision Intelligence
  app.post("/api/vision/analyze", async (req, res) => {
    try {
      const result = await analyzeFileOrImage(req.body);
      addAuditLog("FILE_ANALYZED", "DEX MADE Vision/File", `Analyzed ${req.body.fileName || "input"} (${req.body.mode})`, "info");
      res.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "File & Vision analysis failed.";
      res.status(500).json({ error: msg });
    }
  });

  // Internet Research (Google Search Grounding)
  app.post("/api/research", async (req, res) => {
    try {
      const { query, language } = req.body;
      if (!query) {
        return res.status(400).json({ error: "Research query is required." });
      }
      const result = await researchWebWithGrounding({ query, language });
      addAuditLog("WEB_RESEARCH", "DEX MADE Research", `Executed grounded search: ${String(query).slice(0, 60)}`, "info");
      res.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Internet research failed.";
      res.status(500).json({ error: msg });
    }
  });

  // Developer Workspace
  app.post("/api/dev/assist", async (req, res) => {
    try {
      const result = await runDeveloperAssistant(req.body);
      addAuditLog("DEV_ASSIST", "DEX MADE Dev", `Developer review for ${req.body.languageTarget} (${req.body.projectScope})`, "info");
      res.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Developer assistant request failed.";
      res.status(500).json({ error: msg });
    }
  });

  // Business Assistant CRUD + Drafting
  app.get("/api/business", (_req, res) => res.json(listBusinessItems()));
  app.post("/api/business", (req, res) => res.json(upsertBusinessItem(req.body)));
  app.post("/api/business/draft", async (req, res) => {
    try {
      const result = await draftBusinessDocument(req.body);
      res.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Business drafting failed.";
      res.status(500).json({ error: msg });
    }
  });

  // Personal Productivity: Tasks & Notes
  app.get("/api/tasks", (_req, res) => res.json(listTasks()));
  app.post("/api/tasks", (req, res) => res.json(upsertTask(req.body)));
  app.delete("/api/tasks/:id", (req, res) => {
    deleteTask(req.params.id);
    res.json({ ok: true });
  });

  app.get("/api/notes", (_req, res) => res.json(listNotes()));
  app.post("/api/notes", (req, res) => res.json(upsertNote(req.body)));
  app.delete("/api/notes/:id", (req, res) => {
    deleteNote(req.params.id);
    res.json({ ok: true });
  });

  // Settings
  app.put("/api/settings", (req, res) => {
    const saved = saveAppSettings(req.body);
    addAuditLog("SETTINGS_UPDATED", "Abdul Muheeb", "Updated DEX MADE settings.", "info");
    res.json(saved);
  });

  // Security Center
  app.get("/api/security/status", (_req, res) => res.json(getSecurityStatus()));
  app.get("/api/security/audit", (_req, res) => res.json(listAuditLogs()));
  app.post("/api/security/set-pin", (req, res) => {
    const { pin } = req.body;
    if (!pin || typeof pin !== "string" || pin.length < 4) {
      return res.status(400).json({ error: "PIN must be at least 4 characters." });
    }
    res.json(setSecurityPin(pin));
  });
  app.post("/api/security/verify-pin", (req, res) => {
    const { pin } = req.body;
    const outcome = verifySecurityPin(String(pin || ""));
    res.status(outcome.ok ? 200 : 401).json(outcome);
  });
  app.put("/api/security/config", (req, res) => {
    const { inactivityMinutes, requirePinOnBoot } = req.body;
    res.json(updateSecurityPreferences(Number(inactivityMinutes || 15), Boolean(requirePinOnBoot)));
  });

  // System Telemetry, Local Models & Desktop Control Safety Layer
  app.get("/api/system/telemetry", async (_req, res) => {
    res.json(await getRealTelemetry());
  });

  app.get("/api/models/local", async (_req, res) => {
    const totalRamGb = Number((os.totalmem() / 1024 ** 3).toFixed(2));
    const recommendedMode = totalRamGb <= 5.5 ? "Lightweight" : totalRamGb <= 10 ? "Balanced" : "Advanced";
    const hardwareSummaryNote =
      totalRamGb <= 5.5
        ? `Detected ${totalRamGb} GB RAM — Lightweight mode tuned for entry-level & integrated GPU hardware.`
        : totalRamGb <= 10
          ? `Detected ${totalRamGb} GB RAM — Balanced mode active.`
          : `Detected ${totalRamGb} GB RAM — Advanced multi-tasking mode active.`;
    const ollama = await detectLocalOllamaModels(totalRamGb);
    res.json({
      installedRamGb: totalRamGb,
      recommendedMode,
      hardwareSummaryNote,
      ollamaReachable: ollama.reachable,
      models: ollama.models,
      ollamaModels: ollama.models,
      catalog: [
        {
          id: "qwen2.5:0.5b",
          label: "Qwen 2.5 (0.5B) — Ultra-Light CPU",
          approxSizeGb: 0.4,
          minRamGb: 4,
          mode: "Lightweight",
          notes: "Runs smoothly on 4 GB RAM laptops (e.g., Dell Latitude E6420 Intel HD 3000).",
        },
        {
          id: "tinyllama",
          label: "TinyLlama (1.1B) — Compact Offline",
          approxSizeGb: 0.65,
          minRamGb: 4,
          mode: "Lightweight",
          notes: "Fast CPU-only local answers and coding snippets.",
        },
        {
          id: "qwen2.5:1.5b",
          label: "Qwen 2.5 (1.5B) — Balanced Assistant",
          approxSizeGb: 1.0,
          minRamGb: 6,
          mode: "Balanced",
          notes: "Strong instruction following for 6–8 GB RAM laptops.",
        },
        {
          id: "llama3.2:3b",
          label: "Llama 3.2 (3B) — Advanced Local",
          approxSizeGb: 2.0,
          minRamGb: 12,
          mode: "Advanced",
          notes: "Rich local reasoning for 12–16 GB+ RAM workstations.",
        },
      ],
    });
  });

  // Phase 1 Hardware & Environment Audit → drives the AI architecture decision
  app.get("/api/system/hardware-audit", async (_req, res) => {
    try {
      const totalRamGb = Number((os.totalmem() / 1024 ** 3).toFixed(2));
      const ollama = await detectLocalOllamaModels(totalRamGb);
      const settings = getAppSettings();
      res.json(
        buildHardwareAudit({
          ollamaReachable: ollama.reachable,
          ollamaModelCount: ollama.models.length,
          cloudKeyConfigured: hasAnyGeminiKey() && !settings.offlineModeForced,
        })
      );
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Hardware audit failed" });
    }
  });

  app.post("/api/system/log-action", (req, res) => {
    const { actionLabel, commandPreview, confirmed } = req.body;
    if (!confirmed) {
      return res.status(400).json({ error: "Explicit owner confirmation is required for system operations." });
    }
    if (emergencyStopActive) {
      const blocked = addDesktopActionLog({
        action: String(actionLabel || "Operation"),
        target: String(commandPreview || ""),
        status: "blocked",
        executedIn: "Safety Gate",
        detail: "Blocked because Emergency Stop is active.",
      });
      return res.status(423).json({ error: "Emergency Stop is currently active. Clear Emergency Stop to resume actions.", actionLog: blocked });
    }
    const entry = addAuditLog("COMPUTER_OP_APPROVED", "Abdul Muheeb", `${actionLabel}: ${commandPreview}`, "warning");
    const actionLog = addDesktopActionLog({
      action: String(actionLabel || "Approved Windows Command"),
      target: String(commandPreview || ""),
      status: "approved",
      executedIn: "Web Safety Builder",
      detail: "Explicitly approved & queued for native Windows pc_controller.",
    });
    res.json({ ok: true, entry, actionLog });
  });

  app.get("/api/desktop/actions", (_req, res) => {
    res.json({ emergencyStopActive, actions: listDesktopActionLogs() });
  });

  app.post("/api/desktop/actions", (req, res) => {
    const { action, target, confirmed } = req.body || {};
    if (!confirmed) {
      return res.status(400).json({ error: "Explicit owner confirmation is required." });
    }
    if (emergencyStopActive) {
      const entry = addDesktopActionLog({
        action: String(action || "Desktop Action"),
        target: String(target || ""),
        status: "stopped",
        executedIn: "Safety Controller",
        detail: "Blocked because Emergency Stop is engaged.",
      });
      return res.status(423).json({ error: "Emergency Stop is active.", entry });
    }
    const entry = addDesktopActionLog({
      action: String(action || "Desktop Action"),
      target: String(target || ""),
      status: "approved",
      executedIn: process.platform === "win32" ? "Windows Host" : "Preview Sandbox Bridge",
      detail: `Owner-approved "${String(action || "Desktop Action")}" recorded cleanly.`,
    });
    res.json({ ok: true, entry });
  });

  // Real laptop control (live only when DEX MADE runs on the owner's own PC).
  app.get("/api/laptop/status", (_req, res) => {
    res.json(laptopControlStatus());
  });

  app.post("/api/laptop/command", async (req, res) => {
    const text = String(req.body?.text || "").trim();
    if (!text) return res.status(400).json({ error: "A command is required." });
    const plan = planLaptopCommand(text, listWebsites());
    if (!plan) return res.json({ ok: false, matched: false, message: "That is not a laptop action." });
    if (emergencyStopActive) {
      return res.status(423).json({ ok: false, matched: true, message: "Emergency Stop is active.", plan });
    }
    const outcome = await runLaptopPlan(plan);
    const entry = addDesktopActionLog({
      action: plan.label,
      target: plan.target,
      status: outcome.ok ? "approved" : "blocked",
      executedIn: outcome.ok ? "Laptop Control" : "Preview Sandbox Bridge",
      detail: outcome.detail,
    });
    res.json({
      ok: outcome.ok,
      matched: true,
      message: outcome.ok ? plan.spoken : outcome.detail,
      plan,
      entry,
    });
  });

  app.post("/api/desktop/emergency-stop", (req, res) => {
    const active = req.body?.active !== undefined ? Boolean(req.body.active) : true;
    emergencyStopActive = active;
    const entry = addAuditLog(
      active ? "EMERGENCY_STOP_ENGAGED" : "EMERGENCY_STOP_CLEARED",
      "Abdul Muheeb",
      active ? "Owner pressed Emergency Stop — all automated PC control halted." : "Owner cleared Emergency Stop.",
      active ? "security" : "info"
    );
    const actionLog = addDesktopActionLog({
      action: active ? "Emergency Stop Triggered" : "Emergency Stop Cleared",
      target: "All Desktop & Proactive Automations",
      status: active ? "stopped" : "approved",
      executedIn: "DEX MADE Safety Controller",
      detail: entry.detail,
    });
    res.json({ emergencyStopActive, entry, actionLog });
  });

  // Backup Export
  app.get("/api/backup/export", (_req, res) => {
    const dump = exportFullBackup();
    addAuditLog("BACKUP_EXPORTED", "Abdul Muheeb", "Exported full DEX MADE SQLite knowledge backup JSON.", "info");
    res.setHeader("Content-Disposition", 'attachment; filename="aurix-backup.json"');
    res.json(dump);
  });

  // Native Windows Deliverables Explorer
  app.get("/api/deliverables", (_req, res) => {
    res.json(NATIVE_WINDOWS_FILES);
  });

  app.get("/api/deliverables/download.zip", async (_req, res) => {
    const zip = new JSZip();
    for (const file of NATIVE_WINDOWS_FILES) {
      zip.file(file.path, file.content);
    }
    const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    addAuditLog("DELIVERABLES_EXPORT", "Abdul Muheeb", "Downloaded Native Windows 10/11 Python & C# WPF source package.", "info");
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", 'attachment; filename="AURIX_2.0_Windows_Native_Suite.zip"');
    res.send(buffer);
  });

  // COMPLETE DOWNLOADABLE PROJECT ZIP (All updated frontend, backend, Windows native suite, docs, configs)
  app.get("/api/project/complete-download.zip", async (_req, res) => {
    try {
      const entries = collectCompleteProjectEntries();
      const zip = new JSZip();
      for (const e of entries) {
        zip.file(e.zipPath, e.content);
      }
      const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
      addAuditLog(
        "COMPLETE_PROJECT_EXPORT",
        "Abdul Muheeb",
        `Downloaded complete DEX MADE 2.0 ZIP package (${entries.length} files, ${(buffer.length / 1024).toFixed(1)} KB).`,
        "info"
      );
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", 'attachment; filename="AURIX_2.0_Complete_System_AM_VEYRONIX.zip"');
      res.send(buffer);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Failed to assemble complete project ZIP." });
    }
  });

  // 12-Step Self-Healing Watchdog, Backups & Diagnostics
  app.get("/api/self-heal/status", async (_req, res) => {
    const cached = getLastSelfHealReport();
    if (cached) return res.json(cached);
    const fresh = await runSelfHealAudit({ deepCodeScan: false, reason: "Status inspection" });
    res.json(fresh);
  });

  app.post("/api/self-heal/run", async (req, res) => {
    const deep = Boolean(req.body?.deepCodeScan);
    const report = await runSelfHealAudit({
      deepCodeScan: deep,
      reason: deep ? "Deep manual 12-step self-heal & tsc scan" : "Quick 12-step self-heal check",
    });
    res.json(report);
  });

  app.post("/api/self-heal/diagnose", async (req, res) => {
    try {
      const { errorMessage, codeContext } = req.body || {};
      const out = await diagnoseAndRepairCode({
        errorMessage: String(errorMessage || "Unknown runtime issue"),
        codeContext: codeContext ? String(codeContext) : undefined,
      });
      await runSelfHealAudit({ deepCodeScan: false, reason: "Post-error self-heal recovery" });
      res.json(out);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Diagnosis failed." });
    }
  });

  app.get("/api/self-heal/backups", (_req, res) => {
    res.json(listBackups());
  });

  app.post("/api/self-heal/backup", async (req, res) => {
    const snap = await createSnapshotBackup(String(req.body?.reason || "Owner Manual Snapshot"));
    res.json(snap);
  });

  app.post("/api/self-heal/restore", async (req, res) => {
    const targetId = req.body?.backupId || req.body?.id;
    if (!targetId) return res.status(400).json({ error: "backupId is required." });
    const result = await restoreBackupById(String(targetId));
    res.status(result.ok ? 200 : 404).json(result);
  });

  app.get("/api/self-heal/logs", (_req, res) => {
    res.json(listSelfHealHistory());
  });

  // Safe Sandboxed Workspace File Manager
  const getSafeSandboxPath = (name: string) => {
    const dir = path.join(process.cwd(), "workspace_files");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const cleanName = path.basename(name || "untitled.txt").replace(/[^a-zA-Z0-9._-]/g, "_");
    return { dir, filePath: path.join(dir, cleanName), cleanName };
  };

  app.get("/api/workspace/files", (_req, res) => {
    const dir = path.join(process.cwd(), "workspace_files");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const files = fs.readdirSync(dir).map((name) => {
      const full = path.join(dir, name);
      const stat = fs.statSync(full);
      return {
        name,
        size: stat.size,
        updatedAt: stat.mtime.toISOString(),
        content: stat.size < 200_000 ? fs.readFileSync(full, "utf8") : "",
      };
    });
    res.json(files);
  });

  app.post("/api/workspace/files", (req, res) => {
    const { name, content } = req.body || {};
    if (!name || typeof content !== "string") {
      return res.status(400).json({ error: "File name and string content are required." });
    }
    const { filePath, cleanName } = getSafeSandboxPath(String(name));
    fs.writeFileSync(filePath, content, "utf8");
    addAuditLog("WORKSPACE_FILE_SAVED", "Abdul Muheeb", `Saved local workspace file: ${cleanName}`, "info");
    res.json({ ok: true, name: cleanName, updatedAt: new Date().toISOString() });
  });

  // 100% Free Creative Studio (Picture, Video, Prompt, Writing, Website)
  app.post("/api/creative/generate", async (req, res) => {
    try {
      const { kind, prompt, writingType } = req.body || {};
      if (!prompt || typeof prompt !== "string") {
        return res.status(400).json({ error: "Creative prompt is required." });
      }
      const validKinds = ["picture", "video", "prompt", "writing", "website"] as const;
      const resolvedKind = validKinds.includes(kind) ? kind : "picture";
      const asset = await generateFreeCreativeAsset({
        kind: resolvedKind,
        prompt,
        writingType: writingType ? String(writingType) : undefined,
      });
      res.json(asset);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Creative synthesis failed." });
    }
  });

  // Unified Voice/Text Command Router
  app.post("/api/command/execute", async (req, res) => {
    try {
      const { command, conversationId, language, withVoice = true, model: requestedModel } = req.body || {};
      const text = String(command || "").trim();
      if (!text) return res.status(400).json({ error: "Command text is required." });

      const settings = getAppSettings();
      const targetLang = language || settings.language || "English";
      const q = text.toLowerCase();
      // A spoken laptop command (open YouTube, play music, open a folder, find a
      // file) runs for real when DEX MADE is running on the owner's own computer.
      const laptopPlan = planLaptopCommand(text, listWebsites());

      const activeConvId = ensureConversation(
        conversationId,
        text.slice(0, 48),
        "companion",
        settings.activeModel,
        targetLang
      );
      const history = getConversationMessages(activeConvId);
      const userMsg = addMessage({
        conversationId: activeConvId,
        role: "user",
        content: text,
        language: targetLang,
      });

      let action:
        | { type: "open_url"; label: string; url: string }
        | { type: "navigate"; section: string; label: string }
        | { type: "self_heal"; report: Awaited<ReturnType<typeof runSelfHealAudit>> }
        | { type: "creative"; asset: Awaited<ReturnType<typeof generateFreeCreativeAsset>> }
        | { type: "file_saved"; fileName: string }
        | null = null;

      let replyText = "";
      // The model that actually answered, after any pool failover.
      let servedModel: string | null = null;

      if (laptopPlan) {
        if (emergencyStopActive) {
          addDesktopActionLog({
            action: laptopPlan.label,
            target: laptopPlan.target,
            status: "blocked",
            executedIn: "Safety Gate",
            detail: "Blocked because Emergency Stop is active.",
          });
          replyText =
            "Emergency Stop is active, Muheeb. Clear it in Computer Control and I will open that for you straight away.";
        } else {
          const outcome = await runLaptopPlan(laptopPlan);
          addDesktopActionLog({
            action: laptopPlan.label,
            target: laptopPlan.target,
            status: outcome.ok ? "approved" : "blocked",
            executedIn: outcome.ok ? "Laptop Control" : "Preview Sandbox Bridge",
            detail: outcome.detail,
          });
          if (outcome.ok) {
            replyText = laptopPlan.spoken;
            if (laptopPlan.kind === "navigate") {
              action = { type: "navigate", section: laptopPlan.target, label: laptopPlan.label };
            }
          } else {
            replyText = `${outcome.detail}${
              laptopPlan.fallbackUrl ? " I have placed the link below so you can open it with one tap." : ""
            }`;
            if (laptopPlan.fallbackUrl) {
              action = { type: "open_url", label: laptopPlan.label, url: laptopPlan.fallbackUrl };
            }
          }
        }
      } else if (q.includes("self heal") || q.includes("self-heal") || q.includes("fix error") || q.includes("check errors") || q.includes("سیلف ہیل")) {
        const report = await runSelfHealAudit({ deepCodeScan: true, reason: "Voice/Command 12-Step Self-Heal" });
        action = { type: "self_heal", report };
        replyText = `12-step self-healing diagnostics complete, Muheeb. Overall status is ${report.overallStatus.toUpperCase()} across ${report.checks.length} subsystems, with ${report.repairedCount} repairs in this cycle.`;
      } else if (q.includes("youtube") || q.includes("یوٹیوب")) {
        action = { type: "open_url", label: "Launch YouTube", url: "https://www.youtube.com" };
        addDesktopActionLog({
          action: "Open Website",
          target: "https://www.youtube.com",
          status: emergencyStopActive ? "blocked" : "approved",
          executedIn: "DEX MADE Command Router",
          detail: emergencyStopActive ? "Blocked by Emergency Stop." : "Prepared YouTube launcher link.",
        });
        replyText = emergencyStopActive
          ? "Emergency Stop is currently active, Muheeb. Clear Emergency Stop in System Monitor before launching external workflows."
          : "Certainly, Muheeb. I have prepared the YouTube launcher right here for you.";
      } else if (q.includes("am nexora") || q.includes("nexora")) {
        const site = listWebsites().find((w) => w.name.toLowerCase().includes("nexora"));
        const url = site?.activeDomain?.startsWith("http") ? site.activeDomain : `https://${site?.activeDomain || "am-noxera-2510.infy.click"}`;
        action = { type: "open_url", label: "Open AM NEXORA", url };
        replyText = `Here is AM NEXORA (${url}), Muheeb. Would you like me to review its pending Cloudflare tasks?`;
      } else if (q.includes("am digital hub") || q.includes("digital hub")) {
        const site = listWebsites().find((w) => w.name.toLowerCase().includes("digital"));
        const url = site?.activeDomain?.startsWith("http") ? site.activeDomain : `https://${site?.activeDomain || "amdigitalhub.com"}`;
        action = { type: "open_url", label: "Open AM DIGITAL HUB", url };
        replyText = `AM DIGITAL HUB is queued (${url}), Muheeb. Let me know if you want to inspect its Express routes next.`;
      } else if ((q.includes("open") || q.includes("go to") || q.includes("آن کر")) && q.includes("website")) {
        action = { type: "navigate", section: "websites", label: "Open Website Manager" };
        replyText = "Right away, Muheeb. Open your Website Manager below to inspect AM NEXORA, AM DIGITAL HUB, TEAM CONNECT, or AM VEYRONIX.";
      } else if (q.includes("video") || q.includes("ویڈیو")) {
        const asset = await generateFreeCreativeAsset({ kind: "video", prompt: text });
        action = { type: "creative", asset };
        replyText = `I have generated a 4-scene AI motion video storyboard for "${asset.title}", Muheeb. You can preview and export it as WebM inside the Creative Studio.`;
      } else if (q.includes("picture") || q.includes("image") || q.includes("draw") || q.includes("پکچر") || q.includes("تصویر")) {
        const asset = await generateFreeCreativeAsset({ kind: "picture", prompt: text });
        action = { type: "creative", asset };
        replyText = `I have created a custom visual artwork for "${asset.title}", Muheeb. Download it as PNG or SVG below.`;
      } else if (
        /(company|business|veyronix).*(grow|growth|progress|today|doing|status)/.test(q) ||
        q.includes("company growth")
      ) {
        const projects = listProjects();
        const business = listBusinessItems();
        const openTasks = listTasks().filter((task) => task.status !== "done");
        const today = new Date().toISOString().slice(0, 10);
        const todayLogs = listAuditLogs().filter((entry) => entry.createdAt.startsWith(today));
        const latest = todayLogs[0]?.detail ? ` Latest entry: ${todayLogs[0].detail}.` : "";
        replyText = `Here is today's picture for AM VEYRONIX, Muheeb: ${projects.length} projects tracked, ${business.length} business records, ${openTasks.length} open tasks, and ${todayLogs.length} logged actions today.${latest}`;
      } else if (matchWebsiteCommand(text)?.entry.url) {
        // Any site in the spoken-command registry opens by name: "open GitHub",
        // "open Instagram", "open Gmail", …
        const siteMatch = matchWebsiteCommand(text);
        const url = siteMatch?.account?.url || siteMatch?.entry.url || "";
        const siteName = siteMatch?.entry.name || "that website";
        action = { type: "open_url", label: `Open ${siteName}`, url };
        addDesktopActionLog({
          action: "Open Website",
          target: url,
          status: emergencyStopActive ? "blocked" : "approved",
          executedIn: "DEX MADE Command Router",
          detail: emergencyStopActive ? "Blocked by Emergency Stop." : `Prepared ${siteName} launcher link.`,
        });
        replyText = emergencyStopActive
          ? "Emergency Stop is currently active, Muheeb. Clear it in Computer Control and I will open that for you."
          : `Opening ${siteName} for you, Muheeb.`;
      } else {
        // Voice conversations pass a fast model so DEX MADE answers in about a
        // second instead of waiting on the deep thinking model.
        const voiceFast = requestedModel === "gemini-3.1-flash-lite";
        const aiReply = await chatWithAurix({
          history,
          userMessage: text,
          model: voiceFast ? "gemini-3.1-flash-lite" : settings.activeModel,
          language: targetLang,
          thinkingLevel: voiceFast ? "LOW" : settings.thinkingLevel,
          fast: voiceFast,
        });
        replyText = aiReply.text;
        servedModel = aiReply.modelUsed;
      }

      const assistantMsg = addMessage({
        conversationId: activeConvId,
        role: "assistant",
        content: replyText,
        modelUsed: settings.offlineModeForced
          ? "offline-knowledge-engine"
          : servedModel || settings.activeModel,
        language: targetLang,
        thinkingLevel: settings.thinkingLevel,
      });

      let audioBase64: string | undefined;
      let mimeType: string | undefined;
      if (withVoice && settings.voiceEnabled && !settings.offlineModeForced) {
        try {
          const tts = await synthesizeAurixVoice({
            text: replyText,
            voiceName: settings.voiceName,
            language: targetLang,
            speed: settings.voiceSpeed,
          });
          audioBase64 = tts.audioBase64;
          mimeType = tts.mimeType;
        } catch {
          // Client falls back smoothly to offline British Male voice
        }
      }

      res.json({
        conversationId: activeConvId,
        userMessage: userMsg,
        assistantMessage: assistantMsg,
        action,
        audioBase64,
        mimeType,
        conversations: listConversations(),
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Command execution failed." });
    }
  });

  // Vite Dev Middleware or Static Prod Serving
  if (process.env.NODE_ENV === "production") {
    const distPath = path.resolve(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("/{*path}", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  await runSelfHealAudit({ deepCodeScan: false, reason: "Boot watchdog" });

  app.listen(3000, "0.0.0.0", () => {
    console.log("DEX MADE 2.0 Server listening on http://0.0.0.0:3000");
  });
}

process.on("unhandledRejection", (reason) => {
  console.error("[DEX MADE Self-Heal Shield] Unhandled rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[DEX MADE Self-Heal Shield] Uncaught exception:", err);
});

startServer();
