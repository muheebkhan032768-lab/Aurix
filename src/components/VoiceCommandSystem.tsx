import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ChevronDown,
  Ear,
  HelpCircle,
  History,
  Keyboard,
  Mic,
  Send,
  Sparkles,
  Square,
  Terminal,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import type { AppSettings, AurixSectionId, NoteItem, TaskItem, VoiceShortcuts } from "../types/aurix";
import { cancelCompanionVoice, playCompanionAudioBase64 } from "../utils/companionVoice";
import { createAlwaysOnMic, type AlwaysOnMicController } from "../utils/alwaysOnMic";
import {
  ensureMicrophone,
  getSharedStream,
  getVoiceEngineSnapshot,
  isCapturing,
  releaseMicrophone,
  speak as engineSpeak,
  startCapture,
  stopCapture,
  stopSpeaking as engineStopSpeaking,
} from "../utils/voiceEngine";
import { publishVoice } from "../utils/voiceBus";
import {
  DEFAULT_VOICE_SHORTCUTS,
  formatShortcut,
  isModifierOnly,
  matchesShortcut,
} from "../utils/shortcuts";
import { VoiceShortcutSettings } from "./VoiceShortcutSettings";
import { VoiceCompanionFigure } from "./VoiceCompanionFigure";
import {
  parseVoiceCommand,
  VOICE_COMMAND_REFERENCE,
  VOICE_HELP_TEXT,
} from "../utils/voiceCommands";
import { openInNewTab, resolveAccountFromText, type WebsiteEntry } from "../utils/websiteRegistry";

interface VoiceCommandSystemProps {
  settings: AppSettings;
  tasks: TaskItem[];
  mediaConsent: string | null;
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

/** Ways the wake phrase is commonly heard, including "Hello X". */
const WAKE_ALIASES = [
  "hello aurix",
  "hey aurix",
  "hello x",
  "hey x",
  "hello orix",
  "hello aurex",
  "hello auriks",
  "hello aarox",
  "hello auric",
  "hello aurox",
];

function splitWakePhrase(raw: string, wakePhrase: string): { heard: boolean; remainder: string } {
  const normalized = raw
    .toLowerCase()
    .replace(/[.,!?;:"'“”]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const candidates = [wakePhrase.trim().toLowerCase(), ...WAKE_ALIASES].filter(Boolean);
  for (const phrase of candidates) {
    const index = normalized.indexOf(phrase);
    if (index === -1) continue;
    const remainder = `${normalized.slice(0, index)} ${normalized.slice(index + phrase.length)}`
      .replace(/\s+/g, " ")
      .trim();
    return { heard: true, remainder };
  }
  return { heard: false, remainder: "" };
}

function wakeAcknowledgement(language: AppSettings["language"]): string {
  if (language === "Urdu") return "اورکس آن لائن ہے، میں سن رہا ہوں۔";
  if (language === "Hindi") return "ऑरिक्स ऑनलाइन है, मैं सुन रहा हूँ।";
  return "AURIX online. I'm listening.";
}

/** Space starts and stops the microphone everywhere except inside a text field. */
function isTextEntryTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
  return el.isContentEditable === true;
}

/**
 * Global voice command layer for AURIX.
 * Works on every screen: push-to-talk, hands-free wake phrase, typed commands,
 * a live transcript, a spoken confirmation and a searchable command reference.
 */
export function VoiceCommandSystem({
  settings,
  tasks,
  mediaConsent,
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
  // Set while AURIX waits for the user to pick an account (e.g. Facebook).
  const pendingSiteRef = useRef<{ entry: WebsiteEntry } | null>(null);
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("Ready for a command.");
  const [transcript, setTranscript] = useState("");
  const [inputText, setInputText] = useState("");
  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [wakeListening, setWakeListening] = useState(false);
  const [alwaysOnListening, setAlwaysOnListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{ text: string; ok: boolean } | null>(null);
  const [history, setHistory] = useState<CommandLogEntry[]>([]);
  const [micPermission, setMicPermission] = useState<"granted" | "denied" | "prompt" | "unknown">("unknown");

  const wakeRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const wakeEnabledRef = useRef(false);
  const awaitingWakeCommandRef = useRef(false);
  const speakingRef = useRef(false);
  const processingRef = useRef(false);
  const listeningRef = useRef(false);
  const lastSpeechEndRef = useRef(0);
  const companionModeRef = useRef(false);
  const autoStartedRef = useRef(false);
  const micControllerRef = useRef<AlwaysOnMicController | null>(null);
  const startAlwaysOnRef = useRef<() => Promise<boolean>>(async () => false);
  const inputRef = useRef<HTMLInputElement>(null);
  const focusInputOnOpenRef = useRef(false);
  const runCommandRef = useRef<(raw: string, source?: CommandSource) => Promise<void>>(async () => {});
  const handleSpokenInputRef = useRef<(raw: string, source?: CommandSource) => void>(() => {});
  const spaceHeldRef = useRef(false);
  const spaceReleasePendingRef = useRef(false);
  const wakeListeningRef = useRef(false);
  const alwaysOnListeningRef = useRef(false);
  const resumeAlwaysOnRef = useRef(false);
  const settingsRef = useRef<AppSettings>(settings);
  const updateSettingsRef = useRef<(next: AppSettings) => Promise<void>>(onUpdateSettings);
  const shortcutsRef = useRef<VoiceShortcuts>(settings.voiceShortcuts || DEFAULT_VOICE_SHORTCUTS);
  const startListeningRef = useRef<() => Promise<void>>(async () => {});
  const stopListeningRef = useRef<() => void>(() => {});
  const stopWakeListeningRef = useRef<() => void>(() => {});

  const shortcuts = settings.voiceShortcuts || DEFAULT_VOICE_SHORTCUTS;

  const cancelSpeech = useCallback(() => {
    engineStopSpeaking();
    cancelCompanionVoice();
    speakingRef.current = false;
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    (text: string, force = false) => {
      if (!text.trim()) return;
      if (!force && (!settings.voiceEnabled || settings.doNotDisturb || emergencyStopActive)) return;
      speakingRef.current = true;
      setSpeaking(true);
      void engineSpeak(text, {
        voiceName: settings.voiceName,
        language: settings.language,
        speed: settings.voiceSpeed,
        voiceId: settings.voiceId,
        volume: settings.voiceVolume,
        onStart: () => setSpeaking(true),
        onEnd: () => {
          speakingRef.current = false;
          lastSpeechEndRef.current = Date.now();
          setSpeaking(false);
        },
      }).then((started) => {
        if (started) return;
        speakingRef.current = false;
        lastSpeechEndRef.current = Date.now();
        setSpeaking(false);
      });
    },
    [
      settings.voiceEnabled,
      settings.doNotDisturb,
      settings.voiceName,
      settings.language,
      settings.voiceSpeed,
      settings.voiceId,
      settings.voiceVolume,
      emergencyStopActive,
    ]
  );

  // "Hello AURIX" (or "Hello X") wakes the assistant, opens its interface and
  // runs whatever follows the phrase as the command.
  const handleSpokenInput = useCallback(
    (raw: string, source: CommandSource = "voice") => {
      const spoken = raw.trim();
      if (!spoken) return;
      const current = settingsRef.current;
      const { heard, remainder } = splitWakePhrase(spoken, current.wakePhrase || "Hello AURIX");
      if (!heard) {
        void runCommandRef.current(spoken, source);
        return;
      }
      awaitingWakeCommandRef.current = !remainder;
      setOpen(true);
      setStatus("idle");
      setTranscript(spoken);
      setStatusMessage("AURIX online — I am listening.");
      if (remainder) {
        void runCommandRef.current(remainder, "wake");
        return;
      }
      speak(wakeAcknowledgement(current.language));
    },
    [speak]
  );

  useEffect(() => {
    handleSpokenInputRef.current = handleSpokenInput;
  }, [handleSpokenInput]);

  // Push-to-talk capture: one recording session through the shared voice
  // engine, transcribed by the server so AURIX hears the real words.
  const stopListening = useCallback(() => {
    const current = settingsRef.current;
    setListening(false);
    setStatusMessage("Transcribing what you said…");
    void stopCapture({
      language: current.language,
      autoDetectLanguage: current.autoDetectLanguage,
    }).then((result) => {
      if (result.error) {
        setError(result.error);
        setStatus("error");
        setStatusMessage("Speech recognition is unavailable right now.");
      } else if (result.silent) {
        setStatus("idle");
        setStatusMessage("I didn't catch that — press Space and speak again.");
        setError("Sorry, I didn't catch that. Could you repeat?");
      } else {
        setError(null);
        void handleSpokenInputRef.current(result.transcript, "voice");
      }
      if (resumeAlwaysOnRef.current) void startAlwaysOnRef.current();
      resumeAlwaysOnRef.current = false;
    });
  }, []);

  const startListening = useCallback(async () => {
    if (isCapturing() || listeningRef.current) {
      stopListening();
      return;
    }
    // The hands-free listener and push-to-talk share one microphone stream, so
    // the phrase detector is paused instead of holding a second session.
    if (wakeEnabledRef.current) stopWakeListeningRef.current();
    resumeAlwaysOnRef.current = Boolean(micControllerRef.current);
    micControllerRef.current?.stop();
    micControllerRef.current = null;
    setError(null);
    setTranscript("");
    cancelSpeech();

    const started = await startCapture();
    if (!started) {
      const engine = getVoiceEngineSnapshot();
      if (engine.state === "transcribing") {
        setStatus("processing");
        setStatusMessage("Still transcribing your last command — one moment.");
        resumeAlwaysOnRef.current = false;
        return;
      }
      const engineError = engine.error;
      setError(engineError || "Microphone unavailable. Allow microphone access, then press Space again.");
      setStatus("error");
      setStatusMessage("Microphone permission is required.");
      if (resumeAlwaysOnRef.current) void startAlwaysOnRef.current();
      resumeAlwaysOnRef.current = false;
      return;
    }
    setListening(true);
    setStatus("listening");
    setStatusMessage("Listening — release Space to send.");
    if (spaceReleasePendingRef.current) {
      spaceReleasePendingRef.current = false;
      stopListening();
    }
  }, [stopListening, cancelSpeech]);


  const stopWakeListening = useCallback(() => {
    wakeEnabledRef.current = false;
    companionModeRef.current = false;
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

  const startWakeListening = useCallback((alwaysOn = false) => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      if (alwaysOn) return;
      setError("Hands-free wake phrases need browser speech recognition (Chrome or Edge). Use the mic button or type below.");
      setStatus("error");
      return;
    }
    setError(null);
    companionModeRef.current = alwaysOn;
    if (!alwaysOn) setOpen(true);
    try {
      const recognition = new Ctor();
      recognition.lang = localeFor(settings.language);
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.onresult = (event) => {
        if (speakingRef.current) return;
        if (Date.now() - lastSpeechEndRef.current < 600) return;
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i];
          if (!result.isFinal) continue;
          const said = (result[0]?.transcript || "").trim();
          if (!said) continue;

          if (alwaysOn) {
            handleSpokenInputRef.current(said, "wake");
            continue;
          }

          if (awaitingWakeCommandRef.current) {
            awaitingWakeCommandRef.current = false;
            setOpen(true);
            void runCommandRef.current(said, "wake");
            continue;
          }

          // Armed hands-free mode only reacts once the wake phrase is heard.
          if (!splitWakePhrase(said, settings.wakePhrase || "Hello AURIX").heard) continue;
          handleSpokenInputRef.current(said, "wake");
        }
      };
      recognition.onerror = (event) => {
        const code = event.error || "";
        if (code === "not-allowed" || code === "service-not-allowed") {
          wakeEnabledRef.current = false;
          companionModeRef.current = false;
          setWakeListening(false);
          if (!alwaysOn) {
            setError("Hands-free listening is blocked in this frame. Use the mic button or type below.");
            setStatus("error");
          }
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
      setStatusMessage(
        alwaysOn
          ? "I am listening — just talk to me."
          : `Hands-free mode armed — say "${settings.wakePhrase}".`
      );
    } catch {
      companionModeRef.current = false;
      if (alwaysOn) {
        setWakeListening(false);
        return;
      }
      setError("Hands-free listening could not start in this browser.");
      setStatus("error");
    }
  }, [settings.language, settings.wakePhrase]);

  const toggleWakeListening = useCallback(() => {
    if (wakeListening) {
      stopWakeListening();
    } else {
      micControllerRef.current?.stop();
      micControllerRef.current = null;
      startWakeListening();
    }
  }, [wakeListening, stopWakeListening, startWakeListening]);

  useEffect(() => {
    processingRef.current = processing;
  }, [processing]);

  useEffect(() => {
    listeningRef.current = listening;
  }, [listening]);

  useEffect(() => {
    wakeListeningRef.current = wakeListening;
  }, [wakeListening]);

  useEffect(() => {
    alwaysOnListeningRef.current = alwaysOnListening;
  }, [alwaysOnListening]);

  useEffect(() => {
    settingsRef.current = settings;
    shortcutsRef.current = settings.voiceShortcuts || DEFAULT_VOICE_SHORTCUTS;
  }, [settings]);

  useEffect(() => {
    updateSettingsRef.current = onUpdateSettings;
  }, [onUpdateSettings]);

  // Visible microphone permission indicator.
  useEffect(() => {
    const permissions = navigator.permissions;
    if (!permissions?.query) {
      setMicPermission("unknown");
      return;
    }
    let cancelled = false;
    let status: PermissionStatus | null = null;
    const apply = (state: PermissionState) => {
      if (cancelled) return;
      setMicPermission(state === "granted" ? "granted" : state === "denied" ? "denied" : "prompt");
    };
    permissions
      .query({ name: "microphone" as PermissionName })
      .then((result) => {
        status = result;
        apply(result.state);
        result.onchange = () => apply(result.state);
      })
      .catch(() => setMicPermission("unknown"));
    return () => {
      cancelled = true;
      if (status) status.onchange = null;
    };
  }, []);

  // Keeps the microphone open and transcribes each spoken phrase, which also
  // works where live browser speech recognition is unavailable.
  const startAlwaysOnListening = useCallback(async () => {
    if (micControllerRef.current) return true;
    if (isCapturing()) return false;
    // The phrase detector reuses the shared microphone instead of opening a
    // second capture session on the same device.
    const media = await ensureMicrophone();
    if (!media) return false;
    const controller = createAlwaysOnMic({
      shouldPause: () =>
        speakingRef.current ||
        processingRef.current ||
        listeningRef.current ||
        isCapturing() ||
        Date.now() - lastSpeechEndRef.current < 700,
      sensitivity: () => settingsRef.current.micSensitivity,
      language: () => settingsRef.current.language,
      getSharedStream: () => getSharedStream(),
      onTranscript: (text) => handleSpokenInputRef.current(text, "voice"),
      onError: (message) => {
        setError(message);
        setStatus("error");
      },
      onStateChange: (active) => {
        setAlwaysOnListening(active);
        if (active) {
          setStatus("idle");
          setStatusMessage("I am listening — just talk to me.");
        }
      },
    });
    micControllerRef.current = controller;
    const started = await controller.start();
    if (!started) micControllerRef.current = null;
    return started;
  }, []);

  useEffect(() => {
    startAlwaysOnRef.current = startAlwaysOnListening;
  }, [startAlwaysOnListening]);

  // The companion starts by itself — no button and no wake phrase needed.
  useEffect(() => {
    if (autoStartedRef.current) return;
    if (mediaConsent !== "granted") return;
    if (!settings.micEnabled || settings.doNotDisturb || emergencyStopActive) return;
    if (!navigator.mediaDevices?.getUserMedia) return;
    autoStartedRef.current = true;
    const timer = window.setTimeout(() => {
      void startAlwaysOnListening().then((started) => {
        if (!started) setStatusMessage("Tap me and press Speak to turn my microphone on.");
      });
    }, 900);
    return () => window.clearTimeout(timer);
  }, [
    mediaConsent,
    settings.micEnabled,
    settings.doNotDisturb,
    emergencyStopActive,
    startAlwaysOnListening,
  ]);

  // The microphone is independent of the speaker: muting AURIX's voice, or
  // turning Do Not Disturb on, must never disable push-to-talk. Only the
  // microphone switch or an Emergency Stop closes the input.
  useEffect(() => {
    if (settings.micEnabled && !emergencyStopActive) return;
    micControllerRef.current?.stop();
    micControllerRef.current = null;
    autoStartedRef.current = false;
    if (!settings.micEnabled) setStatusMessage("Microphone off — switch it on in Settings.");
  }, [settings.micEnabled, emergencyStopActive]);

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

      let intent = parseVoiceCommand(text);
      // While an account choice is pending, the next command answers it.
      const pendingSite = pendingSiteRef.current;
      if (pendingSite) {
        pendingSiteRef.current = null;
        const account = resolveAccountFromText(pendingSite.entry, text);
        if (account) {
          intent = {
            kind: "open_website",
            entry: pendingSite.entry,
            account,
            needsAccount: false,
            label: `Open ${pendingSite.entry.name}`,
          };
        } else if (/^(cancel|never ?mind|forget it|stop)\b/i.test(text)) {
          intent = { kind: "cancel", label: "Cancel" };
        }
      }
      let response = "";
      let ok = true;
      let speakResponse = true;
      let forceSpeak = false;
      let prefetchedAudio: { audioBase64: string; mimeType?: string } | null = null;

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
            case "open_website": {
              const { entry, account } = intent;
              if (intent.needsAccount && entry.accounts?.length) {
                pendingSiteRef.current = { entry };
                const names = entry.accounts.map((item) => item.label);
                response = `Which ${entry.name} account would you like to open, ${names.join(" or ")}?`;
                break;
              }
              const target = account?.url || entry.url;
              if (!target) {
                response = `${entry.name} does not have a saved link yet. Add it to the website registry when you have the URL.`;
                ok = false;
                speakResponse = false;
                break;
              }
              const opened = openInNewTab(target);
              if (!opened) {
                response = `Your browser blocked the new tab for ${entry.name}. The saved link is ${target}.`;
                break;
              }
              response = `Opening ${entry.name}${account ? ` for ${account.label}` : ""} in a new tab.`;
              if (entry.id === "youtube-favourite") {
                response += " Playback may need a click on the YouTube tab.";
              }
              break;
            }
            case "cancel": {
              response = "Cancelled.";
              speakResponse = false;
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
              // The spoken answer is synthesized in the same request, so audio
              // starts as soon as the reply text arrives.
              const wantsVoice =
                settings.voiceEnabled &&
                !settings.doNotDisturb &&
                !emergencyStopActive &&
                !settings.offlineModeForced;
              const res = await fetch("/api/command/execute", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  command: intent.text,
                  language: settings.language,
                  withVoice: wantsVoice,
                  model: "gemini-3.1-flash-lite",
                }),
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error || "AURIX could not process that command.");
              if (wantsVoice && data.audioBase64) {
                prefetchedAudio = { audioBase64: data.audioBase64, mimeType: data.mimeType };
              }
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
      if (speakResponse) {
        const audio = prefetchedAudio;
        if (audio) {
          cancelSpeech();
          speakingRef.current = true;
          setSpeaking(true);
          void playCompanionAudioBase64(audio.audioBase64, audio.mimeType, settings.voiceSpeed, {
            onStart: () => setSpeaking(true),
            onEnd: () => {
              speakingRef.current = false;
              lastSpeechEndRef.current = Date.now();
              setSpeaking(false);
            },
          }).then((started) => {
            if (started) return;
            speakingRef.current = false;
            setSpeaking(false);
            speak(response, forceSpeak);
          });
        } else {
          speak(response, forceSpeak);
        }
      }
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
    if (!open || !focusInputOnOpenRef.current) return;
    focusInputOnOpenRef.current = false;
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
    startListeningRef.current = startListening;
    stopListeningRef.current = stopListening;
    stopWakeListeningRef.current = stopWakeListening;
  }, [startListening, stopListening, stopWakeListening]);

  const stopContinuousListening = useCallback(() => {
    micControllerRef.current?.stop();
    micControllerRef.current = null;
    autoStartedRef.current = false;
    if (wakeEnabledRef.current) stopWakeListeningRef.current();
    setStatusMessage("Continuous listening off.");
  }, []);

  // Global voice hotkeys. Push-to-talk starts on key-down and sends the command
  // the moment the key is released; auto-repeat is ignored.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isModifierOnly(event)) return;
      const active = shortcutsRef.current;

      if (event.altKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === "v") {
        event.preventDefault();
        // Typing focus is only taken when the panel is opened from the keyboard
        // shortcut, never after push-to-talk.
        focusInputOnOpenRef.current = true;
        setOpen((value) => !value);
        return;
      }

      if (matchesShortcut(event, active.mute)) {
        event.preventDefault();
        const current = settingsRef.current;
        const next = { ...current, voiceEnabled: !current.voiceEnabled };
        if (!next.voiceEnabled) {
          cancelSpeech();
          setStatusMessage("Voice output muted.");
        } else {
          setStatusMessage("Voice output restored.");
        }
        void updateSettingsRef.current(next);
        return;
      }

      if (matchesShortcut(event, active.continuous)) {
        event.preventDefault();
        if (alwaysOnListeningRef.current || wakeListeningRef.current) stopContinuousListening();
        else void startAlwaysOnRef.current();
        return;
      }

      if (matchesShortcut(event, active.activate)) {
        event.preventDefault();
        setOpen(true);
        void startListeningRef.current();
        return;
      }

      if (matchesShortcut(event, active.cancel)) {
        if (listeningRef.current) {
          event.preventDefault();
          stopListeningRef.current();
          setStatusMessage("Recording cancelled.");
        } else if (speakingRef.current) {
          event.preventDefault();
          cancelSpeech();
          setStatusMessage("Speech stopped.");
        } else {
          setOpen(false);
        }
        return;
      }

      if (matchesShortcut(event, active.pushToTalk)) {
        if (isTextEntryTarget(event.target)) {
          // The voice panel's own empty command box should not swallow the
          // talk key; a box with text in it is a real typing target.
          const field = event.target as HTMLInputElement;
          const isVoiceBox = field === inputRef.current;
          if (!isVoiceBox || field.value.trim().length > 0) return;
          field.blur();
        }
        event.preventDefault();
        if (event.repeat || spaceHeldRef.current) return;
        spaceHeldRef.current = true;
        // A focused button would otherwise be "clicked" by the spacebar.
        const focused = document.activeElement as HTMLElement | null;
        if (focused && focused !== document.body && !isTextEntryTarget(focused)) focused.blur();
        focusInputOnOpenRef.current = false;
        setOpen(true);
        void startListeningRef.current();
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (!spaceHeldRef.current || !matchesShortcut(event, shortcutsRef.current.pushToTalk)) return;
      spaceHeldRef.current = false;
      if (listeningRef.current) stopListeningRef.current();
      else spaceReleasePendingRef.current = true;
    };

    // Losing focus mid-recording must release the microphone.
    const onBlur = () => {
      if (!spaceHeldRef.current) return;
      spaceHeldRef.current = false;
      stopListeningRef.current();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [cancelSpeech, stopContinuousListening]);

  useEffect(() => {
    return () => {
      wakeEnabledRef.current = false;
      try {
        wakeRecognitionRef.current?.stop();
      } catch {
        // Ignore teardown races.
      }
      micControllerRef.current?.stop();
      micControllerRef.current = null;
      if (isCapturing()) void stopCapture();
      releaseMicrophone();
      cancelCompanionVoice();
    };
  }, []);

  const submitTyped = (event: React.FormEvent) => {
    event.preventDefault();
    const value = inputText.trim();
    if (!value) return;
    setInputText("");
    void runCommand(value, "typed");
  };

  const micActive = listening || alwaysOnListening || wakeListening;

  // Publishes the live voice session so the cockpit reactor and the
  // holographic microphone interface follow the real microphone state.
  useEffect(() => {
    publishVoice({
      state: processing
        ? "processing"
        : speaking
          ? "speaking"
          : micActive
            ? "listening"
            : status === "error"
              ? "error"
              : "idle",
      transcript: transcript || "",
      reply: lastResult?.text || "",
      detail: statusMessage,
      muted: !settings.voiceEnabled,
      micPermission,
    });
  }, [
    processing,
    speaking,
    micActive,
    status,
    transcript,
    lastResult,
    statusMessage,
    settings.voiceEnabled,
    micPermission,
  ]);

  const displayStatus: VoiceStatus = processing
    ? "processing"
    : speaking
      ? "success"
      : micActive
        ? "listening"
        : status;

  const companionState = processing
    ? "processing"
    : speaking
      ? "speaking"
      : micActive
        ? "listening"
        : status === "error"
          ? "error"
          : "idle";

  const companionCaption = processing
    ? "Working on that…"
    : lastResult?.text
      ? lastResult.text
      : micActive
        ? "I am listening — just talk to me."
        : mediaConsent !== "granted"
          ? "Tap me and press Speak to turn my microphone on."
          : statusMessage;

  const statusLabel = processing
    ? "Working"
    : speaking
      ? "Speaking"
      : micActive
        ? "Listening"
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
      <VoiceCompanionFigure
        state={companionState}
        caption={companionCaption}
        open={open}
        onToggle={() => setOpen((value) => !value)}
      />

      {open && (
        <section
          data-testid="voice-command-panel"
          aria-label="AURIX voice command system"
          className="fixed bottom-28 right-3 sm:right-5 z-40 w-[calc(100vw-1.5rem)] sm:w-[430px] max-h-[70vh] overflow-y-auto rounded-2xl border border-emerald-500/35 bg-white/95 dark:bg-[#0F1724]/95 backdrop-blur-md shadow-2xl"
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
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => onNavigate("settings")}
                title="Open microphone settings"
                data-testid="mic-permission"
                className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-[10px] font-semibold whitespace-nowrap cursor-pointer ${
                  micPermission === "granted"
                    ? "border-emerald-300 dark:border-emerald-700/70 text-emerald-700 dark:text-emerald-300"
                    : micPermission === "denied"
                      ? "border-rose-300 dark:border-rose-700/70 text-rose-700 dark:text-rose-300"
                      : "border-slate-300 dark:border-slate-700 text-[#64748B] dark:text-slate-300"
                }`}
              >
                <Mic className="w-3 h-3" />
                {micPermission === "granted" ? "Mic ready" : micPermission === "denied" ? "Mic blocked" : "Mic ask"}
              </button>
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

          <details className="px-4 pb-3 group">
            <summary className="flex items-center justify-between gap-2 cursor-pointer list-none text-[11px] font-semibold text-[#202938] dark:text-slate-200">
              <span className="inline-flex items-center gap-1.5">
                <Keyboard className="w-3.5 h-3.5 text-[#06B6D4]" />
                Keyboard shortcuts
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-[#64748B] group-open:rotate-180 transition-transform" />
            </summary>
            <div className="mt-2.5">
              <VoiceShortcutSettings
                shortcuts={shortcuts}
                onChange={(next) => void onUpdateSettings({ ...settings, voiceShortcuts: next })}
              />
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

          <div className="px-4 py-2.5 border-t border-slate-200/80 dark:border-slate-800/80 space-y-1 text-[9px] text-[#64748B] dark:text-slate-500">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                Hold {formatShortcut(shortcuts.pushToTalk)} to talk · {formatShortcut(shortcuts.cancel)} cancels
              </span>
              <button
                type="button"
                onClick={() => {
                  const next = { ...settings, voiceEnabled: !settings.voiceEnabled };
                  if (!next.voiceEnabled) cancelSpeech();
                  void onUpdateSettings(next);
                }}
                aria-pressed={!settings.voiceEnabled}
                data-testid="voice-mute-toggle"
                className="inline-flex items-center gap-1 cursor-pointer hover:text-[#10B981]"
              >
                {settings.voiceEnabled ? (
                  <Volume2 className="w-3 h-3 text-[#10B981]" />
                ) : (
                  <VolumeX className="w-3 h-3 text-rose-500" />
                )}
                <span>{settings.voiceEnabled ? "Voice on" : "Muted"}</span>
                <span className="font-mono">{formatShortcut(shortcuts.mute)}</span>
              </button>
            </div>
            <span className="block truncate">
              {settings.wakePhrase ? `Wake phrase: “${settings.wakePhrase}”` : "Wake phrase not set"}
            </span>
          </div>
        </section>
      )}
    </>
  );
}
