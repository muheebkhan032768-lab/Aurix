import React, { useEffect, useState } from "react";
import { Cpu, Layers, RefreshCw, Server, Sparkles } from "lucide-react";
import type { AppSettings, LocalOllamaModelInfo, SystemTelemetry } from "../../types/aurix";
import { InlineError, SectionHeader, StatCard, StatusDot } from "../ui";

interface ModelsPayload {
  installedRamGb: number;
  recommendedMode: string;
  hardwareSummaryNote: string;
  ollamaReachable: boolean;
  models: LocalOllamaModelInfo[];
  catalog: Array<{ id: string; label: string; approxSizeGb: number; minRamGb: number; mode: string; notes: string }>;
}

interface ModelManagementProps {
  settings: AppSettings;
  telemetry: SystemTelemetry;
  onUpdateSettings: (settings: AppSettings) => Promise<void>;
}

export function ModelManagement({ settings, telemetry, onUpdateSettings }: ModelManagementProps) {
  const [data, setData] = useState<ModelsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const res = await fetch("/api/models/local");
      if (!res.ok) throw new Error("Model information is unavailable.");
      setData(await res.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Model information is unavailable.");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const update = async (patch: Partial<AppSettings>) => {
    setSaving(true);
    try {
      await onUpdateSettings({ ...settings, ...patch });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <SectionHeader
        eyebrow="Model Management"
        title="Choose the brain, match the hardware."
        description="Cloud reasoning through Gemini, with optional local Ollama models and a built-in offline knowledge engine. Selection is saved to your workspace settings."
        actions={
          <button type="button" className="ws-btn" onClick={() => void load()}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        }
      />

      {error && <InlineError message={error} onRetry={() => void load()} />}

      <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <div className="ws-card p-4">
          <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-[var(--ws-text)]">
            <Sparkles className="h-3.5 w-3.5 text-[var(--ws-accent)]" /> Active cloud model
          </h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              { id: "gemini-4-hydrogen", label: "Gemini 4 Hydrogen", hint: "Deep reasoning, coding and long context" },
              { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite", hint: "Fast answers and voice" },
            ].map((model) => (
              <button
                key={model.id}
                type="button"
                onClick={() => void update({ activeModel: model.id as AppSettings["activeModel"] })}
                disabled={saving}
                className={`rounded-xl border p-3 text-left transition-colors ${
                  settings.activeModel === model.id
                    ? "border-[color-mix(in_srgb,var(--ws-accent)_45%,transparent)] bg-[color-mix(in_srgb,var(--ws-accent)_10%,transparent)]"
                    : "border-[var(--ws-border)] hover:bg-[var(--ws-surface-2)]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-[var(--ws-text)]">{model.label}</span>
                  {settings.activeModel === model.id && <StatusDot state="ok" />}
                </div>
                <p className="mt-1 text-[9.5px] text-[var(--ws-muted)]">{model.hint}</p>
                <code className="mt-1 block text-[9px] text-[var(--ws-muted)]">{model.id}</code>
              </button>
            ))}
          </div>
          <label className="mt-3 block text-[10px] text-[var(--ws-muted)]">
            Default reasoning depth
            <select
              className="ws-input mt-1"
              value={settings.thinkingLevel}
              onChange={(e) => void update({ thinkingLevel: e.target.value as AppSettings["thinkingLevel"] })}
            >
              <option value="LOW">Low — fastest</option>
              <option value="MEDIUM">Medium — balanced</option>
              <option value="HIGH">High — deeper</option>
              <option value="XHIGH">Extra high — most deliberate</option>
            </select>
          </label>
          <label className="mt-3 flex items-center gap-2 text-[10.5px] text-[var(--ws-muted)]">
            <input
              type="checkbox"
              checked={settings.offlineModeForced}
              onChange={(e) => void update({ offlineModeForced: e.target.checked })}
              className="accent-[var(--ws-accent)]"
            />
            Force offline mode (disable cloud AI and cloud voice)
          </label>
        </div>

        <div className="ws-card p-4">
          <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-[var(--ws-text)]">
            <Cpu className="h-3.5 w-3.5 text-[var(--ws-accent)]" /> Hardware profile
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <StatCard label="Installed RAM" value={`${data?.installedRamGb ?? telemetry.installedRamGb} GB`} hint={telemetry.cpuModel} />
            <StatCard label="CPU cores" value={telemetry.cpuCores} hint={`load ${telemetry.loadAvg1m.toFixed(2)}`} tone="cyan" />
          </div>
          <div className="mt-2 rounded-xl border border-[var(--ws-border)] bg-[var(--ws-surface-2)] p-2.5 text-[10.5px] leading-relaxed text-[var(--ws-muted)]">
            {data?.hardwareSummaryNote || telemetry.hardwareSummaryNote}
          </div>
          <div className="mt-2 flex items-center justify-between text-[10.5px]">
            <span className="text-[var(--ws-muted)]">Recommended mode</span>
            <span className="font-mono text-[10px] text-[var(--ws-accent)]">{data?.recommendedMode || telemetry.recommendedMode}</span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="ws-card p-4">
          <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-[var(--ws-text)]">
            <Server className="h-3.5 w-3.5 text-[var(--ws-accent)]" /> Installed local models
          </h3>
          <div className="mb-2 flex items-center gap-1.5 text-[10px]">
            <StatusDot state={data?.ollamaReachable ? "ok" : "idle"} />
            {data?.ollamaReachable ? "Ollama is reachable" : "Ollama is not reachable on the host"}
          </div>
          {data?.models.length ? (
            <div className="space-y-1.5">
              {data.models.map((m) => (
                <div key={m.name} className="ws-inset flex items-center justify-between gap-2 px-2.5 py-2 text-[10.5px]">
                  <span className="truncate font-mono text-[var(--ws-text)]">{m.name}</span>
                  <span className="shrink-0 text-[var(--ws-muted)]">{m.sizeGb} GB · {m.fit}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-[var(--ws-border)] px-3 py-4 text-center text-[10px] text-[var(--ws-muted)]">
              No local models detected. Install Ollama on the host and run <code>ollama pull qwen2.5:1.5b</code>.
            </p>
          )}
        </div>

        <div className="ws-card p-4">
          <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-[var(--ws-text)]">
            <Layers className="h-3.5 w-3.5 text-[var(--ws-accent)]" /> Recommended catalog
          </h3>
          <div className="space-y-1.5">
            {(data?.catalog || []).map((m) => (
              <div key={m.id} className="ws-inset px-2.5 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10.5px] font-medium text-[var(--ws-text)]">{m.label}</span>
                  <span className="ws-chip !py-0.5">{m.mode}</span>
                </div>
                <p className="mt-0.5 text-[9.5px] leading-relaxed text-[var(--ws-muted)]">
                  {m.approxSizeGb} GB · needs {m.minRamGb} GB RAM · {m.notes}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="text-[9.5px] leading-relaxed text-[var(--ws-muted)]">
        Model switching affects the next AI request. Cloud models require a server-side GEMINI_API_KEY; local models are
        optional and are never downloaded by the browser.
      </p>
    </div>
  );
}
