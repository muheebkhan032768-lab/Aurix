/**
 * AURIX biometric identity store.
 *
 * - Enrolled face/voice templates are encrypted at rest with AES-256-GCM using
 *   a locally generated key (data/biometric.key, mode 0600) and never returned
 *   to the browser.
 * - Matching happens here, on the owner's machine, not in the client.
 * - Authentication is OR-based: one enabled method succeeding unlocks the
 *   session. A disabled or unavailable method is reported, never silently
 *   downgraded.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { db, uid, addAuditLog, getSecurityStatus } from "./db";
import {
  cepstralMean,
  cosineSimilarity,
  geometrySimilarity,
  l2Normalize,
  pitchSimilarity,
} from "./biometricMath";

const DATA_DIR = path.resolve(process.cwd(), "data");
const KEY_PATH = path.join(DATA_DIR, "biometric.key");

function nowIso(): string {
  return new Date().toISOString();
}

function getKey(): Buffer {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(KEY_PATH)) {
    const key = crypto.randomBytes(32);
    fs.writeFileSync(KEY_PATH, key, { mode: 0o600 });
    return key;
  }
  const existing = fs.readFileSync(KEY_PATH);
  if (existing.length === 32) return existing;
  throw new Error("AURIX biometric key file is corrupt. Delete data/biometric.key and re-enroll.");
}

function encryptPayload(value: unknown): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [iv.toString("base64"), cipher.getAuthTag().toString("base64"), ciphertext.toString("base64")].join(".");
}

function decryptPayload<T>(payload: string): T {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Stored biometric template is unreadable.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plain = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
  return JSON.parse(plain.toString("utf8")) as T;
}

db.exec(`
  CREATE TABLE IF NOT EXISTS biometric_profiles (
    kind TEXT PRIMARY KEY CHECK (kind IN ('face','voice')),
    payload TEXT NOT NULL,
    sample_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS biometric_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    face_enabled INTEGER NOT NULL DEFAULT 1,
    voice_enabled INTEGER NOT NULL DEFAULT 1,
    auth_phrase TEXT NOT NULL DEFAULT 'AURIX authorize my voice',
    face_threshold REAL NOT NULL DEFAULT 0.86,
    voice_threshold REAL NOT NULL DEFAULT 0.78,
    require_biometric_on_boot INTEGER NOT NULL DEFAULT 1,
    send_images_to_cloud INTEGER NOT NULL DEFAULT 0,
    gmail_activation_enabled INTEGER NOT NULL DEFAULT 1,
    chrome_activation_enabled INTEGER NOT NULL DEFAULT 1,
    require_challenge_phrase INTEGER NOT NULL DEFAULT 1,
    auto_start_with_windows INTEGER NOT NULL DEFAULT 0,
    training_preview_seconds INTEGER NOT NULL DEFAULT 60,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS biometric_session (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    status TEXT NOT NULL DEFAULT 'locked',
    method TEXT,
    verified_at TEXT,
    locked_at TEXT,
    last_seen TEXT
  );

  CREATE TABLE IF NOT EXISTS auth_events (
    id TEXT PRIMARY KEY,
    method TEXT NOT NULL,
    outcome TEXT NOT NULL,
    score REAL,
    detail TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS activation_events (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    status TEXT NOT NULL,
    detail TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS pending_activation (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    source TEXT NOT NULL,
    detail TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

const settingsRow = db.prepare(`SELECT id FROM biometric_settings WHERE id = 1`).get();
if (!settingsRow) {
  db.prepare(`INSERT INTO biometric_settings (id, updated_at) VALUES (1, ?)`).run(nowIso());
}
const sessionRow = db.prepare(`SELECT id FROM biometric_session WHERE id = 1`).get();
if (!sessionRow) {
  db.prepare(`INSERT INTO biometric_session (id, status, locked_at) VALUES (1, 'locked', ?)`).run(nowIso());
}

// Voice scoring moved from CMVN+DTW (which did not separate speakers in
// calibration) to cepstral-mean + pitch. Installs still on the old uncalibrated
// default move to the calibrated one; a tuned value is left untouched.
db.prepare(`UPDATE biometric_settings SET voice_threshold = 0.78 WHERE voice_threshold = 0.6`).run();

export interface BiometricSettings {
  faceEnabled: boolean;
  voiceEnabled: boolean;
  authPhrase: string;
  faceThreshold: number;
  voiceThreshold: number;
  requireBiometricOnBoot: boolean;
  sendImagesToCloud: boolean;
  gmailActivationEnabled: boolean;
  chromeActivationEnabled: boolean;
  requireChallengePhrase: boolean;
  autoStartWithWindows: boolean;
  trainingPreviewSeconds: number;
  updatedAt: string;
}

export interface BiometricSession {
  status: "locked" | "unlocked";
  method: string | null;
  verifiedAt: string | null;
  lockedAt: string | null;
}

export interface AuthEvent {
  id: string;
  method: string;
  outcome: string;
  score: number | null;
  detail: string;
  createdAt: string;
}

export interface FaceSample {
  embedding: number[];
  geometry: number[];
}

interface FaceTemplate {
  samples: FaceSample[];
  enrolledAt: string;
}

interface VoiceUtterance {
  frames: number[][];
  f0: number;
}

interface VoiceTemplate {
  utterances: VoiceUtterance[];
  phrase: string;
  enrolledAt: string;
}

export function getBiometricSettings(): BiometricSettings {
  const row = db.prepare(`SELECT * FROM biometric_settings WHERE id = 1`).get() as Record<string, unknown>;
  return {
    faceEnabled: Number(row.face_enabled) === 1,
    voiceEnabled: Number(row.voice_enabled) === 1,
    authPhrase: String(row.auth_phrase),
    faceThreshold: Number(row.face_threshold),
    voiceThreshold: Number(row.voice_threshold),
    requireBiometricOnBoot: Number(row.require_biometric_on_boot) === 1,
    sendImagesToCloud: Number(row.send_images_to_cloud) === 1,
    gmailActivationEnabled: Number(row.gmail_activation_enabled) === 1,
    chromeActivationEnabled: Number(row.chrome_activation_enabled) === 1,
    requireChallengePhrase: Number(row.require_challenge_phrase) === 1,
    autoStartWithWindows: Number(row.auto_start_with_windows) === 1,
    trainingPreviewSeconds: Math.max(15, Math.min(600, Number(row.training_preview_seconds))),
    updatedAt: String(row.updated_at),
  };
}

export function updateBiometricSettings(patch: Partial<BiometricSettings>): BiometricSettings {
  const current = getBiometricSettings();
  const next = { ...current, ...patch };
  const phrase = String(next.authPhrase || "").trim().slice(0, 120) || current.authPhrase;
  const clamp = (value: number, min: number, max: number, fallback: number) =>
    Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
  db.prepare(`
    UPDATE biometric_settings SET
      face_enabled = ?, voice_enabled = ?, auth_phrase = ?, face_threshold = ?, voice_threshold = ?,
      require_biometric_on_boot = ?, send_images_to_cloud = ?, gmail_activation_enabled = ?,
      chrome_activation_enabled = ?, require_challenge_phrase = ?, auto_start_with_windows = ?,
      training_preview_seconds = ?, updated_at = ?
    WHERE id = 1
  `).run(
    next.faceEnabled ? 1 : 0,
    next.voiceEnabled ? 1 : 0,
    phrase,
    clamp(next.faceThreshold, 0.5, 0.99, current.faceThreshold),
    clamp(next.voiceThreshold, 0.4, 0.95, current.voiceThreshold),
    next.requireBiometricOnBoot ? 1 : 0,
    next.sendImagesToCloud ? 1 : 0,
    next.gmailActivationEnabled ? 1 : 0,
    next.chromeActivationEnabled ? 1 : 0,
    next.requireChallengePhrase ? 1 : 0,
    next.autoStartWithWindows ? 1 : 0,
    Math.round(clamp(next.trainingPreviewSeconds, 15, 600, current.trainingPreviewSeconds)),
    nowIso()
  );
  addAuditLog(
    "BIOMETRIC_POLICY_UPDATED",
    "Abdul Muheeb",
    `Face auth ${next.faceEnabled ? "on" : "off"}; voice auth ${next.voiceEnabled ? "on" : "off"}; cloud vision ${
      next.sendImagesToCloud ? "allowed" : "local only"
    }.`,
    "security"
  );
  return getBiometricSettings();
}

export function getBiometricSession(): BiometricSession {
  const row = db.prepare(`SELECT * FROM biometric_session WHERE id = 1`).get() as Record<string, unknown>;
  return {
    status: String(row.status) === "unlocked" ? "unlocked" : "locked",
    method: row.method ? String(row.method) : null,
    verifiedAt: row.verified_at ? String(row.verified_at) : null,
    lockedAt: row.locked_at ? String(row.locked_at) : null,
  };
}

function setSession(status: "locked" | "unlocked", method: string | null): BiometricSession {
  const ts = nowIso();
  if (status === "unlocked") {
    db.prepare(`UPDATE biometric_session SET status = 'unlocked', method = ?, verified_at = ?, last_seen = ? WHERE id = 1`).run(
      method,
      ts,
      ts
    );
  } else {
    db.prepare(`UPDATE biometric_session SET status = 'locked', method = NULL, locked_at = ?, last_seen = ? WHERE id = 1`).run(
      ts,
      ts
    );
  }
  return getBiometricSession();
}

export function lockSession(reason: string): BiometricSession {
  const session = setSession("locked", null);
  addAuditLog("SESSION_LOCKED", "Abdul Muheeb", reason, "security");
  return session;
}

export function unlockSession(method: string): BiometricSession {
  const session = setSession("unlocked", method);
  addAuditLog("SESSION_UNLOCKED", "Abdul Muheeb", `Personal session unlocked via ${method} verification.`, "security");
  return session;
}

export function touchSession(): void {
  db.prepare(`UPDATE biometric_session SET last_seen = ? WHERE id = 1`).run(nowIso());
}

export function listAuthEvents(limit = 40): AuthEvent[] {
  const rows = db.prepare(`SELECT * FROM auth_events ORDER BY created_at DESC LIMIT ?`).all(limit) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    id: String(row.id),
    method: String(row.method),
    outcome: String(row.outcome),
    score: row.score === null || row.score === undefined ? null : Number(row.score),
    detail: String(row.detail),
    createdAt: String(row.created_at),
  }));
}

function logAuthEvent(method: string, outcome: string, score: number | null, detail: string): void {
  db.prepare(`INSERT INTO auth_events (id, method, outcome, score, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)`).run(
    uid("authevt"),
    method,
    outcome,
    score,
    detail,
    nowIso()
  );
}

export interface EnrollmentSummary {
  face: { enrolled: boolean; samples: number; updatedAt: string | null };
  voice: { enrolled: boolean; samples: number; updatedAt: string | null };
}

export function getEnrollmentSummary(): EnrollmentSummary {
  const rows = db.prepare(`SELECT kind, sample_count, updated_at FROM biometric_profiles`).all() as Array<Record<string, unknown>>;
  const find = (kind: string) => rows.find((row) => row.kind === kind);
  const face = find("face");
  const voice = find("voice");
  return {
    face: { enrolled: Boolean(face), samples: face ? Number(face.sample_count) : 0, updatedAt: face ? String(face.updated_at) : null },
    voice: {
      enrolled: Boolean(voice),
      samples: voice ? Number(voice.sample_count) : 0,
      updatedAt: voice ? String(voice.updated_at) : null,
    },
  };
}

function saveTemplate(kind: "face" | "voice", payload: unknown, sampleCount: number): void {
  const encrypted = encryptPayload(payload);
  const ts = nowIso();
  const existing = db.prepare(`SELECT kind FROM biometric_profiles WHERE kind = ?`).get(kind);
  if (existing) {
    db.prepare(`UPDATE biometric_profiles SET payload = ?, sample_count = ?, updated_at = ? WHERE kind = ?`).run(
      encrypted,
      sampleCount,
      ts,
      kind
    );
  } else {
    db.prepare(`INSERT INTO biometric_profiles (kind, payload, sample_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`).run(
      kind,
      encrypted,
      sampleCount,
      ts,
      ts
    );
  }
}

function readTemplate<T>(kind: "face" | "voice"): T | null {
  const row = db.prepare(`SELECT payload FROM biometric_profiles WHERE kind = ?`).get(kind) as { payload?: string } | undefined;
  if (!row?.payload) return null;
  return decryptPayload<T>(row.payload);
}

export function deleteProfile(kind: "face" | "voice"): EnrollmentSummary {
  db.prepare(`DELETE FROM biometric_profiles WHERE kind = ?`).run(kind);
  addAuditLog(
    kind === "face" ? "FACE_PROFILE_DELETED" : "VOICE_PROFILE_DELETED",
    "Abdul Muheeb",
    `${kind === "face" ? "Face" : "Voice"} biometric template permanently deleted from local storage.`,
    "security"
  );
  return getEnrollmentSummary();
}

export function enrollFace(samples: FaceSample[]): EnrollmentSummary {
  const usable = samples.filter((sample) => Array.isArray(sample.embedding) && sample.embedding.length > 32);
  if (usable.length < 3) {
    throw new Error("Face enrollment needs at least 3 usable captures. No template was saved.");
  }
  const normalized = usable.slice(0, 8).map((sample) => ({
    embedding: l2Normalize(sample.embedding.map(Number)),
    geometry: sample.geometry.map(Number),
  }));
  saveTemplate("face", { samples: normalized, enrolledAt: nowIso() } satisfies FaceTemplate, normalized.length);
  addAuditLog("FACE_ENROLLED", "Abdul Muheeb", `Face template enrolled from ${normalized.length} captures (encrypted at rest).`, "security");
  return getEnrollmentSummary();
}

export function enrollVoice(samples: VoiceUtterance[], phrase: string): EnrollmentSummary {
  const usable = (Array.isArray(samples) ? samples : [])
    .map((sample) => ({
      frames: (sample?.frames ?? []).map((frame) => frame.map(Number)),
      f0: Number(sample?.f0),
    }))
    .filter((sample) => sample.frames.length >= 20 && sample.frames[0].length === 13 && sample.f0 > 60 && sample.f0 < 500);
  if (usable.length < 2) {
    throw new Error(
      "Voice enrollment needs at least 2 usable recordings of the authentication phrase with a measurable pitch."
    );
  }
  saveTemplate("voice", { utterances: usable.slice(0, 5), phrase, enrolledAt: nowIso() } satisfies VoiceTemplate, usable.length);
  addAuditLog("VOICE_ENROLLED", "Abdul Muheeb", `Voice template enrolled from ${usable.length} phrase recordings (encrypted at rest).`, "security");
  return getEnrollmentSummary();
}

export interface VerificationResult {
  granted: boolean;
  method: "face" | "voice";
  score: number;
  threshold: number;
  reason: string;
  session: BiometricSession;
  details: string[];
}

export function verifyFace(input: { embedding: number[]; geometry: number[]; liveness?: { blinkDetected?: boolean; frames?: number } }): VerificationResult {
  const settings = getBiometricSettings();
  const template = readTemplate<FaceTemplate>("face");
  const details: string[] = [];

  if (!settings.faceEnabled) {
    return deny("face", "Face authentication is switched off in AURIX settings.", settings.faceThreshold, details);
  }
  if (!template || template.samples.length === 0) {
    return deny("face", "No face profile is enrolled yet.", settings.faceThreshold, details);
  }
  const embedding = input.embedding?.map(Number) ?? [];
  if (embedding.length < 32) {
    return deny("face", "The camera did not produce a usable face sample.", settings.faceThreshold, details);
  }
  if (!input.liveness?.blinkDetected) {
    return deny(
      "face",
      "Liveness check failed: no blink was detected during the capture, so a printed photo or still image cannot unlock AURIX.",
      settings.faceThreshold,
      details
    );
  }

  const normalized = l2Normalize(embedding);
  let best = 0;
  for (const sample of template.samples) {
    const emb = cosineSimilarity(normalized, l2Normalize(sample.embedding));
    const geo = geometrySimilarity(input.geometry ?? [], sample.geometry ?? []);
    const combined = emb * 0.6 + geo * 0.4;
    if (combined > best) best = combined;
  }
  const score = Math.max(0, Math.min(1, best));
  details.push(`Face similarity ${score.toFixed(3)} vs threshold ${settings.faceThreshold.toFixed(2)}.`);
  details.push(`Liveness: blink detected across ${input.liveness.frames ?? 0} sampled frames.`);

  if (score >= settings.faceThreshold) {
    logAuthEvent("face", "granted", score, `Face verified (${score.toFixed(3)} ≥ ${settings.faceThreshold}).`);
    return { granted: true, method: "face", score, threshold: settings.faceThreshold, reason: "Owner face verified.", session: unlockSession("face"), details };
  }
  logAuthEvent("face", "denied", score, `Face rejected (${score.toFixed(3)} < ${settings.faceThreshold}).`);
  return deny("face", "This face does not match the enrolled owner closely enough.", settings.faceThreshold, details, score);
}

export function verifyVoice(input: {
  frames: number[][];
  f0?: number;
  transcript?: string | null;
  challengeId?: string | null;
}): VerificationResult {
  const settings = getBiometricSettings();
  const template = readTemplate<VoiceTemplate>("voice");
  const details: string[] = [];

  if (!settings.voiceEnabled) {
    return deny("voice", "Voice authentication is switched off in AURIX settings.", settings.voiceThreshold, details);
  }
  if (!template || template.utterances.length === 0) {
    return deny("voice", "No voice profile is enrolled yet.", settings.voiceThreshold, details);
  }
  const frames = (input.frames ?? []).map((frame) => frame.map(Number));
  if (frames.length < 20 || frames[0]?.length !== 13) {
    return deny("voice", "The microphone did not capture a long enough voice sample.", settings.voiceThreshold, details);
  }

  if (settings.requireChallengePhrase) {
    const challenge = input.challengeId ? consumeChallenge(input.challengeId) : null;
    if (!challenge) {
      return deny("voice", "The authentication challenge expired. Start a new voice verification.", settings.voiceThreshold, details);
    }
    const transcript = String(input.transcript ?? "").toLowerCase();
    if (!transcript) {
      return deny(
        "voice",
        "Replay protection needs a speech transcript, and this browser did not provide one. Use face authentication or the PIN fallback.",
        settings.voiceThreshold,
        details
      );
    }
    const missing = challenge.words.filter((word) => !transcript.includes(word));
    if (missing.length > 0) {
      return deny(
        "voice",
        `The spoken challenge did not match (missing: ${missing.join(", ")}). A recorded replay cannot pass a fresh challenge.`,
        settings.voiceThreshold,
        details
      );
    }
    details.push(`Challenge phrase matched: "${challenge.words.join(" ")}".`);
  }

  const f0 = Number(input.f0 ?? 0);
  if (!(f0 > 60 && f0 < 500)) {
    return deny(
      "voice",
      "The recording had no measurable pitch. Speak the phrase normally and try again.",
      settings.voiceThreshold,
      details
    );
  }

  const incomingCepstrum = cepstralMean(frames);
  let best = 0;
  let bestBreakdown = { cepstrum: 0, pitch: 0 };
  for (const utterance of template.utterances) {
    const cepstrum = cosineSimilarity(incomingCepstrum, cepstralMean(utterance.frames));
    const pitch = pitchSimilarity(f0, utterance.f0);
    const combined = Math.max(0, Math.min(1, cepstrum * 0.5 + pitch * 0.5));
    if (combined > best) {
      best = combined;
      bestBreakdown = { cepstrum, pitch };
    }
  }
  const score = Math.max(0, Math.min(1, best));
  details.push(`Speaker similarity ${score.toFixed(3)} vs threshold ${settings.voiceThreshold.toFixed(2)}.`);
  details.push(
    `Vocal-tract similarity ${bestBreakdown.cepstrum.toFixed(3)} · pitch similarity ${bestBreakdown.pitch.toFixed(3)} (median F0 ${f0.toFixed(0)} Hz).`
  );

  if (score >= settings.voiceThreshold) {
    logAuthEvent("voice", "granted", score, `Voice verified (${score.toFixed(3)} ≥ ${settings.voiceThreshold}).`);
    return { granted: true, method: "voice", score, threshold: settings.voiceThreshold, reason: "Owner voice verified.", session: unlockSession("voice"), details };
  }
  logAuthEvent("voice", "denied", score, `Voice rejected (${score.toFixed(3)} < ${settings.voiceThreshold}).`);
  return deny("voice", "This voice does not match the enrolled owner closely enough.", settings.voiceThreshold, details, score);
}

function deny(method: "face" | "voice", reason: string, threshold: number, details: string[], score = 0): VerificationResult {
  if (score === 0) logAuthEvent(method, "denied", null, reason);
  return { granted: false, method, score, threshold, reason, session: getBiometricSession(), details };
}

/* ------------------------------------------------------------------ */
/* Voice challenge phrases (replay protection)                         */
/* ------------------------------------------------------------------ */

const CHALLENGE_TTL_MS = 3 * 60 * 1000;
const challenges = new Map<string, { words: string[]; createdAt: number }>();

const CHALLENGE_WORDS = ["amber", "delta", "orbit", "quartz", "cedar", "nova", "harbor", "violet", "tango", "lumen"];

export function issueVoiceChallenge(): { id: string; words: string[]; text: string; expiresInSeconds: number } {
  const settings = getBiometricSettings();
  const words = [CHALLENGE_WORDS[Math.floor(Math.random() * CHALLENGE_WORDS.length)], CHALLENGE_WORDS[Math.floor(Math.random() * CHALLENGE_WORDS.length)]];
  const id = crypto.randomBytes(9).toString("hex");
  challenges.set(id, { words, createdAt: Date.now() });
  // Drop stale challenges so the map cannot grow without bound.
  for (const [key, value] of challenges) {
    if (Date.now() - value.createdAt > CHALLENGE_TTL_MS) challenges.delete(key);
  }
  return {
    id,
    words,
    text: `${settings.authPhrase} ${words.join(" ")}`,
    expiresInSeconds: CHALLENGE_TTL_MS / 1000,
  };
}

function consumeChallenge(id: string): { words: string[] } | null {
  const entry = challenges.get(id);
  if (!entry) return null;
  challenges.delete(id);
  if (Date.now() - entry.createdAt > CHALLENGE_TTL_MS) return null;
  return { words: entry.words };
}

/* ------------------------------------------------------------------ */
/* Chrome / Gmail activation events                                    */
/* ------------------------------------------------------------------ */

export interface ActivationEvent {
  id: string;
  source: string;
  status: string;
  detail: string;
  createdAt: string;
}

export interface ActivationStatus {
  pending: { source: string; detail: string; createdAt: string } | null;
  session: BiometricSession;
  events: ActivationEvent[];
  settings: {
    gmailActivationEnabled: boolean;
    chromeActivationEnabled: boolean;
    autoStartWithWindows: boolean;
  };
}

export function recordActivation(source: string, detail: string): {
  action: "session_active" | "authenticate" | "ignored" | "setup_required";
  status: ActivationStatus;
} {
  const settings = getBiometricSettings();
  const session = getBiometricSession();
  const enabled =
    source === "gmail" ? settings.gmailActivationEnabled : source === "chrome" ? settings.chromeActivationEnabled : true;
  if (!enabled) {
    db.prepare(`INSERT INTO activation_events (id, source, status, detail, created_at) VALUES (?, ?, ?, ?, ?)`).run(
      uid("act"),
      source,
      "ignored",
      `${detail} — detection disabled in AURIX settings.`,
      nowIso()
    );
    return { action: "ignored", status: getActivationStatus() };
  }
  if (session.status === "unlocked" && hasAnyCredential()) {
    db.prepare(`INSERT INTO activation_events (id, source, status, detail, created_at) VALUES (?, ?, ?, ?, ?)`).run(
      uid("act"),
      source,
      "session_active",
      `${detail} — session already verified, no re-authentication requested.`,
      nowIso()
    );
    return { action: "session_active", status: getActivationStatus() };
  }
  if (!hasAnyCredential()) {
    db.prepare(`INSERT INTO activation_events (id, source, status, detail, created_at) VALUES (?, ?, ?, ?, ?)`).run(
      uid("act"),
      source,
      "setup_required",
      `${detail} — no owner face, voice or PIN is configured yet, so AURIX cannot verify anyone.`,
      nowIso()
    );
    return { action: "setup_required", status: getActivationStatus() };
  }
  const ts = nowIso();
  db.prepare(`INSERT INTO pending_activation (id, source, detail, created_at) VALUES (1, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET source = excluded.source, detail = excluded.detail, created_at = excluded.created_at`).run(
    source,
    detail,
    ts
  );
  db.prepare(`INSERT INTO activation_events (id, source, status, detail, created_at) VALUES (?, ?, ?, ?, ?)`).run(
    uid("act"),
    source,
    "authentication_required",
    `${detail} — AURIX is locked, owner verification requested.`,
    ts
  );
  return { action: "authenticate", status: getActivationStatus() };
}

export function getActivationStatus(): ActivationStatus {
  const settings = getBiometricSettings();
  const pendingRow = db.prepare(`SELECT * FROM pending_activation WHERE id = 1`).get() as Record<string, unknown> | undefined;
  const rows = db.prepare(`SELECT * FROM activation_events ORDER BY created_at DESC LIMIT 25`).all() as Array<Record<string, unknown>>;
  return {
    pending: pendingRow
      ? { source: String(pendingRow.source), detail: String(pendingRow.detail), createdAt: String(pendingRow.created_at) }
      : null,
    session: getBiometricSession(),
    events: rows.map((row) => ({
      id: String(row.id),
      source: String(row.source),
      status: String(row.status),
      detail: String(row.detail),
      createdAt: String(row.created_at),
    })),
    settings: {
      gmailActivationEnabled: settings.gmailActivationEnabled,
      chromeActivationEnabled: settings.chromeActivationEnabled,
      autoStartWithWindows: settings.autoStartWithWindows,
    },
  };
}

export function clearPendingActivation(): void {
  db.prepare(`DELETE FROM pending_activation WHERE id = 1`).run();
}

/** AURIX can only ask for verification once the owner has a credential. */
function hasAnyCredential(): boolean {
  const enrollment = getEnrollmentSummary();
  return enrollment.face.enrolled || enrollment.voice.enrolled || getSecurityStatus().hasPin;
}

export function getBiometricSnapshot() {
  const session = getBiometricSession();
  const configured = hasAnyCredential();
  return {
    settings: getBiometricSettings(),
    enrollment: getEnrollmentSummary(),
    // An install with no face, voice or PIN has nothing to protect yet: it is in
    // setup mode, not "locked behind a credential that does not exist".
    session: configured ? session : { ...session, status: "unlocked" as const, method: "setup" },
    hasPin: getSecurityStatus().hasPin,
    authEvents: listAuthEvents(20),
    activation: getActivationStatus(),
  };
}
