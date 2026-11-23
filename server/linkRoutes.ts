/**
 * Link Vault REST API.
 *
 * Every endpoint is owner-gated: while an owner credential is enrolled and the
 * session is locked, requests answer 423 instead of touching saved links.
 * All SQL goes through parameterized statements in server/db.ts, and every URL
 * is validated (http/https only) before it is stored.
 */
import type { Express, Request, Response } from "express";
import {
  DuplicateSavedLinkError,
  createSavedLink,
  deleteSavedLink,
  getSavedLink,
  importSavedLinks,
  listSavedLinks,
  savedLinkCategories,
  setSavedLinkFavourite,
  updateSavedLink,
} from "./db";
import { PREDEFINED_LINK_CATEGORIES, parseTags, sanitizeMultiline, sanitizeText, validateLinkInput, type LinkDraft } from "./linkValidation";
import { resolveLinkCommand, linkCommandAction } from "./linkCommands";
import { ownerSessionOpen } from "./ownerSession";

function guard(_req: Request, res: Response, next: () => void): void {
  if (!ownerSessionOpen()) {
    res.status(423).json({ error: "DEX MADE session is locked. Verify the owner before managing saved links." });
    return;
  }
  next();
}

function matchesQuery(link: { name: string; url: string; category: string; description: string; tags: string[] }, query: string): boolean {
  const needle = query.toLowerCase();
  return (
    link.name.toLowerCase().includes(needle) ||
    link.url.toLowerCase().includes(needle) ||
    link.category.toLowerCase().includes(needle) ||
    link.description.toLowerCase().includes(needle) ||
    link.tags.some((tag) => tag.toLowerCase().includes(needle))
  );
}

/** Accepts a plain array, `{links:[...]}` or a Chrome bookmark export. */
function extractImportItems(payload: unknown): unknown[] {
  const root = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const collected: unknown[] = [];

  const walk = (items: unknown[]): void => {
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const node = item as Record<string, unknown>;
      if (Array.isArray(node.children)) walk(node.children);
      if (typeof node.url === "string" || typeof node.href === "string") collected.push(node);
    }
  };

  if (Array.isArray(root.links)) walk(root.links);
  const roots = root.roots && typeof root.roots === "object" ? (root.roots as Record<string, unknown>) : null;
  if (roots) {
    for (const key of Object.keys(roots)) {
      const folder = roots[key];
      if (folder && typeof folder === "object" && Array.isArray((folder as Record<string, unknown>).children)) {
        walk((folder as Record<string, unknown>).children as unknown[]);
      }
    }
  }
  return collected;
}

function draftFromImportItem(item: unknown): LinkDraft | null {
  const node = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
  const rawUrl = typeof node.url === "string" ? node.url : typeof node.href === "string" ? node.href : "";
  const name = sanitizeText(node.name ?? node.title, 120);
  const result = validateLinkInput({
    name,
    url: rawUrl,
    category: sanitizeText(node.category, 40) || "Other",
    description: sanitizeText(node.description, 600),
    tags: parseTags(node.tags),
    notes: sanitizeMultiline(node.notes, 2000),
    isFavourite: node.isFavourite === true,
  });
  return result.ok ? result.value : null;
}

export function registerLinkRoutes(app: Express): void {
  app.get("/api/links/categories", guard, (_req, res) => {
    res.json({ predefined: [...PREDEFINED_LINK_CATEGORIES], custom: savedLinkCategories() });
  });

  app.post("/api/links/command", guard, (req, res) => {
    const text = typeof req.body?.text === "string" ? req.body.text : "";
    if (!text.trim()) {
      res.status(400).json({ error: "Command text is required." });
      return;
    }
    const result = resolveLinkCommand(text, listSavedLinks());
    res.json({ ...result, action: linkCommandAction(result) });
  });

  app.get("/api/links/export", guard, (_req, res) => {
    const links = listSavedLinks();
    res.setHeader("Content-Disposition", 'attachment; filename="aurix-link-vault.json"');
    res.json({
      exportedAt: new Date().toISOString(),
      system: "DEX MADE 2.0 — Link Vault",
      count: links.length,
      links: links.map((link) => ({
        name: link.name,
        url: link.url,
        category: link.category,
        description: link.description,
        tags: link.tags,
        notes: link.notes,
        isFavourite: link.isFavourite,
        createdAt: link.createdAt,
      })),
    });
  });

  app.post("/api/links/import", guard, (req, res) => {
    const items = extractImportItems(req.body);
    if (!items.length) {
      res.status(400).json({ error: "No links found in that file. Use a Link Vault export or a browser bookmarks file." });
      return;
    }

    const existing = new Set(listSavedLinks().map((link) => link.url.toLowerCase()));
    const batch = new Set<string>();
    const valid: LinkDraft[] = [];
    const duplicates: Array<{ name: string; url: string; reason: string }> = [];
    const invalid: Array<{ name: string; url: string; error: string }> = [];

    for (const item of items) {
      const node = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
      const rawUrl = String(node.url ?? node.href ?? "");
      const rawName = sanitizeText(node.name ?? node.title, 120);
      const draft = draftFromImportItem(item);
      if (!draft) {
        const check = validateLinkInput({ name: rawName, url: rawUrl });
        invalid.push({ name: rawName, url: rawUrl, error: check.ok ? "Invalid entry." : check.errors.join(" ") });
        continue;
      }
      const key = draft.url.toLowerCase();
      if (existing.has(key) || batch.has(key)) {
        duplicates.push({
          name: draft.name,
          url: draft.url,
          reason: existing.has(key) ? "Already saved in Link Vault." : "Repeated inside this file.",
        });
        continue;
      }
      batch.add(key);
      valid.push(draft);
    }

    if (req.body?.confirm !== true) {
      res.json({
        preview: true,
        total: items.length,
        valid,
        duplicates,
        invalid,
        summary: `${valid.length} ready to import, ${duplicates.length} already saved, ${invalid.length} invalid.`,
      });
      return;
    }

    const outcome = importSavedLinks(valid);
    // Duplicates found while classifying are skipped too — report them so the
    // owner can see nothing was silently dropped.
    const skipped = outcome.skipped + duplicates.length;
    res.json({
      preview: false,
      imported: outcome.imported,
      skipped,
      invalid: invalid.length,
      links: listSavedLinks(),
      categories: savedLinkCategories(),
      summary: `Imported ${outcome.imported} link(s), skipped ${skipped} already saved, ${invalid.length} invalid.`,
    });
  });

  app.get("/api/links", guard, (req, res) => {
    let links = listSavedLinks();
    const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const category = typeof req.query.category === "string" ? req.query.category.trim() : "";
    const tag = typeof req.query.tag === "string" ? req.query.tag.trim() : "";
    const favourite = req.query.favourite === "true" || req.query.favourite === "1";
    const sort = typeof req.query.sort === "string" ? req.query.sort : "name";

    if (query) links = links.filter((link) => matchesQuery(link, query));
    if (category && category.toLowerCase() !== "all") {
      links = links.filter((link) => link.category.toLowerCase() === category.toLowerCase());
    }
    if (tag) links = links.filter((link) => link.tags.some((item) => item.toLowerCase() === tag.toLowerCase()));
    if (favourite) links = links.filter((link) => link.isFavourite);

    if (sort === "recent") links.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    else if (sort === "oldest") links.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    else if (sort === "favourite") links.sort((a, b) => Number(b.isFavourite) - Number(a.isFavourite));
    else links.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

    const all = listSavedLinks();
    res.json({
      links,
      categories: savedLinkCategories(),
      stats: { total: all.length, favourites: all.filter((link) => link.isFavourite).length, filtered: links.length },
    });
  });

  app.post("/api/links", guard, (req, res) => {
    const validation = validateLinkInput(req.body);
    if (!validation.ok) {
      res.status(400).json({ error: validation.errors.join(" "), errors: validation.errors });
      return;
    }
    try {
      const link = createSavedLink(validation.value);
      res.status(201).json({ link });
    } catch (error) {
      if (error instanceof DuplicateSavedLinkError) {
        res.status(409).json({ error: error.message, existingId: error.existing.id });
        return;
      }
      res.status(500).json({ error: error instanceof Error ? error.message : "The link could not be saved." });
    }
  });

  app.get("/api/links/:id", guard, (req, res) => {
    const link = getSavedLink(req.params.id);
    if (!link) {
      res.status(404).json({ error: "That saved link was not found." });
      return;
    }
    res.json({ link });
  });

  app.put("/api/links/:id", guard, (req, res) => {
    const existing = getSavedLink(req.params.id);
    if (!existing) {
      res.status(404).json({ error: "That saved link was not found." });
      return;
    }
    const validation = validateLinkInput(req.body, {
      name: existing.name,
      url: existing.url,
      category: existing.category,
      description: existing.description,
      tags: existing.tags,
      notes: existing.notes,
      isFavourite: existing.isFavourite,
    });
    if (!validation.ok) {
      res.status(400).json({ error: validation.errors.join(" "), errors: validation.errors });
      return;
    }
    try {
      const link = updateSavedLink(req.params.id, validation.value);
      if (!link) {
        res.status(404).json({ error: "That saved link was not found." });
        return;
      }
      res.json({ link });
    } catch (error) {
      if (error instanceof DuplicateSavedLinkError) {
        res.status(409).json({ error: error.message, existingId: error.existing.id });
        return;
      }
      res.status(500).json({ error: error instanceof Error ? error.message : "The link could not be updated." });
    }
  });

  app.post("/api/links/:id/favourite", guard, (req, res) => {
    const isFavourite = req.body?.isFavourite;
    if (typeof isFavourite !== "boolean") {
      res.status(400).json({ error: "isFavourite must be true or false." });
      return;
    }
    const link = setSavedLinkFavourite(req.params.id, isFavourite);
    if (!link) {
      res.status(404).json({ error: "That saved link was not found." });
      return;
    }
    res.json({ link });
  });

  app.delete("/api/links/:id", guard, (req, res) => {
    const removed = deleteSavedLink(req.params.id);
    if (!removed) {
      res.status(404).json({ error: "That saved link was not found." });
      return;
    }
    res.json({ ok: true });
  });
}
