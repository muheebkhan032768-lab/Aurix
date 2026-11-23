import React, { useRef, useState } from "react";
import { BookmarkPlus, Camera, Eye, FileSearch, Upload } from "lucide-react";
import type { MemoryItem } from "../types/aurix";

interface FileVisionViewProps {
  onSaveMemory: (m: Omit<MemoryItem, "id" | "createdAt" | "updatedAt">) => Promise<void>;
  initialMode?: "summarize" | "ocr" | "vision" | "code-review" | "compare";
}

export function FileVisionView({ onSaveMemory, initialMode = "summarize" }: FileVisionViewProps) {
  const [mode, setMode] = useState<"summarize" | "ocr" | "vision" | "code-review" | "compare">(initialMode);
  const [fileName, setFileName] = useState("uploaded_input.txt");
  const [mimeType, setMimeType] = useState("text/plain");
  const [base64Data, setBase64Data] = useState<string | undefined>(undefined);
  const [textContent, setTextContent] = useState("");
  const [secondaryName, setSecondaryName] = useState("comparison_doc.txt");
  const [secondaryText, setSecondaryText] = useState("");
  const [prompt, setPrompt] = useState("Summarize key findings, extract structured points, and flag any errors.");
  const [analysis, setAnalysis] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMem, setSavedMem] = useState(false);

  const [cameraOpen, setCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const handlePrimaryFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const type = file.type || "text/plain";
    setMimeType(type);

    if (type.startsWith("image/") || type === "application/pdf") {
      const reader = new FileReader();
      reader.onload = () => {
        const res = String(reader.result || "");
        setBase64Data(res.split(",")[1] || "");
        setTextContent("");
      };
      reader.readAsDataURL(file);
    } else {
      const reader = new FileReader();
      reader.onload = () => {
        setTextContent(String(reader.result || ""));
        setBase64Data(undefined);
      };
      reader.readAsText(file);
    }
  };

  const handleSecondaryFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSecondaryName(file.name);
    const reader = new FileReader();
    reader.onload = () => setSecondaryText(String(reader.result || ""));
    reader.readAsText(file);
  };

  const startCamera = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      setCameraOpen(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 50);
    } catch {
      setError("Camera access denied or unavailable.");
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOpen(false);
  };

  const captureSnapshot = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    setFileName(`camera_snapshot_${Date.now()}.jpg`);
    setMimeType("image/jpeg");
    setBase64Data(dataUrl.split(",")[1]);
    setMode("vision");
    stopCamera();
  };

  const runAnalysis = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!base64Data && !textContent.trim()) {
      setError("Upload a file, paste document text, or capture a consent-based camera snapshot first.");
      return;
    }
    setLoading(true);
    setError(null);
    setSavedMem(false);
    try {
      const res = await fetch("/api/vision/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          prompt,
          fileName,
          mimeType,
          base64Data,
          textContent,
          secondaryFileName: secondaryName,
          secondaryText: mode === "compare" ? secondaryText : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed.");
      setAnalysis(data.analysis);
    } catch (err) {
      setError(err instanceof Error ? err.message : "File & Vision analysis failed.");
    } finally {
      setLoading(false);
    }
  };

  const saveInsightToMemory = async () => {
    if (!analysis) return;
    await onSaveMemory({
      category: "Document Intelligence",
      title: `Insight: ${fileName}`,
      content: analysis.slice(0, 1200),
      source: fileName,
      projectScope: "Global",
      approved: true,
    });
    setSavedMem(true);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <form
        onSubmit={runAnalysis}
        className="lg:col-span-5 bg-white dark:bg-[#0D1420] border border-slate-200 dark:border-slate-800/80 rounded-xl p-6 space-y-4"
      >
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-cyan-500" />
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            File & Computer Vision Input
          </h2>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["summarize", "Summarize"],
              ["ocr", "OCR Text"],
              ["vision", "Image Vision"],
              ["code-review", "Audit Code"],
              ["compare", "Compare Docs"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                mode === id
                  ? "bg-cyan-700 text-white"
                  : "bg-slate-100 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <label className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-cyan-500/60 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer">
            <Upload className="w-3.5 h-3.5 text-cyan-500" />
            <span>Upload Image / PDF / Code / CSV</span>
            <input
              type="file"
              accept="image/*,.pdf,.txt,.md,.csv,.json,.js,.ts,.py,.cs,.cpp,.html,.css,.xml"
              onChange={handlePrimaryFile}
              className="hidden"
            />
          </label>

          {!cameraOpen ? (
            <button
              type="button"
              onClick={startCamera}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-cyan-500/60 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5 text-cyan-500" />
              <span>Camera Snapshot (Consent)</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={stopCamera}
              className="px-3.5 py-2 rounded-lg border border-red-500/40 text-xs font-medium text-red-500 cursor-pointer"
            >
              Close Camera
            </button>
          )}
        </div>

        {cameraOpen && (
          <div className="space-y-2 p-3 rounded-lg bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-800">
            <video ref={videoRef} autoPlay playsInline muted className="w-full rounded-md max-h-48 object-cover" />
            <button
              type="button"
              onClick={captureSnapshot}
              className="w-full py-2 rounded-lg bg-cyan-700 hover:bg-cyan-600 text-white text-xs font-medium cursor-pointer"
            >
              Capture Single Frame for Vision Analysis
            </button>
          </div>
        )}

        {base64Data && mimeType.startsWith("image/") && (
          <div className="rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 max-h-44">
            <img
              src={`data:${mimeType};base64,${base64Data}`}
              alt={fileName}
              className="w-full h-44 object-contain bg-black/40"
            />
          </div>
        )}

        <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
          Loaded: {fileName} ({mimeType})
        </div>

        {!base64Data && (
          <label className="block text-xs text-slate-500 dark:text-slate-400">
            <span>Or Paste Document / Source Code</span>
            <textarea
              rows={5}
              value={textContent}
              onChange={(e) => setTextContent(e.target.value)}
              placeholder="Paste TXT, CSV, code, or logs..."
              className="mt-1 w-full font-mono bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
            />
          </label>
        )}

        {mode === "compare" && (
          <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <label className="inline-flex items-center gap-2 text-xs font-medium text-cyan-500 cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              <span>Upload Secondary Document ({secondaryName})</span>
              <input type="file" accept=".txt,.md,.csv,.json,.js,.ts,.py,.html,.css" onChange={handleSecondaryFile} className="hidden" />
            </label>
            <textarea
              rows={3}
              value={secondaryText}
              onChange={(e) => setSecondaryText(e.target.value)}
              placeholder="Or paste second document for comparison..."
              className="w-full font-mono bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
            />
          </div>
        )}

        <label className="block text-xs text-slate-500 dark:text-slate-400">
          <span>Analysis Instruction</span>
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="mt-1 w-full bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 text-white text-xs font-medium cursor-pointer"
        >
          <FileSearch className="w-4 h-4" />
          <span>{loading ? "Analyzing with Gemini Vision..." : "Analyze Input"}</span>
        </button>

        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-500">
            {error}
          </div>
        )}
      </form>

      <section className="lg:col-span-7 bg-white dark:bg-[#0D1420] border border-slate-200 dark:border-slate-800/80 rounded-xl p-6 flex flex-col">
        <div className="flex items-center justify-between gap-4 mb-4">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Intelligence Report
          </h3>
          {analysis && (
            <button
              type="button"
              onClick={saveInsightToMemory}
              disabled={savedMem}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-cyan-500/60 cursor-pointer"
            >
              <BookmarkPlus className="w-3.5 h-3.5 text-cyan-500" />
              <span>{savedMem ? "Saved to Memory" : "Approve & Save to Memory"}</span>
            </button>
          )}
        </div>

        <div className="flex-1 bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-800 rounded-lg p-5 overflow-auto max-h-[600px]">
          {analysis ? (
            <div className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
              {analysis}
            </div>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Original files are never overwritten. Upload images, PDFs, spreadsheets, or source code to extract OCR text, detect issues, or compare versions.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
