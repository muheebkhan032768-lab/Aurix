import React from "react";
import { BookOpen, Command, Database, KeyRound, Monitor, ShieldCheck, Sparkles, TriangleAlert } from "lucide-react";
import { SectionHeader } from "../ui";

interface HelpViewProps {
  onNavigate: (id: string) => void;
}

const SHORTCUTS = [
  { keys: "Space (hold)", action: "Push-to-talk. Release to finalize and send. Ignored while typing in any input, textarea or editable field." },
  { keys: "Enter", action: "Send the chat message." },
  { keys: "Shift + Enter", action: "Insert a new line in the composer." },
  { keys: "Escape", action: "Close the voice overlay, stop listening, or interrupt speech." },
  { keys: "Ctrl + Space", action: "Continuous listening (existing voice command deck)." },
  { keys: "Ctrl + Shift + Space", action: "Open the voice command panel and start listening." },
];

export function HelpView({ onNavigate }: HelpViewProps) {
  return (
    <div className="space-y-4">
      <SectionHeader
        eyebrow="Help & Support"
        title="How AURIX actually works."
        description="Capabilities, shortcuts, required configuration and the honest limitations of this build."
        actions={
          <>
            <button type="button" className="ws-btn" onClick={() => onNavigate("integrations")}>
              <Sparkles className="h-3.5 w-3.5" /> Integrations
            </button>
            <button type="button" className="ws-btn" onClick={() => onNavigate("settings")}>
              Settings
            </button>
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="ws-card p-4">
          <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-[var(--ws-text)]">
            <Command className="h-3.5 w-3.5 text-[var(--ws-accent)]" /> Keyboard & voice shortcuts
          </h3>
          <div className="space-y-2">
            {SHORTCUTS.map((s) => (
              <div key={s.keys} className="flex items-start gap-3 border-b border-[var(--ws-border)] pb-2 last:border-0 last:pb-0">
                <kbd className="shrink-0 rounded-md border border-[var(--ws-border-strong)] bg-[var(--ws-surface-2)] px-2 py-1 font-mono text-[9.5px] text-[var(--ws-text)]">{s.keys}</kbd>
                <p className="text-[10.5px] leading-relaxed text-[var(--ws-muted)]">{s.action}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="ws-card p-4">
          <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-[var(--ws-text)]">
            <KeyRound className="h-3.5 w-3.5 text-[var(--ws-accent)]" /> Required configuration
          </h3>
          <div className="space-y-2 text-[10.5px] leading-relaxed text-[var(--ws-muted)]">
            <p><span className="font-semibold text-[var(--ws-text)]">GEMINI_API_KEY</span> — server-side secret required for cloud chat, image understanding, speech transcription and the Gemini male voice. Set it in the platform's Secrets panel or the server environment; never in the browser.</p>
            <p><span className="font-semibold text-[var(--ws-text)]">Ollama (optional)</span> — free local models at <code>http://127.0.0.1:11434</code>. Install on the host and pull a model such as <code>qwen2.5:1.5b</code>. The browser cannot install models.</p>
            <p><span className="font-semibold text-[var(--ws-text)]">Microphone permission</span> — requested only when you start listening. Denying it leaves text chat fully usable.</p>
            <p><span className="font-semibold text-[var(--ws-text)]">No other paid services</span> — quick links open official websites; they do not require API keys.</p>
          </div>
        </div>

        <div className="ws-card p-4">
          <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-[var(--ws-text)]">
            <Monitor className="h-3.5 w-3.5 text-[var(--ws-accent)]" /> How to run
          </h3>
          <div className="space-y-2 text-[10.5px] leading-relaxed text-[var(--ws-muted)]">
            <p>Development: <code>npm install</code> then <code>npm run dev</code>, and open <code>http://localhost:3000</code>.</p>
            <p>Production build: <code>npm run build</code> then <code>npm start</code>.</p>
            <p>Data lives in <code>data/aurix.db</code> (SQLite). The app is a single Express + Vite process, so no separate database server is needed.</p>
          </div>
        </div>

        <div className="ws-card p-4">
          <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-[var(--ws-text)]">
            <Database className="h-3.5 w-3.5 text-[var(--ws-accent)]" /> What is stored where
          </h3>
          <div className="space-y-2 text-[10.5px] leading-relaxed text-[var(--ws-muted)]">
            <p>Conversations, messages, projects, notes, tasks, reminders, documents, memories, workflows, settings and audit logs are stored in the local SQLite database.</p>
            <p>Uploaded chat images are sent to the AI provider for that request only and are not written to disk.</p>
            <p>API keys live in the server environment; the browser only receives whether a key is configured.</p>
          </div>
        </div>
      </div>

      <div className="ws-card p-4">
        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[var(--ws-text)]">
          <TriangleAlert className="h-3.5 w-3.5 text-[#E7B75C]" /> Known limitations
        </h3>
        <ul className="grid gap-1.5 text-[10.5px] leading-relaxed text-[var(--ws-muted)] md:grid-cols-2">
          <li>• PDF, DOCX and other binary documents are not parsed in the browser; images and text files are analysed. Attach an image or paste the text.</li>
          <li>• Browser speech recognition (used for the wake phrase) is available in Chromium-based browsers; Firefox may fall back to the server transcriber.</li>
          <li>• Wake-phrase listening is opt-in per session and stops when the tab closes.</li>
          <li>• Automation schedules run only while the AURIX server is running.</li>
          <li>• Token usage, cost and average response time are not recorded, so analytics shows “Data unavailable” rather than estimates.</li>
          <li>• CPU/RAM/storage figures describe the server host; browser-side GPU load is not measurable.</li>
        </ul>
      </div>

      <div className="ws-card p-4">
        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[var(--ws-text)]">
          <ShieldCheck className="h-3.5 w-3.5 text-[var(--ws-accent)]" /> Support
        </h3>
        <p className="text-[10.5px] leading-relaxed text-[var(--ws-muted)]">
          If the AI shows “Degraded”, open Integrations and run “Test AI connection” — the panel reports the exact server
          error. If voice fails, check microphone permission and whether the browser supports speech recognition. If a
          module shows “Data unavailable”, the local API did not answer; refresh after checking the server logs.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className="ws-btn !text-[10.5px]" onClick={() => onNavigate("integrations")}><BookOpen className="h-3.5 w-3.5" /> Integration status</button>
          <button type="button" className="ws-btn !text-[10.5px]" onClick={() => onNavigate("legacy-selfheal")}>Open self-healer</button>
        </div>
      </div>
    </div>
  );
}
