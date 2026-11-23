import React, { useState } from "react";
import { Database, Download, Moon, Package, Play, Plus, Save, Sun, Trash2, User } from "lucide-react";
import { VoiceDiagnosticsPanel } from "./VoiceDiagnosticsPanel";
import { ApiKeysPanel } from "./ApiKeysPanel";
import type {
  AppSettings,
  AurixLanguage,
  MemoryItem,
  OwnerProfile,
  PerformanceMode,
  SystemTelemetry,
  WebsiteRecord,
} from "../types/aurix";

interface SettingsViewProps {
  owner: OwnerProfile;
  settings: AppSettings;
  memories: MemoryItem[];
  websites: WebsiteRecord[];
  telemetry: SystemTelemetry;
  onSaveOwner: (o: OwnerProfile) => Promise<void>;
  onUpdateSettings: (s: AppSettings) => Promise<void>;
  onSaveMemory: (m: Omit<MemoryItem, "id" | "createdAt" | "updatedAt"> & { id?: string }) => Promise<void>;
  onDeleteMemory: (id: string) => Promise<void>;
  onReplayStartup: () => void;
}

export function SettingsView({
  owner,
  settings,
  memories,
  websites,
  telemetry,
  onSaveOwner,
  onUpdateSettings,
  onSaveMemory,
  onDeleteMemory,
  onReplayStartup,
}: SettingsViewProps) {
  const [ownerDraft, setOwnerDraft] = useState<OwnerProfile>(owner);
  const [memSearch, setMemSearch] = useState("");
  const [memScopeFilter, setMemScopeFilter] = useState("All");
  const [newMemTitle, setNewMemTitle] = useState("");
  const [newMemScope, setNewMemScope] = useState("Global");
  const [newMemContent, setNewMemContent] = useState("");
  const [savedFlag, setSavedFlag] = useState(false);

  const filteredMemories = memories.filter((m) => {
    const matchesScope = memScopeFilter === "All" || m.projectScope === memScopeFilter;
    const q = memSearch.toLowerCase();
    const matchesQuery =
      !q ||
      m.title.toLowerCase().includes(q) ||
      m.content.toLowerCase().includes(q) ||
      m.category.toLowerCase().includes(q);
    return matchesScope && matchesQuery;
  });

  const handleSaveOwner = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSaveOwner(ownerDraft);
    setSavedFlag(true);
    setTimeout(() => setSavedFlag(false), 2500);
  };

  const handleAddMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemTitle.trim() || !newMemContent.trim()) return;
    await onSaveMemory({
      category: newMemScope === "Global" ? "Owner Preference" : "Website Project",
      title: newMemTitle.trim(),
      content: newMemContent.trim(),
      source: "Owner Entry",
      projectScope: newMemScope,
      approved: true,
    });
    setNewMemTitle("");
    setNewMemContent("");
  };

  return (
    <div className="space-y-6">
      {/* 1. General Appearance, Performance & Complete Download */}
      <section className="bg-white dark:bg-[#0F1724] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-base font-bold text-[#202938] dark:text-white">
              Appearance, Performance Mode &amp; Complete Project Package
            </h2>
            <p className="text-xs text-muted-ink dark:text-slate-400 mt-0.5">
              Detected {telemetry.installedRamGb} GB RAM ({telemetry.recommendedMode} hardware tier). Configure theme, animations, offline enforcement, and export full Windows package.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() =>
                onUpdateSettings({
                  ...settings,
                  theme: settings.theme === "dark" ? "light" : "dark",
                })
              }
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-[#202938] dark:text-slate-200 cursor-pointer"
            >
              {settings.theme === "dark" ? (
                <Sun className="w-4 h-4 text-[#D6AD60]" />
              ) : (
                <Moon className="w-4 h-4 text-accent" />
              )}
              <span>{settings.theme === "dark" ? "Switch to Bright Light UI" : "Switch to Dark UI"}</span>
            </button>

            <a
              href="/api/backup/export"
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-[#202938] dark:text-slate-200"
            >
              <Download className="w-4 h-4 text-accent" />
              <span>Export DB JSON</span>
            </a>

            <a
              href="/api/project/complete-download.zip"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#047857] hover:bg-emerald-600 text-white text-xs font-semibold"
            >
              <Package className="w-4 h-4" />
              <span>Download Complete DEX MADE 2.0 ZIP</span>
            </a>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <label className="block text-xs text-muted-ink">
            <span>Performance Mode</span>
            <select
              value={settings.performanceMode}
              onChange={(e) =>
                onUpdateSettings({ ...settings, performanceMode: e.target.value as PerformanceMode })
              }
              className="mt-1 w-full bg-[#F8FAFC] dark:bg-[#0B111B] border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-[#202938] dark:text-white"
            >
              <option value="auto">Auto Detect ({telemetry.recommendedMode})</option>
              <option value="lightweight">Lightweight (Low RAM / CPU)</option>
              <option value="balanced">Balanced</option>
              <option value="advanced">Advanced</option>
            </select>
          </label>

          <label className="block text-xs text-muted-ink">
            <span>Wake Phrase</span>
            <input
              type="text"
              value={settings.wakePhrase}
              onChange={(e) => onUpdateSettings({ ...settings, wakePhrase: e.target.value })}
              className="mt-1 w-full bg-[#F8FAFC] dark:bg-[#0B111B] border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-[#202938] dark:text-white"
            />
            <span className="mt-1 block text-[10px] text-muted-ink">Default: Hello Dex Made</span>
          </label>

          <label className="block text-xs text-muted-ink">
            <span>Startup Behavior</span>
            <select
              value={settings.startupBehavior}
              onChange={(e) => onUpdateSettings({ ...settings, startupBehavior: e.target.value })}
              className="mt-1 w-full bg-[#F8FAFC] dark:bg-[#0B111B] border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-[#202938] dark:text-white"
            >
              <option>Open Command Dashboard</option>
              <option>Start Minimized in System Tray (Windows)</option>
              <option>Launch Voice Assistant Ready</option>
            </select>
          </label>

          <div className="grid grid-cols-2 gap-2 items-center pt-3">
            <label className="flex items-center gap-2 text-xs text-[#202938] dark:text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.lightweightAnimations}
                onChange={(e) =>
                  onUpdateSettings({ ...settings, lightweightAnimations: e.target.checked })
                }
                className="accent-[#10B981]"
              />
              <span>Lite Graphics</span>
            </label>
            <label className="flex items-center gap-2 text-xs text-[#202938] dark:text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.offlineModeForced}
                onChange={(e) =>
                  onUpdateSettings({ ...settings, offlineModeForced: e.target.checked })
                }
                className="accent-[#10B981]"
              />
              <span>Force Offline</span>
            </label>
            <label className="flex items-center gap-2 text-xs text-[#202938] dark:text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.autoHealEnabled}
                onChange={(e) =>
                  onUpdateSettings({ ...settings, autoHealEnabled: e.target.checked })
                }
                className="accent-[#10B981]"
              />
              <span>Auto-Heal</span>
            </label>
            <label className="flex items-center gap-2 text-xs text-[#202938] dark:text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.cameraEnabled}
                onChange={(e) =>
                  onUpdateSettings({ ...settings, cameraEnabled: e.target.checked })
                }
                className="accent-[#10B981]"
              />
              <span>Camera Access</span>
            </label>
          </div>
        </div>
      </section>

      {/* 2. Voice engine, microphone and audio diagnostics */}
      <VoiceDiagnosticsPanel settings={settings} onUpdateSettings={onUpdateSettings} />

      {/* 3. Gemini API key failover pool */}
      <ApiKeysPanel />

      {/* 4. Startup Animation, Voice Greeting, DND & Quiet Hours */}
      <section className="bg-white dark:bg-[#0F1724] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-base font-bold text-[#202938] dark:text-white">
              Startup Experience, Proactive Companion, DND &amp; Quiet Hours
            </h2>
            <p className="text-xs text-muted-ink dark:text-slate-400 mt-0.5">
              Control launch splash animation, spoken British greeting, Do Not Disturb, and scheduled Quiet Hours.
            </p>
          </div>

          <button
            type="button"
            onClick={onReplayStartup}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#047857] hover:bg-emerald-600 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
          >
            <Play className="w-3.5 h-3.5" />
            <span>Replay Startup Experience</span>
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <label className="flex items-center gap-2 text-xs text-[#202938] dark:text-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.startupAnimationEnabled}
              onChange={(e) =>
                onUpdateSettings({ ...settings, startupAnimationEnabled: e.target.checked })
              }
              className="accent-[#10B981]"
            />
            <span>Startup Animation</span>
          </label>

          <label className="flex items-center gap-2 text-xs text-[#202938] dark:text-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.startupSoundEnabled}
              onChange={(e) =>
                onUpdateSettings({ ...settings, startupSoundEnabled: e.target.checked })
              }
              className="accent-[#10B981]"
            />
            <span>Startup Sound</span>
          </label>

          <label className="flex items-center gap-2 text-xs text-[#202938] dark:text-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.autoVoiceGreetingEnabled}
              onChange={(e) =>
                onUpdateSettings({ ...settings, autoVoiceGreetingEnabled: e.target.checked })
              }
              className="accent-[#10B981]"
            />
            <span>Voice Greeting</span>
          </label>

          <label className="flex items-center gap-2 text-xs text-[#202938] dark:text-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.autoStartEnabled}
              onChange={(e) =>
                onUpdateSettings({ ...settings, autoStartEnabled: e.target.checked })
              }
              className="accent-[#10B981]"
            />
            <span>Windows Auto-Start</span>
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <label className="block text-xs text-muted-ink">
            <span>Animation Duration ({settings.startupDurationSeconds}s)</span>
            <input
              type="range"
              min="4"
              max="12"
              step="1"
              value={settings.startupDurationSeconds}
              onChange={(e) =>
                onUpdateSettings({ ...settings, startupDurationSeconds: Number(e.target.value) })
              }
              className="mt-2 w-full accent-[#10B981]"
            />
          </label>

          <label className="block text-xs text-muted-ink">
            <span>Startup Sound Volume ({settings.startupSoundVolume}%)</span>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={settings.startupSoundVolume}
              onChange={(e) =>
                onUpdateSettings({ ...settings, startupSoundVolume: Number(e.target.value) })
              }
              className="mt-2 w-full accent-[#10B981]"
            />
          </label>

          <label className="block text-xs text-muted-ink">
            <span>Greeting Volume ({settings.greetingVolume}%)</span>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={settings.greetingVolume}
              onChange={(e) =>
                onUpdateSettings({ ...settings, greetingVolume: Number(e.target.value) })
              }
              className="mt-2 w-full accent-[#10B981]"
            />
          </label>

          <label className="block text-xs text-muted-ink">
            <span>Greeting Language</span>
            <select
              value={settings.greetingLanguage}
              onChange={(e) =>
                onUpdateSettings({
                  ...settings,
                  greetingLanguage: e.target.value as AurixLanguage,
                })
              }
              className="mt-1 w-full bg-[#F8FAFC] dark:bg-[#0B111B] border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-[#202938] dark:text-white"
            >
              <option value="English">English (UK)</option>
              <option value="Urdu">Urdu</option>
              <option value="Hindi">Hindi</option>
            </select>
          </label>
        </div>

        {/* Proactive Companion + Do Not Disturb + Quiet Hours */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 items-center">
          <label className="flex items-center gap-2 text-xs text-[#202938] dark:text-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.proactiveTalkEnabled}
              onChange={(e) =>
                onUpdateSettings({ ...settings, proactiveTalkEnabled: e.target.checked })
              }
              className="accent-[#10B981]"
            />
            <span>Always-On Proactive Talk</span>
          </label>

          <label className="block text-xs text-muted-ink">
            <span>Check-In Pace ({settings.proactiveIntervalSeconds || 20}s)</span>
            <input
              type="range"
              min="12"
              max="120"
              step="4"
              value={settings.proactiveIntervalSeconds || 20}
              onChange={(e) =>
                onUpdateSettings({ ...settings, proactiveIntervalSeconds: Number(e.target.value) })
              }
              className="mt-2 w-full accent-[#10B981]"
            />
          </label>

          <label className="flex items-center gap-2 text-xs text-[#202938] dark:text-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.doNotDisturb}
              onChange={(e) =>
                onUpdateSettings({ ...settings, doNotDisturb: e.target.checked })
              }
              className="accent-[#10B981]"
            />
            <span>Do Not Disturb (Silence Spoken Prompts)</span>
          </label>

          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-xs text-[#202938] dark:text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.quietHoursEnabled}
                onChange={(e) =>
                  onUpdateSettings({ ...settings, quietHoursEnabled: e.target.checked })
                }
                className="accent-[#10B981]"
              />
              <span>Quiet Hours Schedule</span>
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="time"
                aria-label="Quiet hours start"
                value={settings.quietHoursStart}
                onChange={(e) =>
                  onUpdateSettings({ ...settings, quietHoursStart: e.target.value })
                }
                className="bg-[#F8FAFC] dark:bg-[#0B111B] border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-xs text-[#202938] dark:text-white"
              />
              <span className="text-xs text-muted-ink">to</span>
              <input
                type="time"
                aria-label="Quiet hours end"
                value={settings.quietHoursEnd}
                onChange={(e) =>
                  onUpdateSettings({ ...settings, quietHoursEnd: e.target.value })
                }
                className="bg-[#F8FAFC] dark:bg-[#0B111B] border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-xs text-[#202938] dark:text-white"
              />
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Owner Profile Editor */}
        <form
          onSubmit={handleSaveOwner}
          className="lg:col-span-6 bg-white dark:bg-[#0F1724] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4 shadow-sm"
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img
                src="/src/assets/images/avatar_abdul_muheeb_1795088206648.jpg"
                alt="Abdul Muheeb"
                referrerPolicy="no-referrer"
                className="w-12 h-12 rounded-full object-cover border border-slate-200 dark:border-slate-700"
              />
              <div>
                <h3 className="text-base font-bold text-[#202938] dark:text-white flex items-center gap-1.5">
                  <User className="w-4 h-4 text-positive" />
                  <span>Owner Knowledge Profile</span>
                </h3>
                <p className="text-xs text-muted-ink">Primary Owner: {ownerDraft.name}</p>
              </div>
            </div>

            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#047857] hover:bg-emerald-600 text-white text-xs font-semibold cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{savedFlag ? "Saved" : "Save Profile"}</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs text-muted-ink">
              <span>Owner Name</span>
              <input
                type="text"
                value={ownerDraft.name}
                onChange={(e) => setOwnerDraft({ ...ownerDraft, name: e.target.value })}
                className="mt-1 w-full bg-[#F8FAFC] dark:bg-[#0B111B] border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-[#202938] dark:text-white"
              />
            </label>
            <label className="block text-xs text-muted-ink">
              <span>Role</span>
              <input
                type="text"
                value={ownerDraft.role}
                onChange={(e) => setOwnerDraft({ ...ownerDraft, role: e.target.value })}
                className="mt-1 w-full bg-[#F8FAFC] dark:bg-[#0B111B] border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-[#202938] dark:text-white"
              />
            </label>
          </div>

          <label className="block text-xs text-muted-ink">
            <span>Programming Skills (comma separated)</span>
            <input
              type="text"
              value={ownerDraft.programmingSkills.join(", ")}
              onChange={(e) =>
                setOwnerDraft({
                  ...ownerDraft,
                  programmingSkills: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                })
              }
              className="mt-1 w-full bg-[#F8FAFC] dark:bg-[#0B111B] border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-[#202938] dark:text-white"
            />
          </label>

          <label className="block text-xs text-muted-ink">
            <span>Learning Goals (one per line)</span>
            <textarea
              rows={3}
              value={ownerDraft.learningGoals.join("\n")}
              onChange={(e) =>
                setOwnerDraft({
                  ...ownerDraft,
                  learningGoals: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean),
                })
              }
              className="mt-1 w-full bg-[#F8FAFC] dark:bg-[#0B111B] border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-[#202938] dark:text-white"
            />
          </label>

          <label className="block text-xs text-muted-ink">
            <span>Assistant Preferences</span>
            <textarea
              rows={2}
              value={ownerDraft.preferences}
              onChange={(e) => setOwnerDraft({ ...ownerDraft, preferences: e.target.value })}
              className="mt-1 w-full bg-[#F8FAFC] dark:bg-[#0B111B] border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-[#202938] dark:text-white"
            />
          </label>
        </form>

        {/* Persistent Scoped Memory Manager */}
        <section className="lg:col-span-6 bg-white dark:bg-[#0F1724] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4 shadow-sm">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-accent" />
            <h3 className="text-base font-bold text-[#202938] dark:text-white">
              Persistent Scoped Memory Manager
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="text"
              value={memSearch}
              onChange={(e) => setMemSearch(e.target.value)}
              placeholder="Search memories..."
              className="bg-[#F8FAFC] dark:bg-[#0B111B] border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-[#202938] dark:text-white"
            />
            <select
              value={memScopeFilter}
              onChange={(e) => setMemScopeFilter(e.target.value)}
              className="bg-[#F8FAFC] dark:bg-[#0B111B] border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-[#202938] dark:text-white"
            >
              <option value="All">All Scopes</option>
              <option value="Global">Global</option>
              {websites.map((w) => (
                <option key={w.id} value={w.name}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>

          <form onSubmit={handleAddMemory} className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <div className="grid grid-cols-3 gap-2">
              <input
                type="text"
                required
                value={newMemTitle}
                onChange={(e) => setNewMemTitle(e.target.value)}
                placeholder="Approved memory title..."
                className="col-span-2 bg-[#F8FAFC] dark:bg-[#0B111B] border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-[#202938] dark:text-white"
              />
              <select
                value={newMemScope}
                onChange={(e) => setNewMemScope(e.target.value)}
                className="bg-[#F8FAFC] dark:bg-[#0B111B] border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-2 text-xs text-[#202938] dark:text-white"
              >
                <option value="Global">Global</option>
                {websites.map((w) => (
                  <option key={w.id} value={w.name}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              rows={2}
              required
              value={newMemContent}
              onChange={(e) => setNewMemContent(e.target.value)}
              placeholder="Verified fact or project decision..."
              className="w-full bg-[#F8FAFC] dark:bg-[#0B111B] border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-[#202938] dark:text-white"
            />
            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg bg-[#047857] hover:bg-emerald-600 text-white text-xs font-semibold cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Approve &amp; Store Memory</span>
            </button>
          </form>

          <div className="divide-y divide-slate-200 dark:divide-slate-800 max-h-64 overflow-y-auto">
            {filteredMemories.map((m) => (
              <div key={m.id} className="py-3 flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-mono text-accent font-semibold">
                    {m.projectScope} · {m.category}
                  </div>
                  <div className="text-xs font-semibold text-[#202938] dark:text-white mt-0.5">{m.title}</div>
                  <p className="text-xs text-muted-ink dark:text-slate-400 mt-0.5">{m.content}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onDeleteMemory(m.id)}
                  aria-label="Delete memory"
                  className="text-muted-ink hover:text-rose-700 dark:text-rose-400 cursor-pointer shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
