import React, { useState } from "react";
import { Building2, FileText, Plus, Save, Upload } from "lucide-react";
import type { CompanyDocument, CompanyProfile } from "../types/aurix";

interface CompanyViewProps {
  company: CompanyProfile;
  onSaveCompany: (next: CompanyProfile) => Promise<void>;
}

export function CompanyView({ company, onSaveCompany }: CompanyViewProps) {
  const [draft, setDraft] = useState<CompanyProfile>(company);
  const [newService, setNewService] = useState("");
  const [docTitle, setDocTitle] = useState("");
  const [docCategory, setDocCategory] = useState("Strategy");
  const [docContent, setDocContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSaveCompany(draft);
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  const handleUploadDoc = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setDocTitle(file.name);
      setDocContent(String(reader.result || "").slice(0, 15000));
    };
    reader.readAsText(file);
  };

  const addDocument = async () => {
    if (!docTitle.trim() || !docContent.trim()) return;
    const newDoc: CompanyDocument = {
      id: `doc_${Date.now()}`,
      title: docTitle.trim(),
      category: docCategory,
      content: docContent.trim(),
      addedAt: new Date().toISOString(),
    };
    const next = { ...draft, documents: [newDoc, ...draft.documents] };
    setDraft(next);
    setDocTitle("");
    setDocContent("");
    await onSaveCompany(next);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-[#0D1420] border border-slate-200 dark:border-slate-800/80 rounded-xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Building2 className="w-4 h-4 text-cyan-500" />
            <span>Founder: {draft.founder}</span>
            <span aria-hidden="true">·</span>
            <span>Updated {draft.updatedAt.slice(0, 10)}</span>
          </div>
          <h2 className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-50">
            {draft.name}
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 max-w-3xl">
            {draft.vision}
          </p>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <Save className="w-4 h-4" />
          <span>{saving ? "Saving..." : savedNotice ? "Saved to SQLite" : "Save Company Profile"}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Services & Future Products */}
        <div className="lg:col-span-5 bg-white dark:bg-[#0D1420] border border-slate-200 dark:border-slate-800/80 rounded-xl p-6 space-y-5">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Official Services Catalog
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Verified services offered by AM VEYRONIX.
            </p>
          </div>

          <ul className="divide-y divide-slate-200 dark:divide-slate-800/80">
            {draft.services.map((svc, idx) => (
              <li key={svc + idx} className="py-2.5 flex items-center justify-between text-sm text-slate-800 dark:text-slate-200">
                <span>{svc}</span>
                <button
                  type="button"
                  onClick={() =>
                    setDraft({ ...draft, services: draft.services.filter((_, i) => i !== idx) })
                  }
                  className="text-xs text-slate-400 hover:text-red-400 cursor-pointer"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>

          <div className="flex gap-2">
            <input
              type="text"
              value={newService}
              onChange={(e) => setNewService(e.target.value)}
              placeholder="Add service offering..."
              className="flex-1 bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
            />
            <button
              type="button"
              onClick={() => {
                if (!newService.trim()) return;
                setDraft({ ...draft, services: [...draft.services, newService.trim()] });
                setNewService("");
              }}
              className="px-3 py-2 rounded-lg bg-slate-900 dark:bg-slate-800 text-white text-xs font-medium cursor-pointer"
            >
              Add
            </button>
          </div>
        </div>

        {/* Strategy & Plans */}
        <div className="lg:col-span-7 bg-white dark:bg-[#0D1420] border border-slate-200 dark:border-slate-800/80 rounded-xl p-6 space-y-4">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Strategy, Marketing & Hiring Plans
          </h3>

          <label className="block text-xs text-slate-500 dark:text-slate-400">
            <span>Company Vision</span>
            <textarea
              rows={2}
              value={draft.vision}
              onChange={(e) => setDraft({ ...draft, vision: e.target.value })}
              className="mt-1 w-full bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
            />
          </label>

          <label className="block text-xs text-slate-500 dark:text-slate-400">
            <span>Business & Delivery Strategy</span>
            <textarea
              rows={2}
              value={draft.strategy}
              onChange={(e) => setDraft({ ...draft, strategy: e.target.value })}
              className="mt-1 w-full bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
            />
          </label>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block text-xs text-slate-500 dark:text-slate-400">
              <span>Marketing Plan</span>
              <textarea
                rows={3}
                value={draft.marketingPlan}
                onChange={(e) => setDraft({ ...draft, marketingPlan: e.target.value })}
                className="mt-1 w-full bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
              />
            </label>

            <label className="block text-xs text-slate-500 dark:text-slate-400">
              <span>Hiring Plan (Owner Verified Only)</span>
              <textarea
                rows={3}
                value={draft.hiringPlan}
                onChange={(e) => setDraft({ ...draft, hiringPlan: e.target.value })}
                className="mt-1 w-full bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
              />
            </label>
          </div>
        </div>
      </div>

      {/* Company Documents */}
      <section className="bg-white dark:bg-[#0D1420] border border-slate-200 dark:border-slate-800/80 rounded-xl p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Company Documents & Briefs
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Upload text/markdown briefs or add verified company records. AURIX never invents external metrics.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-cyan-500/60 cursor-pointer">
            <Upload className="w-3.5 h-3.5 text-cyan-500" />
            <span>Load File</span>
            <input type="file" accept=".txt,.md,.json,.csv" onChange={handleUploadDoc} className="hidden" />
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <input
            type="text"
            value={docTitle}
            onChange={(e) => setDocTitle(e.target.value)}
            placeholder="Document title..."
            className="md:col-span-5 bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
          />
          <select
            value={docCategory}
            onChange={(e) => setDocCategory(e.target.value)}
            className="md:col-span-3 bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
          >
            <option value="Strategy">Strategy</option>
            <option value="Client Requirement">Client Requirement</option>
            <option value="Hiring">Hiring</option>
            <option value="Marketing">Marketing</option>
          </select>
          <button
            type="button"
            onClick={addDocument}
            className="md:col-span-4 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Store Company Document</span>
          </button>
        </div>

        <textarea
          rows={3}
          value={docContent}
          onChange={(e) => setDocContent(e.target.value)}
          placeholder="Document content or client brief notes..."
          className="w-full bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
        />

        {draft.documents.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            No uploaded company documents yet.
          </p>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800/80">
            {draft.documents.map((doc) => (
              <div key={doc.id} className="py-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="inline-flex items-center gap-1.5 font-medium text-slate-900 dark:text-slate-100">
                    <FileText className="w-3.5 h-3.5 text-cyan-500" />
                    {doc.title}
                  </span>
                  <span className="text-slate-400 font-mono">
                    {doc.category} · {doc.addedAt.slice(0, 10)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 line-clamp-3 whitespace-pre-wrap">
                  {doc.content}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
