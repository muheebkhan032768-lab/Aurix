import React, { useCallback, useEffect, useState } from "react";
import { Keyboard, RotateCcw } from "lucide-react";
import type { VoiceShortcuts } from "../types/aurix";
import {
  DEFAULT_VOICE_SHORTCUTS,
  SHORTCUT_LABELS,
  comboFromEvent,
  formatShortcut,
  isModifierOnly,
} from "../utils/shortcuts";

interface VoiceShortcutSettingsProps {
  shortcuts: VoiceShortcuts;
  onChange: (next: VoiceShortcuts) => void;
}

/** Lets the user re-bind each voice shortcut by pressing the new key combination. */
export function VoiceShortcutSettings({ shortcuts, onChange }: VoiceShortcutSettingsProps) {
  const [capturing, setCapturing] = useState<keyof VoiceShortcuts | null>(null);

  const capture = useCallback(
    (event: KeyboardEvent) => {
      if (!capturing) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        setCapturing(null);
        return;
      }
      if (isModifierOnly(event)) return;
      onChange({ ...shortcuts, [capturing]: comboFromEvent(event) });
      setCapturing(null);
    },
    [capturing, onChange, shortcuts]
  );

  useEffect(() => {
    if (!capturing) return;
    // Capture phase keeps the voice hotkeys from firing while binding a key.
    window.addEventListener("keydown", capture, true);
    return () => window.removeEventListener("keydown", capture, true);
  }, [capturing, capture]);

  return (
    <div className="space-y-1.5" data-testid="voice-shortcuts">
      {(Object.keys(SHORTCUT_LABELS) as Array<keyof VoiceShortcuts>).map((key) => (
        <div key={key} className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-[#64748B] dark:text-slate-400">{SHORTCUT_LABELS[key]}</span>
          <button
            type="button"
            onClick={() => setCapturing(key)}
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-mono cursor-pointer ${
              capturing === key
                ? "border-[#06B6D4] bg-cyan-50 dark:bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 animate-pulse"
                : "border-slate-300 dark:border-slate-700 text-[#202938] dark:text-slate-200 hover:border-[#10B981]"
            }`}
          >
            <Keyboard className="w-3 h-3" />
            {capturing === key ? "Press keys…" : formatShortcut(shortcuts[key])}
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange({ ...DEFAULT_VOICE_SHORTCUTS })}
        className="mt-1 inline-flex items-center gap-1 text-[10px] text-[#64748B] hover:text-[#10B981] cursor-pointer"
      >
        <RotateCcw className="w-3 h-3" />
        Reset to defaults
      </button>
    </div>
  );
}
