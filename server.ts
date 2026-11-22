import "dotenv/config";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import JSZip from "jszip";
import { createServer as createViteServer } from "vite";
import type { SystemTelemetry } from "./src/types/aurix";
import {
  addAuditLog,
  addDesktopActionLog,
  addMessage,
  addWorkflowRun,
  deleteConversation,
  deleteDocument,
  deleteMemory,
  deleteMessage,
  deleteNote,
  deleteReminder,
  deleteTask,
  deleteWorkflow,
  getWorkspaceAnalytics,
  listDocuments,
  listReminders,
  listWorkflowRuns,
  listWorkflows,
  markWorkflowRun,
  renameConversation,
  upsertDocument,
  upsertReminder,
  upsertWorkflow,
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
  diagnoseAndRepairCode,
  draftBusinessDocument,
  generateFreeCreativeAsset,
  generateProactiveCompanionTurn,
  researchWebWithGrounding,
  runDeveloperAssistant,
  synthesizeAurixVoice,
  transcribeAudioInput,
} from "./server/gemini";
import { NATIVE_WINDOWS_FILES } from "./server/nativeWindowsBundle";
import { registerBiometricRoutes } from "./server/biometricRoutes";
import { getAiStatus, probeAiConnection } from "./server/aiStatus";
import { rateLimit } from "./server/rateLimit";
import type { WorkflowItem } from "./src/types/aurix";
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
      aiProviderConnected: Boolean(process.env.GEMINI_API_KEY) && !settings.offlineModeForced,
      localModelsAvailable: ollama.reachable && ollama.models.length > 0,
      ownerProfileLoaded: Boolean(owner?.name),
      companyKnowledgeLoaded: Boolean(company?.name),
      securityVerified: !sec.isLockedOut,
      microphoneStatus: "unknown",
      checkedAt: new Date().toISOString(),
    });
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

  app.patch("/api/conversations/:id", (req, res) => {
    const title = String(req.body?.title || "");
    const updated = renameConversation(req.params.id, title);
    if (!updated) return res.status(400).json({ error: "A conversation title is required." });
    res.json(updated);
  });

  app.delete("/api/conversations/:id", (req, res) => {
    const removed = deleteConversation(req.params.id);
    if (!removed) return res.status(404).json({ error: "Conversation not found." });
    res.json({ ok: true, conversations: listConversations() });
  });

  app.post(
    "/api/chat",
    rateLimit({ windowMs: 60_000, max: 30, label: "chat" }),
    async (req, res) => {
      try {
        const { conversationId, message, model, language, thinkingLevel, scopedWebsite, mode, attachments } = req.body;
        if (!message || typeof message !== "string") {
          return res.status(400).json({ error: "Message text is required." });
        }
        if (message.length > 8000) {
          return res.status(400).json({ error: "Message is too long. Please keep it under 8,000 characters." });
        }
        const rawAttachments = Array.isArray(attachments) ? attachments.slice(0, 4) : [];
        const validAttachments: Array<{ mimeType: string; dataBase64: string; name?: string }> = [];
        const attachmentNames: string[] = [];
        for (const item of rawAttachments) {
          const mimeType = String(item?.mimeType || "");
          const dataBase64 = String(item?.dataBase64 || "");
          const name = String(item?.name || "attachment");
          if (!mimeType.startsWith("image/") || !dataBase64) continue;
          if (dataBase64.length > 11_000_000) {
            return res.status(413).json({ error: `${name} is larger than 8 MB. Please attach a smaller image.` });
          }
          validAttachments.push({ mimeType, dataBase64, name });
          attachmentNames.push(name);
        }

        const settings = getAppSettings();
        const activeConvId = ensureConversation(
          conversationId,
          message,
          mode || "chat",
          model || settings.activeModel,
          language || settings.language
        );
        const history = getConversationMessages(activeConvId);
        const storedContent = attachmentNames.length
          ? `${message}\n\n[Attached image${attachmentNames.length > 1 ? "s" : ""}: ${attachmentNames.join(", ")}]`
          : message;
        const userMsg = addMessage({
          conversationId: activeConvId,
          role: "user",
          content: storedContent,
          language: language || settings.language,
        });

        const aiReply = await chatWithAurix({
          history,
          userMessage: message,
          model,
          language,
          thinkingLevel,
          scopedWebsite,
          attachments: validAttachments,
        });

        const assistantMsg = addMessage({
          conversationId: activeConvId,
          role: "assistant",
          content: aiReply.text,
          modelUsed: aiReply.modelUsed,
          language: language || settings.language,
          thinkingLevel: aiReply.thinkingLevel,
        });

        res.json({
          conversationId: activeConvId,
          userMessage: userMsg,
          assistantMessage: assistantMsg,
          conversations: listConversations(),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "AI chat request failed.";
        res.status(500).json({ error: msg });
      }
    }
  );

  app.post(
    "/api/chat/regenerate",
    rateLimit({ windowMs: 60_000, max: 15, label: "regenerate" }),
    async (req, res) => {
      try {
        const { conversationId, model, language, thinkingLevel, scopedWebsite } = req.body || {};
        if (!conversationId) return res.status(400).json({ error: "conversationId is required." });
        const messages = getConversationMessages(String(conversationId));
        const lastUser = [...messages].reverse().find((m) => m.role === "user");
        if (!lastUser) return res.status(400).json({ error: "There is no message to regenerate yet." });
        const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
        if (lastAssistant) deleteMessage(lastAssistant.id);

        const history = messages.filter((m) => m.id !== lastUser.id && m.id !== lastAssistant?.id);
        const aiReply = await chatWithAurix({
          history,
          userMessage: lastUser.content,
          model,
          language,
          thinkingLevel,
          scopedWebsite,
        });
        const assistantMsg = addMessage({
          conversationId: String(conversationId),
          role: "assistant",
          content: aiReply.text,
          modelUsed: aiReply.modelUsed,
          language: language || getAppSettings().language,
          thinkingLevel: aiReply.thinkingLevel,
        });
        res.json({ assistantMessage: assistantMsg, conversations: listConversations() });
      } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : "Regeneration failed." });
      }
    }
  );

  /* ---------------- Documents, Reminders & Automation ---------------- */

  app.get("/api/documents", (_req, res) => res.json(listDocuments()));
  app.post("/api/documents", (req, res) => {
    const title = String(req.body?.title || "").trim();
    if (!title) return res.status(400).json({ error: "A document title is required." });
    if (String(req.body?.content || "").length > 400_000) {
      return res.status(413).json({ error: "Document is too large (400,000 character limit)." });
    }
    res.json(upsertDocument(req.body));
  });
  app.delete("/api/documents/:id", (req, res) => {
    if (!deleteDocument(req.params.id)) return res.status(404).json({ error: "Document not found." });
    res.json({ ok: true });
  });

  app.get("/api/reminders", (_req, res) => res.json(listReminders()));
  app.post("/api/reminders", (req, res) => {
    const title = String(req.body?.title || "").trim();
    const dueAt = String(req.body?.dueAt || "");
    if (!title) return res.status(400).json({ error: "A reminder title is required." });
    if (!dueAt || Number.isNaN(new Date(dueAt).getTime())) {
      return res.status(400).json({ error: "A valid reminder date and time is required." });
    }
    res.json(upsertReminder({ ...req.body, title, dueAt }));
  });
  app.delete("/api/reminders/:id", (req, res) => {
    if (!deleteReminder(req.params.id)) return res.status(404).json({ error: "Reminder not found." });
    res.json({ ok: true });
  });

  async function executeWorkflow(workflow: WorkflowItem, confirmed: boolean): Promise<{ status: string; detail: string; url?: string }> {
    if (workflow.requiresConfirmation && !confirmed) {
      const run = addWorkflowRun({
        workflowId: workflow.id,
        workflowName: workflow.name,
        status: "pending_approval",
        detail: "Waiting for the owner to approve this action before it runs.",
      });
      return { status: run.status, detail: run.detail };
    }
    try {
      const payload = workflow.actionPayload.trim();
      let detail = "";
      let url: string | undefined;
      if (workflow.actionType === "create_note") {
        const note = upsertNote({
          id: "",
          title: payload.slice(0, 80) || workflow.name,
          category: "Automation",
          content: payload || workflow.description || `Created by workflow: ${workflow.name}`,
        });
        detail = `Created note "${note.title}".`;
      } else if (workflow.actionType === "create_task") {
        const task = upsertTask({
          id: "",
          title: payload.slice(0, 120) || workflow.name,
          category: "dev",
          priority: "medium",
          status: "todo",
          dueDate: new Date().toISOString().slice(0, 10),
          notes: workflow.description || "Created by AURIX Automation Center.",
        });
        detail = `Created task "${task.title}".`;
      } else if (workflow.actionType === "open_url") {
        if (!/^https?:\/\//i.test(payload)) throw new Error("The action URL must start with http:// or https://.");
        url = payload;
        detail = `Prepared official link ${payload}.`;
      } else {
        const reply = await chatWithAurix({
          history: [],
          userMessage: payload || workflow.description || workflow.name,
          model: getAppSettings().activeModel,
          language: getAppSettings().language,
        });
        const note = upsertNote({
          id: "",
          title: `${workflow.name} — AI result`.slice(0, 100),
          category: "Automation",
          content: reply.text,
        });
        detail = `AURIX answered with ${reply.modelUsed} and saved the result to note "${note.title}".`;
      }
      const run = addWorkflowRun({
        workflowId: workflow.id,
        workflowName: workflow.name,
        status: "success",
        detail,
      });
      const now = new Date();
      markWorkflowRun(workflow.id, {
        lastRunAt: now.toISOString(),
        nextRunAt:
          workflow.trigger === "schedule"
            ? new Date(now.getTime() + workflow.intervalMinutes * 60_000).toISOString()
            : null,
      });
      return { status: run.status, detail, url };
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Workflow failed.";
      const run = addWorkflowRun({
        workflowId: workflow.id,
        workflowName: workflow.name,
        status: "failed",
        detail,
      });
      return { status: run.status, detail };
    }
  }

  app.get("/api/workflows", (_req, res) => res.json({ workflows: listWorkflows(), runs: listWorkflowRuns() }));
  app.post("/api/workflows", (req, res) => {
    const name = String(req.body?.name || "").trim();
    const actionType = String(req.body?.actionType || "");
    if (!name) return res.status(400).json({ error: "A workflow name is required." });
    if (!["create_note", "create_task", "open_url", "chat_prompt"].includes(actionType)) {
      return res.status(400).json({ error: "Unsupported workflow action." });
    }
    res.json(upsertWorkflow({ ...req.body, name, actionType: actionType as WorkflowItem["actionType"] }));
  });
  app.delete("/api/workflows/:id", (req, res) => {
    if (!deleteWorkflow(req.params.id)) return res.status(404).json({ error: "Workflow not found." });
    res.json({ ok: true });
  });
  app.post(
    "/api/workflows/:id/run",
    rateLimit({ windowMs: 60_000, max: 20, label: "workflow" }),
    async (req, res) => {
      const workflow = listWorkflows().find((w) => w.id === req.params.id);
      if (!workflow) return res.status(404).json({ error: "Workflow not found." });
      if (!workflow.enabled) return res.status(409).json({ error: "This workflow is disabled." });
      const outcome = await executeWorkflow(workflow, Boolean(req.body?.confirmed));
      res.status(outcome.status === "pending_approval" ? 202 : 200).json({
        ...outcome,
        workflows: listWorkflows(),
        runs: listWorkflowRuns(),
      });
    }
  );

  app.get("/api/analytics", async (_req, res) => {
    const settings = getAppSettings();
    const ollama = await detectLocalOllamaModels(Number((os.totalmem() / 1024 ** 3).toFixed(2)));
    res.json({
      ...getWorkspaceAnalytics(),
      integrations: {
        geminiConfigured: Boolean(process.env.GEMINI_API_KEY) && !settings.offlineModeForced,
        ollamaReachable: ollama.reachable,
        ollamaModels: ollama.models.length,
        offlineEngine: true,
      },
      generatedAt: new Date().toISOString(),
    });
  });

  app.get("/api/ai/status", async (req, res) => {
    if (req.query.probe === "1") await probeAiConnection(true);
    res.json(getAiStatus());
  });

  app.post("/api/ai/probe", async (_req, res) => {
    await probeAiConnection(true);
    res.json(getAiStatus());
  });

  app.get("/api/integrations/status", async (_req, res) => {
    const settings = getAppSettings();
    const totalRamGb = Number((os.totalmem() / 1024 ** 3).toFixed(2));
    const ollama = await detectLocalOllamaModels(totalRamGb);
    const nets = os.networkInterfaces();
    const networkAddresses = Object.values(nets)
      .flat()
      .filter((n): n is NonNullable<typeof n> => n != null && !n.internal)
      .map((n) => ({ name: n.address, family: n.family }));
    res.json({
      ai: getAiStatus(),
      localModels: { reachable: ollama.reachable, models: ollama.models, host: "http://127.0.0.1:11434" },
      storage: {
        engine: "SQLite (node:sqlite)",
        database: path.join("data", "aurix.db"),
        workspaceFiles: "workspace_files/",
        uploadsPersisted: false,
      },
      system: {
        hostname: os.hostname(),
        platform: `${os.platform()} ${os.release()}`,
        arch: os.arch(),
        uptimeSeconds: Math.floor(os.uptime()),
        networkAddresses,
        offlineModeForced: settings.offlineModeForced,
        activeModel: settings.activeModel,
      },
    });
  });

  // Voice Synthesis (Male AURIX Voice via Gemini 3.8 TTS)
  app.post("/api/voice/tts", rateLimit({ windowMs: 60_000, max: 40, label: "voice" }), async (req, res) => {
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
  app.post("/api/voice/stt", rateLimit({ windowMs: 60_000, max: 30, label: "transcription" }), async (req, res) => {
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
        "AURIX Live Companion",
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
      addAuditLog("FILE_ANALYZED", "AURIX Vision/File", `Analyzed ${req.body.fileName || "input"} (${req.body.mode})`, "info");
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
      addAuditLog("WEB_RESEARCH", "AURIX Research", `Executed grounded search: ${String(query).slice(0, 60)}`, "info");
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
      addAuditLog("DEV_ASSIST", "AURIX Dev", `Developer review for ${req.body.languageTarget} (${req.body.projectScope})`, "info");
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
    addAuditLog("SETTINGS_UPDATED", "Abdul Muheeb", "Updated AURIX settings.", "info");
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
          cloudKeyConfigured: Boolean(process.env.GEMINI_API_KEY) && !settings.offlineModeForced,
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

  // Real laptop control (live only when AURIX runs on the owner's own PC).
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
      executedIn: "AURIX Safety Controller",
      detail: entry.detail,
    });
    res.json({ emergencyStopActive, entry, actionLog });
  });

  // Backup Export
  app.get("/api/backup/export", (_req, res) => {
    const dump = exportFullBackup();
    addAuditLog("BACKUP_EXPORTED", "Abdul Muheeb", "Exported full AURIX SQLite knowledge backup JSON.", "info");
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
        `Downloaded complete AURIX 2.0 ZIP package (${entries.length} files, ${(buffer.length / 1024).toFixed(1)} KB).`,
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
  app.post("/api/command/execute", rateLimit({ windowMs: 60_000, max: 40, label: "command" }), async (req, res) => {
    try {
      const { command, conversationId, language, withVoice = true, model: requestedModel } = req.body || {};
      const text = String(command || "").trim();
      if (!text) return res.status(400).json({ error: "Command text is required." });

      const settings = getAppSettings();
      const targetLang = language || settings.language || "English";
      const q = text.toLowerCase();
      // A spoken laptop command (open YouTube, play music, open a folder, find a
      // file) runs for real when AURIX is running on the owner's own computer.
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
          executedIn: "AURIX Command Router",
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
      } else {
        // Voice conversations pass a fast model so AURIX answers in about a
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
      }

      const assistantMsg = addMessage({
        conversationId: activeConvId,
        role: "assistant",
        content: replyText,
        modelUsed: settings.offlineModeForced ? "offline-knowledge-engine" : settings.activeModel,
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

  // Scheduled workflows: only workflows whose owner explicitly disabled the
  // confirmation gate can run unattended. Everything else is queued for
  // approval so an automation can never perform a destructive action silently.
  setInterval(async () => {
    const due = listWorkflows().filter(
      (w) =>
        w.enabled &&
        w.trigger === "schedule" &&
        w.nextRunAt &&
        new Date(w.nextRunAt).getTime() <= Date.now()
    );
    for (const workflow of due) {
      await executeWorkflow(workflow, !workflow.requiresConfirmation);
    }
  }, 60_000).unref();

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
    console.log("AURIX 2.0 Server listening on http://0.0.0.0:3000");
  });
}

process.on("unhandledRejection", (reason) => {
  console.error("[AURIX Self-Heal Shield] Unhandled rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[AURIX Self-Heal Shield] Uncaught exception:", err);
});

startServer();
