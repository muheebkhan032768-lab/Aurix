import { useCallback, useEffect, useState } from "react";
import type {
  AnalyticsPayload,
  DocumentItem,
  ReminderItem,
  WorkflowItem,
  WorkflowRun,
} from "../types/aurix";

export interface WorkspaceStore {
  documents: DocumentItem[];
  reminders: ReminderItem[];
  workflows: WorkflowItem[];
  runs: WorkflowRun[];
  analytics: AnalyticsPayload | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  saveDocument: (input: Partial<DocumentItem> & { title: string }) => Promise<DocumentItem | null>;
  removeDocument: (id: string) => Promise<void>;
  saveReminder: (input: Partial<ReminderItem> & { title: string; dueAt: string }) => Promise<ReminderItem | null>;
  removeReminder: (id: string) => Promise<void>;
  saveWorkflow: (input: Partial<WorkflowItem> & { name: string; actionType: WorkflowItem["actionType"] }) => Promise<WorkflowItem | null>;
  removeWorkflow: (id: string) => Promise<void>;
  runWorkflow: (id: string, confirmed: boolean) => Promise<{ status: string; detail: string; url?: string } | null>;
}

export function useWorkspaceStore(): WorkspaceStore {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [docRes, remRes, wfRes, anRes] = await Promise.all([
        fetch("/api/documents"),
        fetch("/api/reminders"),
        fetch("/api/workflows"),
        fetch("/api/analytics"),
      ]);
      if (docRes.ok) setDocuments(await docRes.json());
      if (remRes.ok) setReminders(await remRes.json());
      if (wfRes.ok) {
        const wf = await wfRes.json();
        setWorkflows(wf.workflows || []);
        setRuns(wf.runs || []);
      }
      if (anRes.ok) setAnalytics(await anRes.json());
      setError(null);
    } catch {
      setError("Workspace data could not be loaded from the local server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveDocument = useCallback(async (input: Partial<DocumentItem> & { title: string }) => {
    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save the document.");
      setDocuments((prev) => [data, ...prev.filter((d) => d.id !== data.id)]);
      return data as DocumentItem;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the document.");
      return null;
    }
  }, []);

  const removeDocument = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Could not delete the document.");
      setDocuments((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the document.");
    }
  }, []);

  const saveReminder = useCallback(async (input: Partial<ReminderItem> & { title: string; dueAt: string }) => {
    try {
      const res = await fetch("/api/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save the reminder.");
      setReminders((prev) => [data, ...prev.filter((r) => r.id !== data.id)].sort((a, b) => a.dueAt.localeCompare(b.dueAt)));
      return data as ReminderItem;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the reminder.");
      return null;
    }
  }, []);

  const removeReminder = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/reminders/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Could not delete the reminder.");
      setReminders((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the reminder.");
    }
  }, []);

  const saveWorkflow = useCallback(async (input: Partial<WorkflowItem> & { name: string; actionType: WorkflowItem["actionType"] }) => {
    try {
      const res = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save the workflow.");
      setWorkflows((prev) => [data, ...prev.filter((w) => w.id !== data.id)]);
      return data as WorkflowItem;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the workflow.");
      return null;
    }
  }, []);

  const removeWorkflow = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/workflows/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Could not delete the workflow.");
      setWorkflows((prev) => prev.filter((w) => w.id !== id));
      setRuns((prev) => prev.filter((r) => r.workflowId !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the workflow.");
    }
  }, []);

  const runWorkflow = useCallback(async (id: string, confirmed: boolean) => {
    try {
      const res = await fetch(`/api/workflows/${id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmed }),
      });
      const data = await res.json();
      if (!res.ok && res.status !== 202) throw new Error(data.error || "Workflow could not run.");
      if (Array.isArray(data.workflows)) setWorkflows(data.workflows);
      if (Array.isArray(data.runs)) setRuns(data.runs);
      return { status: String(data.status || ""), detail: String(data.detail || ""), url: data.url };
    } catch (err) {
      setError(err instanceof Error ? err.message : "Workflow could not run.");
      return null;
    }
  }, []);

  return {
    documents,
    reminders,
    workflows,
    runs,
    analytics,
    loading,
    error,
    refresh,
    saveDocument,
    removeDocument,
    saveReminder,
    removeReminder,
    saveWorkflow,
    removeWorkflow,
    runWorkflow,
  };
}
