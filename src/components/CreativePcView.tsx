import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Code2,
  Copy,
  Download,
  ExternalLink,
  FileCode2,
  FileText,
  Film,
  FolderPlus,
  Globe,
  Image as ImageIcon,
  Laptop,
  Layout,
  Package,
  Play,
  Save,
  Sparkles,
  Upload,
  Wand2,
} from "lucide-react";
import type { CreativeAsset, WebsiteRecord } from "../types/aurix";

interface WorkspaceFileItem {
  name: string;
  size: number;
  updatedAt: string;
  content: string;
}

interface CreativePcViewProps {
  websites: WebsiteRecord[];
}

type StudioTab = "picture" | "video" | "writing" | "website" | "coding";

export function CreativePcView({ websites }: CreativePcViewProps) {
  // Workspace File Editor State
  const [files, setFiles] = useState<WorkspaceFileItem[]>([]);
  const [activeFileName, setActiveFileName] = useState("notes_muheeb.txt");
  const [fileContent, setFileContent] = useState(
    "AURIX 2.0 Workspace File\nOwner: Abdul Muheeb (AM VEYRONIX)\nStatus: Ready for editing offline or online."
  );
  const [savingFile, setSavingFile] = useState(false);
  const [fileFeedback, setFileFeedback] = useState<string | null>(null);

  // 5-Module Studio State
  const [activeStudio, setActiveStudio] = useState<StudioTab>("picture");
  const [creativePrompt, setCreativePrompt] = useState(
    "Futuristic AM VEYRONIX clean glassmorphism command center with emerald accents"
  );
  const [writingType, setWritingType] = useState("Client Email Proposal");
  const [generating, setGenerating] = useState(false);
  const [asset, setAsset] = useState<CreativeAsset | null>(null);
  const [recordingVideo, setRecordingVideo] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [editableWebsiteHtml, setEditableWebsiteHtml] = useState("");

  // Client Canvas Photo Editor State
  const [uploadedImgUrl, setUploadedImgUrl] = useState<string | null>(null);
  const [imgBrightness, setImgBrightness] = useState(100);
  const [imgContrast, setImgContrast] = useState(100);
  const [imgGrayscale, setImgGrayscale] = useState(0);
  const [imgWidth, setImgWidth] = useState(800);
  const [imgHeight, setImgHeight] = useState(500);

  // Quick Coding Studio State
  const [codeLang, setCodeLang] = useState("TypeScript / React");
  const [codeSnippet, setCodeSnippet] = useState("");
  const [codeInstruction, setCodeInstruction] = useState("Optimize and harden input validation.");
  const [codeResult, setCodeResult] = useState("");
  const [codingBusy, setCodingBusy] = useState(false);

  const videoCanvasRef = useRef<HTMLCanvasElement>(null);
  const editorCanvasRef = useRef<HTMLCanvasElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const loadFiles = useCallback(async () => {
    try {
      const res = await fetch("/api/workspace/files");
      const list = (await res.json()) as WorkspaceFileItem[];
      if (Array.isArray(list)) setFiles(list);
    } catch {
      // Offline resilient
    }
  }, []);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const handleSaveFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeFileName.trim()) return;
    setSavingFile(true);
    setFileFeedback(null);
    try {
      const res = await fetch("/api/workspace/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: activeFileName.trim(), content: fileContent }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || "Could not save file.");
      setFileFeedback(`Saved "${out.name}" to sandbox workspace.`);
      await loadFiles();
    } catch (err) {
      setFileFeedback(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSavingFile(false);
    }
  };

  const handleGenerateCreative = async (e: React.FormEvent, overrideKind?: "picture" | "video" | "prompt" | "writing" | "website") => {
    e.preventDefault();
    if (!creativePrompt.trim() || generating) return;
    const targetKind =
      overrideKind ||
      (activeStudio === "coding" ? "prompt" : activeStudio);
    setGenerating(true);
    try {
      const res = await fetch("/api/creative/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: targetKind,
          prompt: creativePrompt.trim(),
          writingType,
        }),
      });
      const json = (await res.json()) as CreativeAsset;
      setAsset(json);
      if (json.kind === "website" && json.websiteHtml) {
        setEditableWebsiteHtml(json.websiteHtml);
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleRunCodingStudio = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codeInstruction.trim() || codingBusy) return;
    setCodingBusy(true);
    try {
      const res = await fetch("/api/dev/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          languageTarget: codeLang,
          projectScope: "Global",
          taskType: "Explain, Optimize & Harden",
          codeSnippet,
          instruction: codeInstruction,
        }),
      });
      const json = await res.json();
      setCodeResult(json.result || json.error || "No result returned.");
    } finally {
      setCodingBusy(false);
    }
  };

  // Paint Canvas Photo Editor whenever uploaded image or adjustments change
  useEffect(() => {
    if (!uploadedImgUrl) return;
    const canvas = editorCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      canvas.width = Math.max(120, Math.min(2048, imgWidth));
      canvas.height = Math.max(120, Math.min(2048, imgHeight));
      ctx.filter = `brightness(${imgBrightness}%) contrast(${imgContrast}%) grayscale(${imgGrayscale}%)`;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = uploadedImgUrl;
  }, [uploadedImgUrl, imgBrightness, imgContrast, imgGrayscale, imgWidth, imgHeight]);

  const downloadEditedPhoto = () => {
    const canvas = editorCanvasRef.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = "aurix_edited_image.png";
    a.click();
  };

  const downloadSvg = () => {
    if (!asset?.svgMarkup) return;
    const blob = new Blob([asset.svgMarkup], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${asset.title.toLowerCase().replace(/[^a-z0-9]+/g, "_") || "aurix_art"}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPngFromSvg = () => {
    if (!asset?.svgMarkup) return;
    const img = new Image();
    const svgBlob = new Blob([asset.svgMarkup], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0, 1280, 720);
        const pngUrl = canvas.toDataURL("image/png");
        const a = document.createElement("a");
        a.href = pngUrl;
        a.download = `${asset.title.toLowerCase().replace(/[^a-z0-9]+/g, "_") || "aurix_art"}.png`;
        a.click();
      }
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  // Render & Loop Free AI Motion Video Storyboard
  useEffect(() => {
    if (asset?.kind !== "video" || !asset.videoScenes?.length) return;
    const canvas = videoCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = 960;
    canvas.height = 540;
    let raf = 0;
    const scenes = asset.videoScenes;
    const start = performance.now();

    const draw = (now: number) => {
      const elapsed = (now - start) / 1000;
      const totalCycle = scenes.length * 2.5;
      const loopT = elapsed % totalCycle;
      const sceneIdx = Math.floor(loopT / 2.5) % scenes.length;
      const localT = (loopT % 2.5) / 2.5;
      const sc = scenes[sceneIdx];

      const grad = ctx.createLinearGradient(0, 0, 960, 540);
      grad.addColorStop(0, sc.bgTop || "#F8FAFC");
      grad.addColorStop(1, sc.bgBottom || "#E2E8F0");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 960, 540);

      ctx.save();
      ctx.translate(480, 240);
      if (sc.motion === "orbit") {
        for (let r = 65; r <= 185; r += 38) {
          ctx.beginPath();
          ctx.arc(0, 0, r, elapsed + r * 0.01, elapsed + r * 0.01 + Math.PI * 1.35);
          ctx.strokeStyle = sc.accentColor || "#10B981";
          ctx.lineWidth = 3;
          ctx.stroke();
        }
      } else if (sc.motion === "wave") {
        ctx.beginPath();
        for (let x = -380; x <= 380; x += 12) {
          const y = Math.sin(x * 0.02 + elapsed * 4) * 48 + Math.cos(x * 0.01 - elapsed * 2) * 20;
          if (x === -380) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = sc.accentColor || "#06B6D4";
        ctx.lineWidth = 4;
        ctx.stroke();
      } else if (sc.motion === "grid") {
        ctx.strokeStyle = `${sc.accentColor || "#D6AD60"}66`;
        ctx.lineWidth = 1.6;
        for (let gx = -400; gx <= 400; gx += 50) {
          ctx.beginPath();
          ctx.moveTo(gx, -170);
          ctx.lineTo(gx * 1.25, 170);
          ctx.stroke();
        }
      } else {
        const pulseR = 65 + Math.sin(elapsed * 4) * 22;
        ctx.beginPath();
        ctx.arc(0, 0, pulseR, 0, Math.PI * 2);
        ctx.fillStyle = `${sc.accentColor || "#10B981"}33`;
        ctx.fill();
        ctx.strokeStyle = sc.accentColor || "#10B981";
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      ctx.restore();

      ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
      ctx.fillRect(48, 396, 864, 96);
      ctx.strokeStyle = sc.accentColor || "#10B981";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(48, 396, 864, 96);

      ctx.fillStyle = "#10B981";
      ctx.font = "bold 13px monospace";
      ctx.fillText(`AURIX 2.0 · SCENE ${sceneIdx + 1}/${scenes.length} · ${asset.title.toUpperCase()}`, 72, 426);

      ctx.fillStyle = "#202938";
      ctx.font = "600 22px sans-serif";
      ctx.fillText(sc.caption.slice(0, 68), 72, 462);

      ctx.fillStyle = sc.accentColor || "#10B981";
      ctx.fillRect(48, 488, 864 * ((sceneIdx + localT) / scenes.length), 4);

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [asset]);

  const exportWebmVideo = async () => {
    const canvas = videoCanvasRef.current;
    if (!canvas || typeof MediaRecorder === "undefined" || !("captureStream" in canvas)) return;
    setRecordingVideo(true);
    try {
      const stream = canvas.captureStream(30);
      const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunks.push(ev.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${asset?.title.toLowerCase().replace(/[^a-z0-9]+/g, "_") || "aurix_video"}.webm`;
        a.click();
        URL.revokeObjectURL(url);
        setRecordingVideo(false);
      };
      recorder.start();
      window.setTimeout(() => {
        if (recorder.state !== "inactive") recorder.stop();
      }, 6000);
    } catch {
      setRecordingVideo(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Complete AURIX Download + Quick Web Launchers */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F1724] p-5 sm:p-6 space-y-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-mono uppercase tracking-[0.16em] text-[#06B6D4] font-semibold">
              Creative, Website &amp; Windows Desktop Suite
            </div>
            <h1 className="text-xl font-bold text-[#202938] dark:text-white mt-0.5">
              5-Module AI Studio, Launchers &amp; Sandbox File Manager
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a
              href="/api/project/complete-download.zip"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#10B981] hover:bg-emerald-600 text-white font-semibold text-xs whitespace-nowrap"
            >
              <Package className="w-4 h-4" />
              <span>Download Complete AURIX 2.0 Project (.zip)</span>
            </a>
            <a
              href="/api/deliverables/download.zip"
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-[#D6AD60] bg-amber-50 dark:bg-amber-500/10 text-[#9A742E] dark:text-amber-300 font-semibold text-xs whitespace-nowrap"
            >
              <Laptop className="w-4 h-4" />
              <span>Windows Native Scripts Only (.zip)</span>
            </a>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {[
            { label: "Open YouTube", url: "https://www.youtube.com", sub: "Video & Music" },
            { label: "Open Google", url: "https://www.google.com", sub: "Web Search" },
            { label: "Open GitHub", url: "https://github.com", sub: "Repositories" },
            ...websites.map((w) => ({
              label: `Open ${w.name}`,
              url: w.activeDomain?.startsWith("http")
                ? w.activeDomain
                : `https://${w.activeDomain || "example.com"}`,
              sub: w.status.toUpperCase(),
            })),
          ].map((item) => (
            <a
              key={item.label}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl border border-slate-200 dark:border-slate-800 hover:border-[#10B981] bg-[#F8FAFC] dark:bg-[#0B111B] p-3 flex items-center justify-between gap-2 transition-colors"
            >
              <div className="min-w-0">
                <div className="text-xs font-semibold text-[#202938] dark:text-white truncate">{item.label}</div>
                <div className="text-[11px] font-mono text-[#64748B] truncate">{item.sub}</div>
              </div>
              <ExternalLink className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
            </a>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* 2. 5-Module AI Studio */}
        <section className="xl:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F1724] p-5 space-y-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#10B981]" />
              <h2 className="text-sm font-semibold text-[#202938] dark:text-white">
                Zero-Cost AI Creative &amp; Engineering Studio
              </h2>
            </div>

            <div className="inline-flex flex-wrap rounded-xl p-1 bg-[#EEF2F7] dark:bg-[#0B111B] border border-slate-200 dark:border-slate-800 gap-1">
              {(
                [
                  { id: "picture", label: "Image", icon: ImageIcon },
                  { id: "video", label: "Video", icon: Film },
                  { id: "writing", label: "Writing", icon: FileText },
                  { id: "website", label: "Website", icon: Layout },
                  { id: "coding", label: "Coding", icon: Code2 },
                ] as const
              ).map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveStudio(tab.id)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer whitespace-nowrap ${
                      activeStudio === tab.id
                        ? "bg-[#10B981] text-white font-semibold"
                        : "text-[#64748B] dark:text-slate-300 hover:text-[#202938] dark:hover:text-white"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {activeStudio === "coding" ? (
            <form onSubmit={handleRunCodingStudio} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <select
                  value={codeLang}
                  onChange={(e) => setCodeLang(e.target.value)}
                  className="rounded-lg bg-[#F8FAFC] dark:bg-[#0B111B] border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs text-[#202938] dark:text-white"
                >
                  <option>TypeScript / React</option>
                  <option>Python (Desktop &amp; Automation)</option>
                  <option>Node.js / Express</option>
                  <option>HTML / CSS / Tailwind</option>
                </select>
                <input
                  type="text"
                  value={codeInstruction}
                  onChange={(e) => setCodeInstruction(e.target.value)}
                  placeholder="What should AURIX build, fix, or refactor?"
                  className="rounded-lg bg-[#F8FAFC] dark:bg-[#0B111B] border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs text-[#202938] dark:text-white"
                />
              </div>
              <textarea
                rows={4}
                value={codeSnippet}
                onChange={(e) => setCodeSnippet(e.target.value)}
                placeholder="Paste code to inspect or leave blank to scaffold..."
                className="w-full rounded-xl bg-[#F8FAFC] dark:bg-[#0B111B] border border-slate-300 dark:border-slate-700 p-3 font-mono text-xs text-[#202938] dark:text-slate-100"
              />
              <button
                type="submit"
                disabled={codingBusy}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#10B981] hover:bg-emerald-600 text-white text-xs font-semibold cursor-pointer"
              >
                <Code2 className="w-3.5 h-3.5" />
                <span>{codingBusy ? "Analyzing..." : "Generate / Review Code"}</span>
              </button>
              {codeResult && (
                <pre className="p-3.5 rounded-xl bg-slate-900 text-emerald-300 font-mono text-xs whitespace-pre-wrap max-h-64 overflow-y-auto border border-slate-700">
                  {codeResult}
                </pre>
              )}
            </form>
          ) : (
            <>
              <form onSubmit={(e) => handleGenerateCreative(e)} className="space-y-2.5">
                {activeStudio === "writing" && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-[#64748B]">Format:</span>
                    {["Client Email Proposal", "Product Description", "Social Media Post", "Marketing Copy", "Master Prompt"].map((fmt) => (
                      <button
                        key={fmt}
                        type="button"
                        onClick={() => setWritingType(fmt)}
                        className={`px-2.5 py-1 rounded-lg border text-xs cursor-pointer ${
                          writingType === fmt
                            ? "bg-[#10B981]/10 border-[#10B981] text-emerald-700 dark:text-emerald-300 font-semibold"
                            : "bg-[#F8FAFC] dark:bg-[#0B111B] border-slate-200 dark:border-slate-700 text-[#64748B]"
                        }`}
                      >
                        {fmt}
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-2.5">
                  <input
                    type="text"
                    value={creativePrompt}
                    onChange={(e) => setCreativePrompt(e.target.value)}
                    placeholder={`Describe the ${activeStudio} output to create...`}
                    className="flex-1 rounded-xl bg-[#F8FAFC] dark:bg-[#0B111B] border border-slate-300 dark:border-slate-700 px-3.5 py-2.5 text-xs sm:text-sm text-[#202938] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#10B981]"
                  />
                  <button
                    type="submit"
                    disabled={generating || !creativePrompt.trim()}
                    onClick={() => {
                      if (activeStudio === "writing" && writingType === "Master Prompt") {
                        // trigger prompt kind smoothly via form below
                      }
                    }}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#10B981] hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold text-xs cursor-pointer shrink-0 whitespace-nowrap"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>{generating ? "Generating..." : "Generate Free"}</span>
                  </button>
                  {activeStudio === "writing" && (
                    <button
                      type="button"
                      disabled={generating || !creativePrompt.trim()}
                      onClick={(e) => handleGenerateCreative(e, "prompt")}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B111B] text-xs font-medium text-[#202938] dark:text-slate-200 cursor-pointer shrink-0 whitespace-nowrap"
                    >
                      <Wand2 className="w-3.5 h-3.5 text-[#06B6D4]" />
                      <span>Master Prompt</span>
                    </button>
                  )}
                </div>
              </form>

              {asset && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-[#F8FAFC] dark:bg-[#0B111B] p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-semibold text-[#202938] dark:text-white">{asset.title}</div>
                      <div className="text-[11px] font-mono text-[#10B981] uppercase">
                        Engine: {asset.source} · $0 Cost
                      </div>
                    </div>

                    {asset.kind === "picture" && asset.svgMarkup && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={downloadPngFromSvg}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#10B981] hover:bg-emerald-600 text-white font-semibold text-xs cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download PNG</span>
                        </button>
                        <button
                          type="button"
                          onClick={downloadSvg}
                          className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs text-[#202938] dark:text-slate-200 cursor-pointer"
                        >
                          SVG
                        </button>
                      </div>
                    )}

                    {asset.kind === "video" && (
                      <button
                        type="button"
                        disabled={recordingVideo}
                        onClick={exportWebmVideo}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#10B981] hover:bg-emerald-600 disabled:opacity-60 text-white font-semibold text-xs cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>{recordingVideo ? "Recording 6s WebM..." : "Export WebM Video"}</span>
                      </button>
                    )}

                    {(asset.kind === "prompt" || asset.kind === "writing") && (
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(asset.writtenText || asset.engineeredPrompt || "");
                          setCopiedText(true);
                          setTimeout(() => setCopiedText(false), 1800);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#10B981] text-white font-semibold text-xs cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>{copiedText ? "Copied!" : "Copy Text"}</span>
                      </button>
                    )}

                    {asset.kind === "website" && editableWebsiteHtml && (
                      <button
                        type="button"
                        onClick={() => {
                          const blob = new Blob([editableWebsiteHtml], { type: "text/html;charset=utf-8" });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = "aurix_generated_site.html";
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#10B981] text-white font-semibold text-xs cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download HTML5 Site</span>
                      </button>
                    )}
                  </div>

                  {asset.kind === "picture" && asset.svgMarkup && (
                    <div
                      className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-white"
                      dangerouslySetInnerHTML={{ __html: asset.svgMarkup }}
                    />
                  )}

                  {asset.kind === "video" && (
                    <div className="space-y-1.5">
                      <canvas
                        ref={videoCanvasRef}
                        className="w-full aspect-video rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8FAFC]"
                      />
                      <p className="text-[11px] text-[#64748B]">
                        Rendered cleanly using CPU-safe HTML5 Canvas motion storyboard encoder (compatible with Intel HD 3000 / entry-level laptops).
                      </p>
                    </div>
                  )}

                  {(asset.kind === "prompt" || asset.kind === "writing") && (
                    <pre className="p-3.5 rounded-xl bg-white dark:bg-[#0F1724] border border-slate-200 dark:border-slate-700 text-xs text-[#202938] dark:text-slate-100 whitespace-pre-wrap font-sans leading-relaxed">
                      {asset.writtenText || asset.engineeredPrompt}
                    </pre>
                  )}

                  {asset.kind === "website" && (
                    <div className="grid grid-cols-1 gap-3">
                      <iframe
                        title="AURIX Website Preview"
                        sandbox="allow-scripts"
                        srcDoc={editableWebsiteHtml}
                        className="w-full h-72 rounded-xl border border-slate-300 dark:border-slate-700 bg-white"
                      />
                      <textarea
                        rows={5}
                        value={editableWebsiteHtml}
                        onChange={(e) => setEditableWebsiteHtml(e.target.value)}
                        className="w-full rounded-xl bg-slate-900 text-emerald-300 p-3 font-mono text-[11px] border border-slate-700"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Built-In Client Photo Canvas Editor (Always visible in Image Studio) */}
              {activeStudio === "picture" && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-[#F8FAFC] dark:bg-[#0B111B] p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-semibold text-[#202938] dark:text-white">
                        Local Photo Resizer &amp; Filter Canvas Editor
                      </div>
                      <div className="text-[11px] text-[#64748B]">
                        Upload any PNG/JPG to resize, adjust brightness/contrast/grayscale locally, and export PNG.
                      </div>
                    </div>
                    <input
                      ref={imageInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = () => setUploadedImgUrl(String(reader.result || ""));
                        reader.readAsDataURL(file);
                        e.target.value = "";
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => imageInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F1724] text-xs font-medium text-[#202938] dark:text-slate-200 cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5 text-[#06B6D4]" />
                      <span>Upload Photo</span>
                    </button>
                  </div>

                  {uploadedImgUrl && (
                    <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs">
                        <label className="text-[#64748B]">
                          Brightness ({imgBrightness}%)
                          <input
                            type="range"
                            min="40"
                            max="180"
                            value={imgBrightness}
                            onChange={(e) => setImgBrightness(Number(e.target.value))}
                            className="w-full accent-[#10B981]"
                          />
                        </label>
                        <label className="text-[#64748B]">
                          Contrast ({imgContrast}%)
                          <input
                            type="range"
                            min="40"
                            max="180"
                            value={imgContrast}
                            onChange={(e) => setImgContrast(Number(e.target.value))}
                            className="w-full accent-[#10B981]"
                          />
                        </label>
                        <label className="text-[#64748B]">
                          Grayscale ({imgGrayscale}%)
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={imgGrayscale}
                            onChange={(e) => setImgGrayscale(Number(e.target.value))}
                            className="w-full accent-[#10B981]"
                          />
                        </label>
                        <label className="text-[#64748B]">
                          Width (px)
                          <input
                            type="number"
                            min={120}
                            max={2048}
                            value={imgWidth}
                            onChange={(e) => setImgWidth(Number(e.target.value))}
                            className="mt-0.5 w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F1724] px-2 py-1 text-[#202938] dark:text-white"
                          />
                        </label>
                        <label className="text-[#64748B]">
                          Height (px)
                          <input
                            type="number"
                            min={120}
                            max={2048}
                            value={imgHeight}
                            onChange={(e) => setImgHeight(Number(e.target.value))}
                            className="mt-0.5 w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F1724] px-2 py-1 text-[#202938] dark:text-white"
                          />
                        </label>
                      </div>
                      <canvas
                        ref={editorCanvasRef}
                        className="max-w-full max-h-60 rounded-lg border border-slate-300 dark:border-slate-700 mx-auto"
                      />
                      <button
                        type="button"
                        onClick={downloadEditedPhoto}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#10B981] text-white text-xs font-semibold cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Export Edited PNG</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </section>

        {/* 3. Live Local Sandbox Workspace File Editor */}
        <section className="xl:col-span-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F1724] p-5 flex flex-col justify-between space-y-4 shadow-sm">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCode2 className="w-4 h-4 text-[#10B981]" />
                <h2 className="text-sm font-semibold text-[#202938] dark:text-white">
                  Local File Creator &amp; Editor
                </h2>
              </div>
              <span className="text-[11px] font-mono text-[#64748B]">./workspace_files</span>
            </div>

            {files.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {files.map((f) => (
                  <button
                    key={f.name}
                    type="button"
                    onClick={() => {
                      setActiveFileName(f.name);
                      setFileContent(f.content);
                    }}
                    className={`px-2.5 py-1 rounded-lg border text-xs font-mono cursor-pointer ${
                      activeFileName === f.name
                        ? "bg-emerald-50 dark:bg-emerald-500/15 border-[#10B981] text-emerald-700 dark:text-emerald-300 font-semibold"
                        : "bg-[#F8FAFC] dark:bg-[#0B111B] border-slate-200 dark:border-slate-800 text-[#64748B] dark:text-slate-300"
                    }`}
                  >
                    {f.name}
                  </button>
                ))}
              </div>
            )}

            <form onSubmit={handleSaveFile} className="space-y-2.5">
              <div className="flex items-center gap-2">
                <FolderPlus className="w-4 h-4 text-[#D6AD60] shrink-0" />
                <input
                  type="text"
                  value={activeFileName}
                  onChange={(e) => setActiveFileName(e.target.value)}
                  placeholder="filename.txt / script.py / notes.md"
                  className="flex-1 rounded-lg bg-[#F8FAFC] dark:bg-[#0B111B] border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs font-mono text-[#202938] dark:text-white"
                />
              </div>

              <textarea
                rows={10}
                value={fileContent}
                onChange={(e) => setFileContent(e.target.value)}
                className="w-full rounded-xl bg-[#F8FAFC] dark:bg-[#0B111B] border border-slate-300 dark:border-slate-700 p-3 text-xs font-mono text-[#202938] dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#10B981]"
              />

              {fileFeedback && <div className="text-xs text-[#10B981] font-medium">{fileFeedback}</div>}

              <button
                type="submit"
                disabled={savingFile || !activeFileName.trim()}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#10B981] hover:bg-emerald-600 text-white font-semibold text-xs cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{savingFile ? "Saving..." : "Save File to Workspace"}</span>
              </button>
            </form>
          </div>

          <div className="rounded-xl bg-[#F8FAFC] dark:bg-[#0B111B] border border-slate-200 dark:border-slate-800 p-3 text-xs text-[#64748B] flex items-center gap-2">
            <Globe className="w-4 h-4 text-[#06B6D4] shrink-0" />
            <span>
              In-browser edits remain sandboxed in <code className="font-mono">./workspace_files</code>. Download the complete Windows ZIP above to run native Windows automation via <code className="font-mono">AURIX_Portable_Start.bat</code>.
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}
