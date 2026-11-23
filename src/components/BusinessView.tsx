import React, { useState } from "react";
import { Briefcase, FilePlus2, Sparkles } from "lucide-react";
import type { BusinessItem, BusinessItemKind } from "../types/aurix";

interface BusinessViewProps {
  items: BusinessItem[];
  onSaveItem: (item: Omit<BusinessItem, "id" | "createdAt" | "updatedAt"> & { id?: string }) => Promise<void>;
}

export function BusinessView({ items, onSaveItem }: BusinessViewProps) {
  const [filter, setFilter] = useState<"all" | BusinessItemKind>("all");
  const [kind, setKind] = useState<BusinessItemKind>("proposal");
  const [title, setTitle] = useState("");
  const [clientName, setClientName] = useState("");
  const [amount, setAmount] = useState("0");
  const [currency, setCurrency] = useState("USD");
  const [details, setDetails] = useState("");
  const [verifiedEntry, setVerifiedEntry] = useState(false);

  const [draftBrief, setDraftBrief] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [draftResult, setDraftResult] = useState("");
  const [error, setError] = useState<string | null>(null);

  const visible = filter === "all" ? items : items.filter((i) => i.kind === filter);
  const verifiedRevenue = items
    .filter((i) => i.kind === "invoice" && i.verifiedEntry && i.status === "Paid")
    .reduce((sum, i) => sum + i.amount, 0);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await onSaveItem({
      kind,
      title: title.trim(),
      clientName: clientName.trim() || "Owner Entry",
      status: kind === "invoice" ? "Pending Approval" : "Draft",
      amount: Number(amount) || 0,
      currency,
      details: details.trim(),
      verifiedEntry,
    });
    setTitle("");
    setClientName("");
    setAmount("0");
    setDetails("");
    setVerifiedEntry(false);
  };

  const handleAiDraft = async () => {
    if (!draftBrief.trim()) return;
    setDrafting(true);
    setError(null);
    try {
      const draftKind = kind === "client" || kind === "package" ? "proposal" : kind;
      const res = await fetch("/api/business/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: draftKind,
          clientName,
          brief: draftBrief,
          currency,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Draft generation failed.");
      setDraftResult(data.draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Business drafting failed.");
    } finally {
      setDrafting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Verified Revenue & Filter Header */}
      <div className="bg-white dark:bg-[#0D1420] border border-slate-200 dark:border-slate-800/80 rounded-xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Briefcase className="w-4 h-4 text-cyan-500" />
            <span>AM VEYRONIX Commercial Operations · Owner Approval Required Before Sending</span>
          </div>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Verified Paid Revenue:
            </span>
            <span className="font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
              ${verifiedRevenue.toLocaleString()}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-[#070B12] border border-slate-200 dark:border-slate-800 rounded-lg">
          {(["all", "client", "proposal", "quotation", "invoice", "package", "marketing"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize cursor-pointer whitespace-nowrap shrink-0 ${
                filter === k
                  ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm"
                  : "text-slate-600 dark:text-slate-400"
              }`}
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Create Record & AI Drafter */}
        <div className="lg:col-span-5 space-y-6">
          <form
            onSubmit={handleCreate}
            className="bg-white dark:bg-[#0D1420] border border-slate-200 dark:border-slate-800/80 rounded-xl p-6 space-y-3"
          >
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Log Business Record
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs text-slate-500 dark:text-slate-400">
                <span>Record Type</span>
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as BusinessItemKind)}
                  className="mt-1 w-full bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
                >
                  <option value="client">Client</option>
                  <option value="proposal">Proposal</option>
                  <option value="quotation">Quotation</option>
                  <option value="invoice">Invoice</option>
                  <option value="package">Service Package</option>
                  <option value="marketing">Marketing Plan</option>
                </select>
              </label>

              <label className="block text-xs text-slate-500 dark:text-slate-400">
                <span>Amount ({currency})</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="mt-1 w-full font-mono bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title (e.g., E-Commerce Redesign)"
                className="bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
              />
              <input
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Client Name"
                className="bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
              />
            </div>

            <textarea
              rows={3}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Scope, deliverables, or terms..."
              className="w-full bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
            />

            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={verifiedEntry}
                onChange={(e) => setVerifiedEntry(e.target.checked)}
                className="accent-cyan-500"
              />
              <span>Mark as owner-verified financial entry</span>
            </label>

            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-cyan-700 hover:bg-cyan-600 text-white text-xs font-medium cursor-pointer"
            >
              <FilePlus2 className="w-4 h-4" />
              <span>Save Business Record</span>
            </button>
          </form>

          <div className="bg-white dark:bg-[#0D1420] border border-slate-200 dark:border-slate-800/80 rounded-xl p-6 space-y-3">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              AI Proposal & Marketing Drafter
            </h3>
            <textarea
              rows={3}
              value={draftBrief}
              onChange={(e) => setDraftBrief(e.target.value)}
              placeholder="Describe client requirements or campaign goal for DEX MADE to draft..."
              className="w-full bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
            />
            <button
              type="button"
              onClick={handleAiDraft}
              disabled={drafting}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-slate-900 dark:bg-slate-800 text-white text-xs font-medium cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span>{drafting ? "Drafting..." : "Generate Internal Draft"}</span>
            </button>
            {error && <p className="text-xs text-red-500">{error}</p>}
            {draftResult && (
              <pre className="p-3 rounded-lg bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-800 text-xs whitespace-pre-wrap max-h-60 overflow-auto text-slate-800 dark:text-slate-200">
                {draftResult}
              </pre>
            )}
          </div>
        </div>

        {/* Ledger Table */}
        <section className="lg:col-span-7 bg-white dark:bg-[#0D1420] border border-slate-200 dark:border-slate-800/80 rounded-xl p-6">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4">
            Business Records
          </h3>
          {visible.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No records in this category. AM VEYRONIX records remain strictly owner-authored.
            </p>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800/80">
              {visible.map((item) => (
                <div key={item.id} className="py-4 flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xs font-mono uppercase text-accent">
                      {item.kind} · {item.status}
                    </div>
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100 mt-0.5">
                      {item.title}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Client: {item.clientName}
                    </div>
                    {item.details && (
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-1.5">
                        {item.details}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                      {item.amount > 0 ? `${item.currency} ${item.amount.toLocaleString()}` : "Custom"}
                    </div>
                    {item.kind === "invoice" && item.status !== "Paid" && (
                      <button
                        type="button"
                        onClick={() =>
                          onSaveItem({ ...item, status: "Paid", verifiedEntry: true })
                        }
                        className="mt-1 text-xs text-accent hover:underline cursor-pointer"
                      >
                        Mark Paid
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
