# AURIX Gemini API Key Failover

AURIX routes every Gemini request through a four-key pool (`server/geminiPool.ts`).
All existing chat, voice, vision, research and creative features use it unchanged —
`getClient()` in `server/gemini.ts` now returns the pooled client.

## Keys

| Slot | Environment variable | Role |
| --- | --- | --- |
| 1 | `GEMINI_API_KEY_1` (falls back to `GEMINI_API_KEY`) | Primary |
| 2 | `GEMINI_API_KEY_2` | Secondary |
| 3 | `GEMINI_API_KEY_3` | Third backup |
| 4 | `GEMINI_API_KEY_4` | Final backup |

Set them in Settings → Secrets. They are read on the server only and are never sent to
the browser: `GET /api/ai/keys` returns masked identifiers (`••••••••ab12`) only.

## Behaviour

- Every request starts on the highest-priority healthy key.
- Quota / rate limit (429), revoked or invalid key (401/403) and transient provider
  errors (500/502/503, network, timeout) move the request to the next key automatically.
- A malformed request or unknown model (400/404) is surfaced immediately instead of
  cycling through the pool, because it would fail on every key.
- Transient errors get one limited retry with exponential backoff per key. A quota or
  invalid-key failure moves on at once — AURIX never retries indefinitely.
- Cooling keys are skipped and re-tested automatically when their cooldown expires.
- Conversation history, the original user message and AURIX system instructions are
  built once per request from the database, so a key switch never resets or duplicates
  a conversation.
- If every key fails, `chatWithAurix` still answers from its existing local Ollama /
  Offline Knowledge Engine fallback, and the reason is recorded in the dashboard.

## Shared quota

Google does not expose remaining Gemini quota through the API, so the dashboard shows
locally counted requests and detected rate limits only. If two or more keys hit quota in
the same short window, the dashboard reports that the keys may share one Google project
quota, in which case switching keys adds no capacity. Identical keys are flagged as
duplicates.

## Dashboard

Settings → **Gemini API Key Failover** shows per-key status, masked identifier, request
counts, last success and last provider error, plus a **Test all keys** button that sends
one tiny request per key with the active model.

## Endpoints

- `GET /api/ai/keys` — pool status (no secrets)
- `POST /api/ai/keys/test` — probe every configured key
- `POST /api/ai/keys/:slot/reset` — clear a key's cooldown
