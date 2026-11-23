# AURIX Gemini API Failover

AURIX routes every Gemini request through one pool (`server/geminiPool.ts`).
All existing chat, voice, vision, research and creative features use it unchanged —
`getClient()` in `server/gemini.ts` returns the pooled client.

## Keys

| Slot | Environment variable | Role |
| --- | --- | --- |
| 1 | `GEMINI_API_KEY_1` (falls back to `GEMINI_API_KEY`) | Primary |
| 2 | `GEMINI_API_KEY_2` | Secondary |
| 3 | `GEMINI_API_KEY_3` | Third backup |
| 4 | `GEMINI_API_KEY_4` | Final backup |

Set them in Settings → Secrets. They are read on the server only and are never sent to
the browser: `GET /api/ai/keys` returns masked identifiers (`••••••••ab12`) only.

## Two failover axes

1. **Keys** — every request starts on the highest-priority healthy key.
2. **Models** — free-tier Gemini quota is counted per Google project *and model*, so a
   model can be exhausted for every key at once. Rotating keys then changes nothing, so
   each model has an explicit, request-compatible fallback ladder:

   ```
   gemini-4-hydrogen → gemini-3.5-flash → gemini-3.1-flash-lite
   gemini-3.5-flash  → gemini-3.1-flash-lite
   gemini-3.1-flash-lite → gemini-3.5-flash
   gemini-3.8-flash-tts → gemini-3.8-flash-lite-tts → gemini-3.1-flash-tts-preview
   gemini-3.5-transcribe → (single compatible model)
   ```

   `gemini-3.8-flash` is intentionally not in the ladder: in this deployment it stalls
   for more than 45s, which is worse than falling through to `gemini-3.5-flash`.

The order tried is: preferred model on every healthy key, then the next model on every
healthy key, and so on.

## Error handling

| Response | Classification | Behaviour |
| --- | --- | --- |
| 429 `RESOURCE_EXHAUSTED` | `quota` | cool that key down for that model, next key, then next model |
| 401 / 403 `API_KEY_INVALID`, `PERMISSION_DENIED` | `invalid_key` | key removed from rotation, never retried |
| 404 `NOT_FOUND` / retired model | `model_unavailable` | model skipped for every key, next model |
| 400 `INVALID_ARGUMENT` | `bad_request` | surfaced immediately, never cycled across keys |
| 500 / 502 / 503 / 504, timeout, network | `transient` | one retry with backoff, then next key |
| caller abort | cancellation | re-thrown without marking any route unhealthy |

Cooldowns are tracked per key **and** model, so a key that is out of quota on
`gemini-4-hydrogen` stays usable on `gemini-3.5-flash`. Daily-quota errors cool a route
for 15 minutes, `retryDelay` / `Retry-After` hints are honoured when present, and every
attempt is bounded by a request timeout that aborts the underlying HTTP call (45s, 90s
for TTS, 8s for the spoken-reply path).

If every route fails, the chat endpoint returns HTTP 503 with the message:

> AURIX is temporarily unable to connect to its AI services. All configured API routes
> are currently unavailable. Please try again shortly.

No offline or templated text is substituted for a cloud answer, so the chat never
pretends an answer was generated. `chatWithAurix` still tries a local Ollama model
first when one is reachable, because that is a real answer.

## Shared quota

Google does not expose remaining Gemini quota through the API, so the dashboard shows
locally counted requests and detected rate limits only. If two or more keys hit quota in
the same short window, the dashboard reports that the keys may share one Google project
quota, in which case switching keys adds no capacity. Identical keys are flagged as
duplicates.

## Duplicate requests

`POST /api/chat` keeps one in-flight reply per `(conversationId, message)`. A double
submit or a retried request joins the request already running instead of asking Gemini
twice for the same answer.

## Dashboard

Settings → **Gemini API Key Failover** shows keys configured, the currently selected key,
the active model (and when a fallback model served the reply), response time, last
successful request, last provider error, per-key status with per-model cooldowns, and a
**Test all keys** button that walks the model ladder with one tiny request per key.

## Endpoints

- `GET /api/ai/keys` — pool status (no secrets)
- `POST /api/ai/keys/test` — probe every configured key across the model ladder
- `POST /api/ai/keys/:slot/reset` — clear a key's cooldowns

## Known quota limits on this project

- `gemini-4-hydrogen`: 20 free requests per day, currently exhausted.
- `gemini-3.1-pro-preview`, `gemini-3.5-transcribe`, `gemini-3.8-flash-tts`: free-tier
  quota exhausted, so cloud transcription and cloud TTS answer with their existing
  device-voice fallbacks.
- Google Search grounding: free-tier quota exhausted, so Internet Research reports the
  provider quota error instead of returning ungrounded results.
