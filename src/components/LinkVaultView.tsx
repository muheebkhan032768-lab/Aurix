import React, { useEffect, useMemo, useState } from "react";
import {
  Bookmark,
  Check,
  Copy,
  Download,
  ExternalLink,
  Info,
  Link2,
  Loader2,
  Pencil,
  Plus,
  Search,
  Star,
  Tag,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type { SavedLink } from "../types/aurix";
import { openInNewTab } from "../utils/websiteRegistry";

export const LINK_CATEGORIES = [
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

interface LinkVaultViewProps {
  links: SavedLink[];
  onRefreshLinks: () => Promise<void>;
}

interface LinkFormState {
  name: string;
  url: string;
  category: string;
  customCategory: string;
  description: string;
  tags: string;
  notes: string;
  isFavourite: boolean;
}

interface ImportPreview {
  total: number;
  valid: Array<{ name: string; url: string; category: string }>;
  duplicates: Array<{ name: string; url: string; reason: string }>;
  invalid: Array<{ name: string; url: string; error: string }>;
  summary: string;
}

type ModalState =
  | { type: "add" }
  | { type: "edit"; link: SavedLink }
  | { type: "delete"; link: SavedLink }
  | { type: "details"; link: SavedLink }
  | { type: "import" }
  | null;

type Notice = { kind: "success" | "error"; text: string } | null;

const emptyForm = (): LinkFormState => ({
  name: "",
  url: "",
  category: "Other",
  customCategory: "",
  description: "",
  tags: "",
  notes: "",
  isFavourite: false,
});

function formFromLink(link: SavedLink): LinkFormState {
  const known = LINK_CATEGORIES.includes(link.category);
  return {
    name: link.name,
    url: link.url,
    category: known ? link.category : "__custom",
    customCategory: known ? "" : link.category,
    description: link.description,
    tags: link.tags.join(", "),
    notes: link.notes,
    isFavourite: link.isFavourite,
  };
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function LinkFavicon({ url, name }: { url: string; name: string }) {
  const [failed, setFailed] = useState(false);
  const host = hostnameOf(url);
  if (failed || !host) {
    return (
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-slate-100 text-sm font-semibold uppercase text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
        {name.slice(0, 1) || "?"}
      </span>
    );
  }
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <img
        src={`https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(host)}`}
        alt=""
        width={24}
        height={24}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="h-6 w-6"
      />
    </span>
  );
}

async function apiRequest(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(path, init);
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Request failed.");
  return data;
}

export function LinkVaultView({ links, onRefreshLinks }: LinkVaultViewProps) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState<"name" | "recent" | "oldest" | "favourite">("name");
  const [favouritesOnly, setFavouritesOnly] = useState(false);
  const [recentOnly, setRecentOnly] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);
  const [form, setForm] = useState<LinkFormState>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [importText, setImportText] = useState("");
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importBusy, setImportBusy] = useState(false);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const categories = useMemo(() => {
    const set = new Set<string>(LINK_CATEGORIES);
    for (const link of links) if (link.category) set.add(link.category);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [links]);

  const favourites = useMemo(() => links.filter((link) => link.isFavourite), [links]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const weekAgo = Date.now() - 1000 * 60 * 60 * 24 * 7;
    const list = links.filter((link) => {
      if (query) {
        const haystack = `${link.name} ${link.url} ${link.category} ${link.description} ${link.tags.join(" ")}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (category !== "All" && link.category !== category) return false;
      if (favouritesOnly && !link.isFavourite) return false;
      if (recentOnly) {
        const added = new Date(link.createdAt).getTime();
        if (!Number.isFinite(added) || added < weekAgo) return false;
      }
      return true;
    });
    return [...list].sort((a, b) => {
      if (sort === "recent") return b.createdAt.localeCompare(a.createdAt);
      if (sort === "oldest") return a.createdAt.localeCompare(b.createdAt);
      if (sort === "favourite") {
        return Number(b.isFavourite) - Number(a.isFavourite) || a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      }
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
  }, [links, search, category, favouritesOnly, recentOnly, sort]);

  const openLink = (link: SavedLink) => {
    if (!openInNewTab(link.url)) {
      setNotice({ kind: "error", text: `Your browser blocked the new tab. The saved URL is ${link.url}` });
    }
  };

  const copyLink = async (link: SavedLink) => {
    try {
      await navigator.clipboard.writeText(link.url);
      setNotice({ kind: "success", text: `${link.name} URL copied to your clipboard.` });
    } catch {
      setNotice({ kind: "error", text: `Copy failed. The saved URL is ${link.url}` });
    }
  };

  const toggleFavourite = async (link: SavedLink) => {
    try {
      await apiRequest(`/api/links/${link.id}/favourite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFavourite: !link.isFavourite }),
      });
      await onRefreshLinks();
      setNotice({ kind: "success", text: link.isFavourite ? `${link.name} removed from favourites.` : `${link.name} marked as favourite.` });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not update the favourite." });
    }
  };

  const startAdd = () => {
    setForm(emptyForm());
    setFormError(null);
    setModal({ type: "add" });
  };

  const startEdit = (link: SavedLink) => {
    setForm(formFromLink(link));
    setFormError(null);
    setModal({ type: "edit", link });
  };

  const saveLink = async () => {
    const chosenCategory = form.category === "__custom" ? form.customCategory.trim() : form.category;
    if (!form.name.trim()) {
      setFormError("A website name is required.");
      return;
    }
    if (!form.url.trim()) {
      setFormError("A website URL is required.");
      return;
    }
    if (!chosenCategory) {
      setFormError("Choose a category or type a custom one.");
      return;
    }
    const payload = {
      name: form.name,
      url: form.url,
      category: chosenCategory,
      description: form.description,
      tags: form.tags,
      notes: form.notes,
      isFavourite: form.isFavourite,
    };
    setBusy(true);
    setFormError(null);
    try {
      if (modal?.type === "edit") {
        await apiRequest(`/api/links/${modal.link.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        setNotice({ kind: "success", text: "Link updated." });
      } else {
        await apiRequest("/api/links", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        setNotice({ kind: "success", text: "Link saved to your vault." });
      }
      await onRefreshLinks();
      setModal(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "The link could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async (link: SavedLink) => {
    setBusy(true);
    try {
      await apiRequest(`/api/links/${link.id}`, { method: "DELETE" });
      await onRefreshLinks();
      setModal(null);
      setNotice({ kind: "success", text: `${link.name} deleted.` });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "The link could not be deleted." });
    } finally {
      setBusy(false);
    }
  };

  const runImport = async (confirm: boolean) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(importText);
    } catch {
      setNotice({ kind: "error", text: "That file is not valid JSON." });
      return;
    }
    const body = Array.isArray(parsed) ? { links: parsed } : (parsed as Record<string, unknown>);
    setImportBusy(true);
    try {
      const data = await apiRequest("/api/links/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, confirm }),
      });
      if (confirm) {
        await onRefreshLinks();
        setModal(null);
        setImportText("");
        setImportPreview(null);
        setNotice({ kind: "success", text: String(data.summary || "Links imported.") });
      } else {
        setImportPreview({
          total: Number(data.total || 0),
          valid: (data.valid as ImportPreview["valid"]) || [],
          duplicates: (data.duplicates as ImportPreview["duplicates"]) || [],
          invalid: (data.invalid as ImportPreview["invalid"]) || [],
          summary: String(data.summary || ""),
        });
      }
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Import failed." });
    } finally {
      setImportBusy(false);
    }
  };

  const exportLinks = async () => {
    try {
      const res = await fetch("/api/links/export");
      if (!res.ok) throw new Error("Export failed.");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "aurix-link-vault.json";
      anchor.click();
      URL.revokeObjectURL(url);
      setNotice({ kind: "success", text: "Link Vault exported as JSON." });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Export failed." });
    }
  };

  const readImportFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      setImportText(await file.text());
      setImportPreview(null);
    } catch {
      setNotice({ kind: "error", text: "That file could not be read." });
    }
  };

  const renderCard = (link: SavedLink) => (
    <article
      key={link.id}
      className="flex h-full flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-cyan-400/70 dark:border-slate-800/80 dark:bg-[#0D1420] dark:hover:border-cyan-500/50"
    >
      <div className="flex items-start gap-3">
        <LinkFavicon url={link.url} name={link.name} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{link.name}</h3>
          <p className="truncate text-[11px] font-mono text-slate-700 dark:text-slate-300">{hostnameOf(link.url)}</p>
        </div>
        <button
          type="button"
          onClick={() => void toggleFavourite(link)}
          aria-label={link.isFavourite ? `Remove ${link.name} from favourites` : `Mark ${link.name} as favourite`}
          aria-pressed={link.isFavourite}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-amber-500 dark:hover:bg-slate-800 cursor-pointer"
        >
          <Star className={`h-4 w-4 ${link.isFavourite ? "fill-amber-400 text-amber-500" : ""}`} />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[10.5px] font-medium text-cyan-700 dark:text-cyan-300">
          {link.category}
        </span>
        <span className="text-[10.5px] text-slate-600 dark:text-slate-400">Added {formatDate(link.createdAt)}</span>
      </div>

      {link.description && (
        <p className="line-clamp-2 text-xs leading-relaxed text-slate-800 dark:text-slate-200">{link.description}</p>
      )}

      {link.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {link.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300"
            >
              <Tag className="h-2.5 w-2.5" />
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="mt-auto flex items-center gap-1 border-t border-slate-100 pt-2.5 dark:border-slate-800/70">
        <button
          type="button"
          onClick={() => openLink(link)}
          className="inline-flex items-center gap-1 rounded-lg bg-cyan-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-cyan-500 cursor-pointer"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open
        </button>
        <button
          type="button"
          onClick={() => void copyLink(link)}
          aria-label={`Copy ${link.name} URL`}
          title="Copy URL"
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-cyan-600 dark:text-slate-400 dark:hover:bg-slate-800 cursor-pointer"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => startEdit(link)}
          aria-label={`Edit ${link.name}`}
          title="Edit"
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-cyan-600 dark:text-slate-400 dark:hover:bg-slate-800 cursor-pointer"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setModal({ type: "details", link })}
          aria-label={`View details for ${link.name}`}
          title="View details"
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-cyan-600 dark:text-slate-400 dark:hover:bg-slate-800 cursor-pointer"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setModal({ type: "delete", link })}
          aria-label={`Delete ${link.name}`}
          title="Delete"
          className="ml-auto rounded-lg p-1.5 text-slate-500 hover:bg-rose-500/10 hover:text-rose-500 dark:text-slate-400 cursor-pointer"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </article>
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800/80 dark:bg-[#0D1420]">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl border border-cyan-500/35 bg-cyan-500/10">
            <Bookmark className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
          </span>
          <div>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Link Vault</h1>
            <p className="text-xs text-slate-700 dark:text-slate-300">
              Every website you save here is permanent, searchable and openable by text or voice.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setImportText("");
              setImportPreview(null);
              setModal({ type: "import" });
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:border-cyan-400 hover:text-cyan-600 dark:border-slate-700 dark:text-slate-300 dark:hover:text-cyan-300 cursor-pointer"
          >
            <Upload className="h-3.5 w-3.5" />
            Import
          </button>
          <button
            type="button"
            onClick={() => void exportLinks()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:border-cyan-400 hover:text-cyan-600 dark:border-slate-700 dark:text-slate-300 dark:hover:text-cyan-300 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </button>
          <button
            type="button"
            onClick={startAdd}
            className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-cyan-500 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Add Link
          </button>
        </div>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Saved links", value: links.length },
          { label: "Favourites", value: favourites.length },
          { label: "Categories", value: new Set(links.map((link) => link.category)).size },
          { label: "Showing", value: filtered.length },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800/80 dark:bg-[#0D1420]"
          >
            <div className="text-[10.5px] font-mono uppercase tracking-[0.14em] text-slate-600 dark:text-slate-400">{stat.label}</div>
            <div className="mt-1 text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Search & filters */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800/80 dark:bg-[#0D1420] lg:flex-row lg:items-center">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, URL, category, tag or description…"
            aria-label="Search saved links"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-cyan-500 focus:outline-none dark:border-slate-700 dark:bg-[#070B12] dark:text-slate-100"
          />
        </label>

        <select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          aria-label="Filter by category"
          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-[#070B12] dark:text-slate-200"
        >
          <option value="All">All categories</option>
          {categories.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>

        <select
          value={sort}
          onChange={(event) => setSort(event.target.value as typeof sort)}
          aria-label="Sort links"
          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-[#070B12] dark:text-slate-200"
        >
          <option value="name">Sort: A → Z</option>
          <option value="recent">Sort: newest first</option>
          <option value="oldest">Sort: oldest first</option>
          <option value="favourite">Sort: favourites first</option>
        </select>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFavouritesOnly((value) => !value)}
            aria-pressed={favouritesOnly}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium cursor-pointer ${
              favouritesOnly
                ? "border-amber-400 bg-amber-500/10 text-amber-600 dark:text-amber-300"
                : "border-slate-200 text-slate-600 hover:border-amber-300 dark:border-slate-700 dark:text-slate-300"
            }`}
          >
            <Star className={`h-3.5 w-3.5 ${favouritesOnly ? "fill-amber-400" : ""}`} />
            Favourites
          </button>
          <button
            type="button"
            onClick={() => setRecentOnly((value) => !value)}
            aria-pressed={recentOnly}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium cursor-pointer ${
              recentOnly
                ? "border-cyan-400 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300"
                : "border-slate-200 text-slate-600 hover:border-cyan-300 dark:border-slate-700 dark:text-slate-300"
            }`}
          >
            Recently added
          </button>
        </div>
      </div>

      {/* Favourites section */}
      {!favouritesOnly && favourites.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-700 dark:text-slate-300">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" />
            Favourites
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{favourites.map(renderCard)}</div>
        </section>
      )}

      {/* All links */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-700 dark:text-slate-300">
          <Link2 className="h-3.5 w-3.5" />
          {favouritesOnly ? "Favourite links" : "All saved links"}
        </h2>

        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white/60 p-10 text-center dark:border-slate-700 dark:bg-[#0D1420]/60">
            <Bookmark className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
            <h3 className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
              {links.length === 0 ? "Your vault is empty" : "No links match those filters"}
            </h3>
            <p className="mx-auto mt-1 max-w-sm text-xs text-slate-700 dark:text-slate-300">
              {links.length === 0
                ? "Add your first website once — DEX MADE will open it for you by text or voice from then on."
                : "Try a different search term, category or clear the filters."}
            </p>
            {links.length === 0 ? (
              <button
                type="button"
                onClick={startAdd}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-cyan-500 cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                Add your first link
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setCategory("All");
                  setFavouritesOnly(false);
                  setRecentOnly(false);
                }}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-medium text-slate-600 hover:border-cyan-400 dark:border-slate-700 dark:text-slate-300 cursor-pointer"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{filtered.map(renderCard)}</div>
        )}
      </section>

      {/* Add / edit modal */}
      {(modal?.type === "add" || modal?.type === "edit") && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="link-form-title">
          <div className="my-8 w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-[#0D1420]">
            <div className="flex items-center justify-between">
              <h2 id="link-form-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {modal.type === "edit" ? "Edit Link" : "Add Link"}
              </h2>
              <button
                type="button"
                onClick={() => setModal(null)}
                aria-label="Close"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <label className="block text-xs text-slate-700 dark:text-slate-300">
                <span>Website Name *</span>
                <input
                  type="text"
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="Facebook"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-cyan-500 focus:outline-none dark:border-slate-700 dark:bg-[#070B12] dark:text-slate-100"
                />
              </label>

              <label className="block text-xs text-slate-700 dark:text-slate-300">
                <span>Website URL *</span>
                <input
                  type="text"
                  inputMode="url"
                  value={form.url}
                  onChange={(event) => setForm({ ...form, url: event.target.value })}
                  placeholder="https://www.facebook.com/"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900 focus:border-cyan-500 focus:outline-none dark:border-slate-700 dark:bg-[#070B12] dark:text-slate-100"
                />
                <span className="mt-1 block text-[10.5px] text-slate-600 dark:text-slate-400">
                  http and https only. Other schemes are rejected for safety.
                </span>
              </label>

              <label className="block text-xs text-slate-700 dark:text-slate-300">
                <span>Category</span>
                <select
                  value={form.category}
                  onChange={(event) => setForm({ ...form, category: event.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-[#070B12] dark:text-slate-100"
                >
                  {LINK_CATEGORIES.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                  {categories
                    .filter((item) => !LINK_CATEGORIES.includes(item))
                    .map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  <option value="__custom">Custom category…</option>
                </select>
              </label>

              {form.category === "__custom" && (
                <label className="block text-xs text-slate-700 dark:text-slate-300">
                  <span>Custom Category Name</span>
                  <input
                    type="text"
                    value={form.customCategory}
                    onChange={(event) => setForm({ ...form, customCategory: event.target.value })}
                    placeholder="Research"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-[#070B12] dark:text-slate-100"
                  />
                </label>
              )}

              <label className="block text-xs text-slate-700 dark:text-slate-300">
                <span>Description</span>
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                  placeholder="My Facebook account."
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-[#070B12] dark:text-slate-100"
                />
              </label>

              <label className="block text-xs text-slate-700 dark:text-slate-300">
                <span>Custom Tags (comma separated)</span>
                <input
                  type="text"
                  value={form.tags}
                  onChange={(event) => setForm({ ...form, tags: event.target.value })}
                  placeholder="social, personal"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-[#070B12] dark:text-slate-100"
                />
              </label>

              <label className="block text-xs text-slate-700 dark:text-slate-300">
                <span>Notes</span>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(event) => setForm({ ...form, notes: event.target.value })}
                  placeholder="Optional notes only you can see."
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-[#070B12] dark:text-slate-100"
                />
              </label>

              <button
                type="button"
                onClick={() => setForm({ ...form, isFavourite: !form.isFavourite })}
                aria-pressed={form.isFavourite}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium cursor-pointer ${
                  form.isFavourite
                    ? "border-amber-400 bg-amber-500/10 text-amber-600 dark:text-amber-300"
                    : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300"
                }`}
              >
                <Star className={`h-3.5 w-3.5 ${form.isFavourite ? "fill-amber-400" : ""}`} />
                {form.isFavourite ? "Marked as favourite" : "Mark as favourite"}
              </button>

              {formError && (
                <p className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-300">
                  {formError}
                </p>
              )}
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveLink()}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-4 py-2 text-xs font-semibold text-white hover:bg-cyan-500 disabled:opacity-60 cursor-pointer"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                {busy ? "Saving…" : modal.type === "edit" ? "Save Changes" : "Save Link"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Details modal */}
      {modal?.type === "details" && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="link-details-title">
          <div className="my-8 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-[#0D1420]">
            <div className="flex items-start gap-3">
              <LinkFavicon url={modal.link.url} name={modal.link.name} />
              <div className="min-w-0 flex-1">
                <h2 id="link-details-title" className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">
                  {modal.link.name}
                </h2>
                <a
                  href={modal.link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate font-mono text-[11px] text-cyan-600 hover:underline dark:text-cyan-400"
                >
                  {modal.link.url}
                </a>
              </div>
              <button
                type="button"
                onClick={() => setModal(null)}
                aria-label="Close"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <dl className="mt-4 space-y-2.5 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-600 dark:text-slate-400">Category</dt>
                <dd className="text-right text-slate-700 dark:text-slate-200">{modal.link.category}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-600 dark:text-slate-400">Favourite</dt>
                <dd className="text-right text-slate-700 dark:text-slate-200">{modal.link.isFavourite ? "Yes" : "No"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-600 dark:text-slate-400">Added</dt>
                <dd className="text-right text-slate-700 dark:text-slate-200">{formatDate(modal.link.createdAt)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-600 dark:text-slate-400">Updated</dt>
                <dd className="text-right text-slate-700 dark:text-slate-200">{formatDate(modal.link.updatedAt)}</dd>
              </div>
              {modal.link.tags.length > 0 && (
                <div>
                  <dt className="text-slate-600 dark:text-slate-400">Tags</dt>
                  <dd className="mt-1 flex flex-wrap gap-1">
                    {modal.link.tags.map((tag) => (
                      <span key={tag} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {tag}
                      </span>
                    ))}
                  </dd>
                </div>
              )}
              {modal.link.description && (
                <div>
                  <dt className="text-slate-600 dark:text-slate-400">Description</dt>
                  <dd className="mt-1 text-slate-700 dark:text-slate-200">{modal.link.description}</dd>
                </div>
              )}
              {modal.link.notes && (
                <div>
                  <dt className="text-slate-600 dark:text-slate-400">Notes</dt>
                  <dd className="mt-1 whitespace-pre-wrap text-slate-700 dark:text-slate-200">{modal.link.notes}</dd>
                </div>
              )}
            </dl>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => void copyLink(modal.link)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-medium text-slate-600 hover:border-cyan-400 dark:border-slate-700 dark:text-slate-300 cursor-pointer"
              >
                <Copy className="h-3.5 w-3.5" />
                Copy URL
              </button>
              <button
                type="button"
                onClick={() => openLink(modal.link)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-cyan-500 cursor-pointer"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {modal?.type === "delete" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="link-delete-title">
          <div className="w-full max-w-sm rounded-2xl border border-rose-400/40 bg-white p-5 shadow-2xl dark:border-rose-500/40 dark:bg-[#0D1420]">
            <h2 id="link-delete-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Delete “{modal.link.name}”?
            </h2>
            <p className="mt-1 text-xs text-slate-700 dark:text-slate-300">
              This removes the saved link permanently. Your browser history and the website itself are not affected.
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmDelete(modal.link)}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-60 cursor-pointer"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                {busy ? "Deleting…" : "Delete Link"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import modal */}
      {modal?.type === "import" && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="link-import-title">
          <div className="my-8 w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-[#0D1420]">
            <div className="flex items-center justify-between">
              <h2 id="link-import-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Import Links
              </h2>
              <button
                type="button"
                onClick={() => setModal(null)}
                aria-label="Close"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-1 text-xs text-slate-700 dark:text-slate-300">
              Paste a Link Vault export, a JSON array of links, or a Chrome bookmarks file. Nothing is saved until you
              confirm the preview.
            </p>

            <input
              type="file"
              accept="application/json,.json"
              onChange={(event) => void readImportFile(event.target.files?.[0])}
              className="mt-3 w-full rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-cyan-600 file:px-2.5 file:py-1.5 file:text-xs file:font-semibold file:text-white dark:border-slate-700 dark:text-slate-300 cursor-pointer"
            />

            <textarea
              rows={6}
              value={importText}
              onChange={(event) => {
                setImportText(event.target.value);
                setImportPreview(null);
              }}
              placeholder='{"links":[{"name":"Facebook","url":"https://www.facebook.com"}]}'
              className="mt-3 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[11px] text-slate-900 dark:border-slate-700 dark:bg-[#070B12] dark:text-slate-100"
            />

            {importPreview && (
              <div className="mt-3 space-y-2 rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-700">
                <p className="font-medium text-slate-700 dark:text-slate-200">{importPreview.summary}</p>
                {importPreview.valid.length > 0 && (
                  <p className="text-emerald-600 dark:text-emerald-400">
                    Ready: {importPreview.valid.map((item) => item.name || item.url).slice(0, 6).join(", ")}
                    {importPreview.valid.length > 6 ? "…" : ""}
                  </p>
                )}
                {importPreview.duplicates.length > 0 && (
                  <p className="text-amber-600 dark:text-amber-400">
                    Already saved: {importPreview.duplicates.map((item) => item.name || item.url).slice(0, 6).join(", ")}
                  </p>
                )}
                {importPreview.invalid.length > 0 && (
                  <p className="text-rose-600 dark:text-rose-400">
                    Invalid: {importPreview.invalid.slice(0, 4).map((item) => `${item.name || item.url} (${item.error})`).join("; ")}
                  </p>
                )}
              </div>
            )}

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void runImport(false)}
                disabled={importBusy || !importText.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-medium text-slate-600 hover:border-cyan-400 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 cursor-pointer"
              >
                {importBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Preview
              </button>
              <button
                type="button"
                onClick={() => void runImport(true)}
                disabled={importBusy || !importPreview || importPreview.valid.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-4 py-2 text-xs font-semibold text-white hover:bg-cyan-500 disabled:opacity-60 cursor-pointer"
              >
                <Upload className="h-3.5 w-3.5" />
                Import {importPreview?.valid.length ? importPreview.valid.length : ""} links
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {notice && (
        <div
          role="status"
          className={`fixed bottom-5 right-5 z-[60] max-w-sm rounded-xl border px-4 py-3 text-xs shadow-xl ${
            notice.kind === "success"
              ? "border-emerald-400/50 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
              : "border-rose-400/50 bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
          }`}
        >
          {notice.text}
        </div>
      )}
    </div>
  );
}
