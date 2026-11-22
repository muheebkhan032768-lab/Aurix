import React, { useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, HardDrive, Plug, RefreshCw, Server, ShieldCheck, Wifi, XCircle } from "lucide-react";
import type { AiStatusPayload, LocalOllamaModelInfo } from "../../types/aurix";
import { QUICK_ACTIONS } from "../nav";
import { InlineError, SectionHeader, StatCard, StatusDot, timeAgo } from "../ui";

interface IntegrationsPayload {
  ai: AiStatusPayload;
  localModels: { reachable: boolean; models: LocalOllamaModelInfo[]; host: string };
  storage: { engine: string; database: string; workspaceFiles: string; uploadsPersisted: boolean };
  system: {
    hostname: string;
    platform: string;
    arch: string;
    uptimeSeconds: number;
    networkAddresses: Array<{ name: string; family: string }>;
    offlineModeForced: boolean;
    activeModel: string;
  };
}

export function IntegrationsView() {
  const [data, setData] = useState<IntegrationsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [probing, setProbing] = useState(false);

  const load = async () => {
    try {
      const res = await fetch("/api/integrations/status");
      if (!res.ok) throw new Error("Integration status is unavailable.");
      setData(await res.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Integration status is unavailable.");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const probe = async () => {
    setProbing(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/probe", { method: "POST" });
      const status = await res.json();
      if (!res.ok) throw new Error(status.error || "Probe failed.");
      setData((prev) => (prev ? { ...prev, ai: status } : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : "The AI probe failed.");
    } finally {
      setProbing(false);
    }
  };

  const ai = data?.ai;

  return (
    <div className="space-y-4">
      <SectionHeader
        eyebrow="Integrations"
        title="Only real connections."
        description="AURIX reports what the server can actually reach. A configured key is not called connected until a live request succeeds."
        actions={
          <>
            <button type="button" className="ws-btn" onClick={() => void load()}>
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
            <button type="button" className="ws-btn ws-btn-primary" onClick={() => void probe()} disabled={probing || !ai?.configured}>
              {probing ? "Testing..." : "Test AI connection"}
            </button>
          </>
        }
      />

      {error && <InlineError message={error} onRetry={() => void load()} />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Gemini AI"
          value={ai?.state === "connected" ? "Connected" : ai?.state === "degraded" ? "Degraded" : ai?.configured ? "Untested" : "No key"}
          hint={ai?.probe ? `${ai.probe.latencyMs ?? "—"} ms probe · ${timeAgo(ai.probe.checkedAt)}` : "Run a live test"}
          icon={<Plug className="h-4 w-4" />}
        />
        <StatCard label="Local Ollama" value={data?.localModels.reachable ? "Reachable" : "Not detected"} hint={data?.localModels.reachable ? `${data.localModels.models.length} model(s)` : data?.localModels.host} icon={<Server className="h-4 w-4" />} tone="cyan" />
        <StatCard label="Database" value="SQLite" hint={data?.storage.database || "data/aurix.db"} icon={<HardDrive className="h-4 w-4" />} />
        <StatCard label="Offline fallback" value="Available" hint="Local knowledge engine" icon={<ShieldCheck className="h-4 w-4" />} tone="cyan" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="ws-card p-4">
          <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-[var(--ws-text)]">
            <Plug className="h-3.5 w-3.5 text-[var(--ws-accent)]" /> AI provider
          </h3>
          <div className="space-y-2 text-[11px]">
            {[
              { label: "Provider", value: ai?.provider || "Google Gemini" },
              { label: "API key", value: ai?.configured ? "Present on server" : "Missing" },
              { label: "Connection", value: ai?.state || "untested" },
              { label: "Last model", value: ai?.lastModel || "Not recorded" },
              { label: "Last success", value: ai?.lastSuccessAt ? new Date(ai.lastSuccessAt).toLocaleString() : "None this session" },
              { label: "Last failure", value: ai?.lastFailureAt ? new Date(ai.lastFailureAt).toLocaleString() : "None this session" },
              { label: "Last error", value: ai?.lastError || "None" },
            ].map((row) => (
              <div key={row.label} className="flex items-start justify-between gap-3 border-b border-[var(--ws-border)] pb-1.5 last:border-0 last:pb-0">
                <span className="text-[var(--ws-muted)]">{row.label}</span>
                <span className="max-w-[62%] break-words text-right font-mono text-[10px] text-[var(--ws-text)]">{row.value}</span>
              </div>
            ))}
          </div>
          {ai?.probe && (
            <p className={`mt-2 inline-flex items-center gap-1.5 text-[10px] ${ai.probe.ok ? "text-[var(--ws-accent)]" : "text-[#F0729B]"}`}>
              <StatusDot state={ai.probe.ok ? "ok" : "error"} /> {ai.probe.detail}
            </p>
          )}
        </div>

        <div className="ws-card p-4">
          <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-[var(--ws-text)]">
            <Server className="h-3.5 w-3.5 text-[var(--ws-accent)]" /> Local models & host
          </h3>
          <div className="space-y-2 text-[11px]">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[var(--ws-muted)]">Ollama endpoint</span>
              <span className="font-mono text-[10px] text-[var(--ws-text)]">{data?.localModels.host || "http://127.0.0.1:11434"}</span>
            </div>
            {data?.localModels.models.length ? (
              data.localModels.models.map((m) => (
                <div key={m.name} className="flex items-center justify-between gap-3">
                  <span className="truncate text-[var(--ws-muted)]">{m.name}</span>
                  <span className="shrink-0 font-mono text-[10px] text-[var(--ws-text)]">{m.sizeGb} GB · {m.fit}</span>
                </div>
              ))
            ) : (
              <p className="rounded-lg border border-dashed border-[var(--ws-border)] px-2.5 py-2 text-[10px] text-[var(--ws-muted)]">
                No local Ollama models were detected. AURIX still works through the offline knowledge engine.
              </p>
            )}
            <div className="ws-divider my-1" />
            <div className="flex items-center justify-between gap-3">
              <span className="text-[var(--ws-muted)]">Host</span>
              <span className="font-mono text-[10px] text-[var(--ws-text)]">{data?.system.hostname || "—"}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[var(--ws-muted)]">Platform</span>
              <span className="font-mono text-[10px] text-[var(--ws-text)]">{data?.system.platform || "—"}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[var(--ws-muted)]">Network interfaces</span>
              <span className="font-mono text-[10px] text-[var(--ws-text)]">{data?.system.networkAddresses.length ?? 0}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[var(--ws-muted)]">Offline mode</span>
              <span className={`font-mono text-[10px] ${data?.system.offlineModeForced ? "text-[#E7B75C]" : "text-[var(--ws-accent)]"}`}>
                {data?.system.offlineModeForced ? "Forced" : "Off"}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="ws-card p-4">
          <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-[var(--ws-text)]">
            <HardDrive className="h-3.5 w-3.5 text-[var(--ws-accent)]" /> Where your data lives
          </h3>
          <div className="space-y-2 text-[11px]">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[var(--ws-muted)]">Database engine</span>
              <span className="font-mono text-[10px] text-[var(--ws-text)]">{data?.storage.engine || "SQLite"}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[var(--ws-muted)]">Database file</span>
              <span className="font-mono text-[10px] text-[var(--ws-text)]">{data?.storage.database || "data/aurix.db"}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[var(--ws-muted)]">Workspace files</span>
              <span className="font-mono text-[10px] text-[var(--ws-text)]">{data?.storage.workspaceFiles || "workspace_files/"}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[var(--ws-muted)]">Uploaded attachments</span>
              <span className="font-mono text-[10px] text-[var(--ws-text)]">{data?.storage.uploadsPersisted ? "Persisted" : "Request only"}</span>
            </div>
          </div>
          <p className="mt-2 text-[9px] leading-relaxed text-[var(--ws-muted)]">
            Images attached in chat are forwarded to the AI provider for that request only and are not written to disk.
          </p>
        </div>

        <div className="ws-card p-4">
          <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-[var(--ws-text)]">
            <Wifi className="h-3.5 w-3.5 text-[var(--ws-accent)]" /> Quick actions
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {QUICK_ACTIONS.map((action) => (
              <a key={action.label} href={action.url} target="_blank" rel="noreferrer noopener" className="ws-inset flex items-center justify-between gap-2 px-2.5 py-2 text-[10.5px] text-[var(--ws-text)] transition-colors hover:border-[color-mix(in_srgb,var(--ws-accent)_35%,transparent)]">
                {action.label}
                <ExternalLink className="h-3 w-3 text-[var(--ws-muted)]" />
              </a>
            ))}
          </div>
        </div>
      </div>

      <div className="ws-card p-4">
        <h3 className="mb-2 text-xs font-semibold text-[var(--ws-text)]">Credentials & dependencies</h3>
        <div className="grid gap-2 text-[10.5px] md:grid-cols-2">
          <div className="ws-inset flex items-start gap-2 p-2.5">
            {ai?.configured ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-[var(--ws-accent)]" /> : <XCircle className="mt-0.5 h-3.5 w-3.5 text-[#F0729B]" />}
            <div>
              <div className="font-medium text-[var(--ws-text)]">GEMINI_API_KEY</div>
              <p className="text-[var(--ws-muted)]">Required for cloud chat, image understanding, transcription and the Gemini male voice. Stored only on the server.</p>
            </div>
          </div>
          <div className="ws-inset flex items-start gap-2 p-2.5">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-[var(--ws-accent)]" />
            <div>
              <div className="font-medium text-[var(--ws-text)]">Local SQLite</div>
              <p className="text-[var(--ws-muted)]">No account or paid service required. Ships with the app.</p>
            </div>
          </div>
          <div className="ws-inset flex items-start gap-2 p-2.5">
            {data?.localModels.reachable ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-[var(--ws-accent)]" /> : <XCircle className="mt-0.5 h-3.5 w-3.5 text-[var(--ws-muted)]" />}
            <div>
              <div className="font-medium text-[var(--ws-text)]">Ollama (optional)</div>
              <p className="text-[var(--ws-muted)]">Free local models for offline answers. Install Ollama on the host and pull a model; the browser cannot install it.</p>
            </div>
          </div>
          <div className="ws-inset flex items-start gap-2 p-2.5">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-[var(--ws-accent)]" />
            <div>
              <div className="font-medium text-[var(--ws-text)]">No other paid dependency</div>
              <p className="text-[var(--ws-muted)]">Quick links open official websites. No third-party API keys are required for them.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
