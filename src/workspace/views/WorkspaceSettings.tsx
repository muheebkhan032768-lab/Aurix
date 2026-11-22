import React, { useEffect, useState } from "react";
import { Bell, Check, Moon, Palette, Save, Settings, Sun, User, Volume2, Bot } from "lucide-react";
import type { AppSettings, OwnerProfile } from "../../types/aurix";
import { ACCENTS } from "../theme";
import { InlineError, SectionHeader } from "../ui";

interface WorkspaceSettingsProps {
  settings: AppSettings;
  owner: OwnerProfile;
  accentId: string;
  onAccentChange: (id: string) => void;
  onUpdateSettings: (settings: AppSettings) => Promise<void>;
  onSaveOwner: (owner: OwnerProfile) => Promise<void>;
  onNavigate: (id: string) => void;
}

export function WorkspaceSettings({ settings, owner, accentId, onAccentChange, onUpdateSettings, onSaveOwner, onNavigate }: WorkspaceSettingsProps) {
  const [draft, setDraft] = useState(settings);
  const [profile, setProfile] = useState(owner);
  const [saving, setSaving] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setDraft(settings), [settings]);
  useEffect(() => setProfile(owner), [owner]);

  const save = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await onUpdateSettings(draft);
      setMessage("Workspace preferences saved.");
    } catch {
      setError("Preferences could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setError(null);
    setMessage(null);
    try {
      await onSaveOwner({ ...profile, updatedAt: new Date().toISOString() });
      setMessage("Owner profile saved and will be used in future AI context.");
    } catch {
      setError("The owner profile could not be saved.");
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <div className="space-y-4">
      <SectionHeader
        eyebrow="Settings"
        title="Make the workspace yours."
        description="Appearance, profile, AI, voice and notification preferences are saved to the local settings store and applied immediately."
        actions={
          <button type="button" className="ws-btn ws-btn-primary" onClick={() => void save()} disabled={saving}>
            <Save className="h-4 w-4" /> {saving ? "Saving..." : "Save preferences"}
          </button>
        }
      />

      {(message || error) && (
        <div className="ws-card p-3">
          {message && <p className="flex items-center gap-1.5 text-[11px] text-[var(--ws-accent)]"><Check className="h-3.5 w-3.5" /> {message}</p>}
          {error && <InlineError message={error} />}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="ws-card p-4">
          <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-[var(--ws-text)]">
            <Palette className="h-3.5 w-3.5 text-[var(--ws-accent)]" /> Appearance
          </h3>
          <div className="flex gap-2">
            <button
              type="button"
              className={`ws-btn flex-1 ${draft.theme === "dark" ? "ws-btn-primary" : ""}`}
              onClick={() => setDraft({ ...draft, theme: "dark" })}
            >
              <Moon className="h-4 w-4" /> Dark
            </button>
            <button
              type="button"
              className={`ws-btn flex-1 ${draft.theme === "light" ? "ws-btn-primary" : ""}`}
              onClick={() => setDraft({ ...draft, theme: "light" })}
            >
              <Sun className="h-4 w-4" /> Light
            </button>
          </div>
          <div className="mt-3">
            <div className="mb-1.5 text-[10px] text-[var(--ws-muted)]">Accent</div>
            <div className="flex flex-wrap gap-2">
              {ACCENTS.map((accent) => (
                <button
                  key={accent.id}
                  type="button"
                  onClick={() => onAccentChange(accent.id)}
                  className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10.5px] transition-colors ${
                    accentId === accent.id ? "border-[var(--ws-border-strong)] bg-[var(--ws-surface-2)] text-[var(--ws-text)]" : "border-transparent text-[var(--ws-muted)] hover:bg-[var(--ws-surface-2)]"
                  }`}
                >
                  <span className="h-3 w-3 rounded-full" style={{ background: `linear-gradient(135deg, ${accent.accent}, ${accent.accent2})` }} />
                  {accent.label}
                </button>
              ))}
            </div>
          </div>
          <label className="mt-3 flex items-center gap-2 text-[10.5px] text-[var(--ws-muted)]">
            <input type="checkbox" checked={draft.lightweightAnimations} onChange={(e) => setDraft({ ...draft, lightweightAnimations: e.target.checked })} className="accent-[var(--ws-accent)]" />
            Reduce motion and animation intensity
          </label>
        </div>

        <form onSubmit={saveProfile} className="ws-card space-y-2.5 p-4">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-[var(--ws-text)]">
            <User className="h-3.5 w-3.5 text-[var(--ws-accent)]" /> Owner profile
          </h3>
          <label className="block text-[10px] text-[var(--ws-muted)]">
            Name
            <input className="ws-input mt-1" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-[10px] text-[var(--ws-muted)]">
              Role
              <input className="ws-input mt-1" value={profile.role} onChange={(e) => setProfile({ ...profile, role: e.target.value })} />
            </label>
            <label className="block text-[10px] text-[var(--ws-muted)]">
              Company
              <input className="ws-input mt-1" value={profile.company} onChange={(e) => setProfile({ ...profile, company: e.target.value })} />
            </label>
          </div>
          <label className="block text-[10px] text-[var(--ws-muted)]">
            Preferences used by AURIX
            <textarea className="ws-input mt-1 min-h-[64px]" value={profile.preferences} onChange={(e) => setProfile({ ...profile, preferences: e.target.value })} />
          </label>
          <button type="submit" className="ws-btn w-full" disabled={savingProfile}>
            {savingProfile ? "Saving..." : "Save owner profile"}
          </button>
        </form>

        <div className="ws-card p-4">
          <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-[var(--ws-text)]">
            <Bot className="h-3.5 w-3.5 text-[var(--ws-accent)]" /> AI defaults
          </h3>
          <label className="block text-[10px] text-[var(--ws-muted)]">
            Active model
            <select className="ws-input mt-1" value={draft.activeModel} onChange={(e) => setDraft({ ...draft, activeModel: e.target.value as AppSettings["activeModel"] })}>
              <option value="gemini-4-hydrogen">Gemini 4 Hydrogen</option>
              <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite</option>
            </select>
          </label>
          <label className="mt-2 block text-[10px] text-[var(--ws-muted)]">
            Reasoning depth
            <select className="ws-input mt-1" value={draft.thinkingLevel} onChange={(e) => setDraft({ ...draft, thinkingLevel: e.target.value as AppSettings["thinkingLevel"] })}>
              <option value="LOW">LOW</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="HIGH">HIGH</option>
              <option value="XHIGH">XHIGH</option>
            </select>
          </label>
          <label className="mt-2 flex items-center gap-2 text-[10.5px] text-[var(--ws-muted)]">
            <input type="checkbox" checked={draft.offlineModeForced} onChange={(e) => setDraft({ ...draft, offlineModeForced: e.target.checked })} className="accent-[var(--ws-accent)]" />
            Force offline mode
          </label>
          <button type="button" className="ws-btn mt-3 w-full !text-[10.5px]" onClick={() => onNavigate("models")}>
            Open model management
          </button>
        </div>

        <div className="ws-card p-4">
          <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-[var(--ws-text)]">
            <Volume2 className="h-3.5 w-3.5 text-[var(--ws-accent)]" /> Voice
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-[10px] text-[var(--ws-muted)]">
              Language
              <select className="ws-input mt-1" value={draft.language} onChange={(e) => setDraft({ ...draft, language: e.target.value as AppSettings["language"], greetingLanguage: e.target.value as AppSettings["language"] })}>
                <option value="English">English</option>
                <option value="Urdu">Urdu</option>
                <option value="Hindi">Hindi</option>
              </select>
            </label>
            <label className="block text-[10px] text-[var(--ws-muted)]">
              Male voice
              <select className="ws-input mt-1" value={draft.voiceName} onChange={(e) => setDraft({ ...draft, voiceName: e.target.value as AppSettings["voiceName"] })}>
                <option value="Charon">Charon</option>
                <option value="Fenrir">Fenrir</option>
                <option value="Puck">Puck</option>
              </select>
            </label>
          </div>
          <label className="mt-2 block text-[10px] text-[var(--ws-muted)]">
            Wake phrase
            <input className="ws-input mt-1" value={draft.wakePhrase} onChange={(e) => setDraft({ ...draft, wakePhrase: e.target.value })} />
          </label>
          <label className="mt-2 flex items-center gap-2 text-[10.5px] text-[var(--ws-muted)]">
            <input type="checkbox" checked={draft.voiceEnabled} onChange={(e) => setDraft({ ...draft, voiceEnabled: e.target.checked })} className="accent-[var(--ws-accent)]" />
            Voice output enabled
          </label>
          <label className="mt-1 flex items-center gap-2 text-[10.5px] text-[var(--ws-muted)]">
            <input type="checkbox" checked={draft.micEnabled} onChange={(e) => setDraft({ ...draft, micEnabled: e.target.checked })} className="accent-[var(--ws-accent)]" />
            Microphone input enabled
          </label>
        </div>

        <div className="ws-card p-4 xl:col-span-2">
          <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-[var(--ws-text)]">
            <Bell className="h-3.5 w-3.5 text-[var(--ws-accent)]" /> Notifications, startup & privacy
          </h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              { key: "notificationsEnabled", label: "In-app notifications" },
              { key: "autoVoiceGreetingEnabled", label: "Speak a greeting when AURIX starts" },
              { key: "startupAnimationEnabled", label: "Play the startup animation" },
              { key: "autoLockEnabled", label: "Auto-lock the session after inactivity" },
              { key: "proactiveTalkEnabled", label: "Allow proactive companion remarks" },
              { key: "handsFreeVadEnabled", label: "Hands-free voice detection" },
            ].map((row) => (
              <label key={row.key} className="flex items-center gap-2 rounded-lg border border-[var(--ws-border)] px-2.5 py-2 text-[10.5px] text-[var(--ws-muted)]">
                <input
                  type="checkbox"
                  checked={Boolean(draft[row.key as keyof AppSettings])}
                  onChange={(e) => setDraft({ ...draft, [row.key]: e.target.checked })}
                  className="accent-[var(--ws-accent)]"
                />
                {row.label}
              </label>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="ws-btn" onClick={() => onNavigate("security")}>
              <Settings className="h-3.5 w-3.5" /> Security policy
            </button>
            <button type="button" className="ws-btn" onClick={() => onNavigate("legacy-settings")}>
              Advanced settings
            </button>
            <button type="button" className="ws-btn" onClick={() => onNavigate("help")}>
              Help & limitations
            </button>
          </div>
          <p className="mt-2 text-[9.5px] leading-relaxed text-[var(--ws-muted)]">
            Settings are stored in the local SQLite key-value store. Theme and accent are applied instantly and persist across reloads.
          </p>
        </div>
      </div>
    </div>
  );
}
