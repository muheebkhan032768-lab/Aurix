import { GoogleGenAI } from "@google/genai";
import type { AiStatusPayload } from "../src/types/aurix";

/**
 * Real AI connection state. Nothing here is simulated: the values come from
 * actual chat calls and from an explicit, cached probe of the Gemini API.
 */
const runtime = {
  lastSuccessAt: null as string | null,
  lastFailureAt: null as string | null,
  lastError: null as string | null,
  lastModel: null as string | null,
  probe: null as AiStatusPayload["probe"],
};

let probeInFlight: Promise<AiStatusPayload["probe"]> | null = null;
let blockedUntil = 0;

/**
 * A failed live probe (invalid key, quota, outage) parks cloud calls for two
 * minutes so chat answers from the local fallback immediately instead of
 * leaving the composer spinning on an unreachable provider.
 */
export function markAiBlocked(reason: string, minutes = 2): void {
  blockedUntil = Date.now() + minutes * 60_000;
  runtime.lastFailureAt = new Date().toISOString();
  runtime.lastError = reason;
}

export function isAiBlocked(): boolean {
  return Date.now() < blockedUntil;
}

export function markAiSuccess(model: string): void {
  blockedUntil = 0;
  runtime.lastSuccessAt = new Date().toISOString();
  runtime.lastModel = model;
  runtime.lastError = null;
}

export function markAiFailure(error: unknown): void {
  runtime.lastFailureAt = new Date().toISOString();
  runtime.lastError = error instanceof Error ? error.message : String(error);
}

export function noteAiModel(model: string): void {
  runtime.lastModel = model;
}

function configured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export function getAiStatus(): AiStatusPayload {
  const probe = runtime.probe;
  let state: AiStatusPayload["state"];
  if (!configured()) {
    state = "not_configured";
  } else if (probe?.ok) {
    state = "connected";
  } else if (probe && !probe.ok) {
    state = "degraded";
  } else if (runtime.lastSuccessAt && !runtime.lastFailureAt) {
    state = "connected";
  } else if (runtime.lastFailureAt) {
    state = "degraded";
  } else {
    state = "untested";
  }
  return {
    configured: configured(),
    provider: "Google Gemini (server-side key)",
    state,
    lastSuccessAt: runtime.lastSuccessAt,
    lastFailureAt: runtime.lastFailureAt,
    lastError: runtime.lastError,
    lastModel: runtime.lastModel,
    probe,
  };
}

/**
 * Sends one tiny generation request so the Integrations screen can show a
 * genuine reachability result instead of a hardcoded badge. Cached for 60s.
 */
export async function probeAiConnection(force = false): Promise<AiStatusPayload["probe"]> {
  if (!configured()) {
    runtime.probe = {
      ok: false,
      checkedAt: new Date().toISOString(),
      latencyMs: null,
      detail: "GEMINI_API_KEY is not configured on the server.",
    };
    return runtime.probe;
  }
  const last = runtime.probe;
  if (!force && last && Date.now() - new Date(last.checkedAt).getTime() < 60_000) {
    return last;
  }
  if (probeInFlight) return probeInFlight;

  probeInFlight = (async () => {
    const started = Date.now();
    try {
      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY as string,
        httpOptions: { apiVersion: "v1beta", headers: { "User-Agent": "aurix-workspace" } },
      });
      const timer = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Probe timed out after 12 seconds.")), 12_000)
      );
      const response = await Promise.race([
        ai.models.generateContent({
          model: "gemini-3.1-flash-lite",
          contents: [{ role: "user", parts: [{ text: "Reply with the single word: ready" }] }],
          // Flash Lite spends part of the budget on internal thinking, so a
          // tiny cap produced an empty candidate and a false "degraded" state.
          config: { maxOutputTokens: 32, temperature: 0 },
        }),
        timer,
      ]);
      const ok = Boolean(response.text);
      if (ok) {
        runtime.lastSuccessAt = new Date().toISOString();
        runtime.lastModel = "gemini-3.1-flash-lite";
        runtime.lastError = null;
      }
      runtime.probe = {
        ok,
        checkedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
        detail: ok ? "Gemini responded to a live test request." : "Gemini returned an empty response.",
      };
      if (!ok) markAiBlocked("Gemini returned an empty response to the live test.");
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Gemini probe failed.";
      runtime.lastFailureAt = new Date().toISOString();
      runtime.lastError = detail;
      runtime.probe = {
        ok: false,
        checkedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
        detail,
      };
      markAiBlocked(detail);
    } finally {
      probeInFlight = null;
    }
    return runtime.probe;
  })();

  return probeInFlight;
}
