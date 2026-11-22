export interface AccentPreset {
  id: string;
  label: string;
  accent: string;
  accent2: string;
  ink: string;
}

export const ACCENTS: AccentPreset[] = [
  { id: "emerald", label: "Emerald", accent: "#20C997", accent2: "#42D9E8", ink: "#04120d" },
  { id: "cyan", label: "Cyan", accent: "#42D9E8", accent2: "#20C997", ink: "#04121a" },
  { id: "violet", label: "Violet", accent: "#8B7CF6", accent2: "#42D9E8", ink: "#0d0820" },
  { id: "gold", label: "Gold", accent: "#D6AD60", accent2: "#42D9E8", ink: "#1a1204" },
  { id: "rose", label: "Rose", accent: "#F0729B", accent2: "#8B7CF6", ink: "#1c0610" },
];

const STORAGE_KEY = "aurix_workspace_accent";

export function getStoredAccent(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && ACCENTS.some((a) => a.id === stored)) return stored;
  } catch {
    /* storage unavailable */
  }
  return "emerald";
}

export function applyAccent(accentId: string): void {
  const preset = ACCENTS.find((a) => a.id === accentId) || ACCENTS[0];
  const root = document.documentElement;
  root.style.setProperty("--ws-accent", preset.accent);
  root.style.setProperty("--ws-accent-2", preset.accent2);
  root.style.setProperty("--ws-accent-ink", preset.ink);
  try {
    localStorage.setItem(STORAGE_KEY, preset.id);
  } catch {
    /* storage unavailable */
  }
}

export function accentValue(accentId: string): AccentPreset {
  return ACCENTS.find((a) => a.id === accentId) || ACCENTS[0];
}
