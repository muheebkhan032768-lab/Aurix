/**
 * Natural-language resolution of Link Vault commands.
 *
 * Shared by the AI chat, the voice/text command router and the client voice
 * system, so "open my LinkedIn", "show my AI tools links", "copy my Facebook
 * URL" or "how many links have I saved" resolve against the same saved_links
 * table and always answer from real records — a URL is never invented.
 *
 * The resolver only claims a phrase when it can act on it: a generic "open
 * YouTube" with nothing saved in the vault falls through to the rest of the
 * command pipeline unchanged.
 */
import type { SavedLink } from "../src/types/aurix";

export type LinkCommandResult =
  | { handled: false }
  | { handled: true; kind: "open"; link: SavedLink; reply: string }
  | { handled: true; kind: "copy"; link: SavedLink; reply: string }
  | { handled: true; kind: "found"; link: SavedLink; reply: string }
  | { handled: true; kind: "list"; links: SavedLink[]; title: string; reply: string }
  | { handled: true; kind: "count"; total: number; favourites: number; reply: string }
  | { handled: true; kind: "ambiguous"; candidates: SavedLink[]; reply: string }
  | { handled: true; kind: "not_found"; query: string; reply: string };

export interface LinkActionPayload {
  type: "open_url" | "copy_url" | "navigate";
  label: string;
  url?: string;
  section?: string;
}

const OPEN_VERBS = /\b(?:open|launch|access|start|go to|goto|bring up|take me to|kholo|khol do|khol|kholna|kholiye)\b/;
const LIST_VERBS = /\b(?:show|list|display|what are|tell me|dikhao|dikha|batao|bata|which)\b/;
const FIND_VERBS = /\b(?:find|search|look for|locate|dhoondo|dhundo)\b/;
const COPY_VERB = /\b(?:copy|clipboard)\b/;
const FAVOURITE_WORD = /\b(?:favou?rite|favorites?|pasand|pasandeeda)\b/;
const RECENT_WORD = /\b(?:recent(?:ly)? added|latest|newest|naya|naye)\b/;
const LINKS_WORD = /\b(?:links?|websites?|sites?|bookmarks?|urls?|link vault)\b/;
const EXPLICIT_SAVED = /\b(?:saved|link vault|my links|my saved)\b/;

/** Words that carry no meaning when looking for the site the owner named. */
const NOISE_WORDS =
  /\b(?:please|kindly|for me|sir|madam|open|launch|access|start|go to|goto|bring up|take me to|kholo|khol do|khol|kholna|kholiye|copy|clipboard|find|search|look for|locate|dhoondo|dhundo|show|list|display|tell me|which|all|about|the|my|saved|save|link|links|website|websites|site|sites|url|urls|bookmark|bookmarks|account|page|link vault)\b/g;

const KNOWN_CATEGORIES_FALLBACK = [
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
];

function normalize(raw: string): string {
  return String(raw || "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[.,!?;:"“”()]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripWake(text: string): string {
  return text.replace(/^(?:hello |hey |hi |ok |okay )?(?:dex made|aurix|assistant|dex)\b[,\s]*/i, "").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function detectCategory(text: string, links: SavedLink[]): string | null {
  const categories = new Set<string>(KNOWN_CATEGORIES_FALLBACK);
  for (const link of links) if (link.category) categories.add(link.category);
  const ordered = [...categories].sort((a, b) => b.length - a.length);
  for (const category of ordered) {
    const pattern = normalize(category);
    if (!pattern) continue;
    if (new RegExp(`\\b${escapeRegExp(pattern)}\\b`).test(text)) return category;
  }
  return null;
}

/** Removes verbs, possessives and filler so only the site name is left. */
function extractTarget(text: string): string {
  return text
    .replace(NOISE_WORDS, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreLink(link: SavedLink, query: string): number {
  const name = normalize(link.name);
  const compactName = name.replace(/\s+/g, "");
  const compactQuery = query.replace(/\s+/g, "");
  let score = 0;

  if (name === query) score = Math.max(score, 100);
  if (compactName === compactQuery) score = Math.max(score, 98);
  if (query.length >= 3 && name.startsWith(query)) score = Math.max(score, 90);
  if (query.length >= 3 && name.includes(query)) score = Math.max(score, 82);
  if (name.length >= 3 && query.includes(name)) score = Math.max(score, 80);

  const host = hostnameOf(link.url).replace(/^www\./, "");
  if (host) {
    if (host === query) score = Math.max(score, 88);
    if (host.split(".")[0] === query) score = Math.max(score, 86);
    if (query.length >= 3 && host.includes(query)) score = Math.max(score, 70);
  }

  for (const tag of link.tags) {
    const normalizedTag = normalize(tag);
    if (normalizedTag === query) score = Math.max(score, 74);
    else if (query.length >= 3 && normalizedTag.includes(query)) score = Math.max(score, 60);
  }

  if (normalize(link.category) === query) score = Math.max(score, 52);
  if (query.length >= 4 && normalize(link.description).includes(query)) score = Math.max(score, 40);

  return score;
}

function matchLinks(query: string, links: SavedLink[]): SavedLink[] {
  const clean = normalize(query);
  if (!clean) return [];
  const scored = links
    .map((link) => ({ link, score: scoreLink(link, clean) }))
    .filter((entry) => entry.score > 0);
  if (!scored.length) return [];
  const top = Math.max(...scored.map((entry) => entry.score));
  if (top < 50) return [];
  return scored.filter((entry) => entry.score === top).map((entry) => entry.link);
}

function openResult(link: SavedLink): LinkCommandResult {
  return {
    handled: true,
    kind: "open",
    link,
    reply: `Opening ${link.name} in a new tab — ${link.url}`,
  };
}

function ambiguousResult(candidates: SavedLink[], query: string): LinkCommandResult {
  const names = candidates.slice(0, 4).map((link) => link.name).join(", ");
  const suffix = candidates.length > 4 ? `, and ${candidates.length - 4} more` : "";
  return {
    handled: true,
    kind: "ambiguous",
    candidates,
    reply: `I found ${candidates.length} saved links matching "${query}": ${names}${suffix}. Which one do you mean?`,
  };
}

function listResult(links: SavedLink[], title: string): LinkCommandResult {
  const preview = links
    .slice(0, 6)
    .map((link) => `${link.name} (${link.category})`)
    .join(", ");
  const more = links.length > 6 ? `, and ${links.length - 6} more` : "";
  return {
    handled: true,
    kind: "list",
    links,
    title,
    reply: `${title} — ${links.length} link${links.length === 1 ? "" : "s"}: ${preview}${more}.`,
  };
}

function emptyVaultResult(): LinkCommandResult {
  return {
    handled: true,
    kind: "not_found",
    query: "saved links",
    reply: "You have no saved links yet. Open Link Vault and add your first website — I will open it by voice afterwards.",
  };
}

/** Resolves a spoken or typed phrase against the owner's saved links. */
export function resolveLinkCommand(rawText: string, links: SavedLink[]): LinkCommandResult {
  const original = String(rawText || "").trim();
  if (!original) return { handled: false };

  const text = stripWake(normalize(original));
  if (!text) return { handled: false };

  const openVerb = OPEN_VERBS.test(text);
  const listVerb = LIST_VERBS.test(text);
  const findVerb = FIND_VERBS.test(text);
  const copyVerb = COPY_VERB.test(text);
  const favourite = FAVOURITE_WORD.test(text);
  const recent = RECENT_WORD.test(text);
  const mentionsLinks = LINKS_WORD.test(text);
  const explicitSaved = EXPLICIT_SAVED.test(text);
  const possessive = /\bmy\b/.test(text);

  // 1. "How many links have I saved?"
  if (
    (/\b(?:how many|kitne|count)\b/.test(text) && /\b(?:links?|websites?|sites?|bookmarks?)\b/.test(text)) ||
    /\blink count\b/.test(text)
  ) {
    const favourites = links.filter((link) => link.isFavourite).length;
    return {
      handled: true,
      kind: "count",
      total: links.length,
      favourites,
      reply:
        links.length === 0
          ? "You have no saved links yet. Open Link Vault to add your first website."
          : `You have ${links.length} saved link${links.length === 1 ? "" : "s"} in Link Vault, ${favourites} marked as favourite.`,
    };
  }

  // "Open link vault" / "show link vault" is a dashboard visit, not a search.
  if (/\blink vault\b/.test(text) && (openVerb || listVerb)) {
    if (!links.length) return emptyVaultResult();
    return listResult(links, "All saved links");
  }

  const category = detectCategory(text, links);
  const inCategory = category
    ? links.filter((link) => normalize(link.category) === normalize(category))
    : links;

  // 2. Favourites — "open my favourite website", "show my favourite links"
  if (favourite) {
    const favouriteLinks = links.filter((link) => link.isFavourite);
    const pool = category ? favouriteLinks.filter((link) => normalize(link.category) === normalize(category)) : favouriteLinks;
    const label = category ? `favourite ${category}` : "favourite";

    if (pool.length === 0) {
      if (links.length === 0) return emptyVaultResult();
      return {
        handled: true,
        kind: "not_found",
        query: `${label} links`,
        reply:
          favouriteLinks.length === 0
            ? "You have no favourite links yet. Star a link in Link Vault and I will open it by voice."
            : `None of your ${label} links are marked as favourite. You have ${favouriteLinks.length} favourite link${favouriteLinks.length === 1 ? "" : "s"} in other categories.`,
      };
    }
    if (openVerb) {
      return pool.length === 1 ? openResult(pool[0]) : ambiguousResult(pool, `${label} links`);
    }
    return listResult(pool, `Your ${label} link${pool.length === 1 ? "" : "s"}`);
  }

  // 3. Recently added
  if (recent && (mentionsLinks || explicitSaved)) {
    const pool = [...inCategory].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (!pool.length) {
      return category
        ? { handled: true, kind: "not_found", query: category, reply: `You have no saved links in ${category} yet.` }
        : emptyVaultResult();
    }
    return listResult(pool.slice(0, 10), "Recently added links");
  }

  // 4. Category queries — "show all my AI tools links", "which social media links have I saved?"
  if (category && (listVerb || findVerb || explicitSaved) && !copyVerb) {
    if (!inCategory.length) {
      return { handled: true, kind: "not_found", query: category, reply: `You have no saved links in ${category} yet.` };
    }
    return listResult(inCategory, `${category} links`);
  }

  // 5. Tag queries — "links tagged fiverr"
  const tagMatch = text.match(/\b(?:tagged|with tag|tag)\s+(.+)$/);
  if (tagMatch) {
    const tag = tagMatch[1].trim();
    const pool = links.filter((link) => link.tags.some((item) => normalize(item).includes(tag)));
    if (!pool.length) {
      return { handled: true, kind: "not_found", query: tag, reply: `You have no saved links tagged "${tag}".` };
    }
    return listResult(pool, `Links tagged "${tag}"`);
  }

  // 6. Copy — "copy my Facebook URL"
  if (copyVerb) {
    const target = extractTarget(text);
    const matches = target ? matchLinks(target, links) : [];
    if (matches.length === 1) {
      return { handled: true, kind: "copy", link: matches[0], reply: `Your ${matches[0].name} link is ${matches[0].url}.` };
    }
    if (matches.length > 1) return ambiguousResult(matches, target);
    return {
      handled: true,
      kind: "not_found",
      query: target || "that link",
      reply: `I do not have a saved link matching "${target || "that"}". Nothing was copied.`,
    };
  }

  // 7. Find / search — "find my saved Fiverr link"
  if (findVerb) {
    const target = extractTarget(text);
    if (!target) return { handled: false };
    const matches = matchLinks(target, links);
    if (matches.length === 1) {
      return {
        handled: true,
        kind: "found",
        link: matches[0],
        reply: `Your ${matches[0].name} link is saved under ${matches[0].category}: ${matches[0].url}`,
      };
    }
    if (matches.length > 1) return ambiguousResult(matches, target);
    return {
      handled: true,
      kind: "not_found",
      query: target,
      reply: `I do not have a saved link matching "${target}".`,
    };
  }

  // 8. Open — "open my LinkedIn website"
  if (openVerb) {
    const target = extractTarget(text);
    const matches = target ? matchLinks(target, links) : [];

    if (matches.length === 1) return openResult(matches[0]);
    if (matches.length > 1) return ambiguousResult(matches, target);

    if (category) {
      if (inCategory.length === 1) return openResult(inCategory[0]);
      if (inCategory.length > 1) return ambiguousResult(inCategory, `${category} links`);
    }

    if (!target) {
      if (links.length === 1) return openResult(links[0]);
      if (links.length > 1) return ambiguousResult(links, "your saved links");
      if (explicitSaved) return emptyVaultResult();
      return { handled: false };
    }

    if (explicitSaved || possessive) {
      if (links.length === 0) return emptyVaultResult();
      return {
        handled: true,
        kind: "not_found",
        query: target,
        reply: `I do not have a saved link matching "${target}". You can add it in Link Vault and I will open it afterwards.`,
      };
    }
    return { handled: false };
  }

  // 9. List everything — "show my saved links"
  if ((listVerb || explicitSaved) && (mentionsLinks || explicitSaved)) {
    if (!links.length) return emptyVaultResult();
    return listResult(links, "All saved links");
  }

  return { handled: false };
}

/** Maps a resolved command onto the action payload the UI understands. */
export function linkCommandAction(result: LinkCommandResult): LinkActionPayload | null {
  if (!result.handled) return null;
  if (result.kind === "open") {
    return { type: "open_url", url: result.link.url, label: `Open ${result.link.name}` };
  }
  if (result.kind === "copy") {
    return { type: "copy_url", url: result.link.url, label: `Copy ${result.link.name} URL` };
  }
  if (result.kind === "list") {
    return { type: "navigate", section: "links", label: "Open Link Vault" };
  }
  return null;
}
