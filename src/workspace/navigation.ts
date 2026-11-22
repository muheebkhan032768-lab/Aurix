import type { AurixSectionId } from "../types/aurix";

let handler: ((moduleId: string) => void) | null = null;

export function registerWorkspaceNavigate(fn: ((moduleId: string) => void) | null): void {
  handler = fn;
}

export function workspaceNavigate(moduleId: string): void {
  handler?.(moduleId);
}

/** Maps an original AURIX section to its module in the unified workspace. */
export function legacyToWorkspaceModule(section: AurixSectionId): string {
  switch (section) {
    case "home":
      return "command-center";
    case "chat":
      return "ai-workspace";
    case "voice":
      return "voice";
    case "projects":
      return "projects";
    case "productivity":
      return "tasks";
    case "memory":
      return "memory";
    case "security":
      return "security";
    case "automation":
      return "automation";
    case "models":
      return "models";
    case "settings":
      return "settings";
    default:
      return `legacy-${section}`;
  }
}
