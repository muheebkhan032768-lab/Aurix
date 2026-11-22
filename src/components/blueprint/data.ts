export interface CoreNode {
  label: string;
  detail: string;
}

export interface OrthoViewSpec {
  id: "front" | "side" | "top";
  label: string;
  meta: string;
}

export interface FlowStep {
  index: string;
  label: string;
  detail: string;
}

export interface ExplodedPart {
  index: string;
  name: string;
  detail: string;
}

export interface BlueprintModule {
  name: string;
  description: string;
  type: string;
}

export const ORTHO_VIEWS: OrthoViewSpec[] = [
  { id: "front", label: "Front view", meta: "X · 0°" },
  { id: "side", label: "Side view", meta: "Y · 90°" },
  { id: "top", label: "Top view", meta: "Z · 90°" },
];

export const CORE_NODES: CoreNode[] = [
  { label: "AI nodes", detail: "routing fabric" },
  { label: "Data ring", detail: "context bus" },
  { label: "Algorithms", detail: "reasoning set" },
  { label: "Memory storage bank", detail: "sqlite recall" },
  { label: "System security interface", detail: "pin + audit" },
  { label: "Output display array", detail: "voice + ui" },
  { label: "Agents tool bus", detail: "tool routing" },
];

export const FLOW_STEPS: FlowStep[] = [
  { index: "01", label: "User input", detail: "voice · text · gesture" },
  { index: "02", label: "Interface", detail: "command hub" },
  { index: "03", label: "Recognition", detail: "voice / gesture parse" },
  { index: "04", label: "Brain", detail: "cognition engine" },
  { index: "05", label: "Memory · agents · tools", detail: "context + execution" },
  { index: "06", label: "Computer", detail: "desktop automation" },
  { index: "07", label: "Output", detail: "display · speech" },
];

export const EXPLODED_PARTS: ExplodedPart[] = [
  { index: "01", name: "Voice", detail: "mic + gesture array" },
  { index: "02", name: "Brain", detail: "cognition core" },
  { index: "03", name: "Agents", detail: "tool routing" },
  { index: "04", name: "Computer", detail: "execution bridge" },
  { index: "05", name: "Tools", detail: "rotational stations" },
  { index: "06", name: "Security", detail: "pin + audit" },
  { index: "07", name: "Interface", detail: "assistant shell" },
];

export const BLUEPRINT_MODULES: BlueprintModule[] = [
  {
    name: "Brain",
    description: "Cognition engine for planning, reasoning and intent routing.",
    type: "Core",
  },
  {
    name: "Voice",
    description: "Voice and gesture recognition with speech synthesis.",
    type: "Sensor",
  },
  {
    name: "Memory",
    description: "SQLite memory bank with recall and self-heal backups.",
    type: "Storage",
  },
  {
    name: "Agents",
    description: "Agent orchestration and tool-access routing.",
    type: "Agents",
  },
  {
    name: "Computer",
    description: "Desktop execution bridge with approval gates.",
    type: "Exec",
  },
  {
    name: "Tools",
    description: "Rotational tool stations and component tracker.",
    type: "Tools",
  },
  {
    name: "Security",
    description: "PIN gate, audit trail and 12-step self-healer.",
    type: "Guard",
  },
  {
    name: "Interface",
    description: "Personal assistant surface for Abdul Muheeb.",
    type: "UI",
  },
];
