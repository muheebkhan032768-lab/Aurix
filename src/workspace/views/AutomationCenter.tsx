import React, { useMemo, useState } from "react";
import { AlertTriangle, Bot, Check, Clock3, Play, Plus, Power, ShieldCheck, Trash2, Zap } from "lucide-react";
import type { AuditLogEntry, WorkflowActionType, WorkflowItem, WorkflowTrigger } from "../../types/aurix";
import type { WorkspaceStore } from "../useWorkspaceStore";
import { ConfirmDialog, EmptyState, InlineError, SectionHeader, timeAgo } from "../ui";

interface AutomationCenterProps {
  store: WorkspaceStore;
  auditLogs: AuditLogEntry[];
  emergencyStopActive: boolean;
  onToggleEmergencyStop: (active: boolean) => Promise<void>;
}

const ACTION_LABELS: Record<WorkflowActionType, string> = {
  create_note: "Create a note",
  create_task: "Create a task",
  open_url: "Prepare an official link",
  chat_prompt: "Ask AURIX and save the answer",
};

export function AutomationCenter({ store, auditLogs, emergencyStopActive, onToggleEmergencyStop }: AutomationCenterProps) {
  const [form, setForm] = useState({
    name: "",
    description: "",
    trigger: "manual" as WorkflowTrigger,
    intervalMinutes: 60,
    actionType: "create_note" as WorkflowActionType,
    actionPayload: "",
    requiresConfirmation: true,
    enabled: true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WorkflowItem | null>(null);
  const [pendingRun, setPendingRun] = useState<WorkflowItem | null>(null);
  const [runNotice, setRunNotice] = useState<string | null>(null);

  const runs = useMemo(() => store.runs.slice(0, 20), [store.runs]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("A workflow name is required.");
      return;
    }
    if (form.actionType === "open_url" && form.actionPayload && !/^https?:\/\//i.test(form.actionPayload)) {
      setError("The URL must start with http:// or https://.");
      return;
    }
    setSaving(true);
    setError(null);
    const saved = await store.saveWorkflow({ ...form, name: form.name.trim() });
    setSaving(false);
    if (saved) {
      setForm({ ...form, name: "", description: "", actionPayload: "" });
      setRunNotice(`Workflow "${saved.name}" created.`);
    } else {
      setError("The workflow could not be saved.");
    }
  };

  const run = async (workflow: WorkflowItem, confirmed: boolean) => {
    setRunNotice(null);
    const outcome = await store.runWorkflow(workflow.id, confirmed);
    if (!outcome) return;
    if (outcome.status === "pending_approval") {
      setPendingRun(workflow);
      setRunNotice("This workflow requires your approval before it runs.");
      return;
    }
    setPendingRun(null);
    setRunNotice(outcome.detail);
    if (outcome.url) window.open(outcome.url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="space-y-4">
      <SectionHeader
        eyebrow="Automation Center"
        title="Workflows with a human approval gate."
        description="Create real automations that write notes, create tasks, open official links or ask AURIX. Destructive actions always ask first, and every run is recorded."
        actions={
          <button
            type="button"
            className={`ws-btn ${emergencyStopActive ? "!border-[#F0729B]/50 !text-[#F0729B]" : ""}`}
            onClick={() => void onToggleEmergencyStop(!emergencyStopActive)}
          >
            <AlertTriangle className="h-4 w-4" /> {emergencyStopActive ? "Emergency stop active" : "Emergency stop"}
          </button>
        }
      />

      {emergencyStopActive && (
        <div className="rounded-xl border border-[#F0729B]/40 bg-[#F0729B]/10 px-4 py-2.5 text-[11px] text-[#F0729B]">
          Emergency stop is active. System actions are blocked until you clear it.
        </div>
      )}
      {runNotice && <div className="rounded-xl border border-[var(--ws-border)] bg-[var(--ws-surface-2)] px-4 py-2.5 text-[11px] text-[var(--ws-text)]">{runNotice}</div>}

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-[var(--ws-text)]">Your workflows</h3>
            <span className="ws-chip"><Zap className="h-3 w-3" /> {store.workflows.length} configured</span>
          </div>
          {store.workflows.length === 0 ? (
            <EmptyState icon={<Bot className="h-5 w-5" />} title="No workflows yet" description="Create one on the right. AURIX will record every run and ask before acting." />
          ) : (
            store.workflows.map((workflow) => (
              <div key={workflow.id} className="ws-card p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`ws-chip ${workflow.enabled ? "!text-[var(--ws-accent)]" : ""}`}>
                        <Power className="h-2.5 w-2.5" /> {workflow.enabled ? "Enabled" : "Disabled"}
                      </span>
                      <span className="ws-chip">{workflow.trigger === "schedule" ? `every ${workflow.intervalMinutes}m` : "manual"}</span>
                      {workflow.requiresConfirmation && <span className="ws-chip !text-[#E7B75C]"><ShieldCheck className="h-2.5 w-2.5" /> approval</span>}
                    </div>
                    <h4 className="mt-1.5 text-[12px] font-semibold text-[var(--ws-text)]">{workflow.name}</h4>
                    {workflow.description && <p className="mt-0.5 text-[10.5px] text-[var(--ws-muted)]">{workflow.description}</p>}
                    <div className="mt-1.5 text-[9.5px] text-[var(--ws-muted)]">
                      {ACTION_LABELS[workflow.actionType]} · last run {workflow.lastRunAt ? timeAgo(workflow.lastRunAt) : "never"}
                      {workflow.nextRunAt && ` · next ${new Date(workflow.nextRunAt).toLocaleString()}`}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    <button type="button" className="ws-btn ws-btn-ghost !p-1.5" onClick={() => void run(workflow, !workflow.requiresConfirmation)} aria-label="Run workflow">
                      <Play className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="ws-btn ws-btn-ghost !p-1.5"
                      onClick={() => void store.saveWorkflow({ ...workflow, enabled: !workflow.enabled })}
                      aria-label={workflow.enabled ? "Disable workflow" : "Enable workflow"}
                    >
                      <Power className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" className="ws-btn ws-btn-ghost !p-1.5 hover:!text-[#F0729B]" onClick={() => setDeleteTarget(workflow)} aria-label="Delete workflow">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}

          <div className="ws-card p-4">
            <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-[var(--ws-text)]">
              <Clock3 className="h-3.5 w-3.5 text-[var(--ws-accent)]" /> Execution history
            </h3>
            {runs.length === 0 ? (
              <p className="py-3 text-center text-[10.5px] text-[var(--ws-muted)]">No workflow has run yet.</p>
            ) : (
              <div className="ws-scroll max-h-64 space-y-1.5 overflow-y-auto">
                {runs.map((runItem) => (
                  <div key={runItem.id} className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-[var(--ws-surface-2)]">
                    <span
                      className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{
                        background:
                          runItem.status === "success"
                            ? "var(--ws-accent)"
                            : runItem.status === "pending_approval"
                              ? "#E7B75C"
                              : "#F0729B",
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-[10.5px] text-[var(--ws-text)]">{runItem.workflowName}</div>
                      <div className="text-[9px] text-[var(--ws-muted)]">{runItem.detail}</div>
                    </div>
                    <span className="shrink-0 text-[9px] text-[var(--ws-muted)]">{timeAgo(runItem.startedAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <form onSubmit={create} className="ws-card space-y-3 self-start p-4">
          <h3 className="text-xs font-semibold text-[var(--ws-text)]">New workflow</h3>
          <label className="block text-[10px] text-[var(--ws-muted)]">
            Name
            <input className="ws-input mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Daily project brief" />
          </label>
          <label className="block text-[10px] text-[var(--ws-muted)]">
            Description
            <input className="ws-input mt-1" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What should this workflow do?" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-[10px] text-[var(--ws-muted)]">
              Trigger
              <select className="ws-input mt-1" value={form.trigger} onChange={(e) => setForm({ ...form, trigger: e.target.value as WorkflowTrigger })}>
                <option value="manual">Manual</option>
                <option value="schedule">Schedule</option>
              </select>
            </label>
            <label className="block text-[10px] text-[var(--ws-muted)]">
              Interval (min)
              <input type="number" min={5} max={1440} className="ws-input mt-1" value={form.intervalMinutes} onChange={(e) => setForm({ ...form, intervalMinutes: Number(e.target.value) })} disabled={form.trigger !== "schedule"} />
            </label>
          </div>
          <label className="block text-[10px] text-[var(--ws-muted)]">
            Action
            <select className="ws-input mt-1" value={form.actionType} onChange={(e) => setForm({ ...form, actionType: e.target.value as WorkflowActionType })}>
              {Object.entries(ACTION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="block text-[10px] text-[var(--ws-muted)]">
            {form.actionType === "open_url" ? "Official URL" : form.actionType === "chat_prompt" ? "Prompt for AURIX" : "Content"}
            {form.actionType === "open_url" ? (
              <input className="ws-input mt-1" value={form.actionPayload} onChange={(e) => setForm({ ...form, actionPayload: e.target.value })} placeholder="https://..." />
            ) : (
              <textarea className="ws-input mt-1 min-h-[72px]" value={form.actionPayload} onChange={(e) => setForm({ ...form, actionPayload: e.target.value })} placeholder={form.actionType === "chat_prompt" ? "Summarise my open tasks and suggest priorities." : "Text to write"} />
            )}
          </label>
          <label className="flex items-center gap-2 text-[10.5px] text-[var(--ws-muted)]">
            <input type="checkbox" checked={form.requiresConfirmation} onChange={(e) => setForm({ ...form, requiresConfirmation: e.target.checked })} className="accent-[var(--ws-accent)]" />
            Require my approval before running
          </label>
          <label className="flex items-center gap-2 text-[10.5px] text-[var(--ws-muted)]">
            <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} className="accent-[var(--ws-accent)]" />
            Enable immediately
          </label>
          {error && <InlineError message={error} />}
          <button type="submit" className="ws-btn ws-btn-primary w-full" disabled={saving}>
            <Plus className="h-4 w-4" /> {saving ? "Saving..." : "Create workflow"}
          </button>
          <p className="text-[9px] leading-relaxed text-[var(--ws-muted)]">
            Scheduled workflows run only while AURIX is running. With approval required, a scheduled run is queued for you
            instead of executing unattended.
          </p>
        </form>
      </div>

      <div className="ws-card p-4">
        <h3 className="mb-2 text-xs font-semibold text-[var(--ws-text)]">Recent system actions</h3>
        {auditLogs.length === 0 ? (
          <p className="text-[10.5px] text-[var(--ws-muted)]">No actions recorded.</p>
        ) : (
          <div className="grid gap-1.5 md:grid-cols-2">
            {auditLogs.slice(0, 8).map((entry) => (
              <div key={entry.id} className="flex items-start gap-2 text-[10px]">
                <Check className="mt-0.5 h-3 w-3 shrink-0 text-[var(--ws-accent)]" />
                <div className="min-w-0">
                  <div className="truncate text-[var(--ws-text)]">{entry.detail}</div>
                  <div className="text-[9px] uppercase tracking-wide text-[var(--ws-muted)]">{entry.eventType} · {timeAgo(entry.createdAt)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(pendingRun)}
        title="Approve this workflow run?"
        message={`"${pendingRun?.name || ""}" will ${pendingRun ? ACTION_LABELS[pendingRun.actionType].toLowerCase() : "run"} now. Only approve if you intend this action.`}
        confirmLabel="Approve & run"
        tone="primary"
        onCancel={() => setPendingRun(null)}
        onConfirm={async () => {
          if (!pendingRun) return;
          const target = pendingRun;
          setPendingRun(null);
          await run(target, true);
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete this workflow?"
        message={`"${deleteTarget?.name || ""}" and its run history will be removed. This cannot be undone.`}
        confirmLabel="Delete workflow"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await store.removeWorkflow(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}
