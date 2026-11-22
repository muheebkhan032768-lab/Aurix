import React, { useMemo, useState } from "react";
import { BookOpen, Building2, Database, FolderKanban, Globe2, Search, ShieldCheck } from "lucide-react";
import type { BootstrapPayload } from "../../types/aurix";
import { SectionHeader, StatCard, timeAgo } from "../ui";

interface KnowledgeCenterProps {
  data: BootstrapPayload;
  onNavigate: (id: string) => void;
}

export function KnowledgeCenter({ data, onNavigate }: KnowledgeCenterProps) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const websites = useMemo(
    () => data.websites.filter((w) => !q || `${w.name} ${w.purpose} ${w.stack.join(" ")} ${w.activeDomain}`.toLowerCase().includes(q)),
    [data.websites, q]
  );
  const projects = useMemo(
    () => data.projects.filter((p) => !q || `${p.name} ${p.description} ${p.stack.join(" ")}`.toLowerCase().includes(q)),
    [data.projects, q]
  );
  const memories = useMemo(
    () => data.memories.filter((m) => m.approved && (!q || `${m.title} ${m.content} ${m.category}`.toLowerCase().includes(q))),
    [data.memories, q]
  );

  return (
    <div className="space-y-4">
      <SectionHeader
        eyebrow="Knowledge Center"
        title="The context AURIX actually knows."
        description="Company knowledge, the isolated website registry, project records and approved memories. Everything here is injected into the AI system prompt — nothing is invented at answer time."
        actions={
          <>
            <button type="button" className="ws-btn" onClick={() => onNavigate("legacy-company")}>
              <Building2 className="h-3.5 w-3.5" /> Edit company
            </button>
            <button type="button" className="ws-btn" onClick={() => onNavigate("legacy-websites")}>
              <Globe2 className="h-3.5 w-3.5" /> Website registry
            </button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Websites" value={data.websites.length} hint="Isolated records" icon={<Globe2 className="h-4 w-4" />} />
        <StatCard label="Projects" value={data.projects.length} hint={`${data.projects.filter((p) => p.status === "active").length} active`} icon={<FolderKanban className="h-4 w-4" />} tone="cyan" />
        <StatCard label="Approved memories" value={data.memories.filter((m) => m.approved).length} hint="Included in AI context" icon={<BookOpen className="h-4 w-4" />} />
        <StatCard label="Documents" value={data.notes.length} hint="Notes + workspace docs" icon={<Database className="h-4 w-4" />} tone="cyan" />
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ws-muted)]" />
        <input className="ws-input !pl-9" placeholder="Search company, websites, projects and memories" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <div className="ws-card p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold text-[var(--ws-text)]">
              <Building2 className="h-3.5 w-3.5 text-[var(--ws-accent)]" /> {data.company.name}
            </h3>
            <span className="ws-chip">Founder: {data.company.founder}</span>
          </div>
          <p className="text-[11px] leading-relaxed text-[var(--ws-muted)]">{data.company.vision}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {data.company.services.map((s) => (
              <span key={s} className="ws-chip">{s}</span>
            ))}
          </div>
          <div className="mt-3 grid gap-2 text-[10.5px] sm:grid-cols-2">
            <div className="ws-inset p-2.5">
              <div className="text-[9px] uppercase tracking-[0.12em] text-[var(--ws-muted)]">Strategy</div>
              <p className="mt-0.5 leading-relaxed text-[var(--ws-text)]">{data.company.strategy || "Not recorded"}</p>
            </div>
            <div className="ws-inset p-2.5">
              <div className="text-[9px] uppercase tracking-[0.12em] text-[var(--ws-muted)]">Future products</div>
              <p className="mt-0.5 leading-relaxed text-[var(--ws-text)]">{data.company.futureProducts.join(", ") || "Not recorded"}</p>
            </div>
          </div>
        </div>

        <div className="ws-card p-4">
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[var(--ws-text)]">
            <ShieldCheck className="h-3.5 w-3.5 text-[var(--ws-accent)]" /> Isolation rule
          </h3>
          <p className="text-[11px] leading-relaxed text-[var(--ws-muted)]">
            Each website record stays isolated. AURIX is instructed never to merge AM NEXORA, AM DIGITAL HUB, TEAM CONNECT
            or the main AM VEYRONIX site, and never to invent clients, revenue or testimonials.
          </p>
          <button type="button" className="ws-btn mt-3 w-full !text-[10.5px]" onClick={() => onNavigate("memory")}>
            Review approved memories
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {websites.map((w) => (
          <div key={w.id} className="ws-card p-3.5">
            <div className="flex items-center justify-between gap-2">
              <h4 className="truncate text-[11.5px] font-semibold text-[var(--ws-text)]">{w.name}</h4>
              <span className="ws-chip !text-[var(--ws-accent)]">{w.status}</span>
            </div>
            <p className="mt-1 line-clamp-2 text-[10px] text-[var(--ws-muted)]">{w.purpose}</p>
            <div className="mt-2 space-y-1 text-[9.5px] text-[var(--ws-muted)]">
              <div className="truncate">Domain: <span className="font-mono text-[var(--ws-text)]">{w.activeDomain || "not set"}</span></div>
              <div className="truncate">Stack: {w.stack.join(", ") || "not recorded"}</div>
              <div>Updated {timeAgo(w.updatedAt)}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="ws-card p-4">
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[var(--ws-text)]">
            <FolderKanban className="h-3.5 w-3.5 text-[var(--ws-accent)]" /> Projects in context
          </h3>
          <div className="space-y-2">
            {projects.slice(0, 6).map((p) => (
              <div key={p.id} className="ws-inset px-2.5 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[10.5px] font-medium text-[var(--ws-text)]">{p.name}</span>
                  <span className="font-mono text-[9px] text-[var(--ws-muted)]">{p.progress}%</span>
                </div>
                <div className="truncate text-[9.5px] text-[var(--ws-muted)]">{p.category} · {p.stack.join(", ") || "stack not recorded"}</div>
              </div>
            ))}
            {projects.length === 0 && <p className="text-[10.5px] text-[var(--ws-muted)]">No project matches that search.</p>}
          </div>
        </div>

        <div className="ws-card p-4">
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[var(--ws-text)]">
            <BookOpen className="h-3.5 w-3.5 text-[var(--ws-accent)]" /> Approved memory
          </h3>
          <div className="space-y-2">
            {memories.slice(0, 6).map((m) => (
              <div key={m.id} className="ws-inset px-2.5 py-2">
                <div className="flex items-center gap-1.5">
                  <span className="ws-chip !py-0.5">{m.category}</span>
                  <span className="truncate text-[10.5px] font-medium text-[var(--ws-text)]">{m.title}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-[9.5px] leading-relaxed text-[var(--ws-muted)]">{m.content}</p>
              </div>
            ))}
            {memories.length === 0 && <p className="text-[10.5px] text-[var(--ws-muted)]">No memory matches that search.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
