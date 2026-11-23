import { GoogleGenAI, type GenerateContentParameters, type GenerateContentResponse } from "@google/genai";

/**
 * AURIX Gemini failover pool.
 *
 * Every Gemini request in the app goes through `getPooledGeminiClient()`.
 * Two independent axes are protected:
 *
 *   1. Keys — GEMINI_API_KEY_1 (or the pre-existing GEMINI_API_KEY) first, then
 *      _2, _3 and _4. A revoked key is taken out of rotation; a quota or
 *      transient failure only cools that key down.
 *   2. Models — a model can be out of quota (or retired) for *every* key at
 *      once, because free-tier quota is counted per Google project and model.
 *      Rotating keys then changes nothing, so each model has an explicit,
 *      compatible fallback ladder.
 *
 * Failure handling is per (key, model) pair: a key that is out of quota on the
 * heavy reasoning model stays usable on the fast model.
 *
 * Nothing here ever returns a full key to the client: the status endpoint only
 * exposes a masked identifier.
 */

export type KeyRole = "Primary" | "Secondary" | "Third Backup" | "Fourth Backup" | "Final Backup";

export type FailureKind =
  | "quota"
  | "invalid_key"
  | "transient"
  | "model_unavailable"
  | "bad_request"
  | "other";

export type KeyStatus = "active" | "cooldown" | "unavailable";

interface ModelRuntime {
  cooldownUntil: number | null;
  consecutiveFailures: number;
  lastError: string | null;
  lastErrorAt: string | null;
  lastErrorKind: FailureKind | null;
  lastSuccessAt: string | null;
  requests: number;
  successes: number;
  failures: number;
  lastResponseMs: number | null;
}

export interface GeminiKeyState {
  slot: number;
  envName: string;
  role: KeyRole;
  apiKey: string;
  masked: string;
  /** `unavailable` means Google rejected the credential itself. */
  status: KeyStatus;
  models: Map<string, ModelRuntime>;
  requests: number;
  successes: number;
  failures: number;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  lastErrorKind: FailureKind | null;
}

const SLOT_ENV_NAMES: Array<{ slot: number; names: string[]; role: KeyRole }> = [
  { slot: 1, names: ["GEMINI_API_KEY_1", "GEMINI_API_KEY"], role: "Primary" },
  { slot: 2, names: ["GEMINI_API_KEY_2"], role: "Secondary" },
  { slot: 3, names: ["GEMINI_API_KEY_3"], role: "Third Backup" },
  { slot: 4, names: ["GEMINI_API_KEY_4"], role: "Fourth Backup" },
  { slot: 5, names: ["GEMINI_API_KEY_5"], role: "Final Backup" },
];

/**
 * Compatible model fallbacks, in order.
 *
 * Free-tier Gemini quota is granted per model, so a model that has hit its
 * daily allowance for the project must be replaced, not retried on another key.
 * Every entry here accepts the same request shape as its parent (text, vision,
 * thinking config, JSON schema output). `gemini-3.8-flash` is deliberately not
 * listed: in this deployment it stalls for over 45s, which would be worse than
 * a fast fallback to `gemini-3.5-flash`.
 */
const MODEL_LADDERS: Record<string, string[]> = {
  "gemini-4-hydrogen": ["gemini-3.5-flash", "gemini-3.1-flash-lite"],
  "gemini-3.8-flash": ["gemini-3.5-flash", "gemini-3.1-flash-lite"],
  "gemini-3.5-flash": ["gemini-3.1-flash-lite"],
  "gemini-3.1-flash-lite": ["gemini-3.5-flash"],
  "gemini-3.8-flash-tts": ["gemini-3.8-flash-lite-tts", "gemini-3.1-flash-tts-preview"],
  "gemini-3.8-flash-lite-tts": ["gemini-3.1-flash-tts-preview"],
  // Transcription has a single compatible model; a 404 is reported, never faked.
  "gemini-3.5-transcribe": [],
};

/** The full ladder for a requested model, starting with the model itself. */
export function buildModelLadder(model: string): string[] {
  const seen = new Set<string>();
  const ladder: string[] = [];
  const walk = (current: string) => {
    if (seen.has(current)) return;
    seen.add(current);
    ladder.push(current);
    for (const next of MODEL_LADDERS[current] ?? []) walk(next);
  };
  walk(model);
  return ladder;
}

/** Cooldown windows. Quota recovers slowly, transient errors quickly. */
const COOLDOWN_MS: Record<FailureKind, number> = {
  quota: 60_000,
  invalid_key: 30 * 60_000,
  transient: 15_000,
  model_unavailable: 30 * 60_000,
  bad_request: 0,
  other: 0,
};
const DAILY_QUOTA_COOLDOWN_MS = 15 * 60_000;
const MAX_COOLDOWN_MS = 30 * 60_000;
const ATTEMPTS_PER_KEY = 2;
const BACKOFF_BASE_MS = 400;
const DEFAULT_TIMEOUT_MS = 45_000;
const TTS_TIMEOUT_MS = 90_000;

export const ALL_ROUTES_DOWN_MESSAGE =
  "AURIX is temporarily unable to connect to its AI services. All configured API routes are currently unavailable. Please try again shortly.";

/** Recent quota failures, used to detect keys sharing one Google quota pool. */
const recentQuotaFailures: Array<{ slot: number; at: number }> = [];
const SHARED_POOL_WINDOW_MS = 10 * 60_000;

/** Models Google reported as retired/unknown — shared by every key. */
const modelOutages = new Map<string, number>();

let lastSuccess: { at: string; model: string; slot: number; masked: string; ms: number } | null = null;
let lastFailure: {
  at: string;
  model: string;
  slot: number;
  masked: string;
  kind: FailureKind;
  message: string;
} | null = null;

const states = new Map<number, GeminiKeyState>();

function maskKey(key: string): string {
  const tail = key.slice(-4);
  return `••••••••${tail}`;
}

function emptyModelRuntime(): ModelRuntime {
  return {
    cooldownUntil: null,
    consecutiveFailures: 0,
    lastError: null,
    lastErrorAt: null,
    lastErrorKind: null,
    lastSuccessAt: null,
    requests: 0,
    successes: 0,
    failures: 0,
    lastResponseMs: null,
  };
}

function modelRuntime(key: GeminiKeyState, model: string): ModelRuntime {
  let runtime = key.models.get(model);
  if (!runtime) {
    runtime = emptyModelRuntime();
    key.models.set(model, runtime);
  }
  return runtime;
}

function resolveKey(slot: number, names: string[]): { envName: string; apiKey: string } | null {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim()) return { envName: name, apiKey: value.trim() };
  }
  return null;
}

/** All keys currently present in the environment, in priority order. */
export function getConfiguredKeys(): GeminiKeyState[] {
  const keys: GeminiKeyState[] = [];
  for (const entry of SLOT_ENV_NAMES) {
    const resolved = resolveKey(entry.slot, entry.names);
    if (!resolved) continue;
    const existing = states.get(entry.slot);
    if (existing && existing.apiKey === resolved.apiKey) {
      existing.envName = resolved.envName;
      keys.push(existing);
      continue;
    }
    const fresh: GeminiKeyState = {
      slot: entry.slot,
      envName: resolved.envName,
      role: entry.role,
      apiKey: resolved.apiKey,
      masked: maskKey(resolved.apiKey),
      status: "active",
      models: new Map(),
      requests: existing?.requests ?? 0,
      successes: existing?.successes ?? 0,
      failures: existing?.failures ?? 0,
      lastSuccessAt: existing?.lastSuccessAt ?? null,
      lastErrorAt: null,
      lastError: null,
      lastErrorKind: null,
    };
    states.set(entry.slot, fresh);
    keys.push(fresh);
  }
  return keys;
}

export function hasAnyGeminiKey(): boolean {
  return getConfiguredKeys().length > 0;
}

function readStatus(error: unknown): number | null {
  const err = error as {
    status?: number;
    code?: number | string;
    response?: { status?: number };
    error?: { code?: number; status?: string };
  };
  const candidates = [err?.status, err?.response?.status, err?.error?.code];
  for (const c of candidates) {
    if (typeof c === "number" && c >= 400 && c < 600) return c;
  }
  if (typeof err?.code === "number" && err.code >= 400 && err.code < 600) return err.code;
  return null;
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/** True when the caller cancelled the request (AbortController / timeout). */
function isCancellation(error: unknown): boolean {
  const name = (error as { name?: string })?.name;
  return name === "AbortError" || name === "TimeoutError" || /aborted|cancelled|canceled/i.test(errorText(error));
}

/** Distinguishes quota, credential, model and request failures. */
export function classifyGeminiError(error: unknown): FailureKind {
  const text = errorText(error);
  const status = readStatus(error);
  const code = (error as { code?: string })?.code;

  if (
    status === 401 ||
    status === 403 ||
    /PERMISSION_DENIED|UNAUTHENTICATED|API_KEY_INVALID|API key not valid|invalid api key|revoked/i.test(text)
  ) {
    return "invalid_key";
  }
  if (
    status === 404 ||
    /NOT_FOUND|is not found|no longer available|not supported for generateContent|unsupported model/i.test(text)
  ) {
    return "model_unavailable";
  }
  if (
    status === 400 ||
    /INVALID_ARGUMENT|FAILED_PRECONDITION|invalid request|bad request/i.test(text)
  ) {
    return "bad_request";
  }
  if (
    status === 429 ||
    /RESOURCE_EXHAUSTED|quota|rate limit|rateLimit|too many requests/i.test(text)
  ) {
    return "quota";
  }
  if (
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    /UNAVAILABLE|INTERNAL|DEADLINE_EXCEEDED|bad gateway|service unavailable|timeout|timed out|network|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed/i.test(text)
  ) {
    return "transient";
  }
  if (code === "ETIMEDOUT" || code === "ECONNRESET" || code === "ENOTFOUND" || code === "UND_ERR_CONNECT_TIMEOUT") {
    return "transient";
  }
  return "other";
}

/** Google's own `retryDelay` hint, when the error carries one. */
function parseRetryDelayMs(error: unknown): number | null {
  const text = errorText(error);
  const match =
    text.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/) || text.match(/retry[-_ ]?after["\s:]+(\d+)/i);
  if (!match) return null;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) ? Math.min(Math.max(seconds, 1) * 1000, MAX_COOLDOWN_MS) : null;
}

function isDailyQuotaError(error: unknown): boolean {
  return /per day|PerDay|requests per day|limit:\s*0\b/i.test(errorText(error));
}

function noteQuotaFailure(slot: number) {
  const now = Date.now();
  recentQuotaFailures.push({ slot, at: now });
  while (recentQuotaFailures.length && now - recentQuotaFailures[0].at > SHARED_POOL_WINDOW_MS) {
    recentQuotaFailures.shift();
  }
}

function recordSuccess(key: GeminiKeyState, model: string, durationMs: number) {
  const nowIso = new Date().toISOString();
  key.requests += 1;
  key.successes += 1;
  key.lastSuccessAt = nowIso;
  const runtime = modelRuntime(key, model);
  runtime.requests += 1;
  runtime.successes += 1;
  runtime.consecutiveFailures = 0;
  runtime.cooldownUntil = null;
  runtime.lastSuccessAt = nowIso;
  runtime.lastResponseMs = durationMs;
  lastSuccess = { at: nowIso, model, slot: key.slot, masked: key.masked, ms: durationMs };
}

function recordFailure(key: GeminiKeyState, model: string, error: unknown, kind: FailureKind) {
  const nowIso = new Date().toISOString();
  const message = errorText(error).slice(0, 300);
  key.requests += 1;
  key.failures += 1;
  key.lastErrorAt = nowIso;
  key.lastError = message;
  key.lastErrorKind = kind;

  const runtime = modelRuntime(key, model);
  runtime.requests += 1;
  runtime.failures += 1;
  runtime.consecutiveFailures += 1;
  runtime.lastErrorAt = nowIso;
  runtime.lastError = message;
  runtime.lastErrorKind = kind;

  lastFailure = { at: nowIso, model, slot: key.slot, masked: key.masked, kind, message };

  if (kind === "bad_request" || kind === "other") return;

  if (kind === "invalid_key") {
    key.status = "unavailable";
    runtime.cooldownUntil = Date.now() + COOLDOWN_MS.invalid_key;
    return;
  }

  if (kind === "model_unavailable") {
    modelOutages.set(model, Date.now() + COOLDOWN_MS.model_unavailable);
    runtime.cooldownUntil = Date.now() + COOLDOWN_MS.model_unavailable;
    return;
  }

  if (kind === "quota") {
    noteQuotaFailure(key.slot);
    const hinted = parseRetryDelayMs(error);
    const base = isDailyQuotaError(error) ? DAILY_QUOTA_COOLDOWN_MS : COOLDOWN_MS.quota;
    const scaled = Math.min(
      (hinted ?? base) * 2 ** Math.min(runtime.consecutiveFailures - 1, 4),
      MAX_COOLDOWN_MS
    );
    runtime.cooldownUntil = Date.now() + scaled;
    return;
  }

  // Transient: short cooldown, exponential per consecutive failure.
  const scaled = Math.min(
    COOLDOWN_MS.transient * 2 ** Math.min(runtime.consecutiveFailures - 1, 4),
    MAX_COOLDOWN_MS
  );
  runtime.cooldownUntil = Date.now() + scaled;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class GeminiKeysExhaustedError extends Error {
  readonly kind = "all_keys_unavailable";
  constructor(message: string) {
    super(message);
    this.name = "GeminiKeysExhaustedError";
  }
}

export class GeminiNotConfiguredError extends Error {
  constructor() {
    super(
      "No Gemini API key is configured on the server. Add GEMINI_API_KEY_1–GEMINI_API_KEY_5 in Settings > Secrets."
    );
    this.name = "GeminiNotConfiguredError";
  }
}

export function isSharedQuotaSuspected(): boolean {
  const now = Date.now();
  const distinct = new Set(
    recentQuotaFailures.filter((f) => now - f.at <= SHARED_POOL_WINDOW_MS).map((f) => f.slot)
  );
  return distinct.size >= 2;
}

function friendlyExhaustedMessage(keys: GeminiKeyState[], ladder: string[]): string {
  const quota = keys.filter((k) => k.lastErrorKind === "quota").length;
  const invalid = keys.filter((k) => k.status === "unavailable").length;
  const missingModel = ladder.filter((m) => (modelOutages.get(m) ?? 0) > Date.now());
  const reasons: string[] = [];
  if (invalid) reasons.push(`${invalid} key${invalid > 1 ? "s" : ""} rejected by Google (invalid or revoked)`);
  if (quota) reasons.push(`${quota} key${quota > 1 ? "s" : ""} out of quota or rate limited`);
  if (missingModel.length) reasons.push(`model unavailable: ${missingModel.join(", ")}`);
  if (!reasons.length) reasons.push("every route is cooling down after provider errors");

  const details = [
    `Tried ${ladder.join(" → ")} on ${keys.length} key${keys.length === 1 ? "" : "s"} — ${reasons.join(", ")}.`,
    isSharedQuotaSuspected()
      ? "The keys appear to share one Google project quota, so switching keys cannot add capacity until that quota resets."
      : "AURIX will retry automatically once a route recovers.",
  ];
  return `${ALL_ROUTES_DOWN_MESSAGE} ${details.join(" ")}`;
}

interface FailoverOptions {
  /** Model ladder; the requested model is always first. */
  models?: string[];
  timeoutMs?: number;
}

function createClient(apiKey: string, timeoutMs: number): GoogleGenAI {
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      // v1beta exposes every model this app uses (chat, transcribe, TTS).
      apiVersion: "v1beta",
      headers: { "User-Agent": "aistudio-build" },
      // The SDK aborts the HTTP request itself when this elapses, so a stalled
      // provider cannot pin a request open indefinitely.
      timeout: timeoutMs,
    },
  });
}

/**
 * Runs one operation through the key × model matrix.
 *
 * Order: preferred model on every healthy key, then the next model in the
 * ladder on every healthy key, and so on. Permanent request errors are thrown
 * at once; cancellations are re-thrown without marking any route unhealthy.
 */
export async function runWithGeminiFailover<T>(
  operation: (ai: GoogleGenAI, key: GeminiKeyState, model: string) => Promise<T>,
  options: FailoverOptions = {}
): Promise<T> {
  const keys = getConfiguredKeys();
  if (!keys.length) throw new GeminiNotConfiguredError();

  const ladder = options.models?.length ? options.models : ["gemini-4-hydrogen", "gemini-3.5-flash", "gemini-3.1-flash-lite"];
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const now = Date.now();
  let attempted = false;

  for (const model of ladder) {
    if ((modelOutages.get(model) ?? 0) > now) continue;

    for (const key of keys) {
      // Google reported this model as retired/unknown: no other key can serve it.
      if ((modelOutages.get(model) ?? 0) > Date.now()) break;
      if (key.status === "unavailable") continue;
      const runtime = modelRuntime(key, model);
      if (runtime.cooldownUntil && runtime.cooldownUntil > Date.now()) continue;
      attempted = true;

      for (let attempt = 1; attempt <= ATTEMPTS_PER_KEY; attempt += 1) {
        const started = Date.now();
        try {
          const ai = createClient(key.apiKey, timeoutMs);
          const result = await operation(ai, key, model);
          recordSuccess(key, model, Date.now() - started);
          return result;
        } catch (error) {
          if (isCancellation(error)) throw error;
          const kind = classifyGeminiError(error);

          if (kind === "bad_request" || kind === "other") {
            // A malformed request would fail on every key and every model, so
            // report it instead of cycling through the pool.
            recordFailure(key, model, error, kind);
            throw error;
          }

          recordFailure(key, model, error, kind);

          // A revoked key, an exhausted model or a model Google no longer
          // serves gains nothing from an immediate retry: move on.
          if (kind === "invalid_key" || kind === "quota" || kind === "model_unavailable") break;

          if (attempt < ATTEMPTS_PER_KEY) {
            const hinted = parseRetryDelayMs(error);
            await sleep(hinted ?? BACKOFF_BASE_MS * 2 ** (attempt - 1));
          }
        }
      }
    }
  }

  if (!attempted) {
    // Every route is cooling down: still a real outage, never a silent answer.
    throw new GeminiKeysExhaustedError(friendlyExhaustedMessage(keys, ladder));
  }
  throw new GeminiKeysExhaustedError(friendlyExhaustedMessage(keys, ladder));
}

/**
 * Drop-in replacement for `new GoogleGenAI(...)`. Every `models.generateContent`
 * call is routed through the failover pool, so all existing call sites keep
 * working unchanged and gain the model fallback ladder automatically.
 */
export function getPooledGeminiClient(): GoogleGenAI {
  return {
    models: {
      generateContent: (params: GenerateContentParameters) => {
        const ladder = buildModelLadder(params.model);
        const timeoutMs = /tts/i.test(params.model) ? TTS_TIMEOUT_MS : DEFAULT_TIMEOUT_MS;
        return runWithGeminiFailover(
          (ai, _key, model) => ai.models.generateContent({ ...params, model }),
          { models: ladder, timeoutMs }
        );
      },
    },
  } as unknown as GoogleGenAI;
}

export interface GeminiModelCooldown {
  model: string;
  kind: FailureKind | null;
  remainingSeconds: number;
}

export interface GeminiKeyPublicStatus {
  slot: number;
  envName: string;
  role: KeyRole;
  masked: string;
  /** Slot number of an earlier key holding the exact same secret, if any. */
  duplicateOfSlot: number | null;
  status: KeyStatus | "missing";
  requests: number;
  successes: number;
  failures: number;
  lastSuccessAt: string | null;
  lastError: string | null;
  lastErrorKind: FailureKind | null;
  cooldownRemainingSeconds: number;
  modelCooldowns: GeminiModelCooldown[];
}

export function getGeminiPoolStatus(preferredModel?: string) {
  const now = Date.now();
  const configured = getConfiguredKeys();
  const bySlot = new Map(configured.map((k) => [k.slot, k]));
  const findDuplicate = (key: GeminiKeyState): number | null => {
    const earlier = configured.find((other) => other.slot < key.slot && other.apiKey === key.apiKey);
    return earlier ? earlier.slot : null;
  };

  const keys: GeminiKeyPublicStatus[] = SLOT_ENV_NAMES.map((entry) => {
    const key = bySlot.get(entry.slot);
    if (!key) {
      return {
        slot: entry.slot,
        envName: entry.names[0],
        role: entry.role,
        masked: "not configured",
        duplicateOfSlot: null,
        status: "missing",
        requests: 0,
        successes: 0,
        failures: 0,
        lastSuccessAt: null,
        lastError: null,
        lastErrorKind: null,
        cooldownRemainingSeconds: 0,
        modelCooldowns: [],
      };
    }

    const modelCooldowns: GeminiModelCooldown[] = [...key.models.entries()]
      .filter(([, runtime]) => runtime.cooldownUntil && runtime.cooldownUntil > now)
      .map(([model, runtime]) => ({
        model,
        kind: runtime.lastErrorKind,
        remainingSeconds: Math.ceil(((runtime.cooldownUntil as number) - now) / 1000),
      }))
      .sort((a, b) => b.remainingSeconds - a.remainingSeconds);

    // A key counts as active while it can still serve at least one model of the
    // preferred ladder; otherwise the fallback route that actually answers would
    // be reported as unavailable.
    const ladder = preferredModel ? buildModelLadder(preferredModel) : [];
    const ladderModelFree =
      ladder.length > 0
        ? ladder.some((model) => !modelCooldowns.some((c) => c.model === model))
        : modelCooldowns.length === 0;

    let status: KeyStatus = "active";
    if (key.status === "unavailable") {
      status = "unavailable";
    } else if (!ladderModelFree) {
      status = "cooldown";
    }
    const preferredCooling = preferredModel
      ? modelCooldowns.find((c) => c.model === preferredModel)
      : undefined;

    return {
      slot: key.slot,
      envName: key.envName,
      role: key.role,
      masked: key.masked,
      duplicateOfSlot: findDuplicate(key),
      status,
      requests: key.requests,
      successes: key.successes,
      failures: key.failures,
      lastSuccessAt: key.lastSuccessAt,
      lastError: key.lastError,
      lastErrorKind: key.lastErrorKind,
      cooldownRemainingSeconds: (preferredCooling ?? modelCooldowns[0])?.remainingSeconds ?? 0,
      modelCooldowns,
    };
  });

  const healthy = keys.filter((k) => k.status === "active");
  const current = healthy[0] ?? keys.find((k) => k.status === "cooldown");

  return {
    provider: "Google Gemini",
    configuredKeys: configured.length,
    preferredModel: preferredModel ?? null,
    currentKeySlot: current && current.status !== "missing" ? current.slot : null,
    currentKeyMasked: current && current.status !== "missing" ? current.masked : null,
    activeModel: lastSuccess?.model ?? null,
    lastResponseMs: lastSuccess?.ms ?? null,
    keys,
    lastSuccessfulRequestAt: lastSuccess?.at ?? null,
    lastError: lastFailure
      ? {
          at: lastFailure.at,
          model: lastFailure.model,
          masked: lastFailure.masked,
          kind: lastFailure.kind,
          message: lastFailure.message,
        }
      : null,
    quota: {
      officialQuotaApiAvailable: false,
      note:
        "Google does not expose remaining Gemini quota through the API, so AURIX shows locally counted requests and detected rate limits only.",
      sharedPoolSuspected: isSharedQuotaSuspected(),
    },
    checkedAt: new Date().toISOString(),
  };
}

/** Clears a key's cooldowns so the next request tries it again. */
export function resetGeminiKey(slot: number): boolean {
  const key = states.get(slot);
  if (!key) return false;
  key.status = "active";
  key.lastError = null;
  key.lastErrorKind = null;
  for (const runtime of key.models.values()) {
    runtime.cooldownUntil = null;
    runtime.consecutiveFailures = 0;
    runtime.lastError = null;
    runtime.lastErrorKind = null;
  }
  return true;
}

/**
 * Controlled per-key probe used by the dashboard. Walks the model ladder so the
 * owner sees which model each key can actually answer with, not just whether
 * the preferred model happens to be in quota.
 */
export async function testGeminiKeys(preferredModel: string) {
  const keys = getConfiguredKeys();
  const ladder = buildModelLadder(preferredModel);
  const results = await Promise.all(
    SLOT_ENV_NAMES.map(async (entry) => {
      const key = keys.find((k) => k.slot === entry.slot);
      if (!key) {
        return {
          slot: entry.slot,
          role: entry.role,
          masked: "not configured",
          ok: false,
          model: null,
          detail: "No key configured for this slot.",
        };
      }

      const notes: string[] = [];
      for (const model of ladder) {
        const started = Date.now();
        try {
          const ai = createClient(key.apiKey, DEFAULT_TIMEOUT_MS);
          const response = await ai.models.generateContent({
            model,
            contents: "Reply with the single word OK.",
            config: { maxOutputTokens: 8, temperature: 0 },
          });
          recordSuccess(key, model, Date.now() - started);
          const suffix = notes.length ? ` (after ${notes.join("; ")})` : "";
          return {
            slot: entry.slot,
            role: entry.role,
            masked: key.masked,
            ok: true,
            model,
            detail: `Connected via ${model}${response.text ? "" : " (empty reply)"}${suffix}.`,
          };
        } catch (error) {
          const kind = classifyGeminiError(error);
          recordFailure(key, model, error, kind);
          notes.push(
            `${model}: ${
              kind === "invalid_key"
                ? "key rejected (invalid or revoked)"
                : kind === "quota"
                  ? "quota or rate limit reached"
                  : kind === "model_unavailable"
                    ? "model unavailable"
                    : kind === "transient"
                      ? "provider temporarily unavailable"
                      : errorText(error).slice(0, 120)
            }`
          );
          if (kind === "invalid_key" || kind === "bad_request") break;
        }
      }

      return {
        slot: entry.slot,
        role: entry.role,
        masked: key.masked,
        ok: false,
        model: null,
        detail: notes.join("; ") || "No compatible model answered.",
      };
    })
  );
  return { model: preferredModel, results, status: getGeminiPoolStatus(preferredModel) };
}

/** For tests and diagnostics: forget every cached key state. */
export function resetGeminiPoolState() {
  states.clear();
  recentQuotaFailures.length = 0;
  modelOutages.clear();
  lastSuccess = null;
  lastFailure = null;
}

export type { GenerateContentResponse };
