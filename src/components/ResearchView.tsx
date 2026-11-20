import React, { useState } from "react";
import { ExternalLink, Search } from "lucide-react";
import type { AurixLanguage } from "../types/aurix";

interface ResearchViewProps {
  language: AurixLanguage;
}

export function ResearchView({ language }: ResearchViewProps) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState("");
  const [sources, setSources] = useState<{ title: string; uri: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  const runSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim(), language }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Web research failed.");
      setSummary(data.summary);
      setSources(data.sources || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Research error.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <form
        onSubmit={runSearch}
        className="bg-white dark:bg-[#0D1420] border border-slate-200 dark:border-slate-800/80 rounded-xl p-6 space-y-3"
      >
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Grounded Internet Research
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Powered by live Google Search grounding. Verified citations are extracted separately from synthesis.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 pt-1">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Research documentation, hosting providers, Cloudflare DNS setup, tech benchmarks, or market trends..."
            className="flex-1 bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100"
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-sm font-medium cursor-pointer whitespace-nowrap shrink-0"
          >
            <Search className="w-4 h-4" />
            <span>{loading ? "Researching..." : "Search & Synthesize"}</span>
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-500">
            {error}
          </div>
        )}
      </form>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-8 bg-white dark:bg-[#0D1420] border border-slate-200 dark:border-slate-800/80 rounded-xl p-6">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-3">
            Research Synthesis
          </h3>
          {summary ? (
            <div className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
              {summary}
            </div>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Submit a topic above to run live web search grounding.
            </p>
          )}
        </section>

        <aside className="lg:col-span-4 bg-white dark:bg-[#0D1420] border border-slate-200 dark:border-slate-800/80 rounded-xl p-6">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-3">
            Verified Source Citations
          </h3>
          {sources.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Grounding URLs will appear here after executing a web search.
            </p>
          ) : (
            <ul className="divide-y divide-slate-200 dark:divide-slate-800/80">
              {sources.map((s) => (
                <li key={s.uri} className="py-2.5">
                  <a
                    href={s.uri}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-start gap-2 text-xs text-cyan-600 dark:text-cyan-400 hover:underline"
                  >
                    <ExternalLink className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span className="break-all">{s.title}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
