import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ChevronDown,
  Ear,
  HelpCircle,
  History,
  Mic,
  Send,
  Sparkles,
  Square,
  Terminal,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import type { AppSettings, AurixSectionId, NoteItem, TaskItem } from "../types/aurix";
import { cancelOfflineVoice, speakWithOfflineBritishVoice } from "../utils/offlineVoice";
import {
  parseVoiceCommand,
  VOICE_COMMAND_REFERENCE,
  VOICE_HELP_TEXT,
} from "../utils/voiceCommands";

interface VoiceCommandSystemProps {
  settings: AppSettings;
  tasks: TaskItem[];
  emergencyStopActive: boolean;
  onNavigate: (section: AurixSectionId) => void;
  onAddTask: (task: Omit<TaskItem, "id" | "createdAt"> & { id?: string }) => Promise<void>;
  onAddNote: (note: Omit<NoteItem, "id" | "updatedAt"> & { id?: string }) => Promise<void>;
  onUpdateSettings: (next: AppSettings) => Promise<void>;
  onEmergencyStop: (active: boolean) => Promise<void>;
  onLock: () => void;
  onRefreshSystem: () => Promise<void>;
}

type VoiceStatus = "idle" | "listening" | "processing" | "success" | "error";
type CommandSource = "voice" | "typed" | "wake";

interface CommandLogEntry {
  id: string;
  text: string;
  label: string;
  response: string;
  ok: boolean;
  at: string;
  source: CommandSource;
}

interface SpeechRecognitionResultLike {
  0: { transcript: string };
  isFinal: boolean;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const scope = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return scope.SpeechRecognition || scope.webkitSpeechRecognition || null;
}

function localeFor(language: AppSettings["language"]): string {
  if (language === "Urdu") return "ur-PK";
  if (language === "Hindi") return "hi-IN";
  return "en-GB";
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || "").split(",")[1] || "");
    reader.onerror = () => reject(new Error("Could not read the recorded audio."));
    reader.readAsDataURL(blob);
  });
}

/**
 * Global voice command layer for AURIX.
 * Works on every screen: push-to-talk, hands-free wake phrase, typed commands,
 * a live transcript, a spoken confirmation and a searchable command reference.
 */
export function VoiceCommandSystem({
  settings,
  tasks,
  emergencyStopActive,
  onNavigate,
  onAddTask,
  onAddNote,
  onUpdateSettings,
  onEmergencyStop,
  onLock,
  onRefreshSystem,
}: VoiceCommandSystemProps) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("Ready for a command.");
  const [transcript, setTranscript] = useState("");
  const [inputText, setInputText] = useState("");
  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [wakeListening, setWakeListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{ text: string; ok: boolean } | null>(null);
  const [history, setHistory] = useState<CommandLogEntry[]>([]);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const wakeRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const wakeEnabledRef = useRef(false);
  const awaitingWakeCommandRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const speakingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const runCommandRef = useRef<(raw: string, source?: CommandSource) => Promise<void>>(async () => {});

  const cancelSpeech = useCallback(() => {
    cancelOfflineVoice();
    speakingRef.current = false;
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    (text: string, force = false) => {
      if (!text.trim()) return;
      if (!force && (!settings.voiceEnabled || settings.doNotDisturb || emergencyStopActive)) return;
      cancelOfflineVoice();
      speakingRef.current = true;
      setSpeaking(true);
      const started = speakWithOfflineBritishVoice(text, settings.language, settings.voiceSpeed, {
        onStart: () => setSpeaking(true),
        onEnd: () => {
          speakingRef.current = false;
          setSpeaking(false);
        },
      });
      if (!started) {
        speakingRef.current = false;
        setSpeaking(false);
      }
    },
    [settings.voiceEnabled, settings.doNotDisturb, settings.language, settings.voiceSpeed, emergencyStopActive]
  );

  const stopListening = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      // Recognition may already be stopped.
    }
    recognitionRef.current = null;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setListening(false);
    setStatus("idle");
    setStatusMessage("Microphone stopped.");
  }, []);

  const startMicFallback = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser cannot access a microphone. Type the command below instead.");
      setStatus("error");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (!blob.size) {
          setStatus("idle");
          return;
        }
        setStatus("processing");
        setStatusMessage("Transcribing speech...");
        try {
          const base64 = await blobToBase64(blob);
          const response = await fetch("/api/voice/stt", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              audioBase64: base64,
              mimeType: blob.type || "audio/webm",
              languageHint: settings.language,
            }),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "Transcription failed.");
          await runCommandRef.current(String(data.transcript || ""), "voice");
        } catch (err) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not transcribe that recording. Type the command below instead."
          );
          setStatus("error");
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setListening(true);
      setStatus("listening");
      setStatusMessage("Recording — tap the mic again to send.");
    } catch {
      setError("Microphone access is blocked in this frame. Type the command below instead.");
      setStatus("error");
    }
  }, [settings.language]);

  const startListening = useCallback(async () => {
    if (listening) {
      stopListening();
      return;
    }
    setError(null);
    setTranscript("");
    cancelSpeech();
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      await startMicFallback();
      return;
    }
    try {
      const recognition = new Ctor();
      recognition.lang = localeFor(settings.language);
      recognition.continuous = false;
      recognition.interimResults = true;
      let finalText = "";
      let combined = "";
      recognition.onresult = (event) => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i];
          const chunk = result[0]?.transcript || "";
          if (result.isFinal) finalText += `${chunk} `;
          else interim += chunk;
        }
        combined = `${finalText}${interim}`.trim();
        setTranscript(combined);
      };
      recognition.onerror = (event) => {
        const code = event.error || "";
        setListening(false);
        setStatus("idle");
        if (code === "no-speech") {
          setError("I did not catch that. Try again or type the command below.");
        } else if (code !== "aborted") {
          setError("Live speech recognition is unavailable here. Type the command below instead.");
        }
      };
      recognition.onend = () => {
        setListening(false);
        const said = (finalText || combined).trim();
        if (said) void runCommandRef.current(said, "voice");
        else setStatus("idle");
      };
      recognitionRef.current = recognition;
      recognition.start();
      setListening(true);
      setStatus("listening");
      setStatusMessage("Listening — speak your command now.");
    } catch {
      await startMicFallback();
    }
  }, [listening, stopListening, cancelSpeech, startMicFallback, settings.language]);

  const stopWakeListening = useCallback(() => {
    wakeEnabledRef.current = false;
    awaitingWakeCommandRef.current = false;
    try {
      wakeRecognitionRef.current?.stop();
    } catch {
      // Recognition may already be stopped.
    }
    wakeRecognitionRef.current = null;
    setWakeListening(false);
    setStatusMessage("Hands-free mode off.");
  }, []);

  const startWakeListening = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setError("Hands-free wake phrases need browser speech recognition (Chrome or Edge). Use the mic button or type below.");
      setStatus("error");
      return;
    }
    setError(null);
    setOpen(true);
    try {
      const recognition = new Ctor();
      recognition.lang = localeFor(settings.language);
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.onresult = (event) => {
        if (speakingRef.current) return;
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i];
          if (!result.isFinal) continue;
          const said = (result[0]?.transcript || "").trim();
          if (!said) continue;
          const wake = settings.wakePhrase.trim().toLowerCase();
          const lower = said.toLowerCase();

          if (awaitingWakeCommandRef.current) {
            awaitingWakeCommandRef.current = false;
            setOpen(true);
            void runCommandRef.current(said, "wake");
            continue;
          }
          if (!wake) continue;
          const wakeIndex = lower.indexOf(wake);
          if (wakeIndex === -1) continue;
          const rest = said
            .slice(wakeIndex + wake.length)
            .replace(/^[,.\s]+/, "")
            .trim();
          if (rest) {
            setOpen(true);
            void runCommandRef.current(rest, "wake");
          } else {
            awaitingWakeCommandRef.current = true;
            setOpen(true);
            setStatusMessage(`Wake phrase detected — listening for your command.`);
          }
        }
      };
      recognition.onerror = (event) => {
        const code = event.error || "";
        if (code === "not-allowed" || code === "service-not-allowed") {
          wakeEnabledRef.current = false;
          setWakeListening(false);
          setError("Hands-free listening is blocked in this frame. Use the mic button or type below.");
          setStatus("error");
        }
      };
      recognition.onend = () => {
        if (!wakeEnabledRef.current) {
          setWakeListening(false);
          return;
        }
        window.setTimeout(() => {
          if (!wakeEnabledRef.current) return;
          try {
            recognition.start();
          } catch {
            setWakeListening(false);
          }
        }, 450);
      };
      wakeEnabledRef.current = true;
      wakeRecognitionRef.current = recognition;
      recognition.start();
      setWakeListening(true);
      setStatus("idle");
      setStatusMessage(`Hands-free mode armed — say "${settings.wakePhrase}".`);
    } catch {
      setError("Hands-free listening could not start in this browser.");
      setStatus("error");
    }
  }, [settings.language, settings.wakePhrase]);

  const toggleWakeListening = useCallback(() => {
    if (wakeListening) stopWakeListening();
    else startWakeListening();
  }, [wakeListening, stopWakeListening, startWakeListening]);

  const runCommand = useCallback(
    async (raw: string, source: CommandSource = "typed") => {
      const text = raw.trim();
      if (!text) return;
      cancelSpeech();
      setError(null);
      setTranscript(text);
      setProcessing(true);
      setStatus("processing");
      setStatusMessage("Working on your command...");

      const intent = parseVoiceCommand(text);
      let response = "";
      let ok = true;
      let speakResponse = true;
      let forceSpeak = false;

      try {
        const allowedDuringStop =
          intent.kind === "action" &&
          ["emergency_stop_off", "help", "mute_voice"].includes(intent.action);

        if (emergencyStopActive && !allowedDuringStop) {
          response = 'Emergency Stop is active. Say "resume operations" to clear it before running other commands.';
          ok = false;
          speakResponse = false;
        } else {
          switch (intent.kind) {
            case "navigate": {
              onNavigate(intent.section);
              response = `Opening ${intent.label}.`;
              break;
            }
            case "add_task": {
              if (!intent.title) {
                response = "What should the task be? For example: add task buy a domain for NEXORA.";
                ok = false;
                break;
              }
              await onAddTask({
                title: intent.title,
                category: intent.category,
                priority: intent.priority,
                status: "todo",
                dueDate: "",
                notes: "Added by the AURIX voice command system.",
              });
              response = `Added "${intent.title}" to your ${intent.category} tasks.`;
              break;
            }
            case "add_note": {
              if (!intent.content) {
                response = "What should the note say? For example: add note review Cloudflare DNS.";
                ok = false;
                break;
              }
              await onAddNote({
                title: intent.title || "Voice note",
                category: "Voice",
                content: intent.content,
              });
              response = `Saved a note titled "${intent.title || "Voice note"}".`;
              break;
            }
            case "action": {
              switch (intent.action) {
                case "self_heal": {
                  const res = await fetch("/api/self-heal/run", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ deepCodeScan: false }),
                  });
                  const report = await res.json();
                  if (!res.ok) throw new Error(report.error || "Self-heal failed.");
                  await onRefreshSystem();
                  const repaired = Number(report.repairedCount ?? 0);
                  const checks = Array.isArray(report.checks) ? report.checks.length : 0;
                  response = `Self-healing complete. Status ${String(report.overallStatus || "healthy").toUpperCase()} with ${repaired} repairs across ${checks} subsystem checks.`;
                  break;
                }
                case "emergency_stop_on": {
                  await onEmergencyStop(true);
                  response = "Emergency Stop engaged. Desktop automation and proactive voice are halted.";
                  speakResponse = false;
                  break;
                }
                case "emergency_stop_off": {
                  await onEmergencyStop(false);
                  response = "Emergency Stop cleared. AURIX operations resumed.";
                  break;
                }
                case "set_theme": {
                  const theme = intent.theme || "light";
                  await onUpdateSettings({ ...settings, theme });
                  response = `Switched to ${theme} mode.`;
                  break;
                }
                case "mute_voice": {
                  await onUpdateSettings({ ...settings, voiceEnabled: false });
                  response = "Voice output muted. I will respond on screen until you say unmute.";
                  speakResponse = false;
                  break;
                }
                case "unmute_voice": {
                  await onUpdateSettings({ ...settings, voiceEnabled: true });
                  response = "Voice output restored. I am speaking again.";
                  forceSpeak = true;
                  break;
                }
                case "lock_session": {
                  response = "Locking the AURIX session.";
                  window.setTimeout(() => onLock(), 1200);
                  break;
                }
                case "refresh_system": {
                  await onRefreshSystem();
                  const openTasks = tasks.filter((task) => task.status !== "done").length;
                  response = `System telemetry refreshed. ${openTasks} open ${openTasks === 1 ? "task" : "tasks"} in the queue.`;
                  break;
                }
                case "task_summary": {
                  const openTasks = tasks.filter((task) => task.status !== "done");
                  const preview = openTasks.slice(0, 3).map((task) => task.title).join(", ");
                  response =
                    openTasks.length === 0
                      ? "You have no open tasks. Everything is clear."
                      : `You have ${openTasks.length} open ${openTasks.length === 1 ? "task" : "tasks"}.${preview ? ` Next up: ${preview}.` : ""}`;
                  break;
                }
                case "tell_time": {
                  const now = new Date();
                  response = `It is ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} on ${now.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}.`;
                  break;
                }
                case "open_external": {
                  const url = intent.url || "https://www.youtube.com";
                  const opened = window.open(url, "_blank", "noopener,noreferrer");
                  response = opened
                    ? "Opened the link in a new tab."
                    : `Your browser blocked the new tab. The link is ${url}.`;
                  break;
                }
                case "help": {
                  response = VOICE_HELP_TEXT;
                  break;
                }
              }
              break;
            }
            case "ask_ai": {
              if (!intent.text) {
                response = "I did not catch a command. Try saying open tasks, or type it below.";
                ok = false;
                break;
              }
              const res = await fetch("/api/command/execute", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  command: intent.text,
                  language: settings.language,
                  withVoice: false,
                }),
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error || "AURIX could not process that command.");
              if (data.action?.type === "navigate" && data.action.section) {
                onNavigate(data.action.section as AurixSectionId);
              }
              if (data.action?.type === "open_url" && data.action.url) {
                window.open(data.action.url, "_blank", "noopener,noreferrer");
              }
              if (data.action?.type === "self_heal") {
                await onRefreshSystem();
              }
              response = data.assistantMessage?.content || "Command processed.";
              break;
            }
          }
        }
      } catch (err) {
        ok = false;
        speakResponse = false;
        response = err instanceof Error ? err.message : "That command could not be completed.";
      }

      setProcessing(false);
      setLastResult({ text: response, ok });
      setStatus(ok ? "success" : "error");
      setStatusMessage(ok ? "Command complete." : "Command needs attention.");
      setHistory((prev) =>
        [
          {
            id: `vc_${Date.now()}`,
            text,
            label: intent.label,
            response,
            ok,
            at: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            source,
          },
          ...prev,
        ].slice(0, 8)
      );
      if (speakResponse) speak(response, forceSpeak);
    },
    [
      cancelSpeech,
      emergencyStopActive,
      onNavigate,
      onAddTask,
      onAddNote,
      onUpdateSettings,
      onEmergencyStop,
      onLock,
      onRefreshSystem,
      settings,
      tasks,
      speak,
    ]
  );

  useEffect(() => {
    runCommandRef.current = runCommand;
  }, [runCommand]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (status !== "success" && status !== "error") return;
    const timer = window.setTimeout(() => {
      setStatus("idle");
      setStatusMessage("Ready for a command.");
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [status]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === "v") {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    return () => {
      wakeEnabledRef.current = false;
      try {
        wakeRecognitionRef.current?.stop();
        recognitionRef.current?.stop();
      } catch {
        // Ignore teardown races.
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      cancelOfflineVoice();
    };
  }, []);

  const submitTyped = (event: React.FormEvent) => {
    event.preventDefault();
    const value = inputText.trim();
    if (!value) return;
    setInputText("");
    void runCommand(value, "typed");
  };

  const displayStatus: VoiceStatus = listening
    ? "listening"
    : processing
      ? "processing"
      : speaking
        ? "success"
        : status;

  const statusLabel = listening
    ? "Listening"
    : processing
      ? "Working"
      : speaking
        ? "Speaking"
        : status === "success"
          ? "Done"
          : status === "error"
            ? "Needs attention"
            : "Ready";

  const dotClass =
    displayStatus === "listening"
      ? "bg-[#06B6D4]"
      : displayStatus === "processing"
        ? "bg-[#D6AD60]"
        : displayStatus === "error"
          ? "bg-rose-500"
          : displayStatus === "success"
            ? "bg-[#10B981]"
            : "bg-slate-400";

  return (
    <>
      <button
        type="button"
        data-testid="voice-command-launcher"
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? "Close voice command system" : "Open voice command system"}
        aria-expanded={open}
        className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 px-4 py-3 rounded-full bg-[#10B981] hover:bg-emerald-600 text-white text-xs font-semibold shadow-lg shadow-emerald-500/25 border border-emerald-400/50 cursor-pointer transition-colors"
      >
        <span className="relative flex items-center justify-center">
          {wakeListening && (
            <span className="absolute inset-0 rounded-full bg-white/50 animate-ping" aria-hidden="true" />
          )}
          <Mic className="w-4 h-4" />
        </span>
        <span className="hidden sm:inline">Voice Command</span>
      </button>

      {open && (
        <section
          data-testid="voice-command-panel"
          aria-label="AURIX voice command system"
          className="fixed bottom-20 right-3 sm:right-5 z-40 w-[calc(100vw-1.5rem)] sm:w-[430px] max-h-[74vh] overflow-y-auto rounded-2xl border border-emerald-500/35 bg-white/95 dark:bg-[#0F1724]/95 backdrop-blur-md shadow-2xl"
        >
          <div className="sticky top-0 z-10 flex items-start justify-between gap-3 px-4 pt-4 pb-3 bg-white/95 dark:bg-[#0F1724]/95 border-b border-slate-200/80 dark:border-slate-800/80">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/12 border border-emerald-500/30 flex items-center justify-center shrink-0">
                <Terminal className="w-4 h-4 text-[#10B981]" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-[#202938] dark:text-white truncate">
                  Voice Command System
                </h2>
                <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#64748B] dark:text-slate-400">
                  AURIX · Alt+V
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close voice command panel"
              className="p-1.5 rounded-lg text-[#64748B] hover:text-[#202938] dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-4 py-3 flex items-center justify-between gap-2 border-b border-slate-200/70 dark:border-slate-800/70">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${dotClass} ${
                  listening || processing || speaking ? "animate-pulse" : ""
                }`}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-[#202938] dark:text-white">{statusLabel}</div>
                <div className="text-[10px] text-[#64748B] dark:text-slate-400 truncate">{statusMessage}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={toggleWakeListening}
              aria-pressed={wakeListening}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-semibold cursor-pointer whitespace-nowrap ${
                wakeListening
                  ? "border-[#06B6D4] bg-cyan-50 dark:bg-cyan-500/15 text-cyan-700 dark:text-cyan-300"
                  : "border-slate-300 dark:border-slate-700 text-[#64748B] dark:text-slate-300"
              }`}
            >
              <Ear className="w-3.5 h-3.5" />
              <span>{wakeListening ? "Hands-free on" : "Hands-free"}</span>
            </button>
          </div>

          <div className="p-4 space-y-3">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-[#F8FAFC] dark:bg-[#0B111B] px-3 py-2.5 min-h-[52px]">
              <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#64748B] dark:text-slate-500">
                Transcript
              </div>
              <p className="text-sm text-[#202938] dark:text-slate-200 mt-0.5">
                {transcript || "Say “open tasks” or type a command below."}
              </p>
            </div>

            <div className="flex items-stretch gap-2">
              <button
                type="button"
                onClick={() => void startListening()}
                aria-label={listening ? "Stop listening" : "Start voice input"}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                  listening
                    ? "bg-rose-600 hover:bg-rose-700 text-white"
                    : "bg-[#10B981] hover:bg-emerald-600 text-white"
                }`}
              >
                {listening ? <Square className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                <span>{listening ? "Stop" : "Speak"}</span>
              </button>

              <form onSubmit={submitTyped} className="flex-1 flex items-stretch gap-2 min-w-0">
                <input
                  ref={inputRef}
                  data-testid="voice-command-input"
                  aria-label="Type a voice command"
                  value={inputText}
                  onChange={(event) => setInputText(event.target.value)}
                  placeholder='e.g. "add task buy a domain"'
                  className="flex-1 min-w-0 bg-[#F8FAFC] dark:bg-[#0B111B] border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-[#202938] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#10B981]"
                />
                <button
                  type="submit"
                  data-testid="voice-command-submit"
                  aria-label="Run command"
                  disabled={processing || !inputText.trim()}
                  className="px-3 rounded-lg bg-[#202938] dark:bg-slate-700 hover:bg-slate-800 dark:hover:bg-slate-600 disabled:opacity-40 text-white cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>

            {error && (
              <div className="rounded-lg bg-rose-50 dark:bg-rose-500/10 border border-rose-300 dark:border-rose-700 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
                {error}
              </div>
            )}

            {lastResult && (
              <div
                className={`rounded-xl border px-3 py-2.5 ${
                  lastResult.ok
                    ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-700/70"
                    : "bg-amber-50 dark:bg-amber-500/10 border-amber-300 dark:border-amber-700/70"
                }`}
              >
                <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.14em] text-[#64748B] dark:text-slate-400">
                  {lastResult.ok ? (
                    <Sparkles className="w-3 h-3 text-[#10B981]" />
                  ) : (
                    <Activity className="w-3 h-3 text-amber-600" />
                  )}
                  <span>AURIX</span>
                  {speaking && <Volume2 className="w-3 h-3 text-[#10B981]" />}
                </div>
                <p className="text-xs text-[#202938] dark:text-slate-200 mt-1 leading-relaxed">
                  {lastResult.text}
                </p>
              </div>
            )}

            <div className="flex flex-wrap gap-1.5">
              {["Open tasks", "Run self-heal", "Read my tasks", "Dark mode", "Help"].map((command) => (
                <button
                  key={command}
                  type="button"
                  onClick={() => void runCommand(command, "typed")}
                  className="px-2.5 py-1 rounded-full border border-slate-300 dark:border-slate-700 text-[10px] font-medium text-[#64748B] dark:text-slate-300 hover:border-[#10B981] hover:text-[#10B981] cursor-pointer"
                >
                  {command}
                </button>
              ))}
            </div>
          </div>

          <details className="px-4 pb-3 group">
            <summary className="flex items-center justify-between gap-2 cursor-pointer list-none text-[11px] font-semibold text-[#202938] dark:text-slate-200">
              <span className="inline-flex items-center gap-1.5">
                <HelpCircle className="w-3.5 h-3.5 text-[#06B6D4]" />
                Command reference
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-[#64748B] group-open:rotate-180 transition-transform" />
            </summary>
            <div className="mt-2.5 space-y-2.5">
              {VOICE_COMMAND_REFERENCE.map((group) => (
                <div key={group.title}>
                  <div className="text-[9px] font-mono uppercase tracking-[0.16em] text-[#64748B] dark:text-slate-500">
                    {group.title}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {group.commands.map((command) => (
                      <button
                        key={command}
                        type="button"
                        onClick={() => void runCommand(command, "typed")}
                        className="px-2 py-1 rounded-md bg-[#F8FAFC] dark:bg-[#0B111B] border border-slate-200 dark:border-slate-800 text-[10px] text-[#202938] dark:text-slate-300 hover:border-[#10B981] cursor-pointer"
                      >
                        {command}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </details>

          {history.length > 0 && (
            <div className="px-4 pb-4">
              <div className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-[0.16em] text-[#64748B] dark:text-slate-500">
                <History className="w-3 h-3" />
                Recent commands
              </div>
              <ul className="mt-2 space-y-1.5">
                {history.map((entry) => (
                  <li
                    key={entry.id}
                    className="rounded-lg border border-slate-200 dark:border-slate-800 bg-[#F8FAFC] dark:bg-[#0B111B] px-2.5 py-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-[#202938] dark:text-slate-200 truncate">
                        {entry.text}
                      </span>
                      <span className="text-[9px] font-mono text-[#64748B] tabular-nums shrink-0">
                        {entry.at}
                      </span>
                    </div>
                    <div className="text-[10px] text-[#64748B] dark:text-slate-400 line-clamp-2">
                      {entry.ok ? entry.response : `Not completed — ${entry.response}`}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="px-4 py-2.5 border-t border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between gap-2 text-[9px] text-[#64748B] dark:text-slate-500">
            <span>Alt+V toggles · Esc closes</span>
            <span className="inline-flex items-center gap-1 truncate">
              {settings.voiceEnabled ? (
                <Volume2 className="w-3 h-3 text-[#10B981]" />
              ) : (
                <VolumeX className="w-3 h-3 text-rose-500" />
              )}
              <span className="truncate">
                {settings.wakePhrase ? `Wake phrase: “${settings.wakePhrase}”` : "Wake phrase not set"}
              </span>
            </span>
          </div>
        </section>
      )}
    </>
  );
}
