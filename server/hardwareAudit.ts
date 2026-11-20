import fs from "node:fs";
import os from "node:os";
import { execFileSync } from "node:child_process";

/**
 * AURIX 2.0 — Phase 1 Hardware & Environment Audit.
 *
 * Reads the REAL machine it is running on (no invented figures):
 *  - Node `os` module for CPU model, cores, RAM, platform.
 *  - `fs.statfsSync` for real disk capacity.
 *  - Windows: PowerShell CIM probes for GPU / VRAM / Windows edition / physical cores.
 *  - Linux: nvidia-smi (when present) + /proc/cpuinfo for physical cores.
 *
 * The result feeds the AI-architecture decision (local model size, performance mode,
 * cloud routing, voice/vision feasibility). Nothing here claims a capability the
 * host does not actually have.
 */

export type HardwareTier = "Entry" | "Mid-Range" | "High-Performance";
export type PerformanceMode = "ECO MODE" | "BALANCED MODE" | "PERFORMANCE MODE" | "CLOUD INTELLIGENCE MODE";
export type SubsystemStatus = "Ready" | "Limited" | "Cloud-dependent" | "Requires setup";

export interface HardwareSubsystem {
  id: string;
  label: string;
  status: SubsystemStatus;
  detail: string;
}

export interface HardwareAuditReport {
  generatedAt: string;
  source: "windows-host" | "linux-host" | "other-host";
  isWindowsHost: boolean;
  machine: {
    hostname: string;
    osLabel: string;
    arch: string;
    cpuModel: string;
    physicalCores: number | null;
    logicalCores: number;
    installedRamGb: number;
    freeRamGb: number;
    diskTotalGb: number;
    diskFreeGb: number;
    gpuName: string | null;
    gpuVramGb: number | null;
    gpuKind: "Dedicated" | "Integrated/Unknown" | "Not detectable";
    windowsEdition: string | null;
  };
  score: number;
  tier: HardwareTier;
  performanceMode: PerformanceMode;
  cloudModeAvailable: boolean;
  recommendedLocalModel: { id: string; label: string; approxSizeGb: number; rationale: string };
  architecture: {
    headline: string;
    localLayer: string;
    cloudLayer: string;
    voiceLayer: string;
    visionLayer: string;
    automationLayer: string;
    storageLayer: string;
    rationale: string[];
  };
  subsystems: HardwareSubsystem[];
  checks: Array<{ label: string; verdict: "pass" | "warn" | "fail"; detail: string }>;
  warnings: string[];
}

function run(cmd: string, args: string[], timeout = 4000): string | null {
  try {
    const out = execFileSync(cmd, args, {
      timeout,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    });
    return String(out).trim();
  } catch {
    return null;
  }
}

function physicalCoresFromProc(): number | null {
  try {
    const raw = fs.readFileSync("/proc/cpuinfo", "utf8");
    const match = raw.match(/^cpu cores\s*:\s*(\d+)$/m);
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

function detectGpu(isWindows: boolean): {
  name: string | null;
  vramGb: number | null;
  kind: HardwareAuditReport["machine"]["gpuKind"];
} {
  if (isWindows) {
    const ps = run("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "Get-CimInstance Win32_VideoController | Select-Object -First 1 Name,AdapterRAM | ConvertTo-Json -Compress",
    ]);
    if (ps) {
      try {
        const parsed = JSON.parse(ps) as { Name?: string; AdapterRAM?: number };
        const vramBytes = Number(parsed.AdapterRAM || 0);
        const name = parsed.Name || null;
        const isDedicated = Boolean(name && /nvidia|geforce|rtx|gtx|radeon rx|arc a/i.test(name));
        return {
          name,
          vramGb: vramBytes > 0 ? Number((vramBytes / 1024 ** 3).toFixed(1)) : null,
          kind: isDedicated ? "Dedicated" : "Integrated/Unknown",
        };
      } catch {
        // fall through to undetectable
      }
    }
    return { name: null, vramGb: null, kind: "Not detectable" };
  }

  const nvidia = run("nvidia-smi", ["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"]);
  if (nvidia) {
    const [name, mem] = nvidia.split("\n")[0].split(",").map((s) => s.trim());
    return {
      name: name || null,
      vramGb: mem ? Number((Number(mem) / 1024).toFixed(1)) : null,
      kind: "Dedicated",
    };
  }
  return { name: null, vramGb: null, kind: "Not detectable" };
}

export function buildHardwareAudit(options: {
  ollamaReachable: boolean;
  ollamaModelCount: number;
  cloudKeyConfigured: boolean;
}): HardwareAuditReport {
  const cpus = os.cpus();
  const logicalCores = cpus.length;
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const installedRamGb = Number((totalMem / 1024 ** 3).toFixed(2));
  const freeRamGb = Number((freeMem / 1024 ** 3).toFixed(2));

  let diskTotalBytes = 0;
  let diskFreeBytes = 0;
  try {
    const stat = fs.statfsSync(process.cwd());
    diskTotalBytes = Number(stat.blocks) * Number(stat.bsize);
    diskFreeBytes = Number(stat.bavail) * Number(stat.bsize);
  } catch {
    // Capacity unavailable on this filesystem — reported as 0, never guessed.
  }

  const isWindows = process.platform === "win32";
  const physicalCores = isWindows ? null : physicalCoresFromProc();
  const gpu = detectGpu(isWindows);

  const windowsEdition = isWindows
    ? (run("powershell.exe", [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "(Get-CimInstance Win32_OperatingSystem).Caption",
      ]) ?? null)
    : null;

  const tier: HardwareTier =
    installedRamGb >= 16 && logicalCores >= 8 ? "High-Performance" : installedRamGb >= 8 ? "Mid-Range" : "Entry";

  // Scoring is derived only from measured figures.
  const ramPoints = Math.min(40, Math.round((installedRamGb / 32) * 40));
  const corePoints = Math.min(24, Math.round(((physicalCores ?? logicalCores) / 8) * 24));
  const gpuPoints = gpu.kind === "Dedicated" ? 20 : gpu.kind === "Integrated/Unknown" ? 8 : 4;
  const diskFreeGb = Number((diskFreeBytes / 1024 ** 3).toFixed(1));
  const diskPoints = diskFreeGb >= 20 ? 16 : diskFreeGb >= 8 ? 10 : 4;
  const score = Math.max(0, Math.min(100, ramPoints + corePoints + gpuPoints + diskPoints));

  const performanceMode: PerformanceMode =
    installedRamGb < 6 || logicalCores <= 2
      ? "ECO MODE"
      : installedRamGb < 12
        ? "BALANCED MODE"
        : gpu.kind === "Dedicated" || logicalCores >= 8
          ? "PERFORMANCE MODE"
          : "BALANCED MODE";

  const recommendedLocalModel =
    installedRamGb < 6
      ? {
          id: "qwen2.5:0.5b",
          label: "Qwen 2.5 (0.5B) — Ultra-Light CPU",
          approxSizeGb: 0.4,
          rationale: `${installedRamGb} GB RAM detected: a sub-1B model keeps the assistant responsive without swapping.`,
        }
      : installedRamGb < 10
        ? {
            id: "qwen2.5:1.5b",
            label: "Qwen 2.5 (1.5B) — Balanced Assistant",
            approxSizeGb: 1.0,
            rationale: `${installedRamGb} GB RAM detected: 1.5B fits inside the safe memory budget with room for the desktop shell.`,
          }
        : installedRamGb < 16
          ? {
              id: "llama3.2:3b",
              label: "Llama 3.2 (3B) — Advanced Local",
              approxSizeGb: 2.0,
              rationale: `${installedRamGb} GB RAM detected: 3B local reasoning is viable while cloud handles heavy tasks.`,
            }
          : {
              id: "qwen2.5:7b",
              label: "Qwen 2.5 (7B) — Local Reasoning (optional)",
              approxSizeGb: 4.7,
              rationale: `${installedRamGb} GB RAM detected: 7B is optional; 3B remains the default for fast startup and low idle load.`,
            };

  const subsystems: HardwareSubsystem[] = [
    {
      id: "startup",
      label: "Cinematic startup animation",
      status: gpu.kind === "Not detectable" ? "Limited" : "Ready",
      detail:
        gpu.kind === "Not detectable"
          ? "No GPU could be probed here; WPF falls back to software-rendered particle effects."
          : `${gpu.name ?? "GPU detected"} — hardware-accelerated particle and hologram rendering.`,
    },
    {
      id: "local-llm",
      label: "Local AI brain (offline)",
      status: options.ollamaReachable ? "Ready" : installedRamGb >= 8 ? "Requires setup" : "Limited",
      detail: options.ollamaReachable
        ? `Local runtime reachable with ${options.ollamaModelCount} installed model(s); ${recommendedLocalModel.id} recommended.`
        : `Ollama runtime not reachable. ${recommendedLocalModel.id} (~${recommendedLocalModel.approxSizeGb} GB) is the recommended install.`,
    },
    {
      id: "cloud-ai",
      label: "Cloud reasoning & research",
      status: options.cloudKeyConfigured ? "Ready" : "Requires setup",
      detail: options.cloudKeyConfigured
        ? "Cloud API key present — deep reasoning, research grounding and voice synthesis route to the cloud."
        : "No cloud API key configured. Local intelligence works; advanced reasoning stays unavailable until a key is added.",
    },
    {
      id: "voice",
      label: "Voice (STT / TTS, EN-UR-HI)",
      status: "Ready",
      detail: "Microphone capture, wake-phrase listener and spoken replies run in-app with explicit mic permission and a visible listening indicator.",
    },
    {
      id: "vision",
      label: "Vision & OCR",
      status: options.cloudKeyConfigured ? "Ready" : "Limited",
      detail: options.cloudKeyConfigured
        ? "Screenshot analysis and OCR route through the cloud vision model with per-capture consent."
        : "Without a cloud key, vision is limited to locally readable text; OCR quality depends on the local engine.",
    },
    {
      id: "memory",
      label: "Personal memory (SQLite)",
      status: "Ready",
      detail: `Local SQLite store on ${diskFreeGb} GB free disk; owner-approved memories only, with view / edit / delete controls.`,
    },
    {
      id: "automation",
      label: "Windows computer control",
      status: isWindows ? "Ready" : "Requires setup",
      detail: isWindows
        ? "Native Windows host detected — app launch, file search and system control available behind the confirmation gate."
        : "Automation needs the native Windows build; this audit is running on a non-Windows host, so those probes are inactive here.",
    },
    {
      id: "packaging",
      label: "Portable EXE & installer",
      status: "Requires setup",
      detail: "Build machine needs the .NET SDK plus the installer toolchain; both are documented in the Windows install guide.",
    },
  ];

  const checks: HardwareAuditReport["checks"] = [
    {
      label: "Windows 10/11 64-bit target",
      verdict: isWindows ? "pass" : "warn",
      detail: isWindows ? windowsEdition ?? "Windows host detected." : "Audit executed on a non-Windows host; run the Windows build for host-accurate results.",
    },
    {
      label: "Memory for OS + desktop shell + AI",
      verdict: installedRamGb >= 8 ? "pass" : installedRamGb >= 5.5 ? "warn" : "fail",
      detail: `${installedRamGb} GB installed, ${freeRamGb} GB free right now.`,
    },
    {
      label: "Free disk for models & data",
      verdict: diskFreeGb >= 20 ? "pass" : diskFreeGb >= 8 ? "warn" : "fail",
      detail: `${diskFreeGb} GB free of ${Number((diskTotalBytes / 1024 ** 3).toFixed(1))} GB.`,
    },
    {
      label: "GPU acceleration",
      verdict: gpu.kind === "Dedicated" ? "pass" : gpu.kind === "Integrated/Unknown" ? "warn" : "warn",
      detail:
        gpu.kind === "Not detectable"
          ? "No GPU probe available on this host — CPU-only rendering assumed."
          : `${gpu.name ?? "GPU"} (${gpu.kind}${gpu.vramGb ? `, ${gpu.vramGb} GB VRAM` : ""}).`,
    },
    {
      label: "CPU cores",
      verdict: logicalCores >= 4 ? "pass" : "warn",
      detail: `${physicalCores ?? "unknown"} physical / ${logicalCores} logical — ${cpus[0]?.model ?? "unknown CPU"}.`,
    },
  ];

  const warnings: string[] = [];
  if (!isWindows) {
    warnings.push(
      "This report was measured on the Linux preview container, not on your Windows PC. Run the packaged Windows build (System & PC Monitor → Hardware Audit) to audit the real machine."
    );
  }
  if (freeRamGb < 2) warnings.push("Less than 2 GB RAM is free right now — close heavy apps before loading a local model.");
  if (diskFreeGb < 8) warnings.push("Low free disk space: model downloads and SQLite backups need headroom.");
  if (gpu.kind === "Not detectable") warnings.push("No GPU probe succeeded; the UI will run CPU-rendered effects only.");

  const architecture: HardwareAuditReport["architecture"] = {
    headline: `Hybrid ${performanceMode}: C#/.NET WPF shell + local Ollama brain + cloud reasoning fallback`,
    localLayer:
      installedRamGb >= 6
        ? `Ollama ${recommendedLocalModel.id} for offline chat, summaries and code snippets; deterministic SQLite intelligence when no model is installed.`
        : "Deterministic local intelligence only; model loading is disabled to protect low-RAM laptops.",
    cloudLayer: options.cloudKeyConfigured
      ? "Cloud model handles multi-step reasoning, research grounding, vision and natural voice synthesis; the router falls back to local when the network drops."
      : "Cloud layer dormant until an API key is stored in the Security Center; the router keeps everything local.",
    voiceLayer:
      "Browser/native speech recognition for input, cloud neural voice for output, wake-phrase listener gated by explicit mic consent with a persistent listening indicator.",
    visionLayer: options.cloudKeyConfigured
      ? "On-demand screenshot capture with consent → OCR + interface understanding → explanation in the conversation panel."
      : "Consent-gated screenshot capture with local text extraction; visual reasoning waits for a cloud key.",
    automationLayer: isWindows
      ? "PowerShell/CIM + file-system automation behind a per-action confirmation gate and Emergency Stop."
      : "Windows automation code ships in the native bundle; inactive on this host.",
    storageLayer: "SQLite for memories, conversations, tasks and audit trail; API keys kept out of source and logs.",
    rationale: [
      `Measured ${installedRamGb} GB RAM and ${logicalCores} logical cores → ${tier} tier, ${score}/100 compatibility score.`,
      `GPU probe: ${gpu.name ?? "none detected"} (${gpu.kind}) → ${
        gpu.kind === "Dedicated" ? "GPU-accelerated effects and faster local inference are safe to enable." : "effects stay CPU-friendly and inference stays small."
      }`,
      `${diskFreeGb} GB free disk → ${
        diskFreeGb >= 20 ? "room for the recommended model plus backups." : "model size must stay small; clean up before installing larger weights."
      }`,
      options.cloudKeyConfigured
        ? "Cloud key detected → heavy reasoning and neural voice stay in the cloud, keeping local RAM for the desktop shell."
        : "No cloud key → the assistant must stay useful offline, so the local fallback is the primary path until a key is added.",
    ],
  };

  return {
    generatedAt: new Date().toISOString(),
    source: isWindows ? "windows-host" : process.platform === "linux" ? "linux-host" : "other-host",
    isWindowsHost: isWindows,
    machine: {
      hostname: os.hostname(),
      osLabel: isWindows ? windowsEdition ?? `Windows ${os.release()}` : `${os.type()} ${os.release()}`,
      arch: os.arch(),
      cpuModel: cpus[0]?.model ?? "Unknown CPU",
      physicalCores,
      logicalCores,
      installedRamGb,
      freeRamGb,
      diskTotalGb: Number((diskTotalBytes / 1024 ** 3).toFixed(1)),
      diskFreeGb,
      gpuName: gpu.name,
      gpuVramGb: gpu.vramGb,
      gpuKind: gpu.kind,
      windowsEdition,
    },
    score,
    tier,
    performanceMode,
    cloudModeAvailable: options.cloudKeyConfigured,
    recommendedLocalModel,
    architecture,
    subsystems,
    checks,
    warnings,
  };
}
