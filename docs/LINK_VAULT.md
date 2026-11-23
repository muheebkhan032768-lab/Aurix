# Link Vault & AI Link Control System

Link Vault stores every website you care about in the existing DEX MADE SQLite database, shows it in
a dashboard, and lets you open, copy or search those links by text or voice. Adding a website never
requires a source-code edit.

- Dashboard: **Link Vault** in the sidebar (`src/components/LinkVaultView.tsx`)
- Database: `saved_links` table in `server/db.ts`
- API: `server/linkRoutes.ts`
- Natural-language resolver: `server/linkCommands.ts`
- Validation: `server/linkValidation.ts`
- Owner-session guard: `server/ownerSession.ts`

## Database migration

The table is created with `CREATE TABLE IF NOT EXISTS`, so it is applied automatically on the next
server start and is fully backward compatible — no existing table, row or setting is touched.

```sql
CREATE TABLE IF NOT EXISTS saved_links (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  url          TEXT NOT NULL,
  category     TEXT NOT NULL DEFAULT 'Other',
  description  TEXT NOT NULL DEFAULT '',
  tags_json    TEXT NOT NULL DEFAULT '[]',
  notes        TEXT NOT NULL DEFAULT '',
  is_favourite INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_links_url ON saved_links (url COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_saved_links_created ON saved_links (created_at DESC);
```

- `id` is generated server-side (`lnk_` + random hex), never supplied by the client.
- The unique index prevents accidental duplicate URLs (a second save answers `409`).
- `tags` is stored as JSON text (`tags_json`) and returned as a string array.
- **One-time seed:** on the first run the vault imports the websites already listed in
  `src/utils/websiteRegistry.ts` (the spoken-command registry the app already shipped). Only real,
  previously configured URLs are copied — nothing is invented. A `link_vault_seeded` flag in
  `kv_store` makes sure a vault you deliberately empty stays empty.

## API

All endpoints are owner-gated. While a PIN / face / voice credential is enrolled and the owner
session is locked they answer **423 Locked** without touching data. Requests are parameterized SQL
only.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/links` | List links. Query: `q`, `category`, `tag`, `favourite=true`, `sort=name\|recent\|oldest\|favourite`. Returns `{ links, categories, stats }`. |
| POST | `/api/links` | Create. Body: `name`, `url`, `category`, `description`, `tags`, `notes`, `isFavourite`. `201 { link }`. |
| GET | `/api/links/:id` | Read one link. `404` when missing. |
| PUT | `/api/links/:id` | Update (partial bodies are merged with the stored record). |
| DELETE | `/api/links/:id` | Delete. `{ ok: true }`. |
| POST | `/api/links/:id/favourite` | Body `{ isFavourite: boolean }`. |
| POST | `/api/links/command` | Resolve a natural-language phrase against saved links. Body `{ text }`. Returns `{ handled, kind, reply, action }`. |
| GET | `/api/links/export` | Download every link as JSON (`aurix-link-vault.json`). |
| POST | `/api/links/import` | Preview (`confirm` absent/false) or import (`confirm: true`) a JSON array, a vault export or a Chrome bookmarks file. Duplicates are skipped, never overwritten. |

Validation rules (server-side, `server/linkValidation.ts`):

- `name` required, max 120 chars; `category` max 40; `description` max 600; `notes` max 2000.
- URLs must be `http` or `https`. `javascript:`, `data:`, `file:`, `vbscript:` and every other
  scheme are rejected with `400`. URLs containing a username/password are rejected.
- Control characters are stripped from every text field; tags are de-duplicated and capped.
- Duplicate URL → `409` with the existing record id.

## AI and voice integration

`resolveLinkCommand()` understands phrases such as:

- `Open Facebook.` / `Open my LinkedIn website.` / `open my saved Instagram link`
- `Show my saved links.` / `Show all my AI tools links.` / `Which social media links have I saved?`
- `Show my recently added websites.` / `Open my favourite website.`
- `Find my saved Fiverr link.` / `Copy my Facebook URL.` / `Tell me how many links I have saved.`
- Romanized Urdu/Hindi verbs (`kholo`, `dikhao`, `batao`, `dhoondo`) are understood the same way.

Wiring:

- **AI chat** (`/api/chat`, `/api/chat/stream`): a saved-link phrase is answered deterministically
  from `saved_links` (no model call, no invented URL) and the reply carries an `action`
  (`open_url`, `copy_url` or `navigate: links`) that the chat workspace executes.
- **Voice/text command router** (`/api/command/execute`): saved links are resolved before the
  generic website registry, so the vault is the owner's source of truth.
- **Client voice system** (`src/components/VoiceCommandSystem.tsx`): "open …" phrases ask the vault
  first via `POST /api/links/command`; anything the vault does not recognise keeps using the
  existing registry and AI paths. `open link vault` navigates to the dashboard.
- Similar names produce a question instead of a guess ("I found 2 saved links matching … Which one
  do you mean?"). A name that is not saved is reported as not saved — a URL is never invented.
- Opening a website never needs confirmation; adding, editing and deleting always happen through
  explicit dashboard actions with confirmation dialogs.

## Website opening

- Browser: the dashboard and chat open the stored URL in a new tab using the existing
  `openInNewTab` helper (`window.open` + manual `noopener`), so the saved page cannot reach back into
  DEX MADE. If the browser blocks the tab the reply states the exact saved URL.
- Desktop: when DEX MADE runs on the owner's own PC (`laptopControlStatus().available`), the command
  router opens the URL through the existing laptop-control layer instead and logs the action in
  `desktop_actions`.
- No shell command is ever built from a URL, and DEX MADE never downloads or executes anything a
  link points to. Saved URLs are never fetched server-side, so there is no SSRF surface.

## Adding a link (no code changes)

1. Sidebar → **Link Vault** → **Add Link**.
2. Enter name, URL, category (11 presets + your own custom category), description, tags, notes and
   the favourite toggle.
3. **Save Link**. It is stored in SQLite immediately and is voice-accessible from then on.

Cards support Open, Copy URL, Edit, Details, Favourite and Delete; the toolbar provides search
(name, URL, category, tags, description), category filter, favourites-only, recently-added, and
sorting A→Z / newest / oldest / favourites first. Import/Export live in the header.

## Build, run and test

```bash
npm install          # install dependencies
npm run dev          # Express API + Vite dev server on http://localhost:3000
npm run lint         # tsc --noEmit
npm run build        # vite build + bundled server.js
npm start            # production server
```

Base44 preview (compose):

```bash
docker compose --project-name app --project-directory "$BASE44_PROJECT_ROOT" \
  -f "$BASE44_CONFIG_ROOT/docker-compose.base44.yml" up -d --build
docker compose --project-name app --project-directory "$BASE44_PROJECT_ROOT" \
  -f "$BASE44_CONFIG_ROOT/docker-compose.base44.yml" exec -T web ./node_modules/.bin/tsc --noEmit
```

Server-side files (`server/*.ts`, `server.ts`) need a service restart; frontend files hot-reload.

## Verification performed (2026-11-23)

- `tsc --noEmit` clean.
- 32 API assertions: create/list/search/filter/edit/favourite/delete, duplicate `409`, `javascript:`
  / `data:` / `file:` / credential URLs `400`, missing name `400`, missing id `404`, import preview
  + confirm + duplicate skip, export.
- Owner-session guard: with a PIN present and the session locked, list/create/delete all answer
  `423`; every column of `security_config` and `biometric_session` was restored afterwards.
- AI chat: "Open Facebook." → `link-vault` reply + `open_url`; "Show my saved links." → list +
  navigate; "Tell me how many links I have saved." → count; streaming path returns `copy_url`.
- Voice/text router: "open my facebook" → `open_url`; "how many links have i saved" → count.
- Persistence: a link created through the API was still present after a full service restart.
- Preview UI: dashboard renders 21 seeded links, add → favourite → edit → details → search → delete
  all succeeded, mobile viewport has no horizontal overflow, no console errors. Chat workspace
  answered a link question and "Show my saved links." navigated to Link Vault.

## Known limitations

- Favicons come from Google's public favicon endpoint; offline they fall back to a letter avatar.
- Clipboard writes need browser permission; if blocked, the reply still shows the URL.
- Popup blockers may block a voice-triggered new tab; the reply then names the saved URL.
- Custom categories are free-form strings on each link (no separate categories table), which keeps
  the schema and the migration small.
- Import supports JSON arrays, Link Vault exports and Chrome bookmark files. Other browsers'
  bookmark formats are not parsed.
- Link metadata (titles, previews) is never fetched by the server, by design.
- Voice commands open, copy, find, list and count saved links. Adding, editing and deleting are
  dashboard-only actions with confirmation dialogs — there is deliberately no destructive voice
  path, so nothing can be added or removed by a misheard command.
- The dark theme uses the same Tailwind `dark:` classes as the other dashboards; only the light
  shell was visually captured in this verification pass.
