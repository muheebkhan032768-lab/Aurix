/**
 * AURIX biometric, training-memory and activation API.
 *
 * Mounted from server.ts. Personal training memory is refused while the owner
 * session is locked, so an unknown user cannot read it even if they reach the
 * HTTP API directly.
 */
import fs from "node:fs";
import path from "node:path";
import type { Express, Request, Response } from "express";
import JSZip from "jszip";
import {
  clearPendingActivation,
  deleteProfile,
  enrollFace,
  enrollVoice,
  getActivationStatus,
  getBiometricSettings,
  getBiometricSnapshot,
  getBiometricSession,
  getEnrollmentSummary,
  issueVoiceChallenge,
  listAuthEvents,
  lockSession,
  recordActivation,
  touchSession,
  unlockSession,
  updateBiometricSettings,
  verifyFace,
  verifyVoice,
} from "./biometricStore";
import { verifySecurityPin, getSecurityStatus, addAuditLog, resetSecurityState } from "./db";
import {
  clearTrainingMemory,
  deleteTrainingExample,
  getTrainingExample,
  listTrainingExamples,
  matchGestureDescriptor,
  matchTrainingEmbedding,
  saveTrainingExample,
  trainingStats,
  updateTrainingExample,
} from "./trainingStore";
import { MODEL_SOURCES, modelStatus, serveModel } from "./visionAssets";
import { analyzeFileOrImage } from "./gemini";
import { hasAnyGeminiKey } from "./geminiPool";

const ASSET_DIR = path.resolve(process.cwd(), "data", "training");
const EXTENSION_DIR = path.resolve(process.cwd(), "desktop", "chrome-extension");

function hasCredentials(): boolean {
  const enrollment = getEnrollmentSummary();
  return enrollment.face.enrolled || enrollment.voice.enrolled || getSecurityStatus().hasPin;
}

/** Personal memory is only readable inside an authenticated owner session. */
function sessionOpen(): boolean {
  if (getBiometricSession().status === "unlocked") return true;
  return !hasCredentials();
}

function refuseLocked(res: Response): boolean {
  if (sessionOpen()) return false;
  res.status(423).json({ error: "AURIX session is locked. Verify the owner before accessing personal training memory." });
  return true;
}

export function registerBiometricRoutes(app: Express): void {
  /* ---------------------------- identity ---------------------------- */

  app.get("/api/biometrics/status", (_req, res) => {
    touchSession();
    res.json({ ...getBiometricSnapshot(), models: modelStatus() });
  });

  app.put("/api/biometrics/settings", (req, res) => {
    if (refuseLocked(res)) return;
    res.json(updateBiometricSettings(req.body ?? {}));
  });

  app.post("/api/biometrics/enroll/face", (req, res) => {
    if (refuseLocked(res)) return;
    if (req.body?.consent !== true) {
      res.status(400).json({ error: "Face enrollment needs explicit owner consent for this camera session." });
      return;
    }
    try {
      const enrollment = enrollFace(Array.isArray(req.body?.samples) ? req.body.samples : []);
      res.json({ ok: true, enrollment });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Face enrollment failed." });
    }
  });

  app.post("/api/biometrics/enroll/voice", (req, res) => {
    if (refuseLocked(res)) return;
    if (req.body?.consent !== true) {
      res.status(400).json({ error: "Voice enrollment needs explicit owner consent for this microphone session." });
      return;
    }
    try {
      const enrollment = enrollVoice(
        Array.isArray(req.body?.utterances) ? req.body.utterances : [],
        String(req.body?.phrase ?? getBiometricSettings().authPhrase)
      );
      res.json({ ok: true, enrollment });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Voice enrollment failed." });
    }
  });

  app.delete("/api/biometrics/profile/:kind", (req, res) => {
    if (refuseLocked(res)) return;
    const kind = req.params.kind === "voice" ? "voice" : req.params.kind === "face" ? "face" : null;
    if (!kind) {
      res.status(400).json({ error: "Unknown biometric profile." });
      return;
    }
    res.json({ ok: true, enrollment: deleteProfile(kind) });
  });

  // Owner recovery: wipe every enrolled credential (face, voice, PIN, lockouts)
  // so the owner can enroll again. Deliberately available while the session is
  // locked — a forgotten voice or face template must never lock the owner out.
  app.post("/api/security/reset", (_req, res) => {
    const security = resetSecurityState();
    res.json({ ok: true, security, snapshot: getBiometricSnapshot() });
  });

  app.get("/api/biometrics/challenge", (_req, res) => {
    res.json(issueVoiceChallenge());
  });

  app.post("/api/biometrics/verify/face", (req, res) => {
    const result = verifyFace({
      embedding: Array.isArray(req.body?.embedding) ? req.body.embedding : [],
      geometry: Array.isArray(req.body?.geometry) ? req.body.geometry : [],
      liveness: req.body?.liveness ?? {},
    });
    clearPendingActivationIfGranted(result.granted);
    res.json(result);
  });

  app.post("/api/biometrics/verify/voice", (req, res) => {
    const result = verifyVoice({
      frames: Array.isArray(req.body?.frames) ? req.body.frames : [],
      f0: Number(req.body?.f0 ?? 0),
      transcript: typeof req.body?.transcript === "string" ? req.body.transcript : null,
      challengeId: typeof req.body?.challengeId === "string" ? req.body.challengeId : null,
    });
    clearPendingActivationIfGranted(result.granted);
    res.json(result);
  });

  app.post("/api/biometrics/session/unlock-pin", (req, res) => {
    if (!getSecurityStatus().hasPin) {
      res.status(400).json({
        ok: false,
        error: "No owner PIN is configured, so PIN unlock is unavailable. Set a PIN in the Security Center first.",
      });
      return;
    }
    const outcome = verifySecurityPin(String(req.body?.pin ?? ""));
    if (!outcome.ok) {
      addAuditLog("BIOMETRIC_GATE_PIN_FAILED", "Security Gate", "PIN fallback rejected at the AURIX identity gate.", "security");
      res.status(401).json({ ok: false, error: outcome.message, security: outcome.status });
      return;
    }
    clearPendingActivation();
    res.json({ ok: true, method: "pin", session: unlockSession("pin"), security: outcome.status });
  });

  app.post("/api/biometrics/session/lock", (req, res) => {
    const reason = typeof req.body?.reason === "string" ? req.body.reason : "Owner locked the AURIX session.";
    res.json({ ok: true, session: lockSession(reason) });
  });

  app.post("/api/biometrics/session/logout", (_req, res) => {
    const session = lockSession("Owner logged out of AURIX.");
    clearPendingActivation();
    addAuditLog("SESSION_LOGGED_OUT", "Abdul Muheeb", "Owner logged out; personal session data closed.", "security");
    res.json({ ok: true, session });
  });

  app.post("/api/biometrics/session/touch", (_req, res) => {
    touchSession();
    res.json({ ok: true, session: getBiometricSession() });
  });

  app.get("/api/biometrics/events", (_req, res) => {
    res.json(listAuthEvents(40));
  });

  /* ---------------------------- training ---------------------------- */

  app.get("/api/training", (req, res) => {
    if (refuseLocked(res)) return;
    res.json({
      examples: listTrainingExamples({
        query: typeof req.query.query === "string" ? req.query.query : undefined,
        kind: typeof req.query.kind === "string" ? req.query.kind : undefined,
        category: typeof req.query.category === "string" ? req.query.category : undefined,
        since: typeof req.query.since === "string" ? req.query.since : undefined,
      }),
      stats: trainingStats(),
    });
  });

  app.post("/api/training", (req, res) => {
    if (refuseLocked(res)) return;
    try {
      const example = saveTrainingExample({
        kind: req.body?.kind,
        label: req.body?.label,
        description: req.body?.description,
        category: req.body?.category,
        imageDataUrl: req.body?.imageDataUrl,
        embedding: req.body?.embedding,
        descriptor: req.body?.descriptor,
        trigger: req.body?.trigger,
        action: req.body?.action,
        approved: req.body?.approved === true,
      });
      res.json({ ok: true, example });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Could not save this training example." });
    }
  });

  app.put("/api/training/:id", (req, res) => {
    if (refuseLocked(res)) return;
    try {
      res.json({ ok: true, example: updateTrainingExample(req.params.id, req.body ?? {}) });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Could not update this training example." });
    }
  });

  app.delete("/api/training/:id", (req, res) => {
    if (refuseLocked(res)) return;
    deleteTrainingExample(req.params.id);
    res.json({ ok: true, stats: trainingStats() });
  });

  app.post("/api/training/clear", (req, res) => {
    if (refuseLocked(res)) return;
    if (req.body?.confirm !== "DELETE_ALL_TRAINING_DATA") {
      res.status(400).json({ error: "Clearing training memory needs explicit confirmation." });
      return;
    }
    const removed = clearTrainingMemory();
    res.json({ ok: true, removed, stats: trainingStats() });
  });

  app.get("/api/training/assets/:file", (req, res) => {
    if (refuseLocked(res)) return;
    const filename = path.basename(String(req.params.file));
    const file = path.join(ASSET_DIR, filename);
    if (!fs.existsSync(file)) {
      res.status(404).json({ error: "Training asset not found." });
      return;
    }
    res.sendFile(file);
  });

  app.post("/api/training/match", (req, res) => {
    if (refuseLocked(res)) return;
    const embedding = Array.isArray(req.body?.embedding) ? req.body.embedding : [];
    if (embedding.length < 16) {
      res.status(400).json({ error: "A visual embedding is required for matching." });
      return;
    }
    res.json({ matches: matchTrainingEmbedding(embedding, "object", 3) });
  });

  app.post("/api/training/match-gesture", (req, res) => {
    if (refuseLocked(res)) return;
    const descriptor = Array.isArray(req.body?.descriptor) ? req.body.descriptor : [];
    if (descriptor.length < 4) {
      res.status(400).json({ error: "A gesture descriptor is required for matching." });
      return;
    }
    res.json({ matches: matchGestureDescriptor(descriptor, 3) });
  });

  /**
   * Identify an observed object: local retrieval first, optional cloud label
   * only when the owner has explicitly allowed images to leave the machine.
   */
  app.post("/api/training/identify", async (req, res) => {
    if (refuseLocked(res)) return;
    const embedding = Array.isArray(req.body?.embedding) ? req.body.embedding : [];
    const imageDataUrl = typeof req.body?.imageDataUrl === "string" ? req.body.imageDataUrl : undefined;
    const settings = getBiometricSettings();
    const matches = embedding.length >= 16 ? matchTrainingEmbedding(embedding, "object", 3) : [];
    const known = matches.find((match) => match.score >= 0.82) ?? null;

    let cloudLabel: string | null = null;
    let cloudError: string | null = null;
    if (settings.sendImagesToCloud && imageDataUrl && hasAnyGeminiKey()) {
      const commaIndex = imageDataUrl.indexOf(",");
      const meta = imageDataUrl.slice(5, commaIndex);
      try {
        const analysis = await analyzeFileOrImage({
          mode: "vision",
          prompt:
            "Identify the main object in this photo in one short sentence. Reply with a noun phrase first, then a short description of its likely purpose. Do not guess if the object is unclear — say so.",
          fileName: "aurix-training-capture.jpg",
          mimeType: meta.split(";")[0] || "image/jpeg",
          base64Data: imageDataUrl.slice(commaIndex + 1),
        });
        cloudLabel = analysis.analysis.trim();
      } catch (err) {
        cloudError = err instanceof Error ? err.message : "Cloud vision labeling failed.";
      }
    }

    res.json({
      matches,
      knownExample: known,
      cloudLabel,
      cloudError,
      cloudConsent: settings.sendImagesToCloud,
      cloudAvailable: hasAnyGeminiKey(),
    });
  });

  /* -------------------------- activation --------------------------- */

  app.post("/api/activation/event", (req, res) => {
    const source = typeof req.body?.source === "string" ? req.body.source : "chrome";
    const detail = typeof req.body?.detail === "string" ? req.body.detail : "Chrome activation signal";
    const result = recordActivation(source, detail);
    res.json(result);
  });

  app.get("/api/activation/status", (_req, res) => {
    res.json(getActivationStatus());
  });

  app.post("/api/activation/pending/clear", (_req, res) => {
    clearPendingActivation();
    res.json({ ok: true, status: getActivationStatus() });
  });

  app.get("/api/activation/extension.zip", async (_req, res) => {
    if (!fs.existsSync(EXTENSION_DIR)) {
      res.status(404).json({ error: "Chrome extension files are missing from the repository." });
      return;
    }
    const zip = new JSZip();
    for (const file of fs.readdirSync(EXTENSION_DIR)) {
      const full = path.join(EXTENSION_DIR, file);
      if (fs.statSync(full).isFile()) zip.file(file, fs.readFileSync(full));
    }
    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", 'attachment; filename="aurix-chrome-extension.zip"');
    res.send(buffer);
  });

  /* ---------------------------- models ----------------------------- */

  app.get("/api/vision/models", (_req, res) => {
    res.json({ models: modelStatus(), known: Object.keys(MODEL_SOURCES) });
  });

  app.get("/api/vision/models/:name", (req, res) => {
    void serveModel(req, res);
  });

  // Expose nothing else: training example ids are only listed through /api/training.
  app.get("/api/training/example/:id", (req: Request, res: Response) => {
    if (refuseLocked(res)) return;
    const example = getTrainingExample(req.params.id);
    if (!example) {
      res.status(404).json({ error: "Training example not found." });
      return;
    }
    res.json(example);
  });
}

function clearPendingActivationIfGranted(granted: boolean): void {
  if (granted) clearPendingActivation();
}
