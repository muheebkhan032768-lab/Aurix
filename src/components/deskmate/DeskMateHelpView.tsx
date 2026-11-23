import React from "react";
import { BookOpen, LifeBuoy, ShieldCheck, Sparkles } from "lucide-react";
import type { AurixSectionId } from "../../types/aurix";
import { BRAND } from "../../brand";

interface DeskMateHelpViewProps {
  onNavigate: (section: AurixSectionId) => void;
}

const TOPICS: Array<{ title: string; copy: string; icon: React.ComponentType<{ className?: string }> }> = [
  {
    title: "Voice commands",
    copy: "Hold Space or the orb and speak. Try “open YouTube”, “open GitHub”, “open Instagram” or “create a project”.",
    icon: Sparkles,
  },
  {
    title: "API failover",
    copy: "Five Gemini keys are tried in order, and each key falls back to a lighter model when its quota is exhausted — see AI Analytics.",
    icon: ShieldCheck,
  },
  {
    title: "Identity & security",
    copy: "Enroll face or voice in Personal Authentication. If an old template stops matching, reset the security system and enroll again.",
    icon: LifeBuoy,
  },
];

export function DeskMateHelpView({ onNavigate }: DeskMateHelpViewProps) {
  return (
    <div className="grid gap-3">
      <section className="aurix-panel rounded-2xl px-4 py-4">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-[var(--d-cyan)]" />
          <h1 className="text-base font-semibold text-[var(--d-text)]">Help &amp; Support</h1>
        </div>
        <p className="mt-1 text-[11.5px] text-[var(--d-muted)]">
          {BRAND.name} {BRAND.version} · powered by {BRAND.vendor}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onNavigate("identity")}
            className="rounded-full border border-[var(--d-border)] px-3 py-1.5 text-[11px] text-[var(--d-muted)] hover:text-[var(--d-text)]"
          >
            Personal Authentication
          </button>
          <button
            type="button"
            onClick={() => onNavigate("security")}
            className="rounded-full border border-[var(--d-border)] px-3 py-1.5 text-[11px] text-[var(--d-muted)] hover:text-[var(--d-text)]"
          >
            Reset security system
          </button>
          <button
            type="button"
            onClick={() => onNavigate("models")}
            className="rounded-full border border-[var(--d-border)] px-3 py-1.5 text-[11px] text-[var(--d-muted)] hover:text-[var(--d-text)]"
          >
            API key status
          </button>
        </div>
      </section>

      <div className="grid gap-2 sm:grid-cols-3">
        {TOPICS.map((topic) => {
          const Icon = topic.icon;
          return (
            <div key={topic.title} className="aurix-panel-2 rounded-xl px-3.5 py-3">
              <Icon className="h-4 w-4 text-[var(--d-cyan)]" />
              <h2 className="mt-2 text-[12px] font-semibold text-[var(--d-text)]">{topic.title}</h2>
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--d-muted)]">{topic.copy}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
