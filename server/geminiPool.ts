import { GoogleGenAI, type GenerateContentParameters, type GenerateContentResponse } from "@google/genai";

/**
 * AURIX four-key Gemini failover pool.
 *
 * Every Gemini request in the app goes through `getPooledGeminiClient()`, which
 * routes it to the highest-priority healthy key and automatically moves on when
 * a key is rate limited, out of quota, revoked or temporarily unavailable.
 *
 * Key order (priority):
 *   1. GEMINI_API_KEY_1  (falls back to the pre-existing GEMINI_API_KEY)
 *   2. GEMINI_API_KEY_2
 *   3. GEMINI_API_KEY_3
 *   4. GEMINI_API_KEY_4
 *
 * Nothing here ever returns a full key to the client: the status endpoint only
 * exposes a masked identifier.
 */

export type KeyRole = "Primary" | "Secondary" | "Third Backup" | "Final Backup";

export type FailureKind = "quota" | "invalid_key" | "transient" | "other";

export interface GeminiKeyState {
  slot: number;
  envName: string;
  role: KeyRole;
  apiKey: string;
  masked: string;
  status: "active" | "cooldown" | "unavailable";
  cooldownUntil: number | null;
  requests: number;
  successes: number;
  failures: number;
  consecutiveFailures: number;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  lastErrorKind: FailureKind | null;
}

const SLOT_ENV_NAMES: Array<{ slot: number; names: string[]; role: KeyRole }> = [
  { slot: 1, names: ["GEMINI_API_KEY_1", "GEMINI_API_KEY"], role: "Primary" },
  { slot: 2, names: ["GEMINI_API_KEY_2"], role: "Secondary" },
  { slot: 3, names: ["GEMINI_API_KEY_3"], role: "Third Backup" },
  { slot: 4, names: ["GEMINI_API_KEY_4"], role: "Final Backup" },
];

/** Cooldown windows. Quota recovers slowly, transient errors quickly. */
const COOLDOWN_MS: Record<Exclude<FailureKind, "other">, number> = {
  quota: 60_000,
  transient: 15_000,
  invalid_key: 30 * 60_000,
};
const MAX_COOLDOWN_MS = 10 * 60_000;
const ATTEMPTS_PER_KEY = 2;
const BACKOFF_BASE_MS = 400;

/** Recent quota failures, used to detect keys sharing one Google quota pool. */
const recentQuotaFailures: Array<{ slot: number; at: number }> = [];
const SHARED_POOL_WINDOW_MS = 10 * 60_000;

const states = new Map<number, GeminiKeyState>();

function maskKey(key: string): string {
  const tail = key.slice(-4);
  return `••••••••${tail}`;
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
      cooldownUntil: null,
      requests: existing?.requests ?? 0,
      successes: existing?.successes ?? 0,
      failures: existing?.failures ?? 0,
      consecutiveFailures: 0,
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

function isEligible(key: GeminiKeyState, now = Date.now()): boolean {
  if (key.status === "active") return true;
  if (key.cooldownUntil && key.cooldownUntil <= now) {
    // Automatic recovery check: the key gets another chance.
    key.status = "active";
    key.cooldownUntil = null;
    key.consecutiveFailures = 0;
    return true;
  }
  return false;
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

/** Distinguishes a real quota/rate limit from a generic failure. */
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

function noteQuotaFailure(slot: number) {
  const now = Date.now();
  recentQuotaFailures.push({ slot, at: now });
  while (recentQuotaFailures.length && now - recentQuotaFailures[0].at > SHARED_POOL_WINDOW_MS) {
    recentQuotaFailures.shift();
  }
}

function recordSuccess(key: GeminiKeyState) {
  key.requests += 1;
  key.successes += 1;
  key.consecutiveFailures = 0;
  key.status = "active";
  key.cooldownUntil = null;
  key.lastSuccessAt = new Date().toISOString();
}

function recordFailure(key: GeminiKeyState, error: unknown, kind: FailureKind) {
  key.requests += 1;
  key.failures += 1;
  key.consecutiveFailures += 1;
  key.lastErrorAt = new Date().toISOString();
  key.lastError = errorText(error).slice(0, 300);
  key.lastErrorKind = kind;

  if (kind === "other") return;

  const base = COOLDOWN_MS[kind];
  const scaled = kind === "quota" ? Math.min(base * 2 ** (key.consecutiveFailures - 1), MAX_COOLDOWN_MS) : base;
  key.cooldownUntil = Date.now() + scaled;
  key.status = kind === "invalid_key" ? "unavailable" : "cooldown";
  if (kind === "quota") noteQuotaFailure(key.slot);
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
      "No Gemini API key is configured on the server. Add GEMINI_API_KEY_1–GEMINI_API_KEY_4 in Settings > Secrets."
    );
    this.name = "GeminiNotConfiguredError";
  }
}

function friendlyExhaustedMessage(keys: GeminiKeyState[]): string {
  const configured = keys.length;
  const quota = keys.filter((k) => k.lastErrorKind === "quota").length;
  const invalid = keys.filter((k) => k.lastErrorKind === "invalid_key").length;
  const reasons: string[] = [];
  if (invalid) reasons.push(`${invalid} key${invalid > 1 ? "s" : ""} rejected by Google (invalid or revoked)`);
  if (quota) reasons.push(`${quota} key${quota > 1 ? "s" : ""} out of quota or rate limited`);
  if (!reasons.length) reasons.push("every key is temporarily cooling down after provider errors");
  const shared = isSharedQuotaSuspected();
  return [
    `All ${configured} AURIX Gemini key${configured > 1 ? "s are" : " is"} unavailable right now — ${reasons.join(", ")}.`,
    shared
      ? "Your keys look like they share one Google project quota, so switching keys cannot add capacity until that quota resets."
      : "AURIX will retry automatically once a key recovers, or you can add a fresh key in Settings > Secrets.",
  ].join(" ");
}

export function isSharedQuotaSuspected(): boolean {
  const now = Date.now();
  const distinct = new Set(
    recentQuotaFailures.filter((f) => now - f.at <= SHARED_POOL_WINDOW_MS).map((f) => f.slot)
  );
  return distinct.size >= 2;
}

/** Runs one operation against the healthiest available key, in priority order. */
export async function runWithGeminiFailover<T>(
  operation: (ai: GoogleGenAI, key: GeminiKeyState) => Promise<T>
): Promise<T> {
  const keys = getConfiguredKeys();
  if (!keys.length) throw new GeminiNotConfiguredError();

  let sawEligible = false;

  for (const key of keys) {
    if (!isEligible(key)) continue;
    sawEligible = true;

    for (let attempt = 1; attempt <= ATTEMPTS_PER_KEY; attempt += 1) {
      try {
        const ai = new GoogleGenAI({
          apiKey: key.apiKey,
          httpOptions: {
            // v1beta exposes every model this app uses (chat, transcribe, TTS).
            apiVersion: "v1beta",
            headers: { "User-Agent": "aistudio-build" },
          },
        });
        const result = await operation(ai, key);
        recordSuccess(key);
        return result;
      } catch (error) {
        const kind = classifyGeminiError(error);
        if (kind === "other") {
          // A malformed request or an unknown model would fail on every key,
          // so surface it instead of cycling through the pool.
          recordFailure(key, error, kind);
          throw error;
        }
        recordFailure(key, error, kind);
        // A revoked key never recovers on retry, and a rate-limited key gains
        // nothing from an immediate second attempt — move to the next key.
        if (kind === "invalid_key" || kind === "quota") break;
        if (attempt < ATTEMPTS_PER_KEY) {
          await sleep(BACKOFF_BASE_MS * 2 ** (attempt - 1));
        }
      }
    }
  }

  if (!sawEligible) {
    throw new GeminiKeysExhaustedError(friendlyExhaustedMessage(keys));
  }
  throw new GeminiKeysExhaustedError(friendlyExhaustedMessage(keys));
}

/**
 * Drop-in replacement for `new GoogleGenAI(...)`. Every `models.generateContent`
 * call is routed through the failover pool, so all existing call sites keep
 * working unchanged.
 */
export function getPooledGeminiClient(): GoogleGenAI {
  return {
    models: {
      generateContent: (params: GenerateContentParameters) =>
        runWithGeminiFailover((ai) => ai.models.generateContent(params)),
    },
  } as unknown as GoogleGenAI;
}

export interface GeminiKeyPublicStatus {
  slot: number;
  envName: string;
  role: KeyRole;
  masked: string;
  /** Slot number of an earlier key holding the exact same secret, if any. */
  duplicateOfSlot: number | null;
  status: "active" | "cooldown" | "unavailable" | "missing";
  requests: number;
  successes: number;
  failures: number;
  lastSuccessAt: string | null;
  lastError: string | null;
  lastErrorKind: FailureKind | null;
  cooldownRemainingSeconds: number;
}

export function getGeminiPoolStatus() {
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
      };
    }
    const cooling = key.status !== "active" && key.cooldownUntil && key.cooldownUntil > now;
    return {
      slot: key.slot,
      envName: key.envName,
      role: key.role,
      masked: key.masked,
      duplicateOfSlot: findDuplicate(key),
      status: key.status,
      requests: key.requests,
      successes: key.successes,
      failures: key.failures,
      lastSuccessAt: key.lastSuccessAt,
      lastError: key.lastError,
      lastErrorKind: key.lastErrorKind,
      cooldownRemainingSeconds: cooling ? Math.ceil(((key.cooldownUntil as number) - now) / 1000) : 0,
    };
  });

  const active = keys.find((k) => k.status === "active");
  return {
    provider: "Google Gemini",
    configuredKeys: configured.length,
    currentKeySlot: active ? active.slot : null,
    currentKeyMasked: active ? active.masked : null,
    keys,
    lastSuccessfulRequestAt:
      configured
        .map((k) => k.lastSuccessAt)
        .filter((v): v is string => Boolean(v))
        .sort()
        .pop() || null,
    quota: {
      officialQuotaApiAvailable: false,
      note:
        "Google does not expose remaining Gemini quota through the API, so AURIX shows locally counted requests and detected rate limits only.",
      sharedPoolSuspected: isSharedQuotaSuspected(),
    },
    checkedAt: new Date().toISOString(),
  };
}

/** Clears a key's cooldown so the next request tries it again. */
export function resetGeminiKey(slot: number): boolean {
  const key = states.get(slot);
  if (!key) return false;
  key.status = "active";
  key.cooldownUntil = null;
  key.consecutiveFailures = 0;
  key.lastError = null;
  key.lastErrorKind = null;
  return true;
}

/**
 * Controlled per-key probe used by the dashboard. Sends the smallest possible
 * request with the configured model so the owner can see which keys are live.
 */
export async function testGeminiKeys(model: string) {
  const keys = getConfiguredKeys();
  const results = await Promise.all(
    SLOT_ENV_NAMES.map(async (entry) => {
      const key = keys.find((k) => k.slot === entry.slot);
      if (!key) {
        return { slot: entry.slot, role: entry.role, masked: "not configured", ok: false, detail: "No key configured for this slot." };
      }
      try {
        const ai = new GoogleGenAI({
          apiKey: key.apiKey,
          httpOptions: { apiVersion: "v1beta", headers: { "User-Agent": "aistudio-build" } },
        });
        const response = await ai.models.generateContent({
          model,
          contents: "Reply with the single word OK.",
          config: { maxOutputTokens: 8, temperature: 0 },
        });
        recordSuccess(key);
        return {
          slot: entry.slot,
          role: entry.role,
          masked: key.masked,
          ok: true,
          detail: `Model "${model}" answered${response.text ? "" : " (empty reply)"}.`,
        };
      } catch (error) {
        const kind = classifyGeminiError(error);
        recordFailure(key, error, kind);
        const detail =
          kind === "invalid_key"
            ? "Key rejected by Google (invalid or revoked)."
            : kind === "quota"
              ? "Quota or rate limit reached for this key."
              : kind === "transient"
                ? "Provider temporarily unavailable."
                : `Request failed: ${errorText(error).slice(0, 180)}`;
        return { slot: entry.slot, role: entry.role, masked: key.masked, ok: false, detail };
      }
    })
  );
  return { model, results, status: getGeminiPoolStatus() };
}

/** For tests and diagnostics: forget every cached key state. */
export function resetGeminiPoolState() {
  states.clear();
  recentQuotaFailures.length = 0;
}

export type { GenerateContentResponse };
