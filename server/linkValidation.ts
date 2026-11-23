/**
 * Link Vault input validation.
 *
 * Every URL that reaches the database goes through `normalizeHttpUrl`, which
 * only accepts http/https and rejects javascript:, data:, file:, vbscript: and
 * every other scheme. Text fields are stripped of control characters and
 * length-capped before they are stored, so a saved link can never carry
 * executable markup into the UI or an audit log.
 */

export const PREDEFINED_LINK_CATEGORIES = [
  "Social Media",
  "Development",
  "AI Tools",
  "Business",
  "Education",
  "Entertainment",
  "Freelancing",
  "Productivity",
  "Technology",
  "Personal",
  "Other",
] as const;

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;
const SAFE_PROTOCOLS = new Set(["http:", "https:"]);

/** Trims, removes control characters and caps length. */
export function sanitizeText(value: unknown, maxLength = 400): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

/** Multi-line variant used for notes (keeps newlines, drops other control chars). */
export function sanitizeMultiline(value: unknown, maxLength = 2000): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL_CHARS, " ")
    .replace(/[ \t]+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export type UrlValidation = { ok: true; url: string } | { ok: false; error: string };

/**
 * Normalizes a user supplied URL. A bare host ("facebook.com") gets https://,
 * an explicit scheme must be http or https, and credentials in the URL are
 * refused so a saved link can never smuggle a login into an address bar.
 */
export function normalizeHttpUrl(raw: unknown): UrlValidation {
  if (typeof raw !== "string" || !raw.trim()) {
    return { ok: false, error: "A website URL is required." };
  }
  const trimmed = raw.trim();
  if (trimmed.length > 2048) {
    return { ok: false, error: "That URL is too long (maximum 2048 characters)." };
  }
  if (/[\s]/.test(trimmed)) {
    return { ok: false, error: "A URL cannot contain spaces." };
  }

  const candidate = SCHEME_PATTERN.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { ok: false, error: "That does not look like a valid URL." };
  }

  if (!SAFE_PROTOCOLS.has(parsed.protocol)) {
    return {
      ok: false,
      error: `Only http and https links can be saved. "${parsed.protocol.replace(":", "")}" links are blocked for safety.`,
    };
  }
  if (!parsed.hostname) {
    return { ok: false, error: "The URL needs a website address (for example example.com)." };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, error: "Links with a username or password inside the URL are not allowed." };
  }

  // Trim the meaningless trailing slash on a bare host so the same site is
  // stored once, however it was typed. Paths deeper than "/" keep their slash.
  const normalized = parsed.toString();
  const url =
    parsed.pathname === "/" && !parsed.search && !parsed.hash ? normalized.replace(/\/$/, "") : normalized;

  return { ok: true, url };
}

/** Cleans a tags array (or comma separated string) into unique short labels. */
export function parseTags(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const item of raw) {
    const tag = sanitizeText(item, 32);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length >= 12) break;
  }
  return tags;
}

export interface LinkDraft {
  name: string;
  url: string;
  category: string;
  description: string;
  tags: string[];
  notes: string;
  isFavourite: boolean;
}

export type LinkValidation = { ok: true; value: LinkDraft } | { ok: false; errors: string[] };

/** Validates a create/update payload. `base` supplies fields a partial update omits. */
export function validateLinkInput(body: unknown, base?: LinkDraft): LinkValidation {
  const source = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const errors: string[] = [];

  const rawName = source.name !== undefined ? source.name : base?.name;
  const name = sanitizeText(rawName, 120);
  if (!name) errors.push("A website name is required.");

  const rawUrl = source.url !== undefined ? source.url : base?.url;
  const urlResult = normalizeHttpUrl(rawUrl);
  if (!urlResult.ok) errors.push(urlResult.error);

  const rawCategory = source.category !== undefined ? source.category : base?.category;
  const category = sanitizeText(rawCategory, 40) || "Other";

  const rawDescription = source.description !== undefined ? source.description : base?.description;
  const description = sanitizeText(rawDescription, 600);

  const rawNotes = source.notes !== undefined ? source.notes : base?.notes;
  const notes = sanitizeMultiline(rawNotes, 2000);

  const tags =
    source.tags !== undefined
      ? parseTags(source.tags)
      : base?.tags ?? [];

  const rawFavourite = source.isFavourite !== undefined ? source.isFavourite : base?.isFavourite;
  const isFavourite = rawFavourite === true || rawFavourite === "true" || rawFavourite === 1;

  if (errors.length || !urlResult.ok) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: { name, url: urlResult.url, category, description, tags, notes, isFavourite },
  };
}
