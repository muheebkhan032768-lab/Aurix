import type { VoiceShortcuts } from "../types/aurix";

export const DEFAULT_VOICE_SHORTCUTS: VoiceShortcuts = {
  pushToTalk: "Space",
  cancel: "Escape",
  continuous: "Control+Space",
  activate: "Control+Shift+Space",
  mute: "Control+M",
};

export const SHORTCUT_LABELS: Record<keyof VoiceShortcuts, string> = {
  pushToTalk: "Microphone toggle (press to start, press again to send)",
  cancel: "Cancel recording / stop speech",
  continuous: "Toggle continuous listening",
  activate: "Activate voice assistant",
  mute: "Mute or unmute DEX MADE voice",
};

const MODIFIER_KEYS = ["Control", "Shift", "Alt", "Meta", "OS"];

function keyName(event: KeyboardEvent): string {
  if (event.code === "Space" || event.key === " ") return "Space";
  if (event.key.length === 1) return event.key.toUpperCase();
  return event.key;
}

export function comboFromEvent(event: KeyboardEvent): string {
  const parts: string[] = [];
  if (event.ctrlKey) parts.push("Control");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  if (event.metaKey) parts.push("Meta");
  parts.push(keyName(event));
  return parts.join("+");
}

export function isModifierOnly(event: KeyboardEvent): boolean {
  return MODIFIER_KEYS.includes(event.key);
}

export function matchesShortcut(event: KeyboardEvent, combo: string | undefined): boolean {
  if (!combo || isModifierOnly(event)) return false;
  return comboFromEvent(event) === combo;
}

export function formatShortcut(combo: string): string {
  return combo.replace(/Control/g, "Ctrl").replace(/\+/g, " + ");
}
