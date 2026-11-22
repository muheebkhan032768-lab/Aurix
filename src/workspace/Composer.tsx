import React, { useRef, useState } from "react";
import { ArrowUp, FileText, Image as ImageIcon, Mic, Paperclip, X } from "lucide-react";
import { useVoiceSnapshot } from "../utils/voiceBus";
import { getVoiceControls } from "./voiceControls";
import type { ComposerAttachment, PendingAsk } from "./pending";

interface ComposerProps {
  onAsk: (ask: PendingAsk) => void;
  onOpenVoice: () => void;
}

export function Composer({ onAsk, onOpenVoice }: ComposerProps) {
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const voice = useVoiceSnapshot();

  const submit = () => {
    const text = value.trim();
    if (!text && attachments.length === 0) return;
    onAsk({ text: text || "Please review the attached file.", attachments, nonce: Date.now() });
    setValue("");
    setAttachments([]);
  };

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    const next: ComposerAttachment[] = [];
    for (const file of Array.from(files).slice(0, 3)) {
      if (file.size > 8 * 1024 * 1024) {
        setError(`${file.name} is larger than 8 MB.`);
        continue;
      }
      if (file.type.startsWith("image/")) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error("read failed"));
          reader.readAsDataURL(file);
        }).catch(() => "");
        if (!dataUrl) {
          setError(`Could not read ${file.name}.`);
          continue;
        }
        next.push({
          id: `${file.name}-${Date.now()}`,
          name: file.name,
          mimeType: file.type || "image/png",
          size: file.size,
          dataBase64: dataUrl.split(",")[1] || "",
        });
      } else if (
        file.type.startsWith("text/") ||
        /\.(txt|md|markdown|json|csv|log|ts|tsx|js|jsx|py|html|css|yml|yaml|sql)$/i.test(file.name)
      ) {
        next.push({
          id: `${file.name}-${Date.now()}`,
          name: file.name,
          mimeType: file.type || "text/plain",
          size: file.size,
          text: await file.text(),
        });
      } else {
        setError(`${file.name}: only images and text files are supported.`);
      }
    }
    setAttachments((prev) => [...prev, ...next].slice(0, 3));
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="shrink-0 border-t border-[var(--ws-border)] bg-[color-mix(in_srgb,var(--ws-bg)_88%,transparent)] px-3 py-2.5 backdrop-blur-xl">
      <div className="mx-auto max-w-3xl">
        {error && (
          <div className="mb-1.5 flex items-center justify-between rounded-lg border border-[#E7B75C]/35 bg-[#E7B75C]/10 px-2.5 py-1 text-[9.5px] text-[#E7B75C]">
            {error}
            <button type="button" onClick={() => setError(null)} aria-label="Dismiss attachment error"><X className="h-3 w-3" /></button>
          </div>
        )}
        {attachments.length > 0 && (
          <div className="mb-1.5 flex flex-wrap gap-1.5">
            {attachments.map((a) => (
              <span key={a.id} className="ws-chip !py-1">
                {a.dataBase64 ? <ImageIcon className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                <span className="max-w-[150px] truncate">{a.name}</span>
                <button type="button" onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))} aria-label={`Remove ${a.name}`}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="ws-inset flex items-end gap-1.5 p-1.5">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/*,.txt,.md,.markdown,.json,.csv,.log,.ts,.tsx,.js,.jsx,.py,.html,.css,.yml,.yaml,.sql"
            className="hidden"
            onChange={(e) => void addFiles(e.target.files)}
          />
          <button type="button" className="ws-btn ws-btn-ghost !p-2" onClick={() => fileRef.current?.click()} aria-label="Attach file or image" title="Attach file or image">
            <Paperclip className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={`ws-btn ws-btn-ghost !p-2 ${voice.state === "listening" ? "!text-[var(--ws-accent)]" : ""}`}
            onClick={() => {
              const controls = getVoiceControls();
              if (controls) {
                controls.open();
                controls.start();
              } else {
                onOpenVoice();
              }
            }}
            aria-label="Voice input"
            title="Hold Space to talk, or click to start listening"
          >
            <Mic className="h-4 w-4" />
          </button>
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
              if (e.key === "Escape") {
                getVoiceControls()?.interrupt();
                setValue("");
              }
            }}
            rows={1}
            placeholder="Ask AURIX anything, Sir..."
            className="max-h-28 min-h-[34px] flex-1 resize-none border-0 bg-transparent px-1 py-2 text-[12.5px] text-[var(--ws-text)] outline-none placeholder:text-[var(--ws-muted)]"
          />
          <div className="flex items-center gap-1 pb-0.5 pr-0.5">
            {voice.state === "listening" && <span className="ws-chip !border-[color-mix(in_srgb,var(--ws-accent)_40%,transparent)] !text-[var(--ws-accent)]"><span className="ws-blink h-1.5 w-1.5 rounded-full bg-[var(--ws-accent)]" /> mic live</span>}
            <button
              type="button"
              onClick={submit}
              disabled={!value.trim() && attachments.length === 0}
              className="ws-btn ws-btn-primary !h-8 !w-8 !rounded-full !p-0"
              aria-label="Send to AURIX"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-1 px-1 text-[8.5px] text-[var(--ws-muted)]">
          <span>Enter to send · Shift+Enter for a new line · Hold Space to talk · Esc interrupts</span>
          <span>Server-side AI · images go only to the configured provider</span>
        </div>
      </div>
    </div>
  );
}
