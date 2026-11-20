import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  BellOff,
  Building2,
  Download,
  ExternalLink,
  FolderKanban,
  Globe,
  ListChecks,
  Mic,
  MicOff,
  MoonStar,
  OctagonAlert,
  Pause,
  Play,
  Send,
  ShieldCheck,
  Sparkles,
  Upload,
  Volume2,
  VolumeX,
} from "lucide-react";
import type {
  AppSettings,
  AurixLanguage,
  AurixSectionId,
  ChatMessage,
  CompanyProfile,
  ConversationSummary,
  CreativeAsset,
  OwnerProfile,
  ProjectRecord,
  SelfHealReport,
  SystemTelemetry,
  TaskItem,
  WebsiteRecord,
} from "../types/aurix";
import { cancelOfflineVoice, speakWithOfflineBritishVoice } from "../utils/offlineVoice";

type FocusNodeId = "company" | "websites" | "projects" | "tasks" | "system";
type OrbState = "ready" | "listening" | "thinking" | "speaking" | "executing" | "error";

type CommandAction =
  | { type: "open_url"; label: string; url: string }
  | { type: "navigate"; section: string; label: string }
  | { type: "self_heal"; report: SelfHealReport }
  | { type: "creative"; asset: CreativeAsset }
  | { type: "file_saved"; fileName: string };

interface CommandHubViewProps {
  owner: OwnerProfile;
  company: CompanyProfile;
  websites: WebsiteRecord[];
  projects: ProjectRecord[];
  tasks: TaskItem[];
  conversations: ConversationSummary[];
  settings: AppSettings;
  telemetry: SystemTelemetry;
  isOnline: boolean;
  welcomeTriggerSignal?: number;
  onNavigate: (section: AurixSectionId) => void;
  onUpdateSettings: (next: AppSettings) => Promise<void>;
  onEmergencyStop: (active: boolean) => Promise<void>;
  onConversationsUpdated: (conversations: ConversationSummary[]) => void;
}

const FOCUS_TOPICS = [
  "AM VEYRONIX Business Strategy",
  "AM NEXORA & Isolated Websites",
  "Active Software Projects",
  "Cybersecurity & System Self-Healing",
  "Owner Daily Productivity & Focus",
];

function isWithinQuietHours(settings: AppSettings): boolean {
  if (!settings.quietHoursEnabled) return false;
  const now = new Date();
  const currentMins = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = (settings.quietHoursStart || "22:00").split(":").map(Number);
  const [eh, em] = (settings.quietHoursEnd || "07:00").split(":").map(Number);
  const startMins = (sh || 0) * 60 + (sm || 0);
  const endMins = (eh || 0) * 60 + (em || 0);
  if (startMins <= endMins) {
    return currentMins >= startMins && currentMins <= endMins;
  }
  return currentMins >= startMins || currentMins <= endMins;
}

function buildImmediateBritishWelcome(lang: AurixLanguage): string {
  const hr = new Date().getHours();
  if (lang === "Urdu") {
    const sal = hr >= 5 && hr < 12 ? "صبح بخیر" : hr >= 12 && hr < 17 ? "دوپہر بخیر" : "شام بخیر";
    return `${sal}، محیب! میں اورکس آن لائن، فعال اور آپ کی خدمت کے لیے تیار ہوں۔ آپ کیسے ہیں؟ آج آپ کے ذہن میں کون سے نئے آئیڈیاز ہیں اور ہم کون سا کام شروع کریں؟`;
  }
  if (lang === "Hindi") {
    const sal = hr >= 5 && hr < 12 ? "सुप्रभात" : hr >= 12 && hr < 17 ? "नमस्कार" : "शुभ संध्या";
    return `${sal}, मुहीब! मैं ऑरिक्स ऑनलाइन, सक्रिय और तैयार हूँ। आप कैसे हैं? आज आपके पास कौन से नए विचार हैं और हम कौन सा काम शुरू करें?`;
  }
  const period = hr >= 5 && hr < 12 ? "Good morning" : hr >= 12 && hr < 17 ? "Good afternoon" : "Good evening";
  return `${period}, Muheeb! I am online, active, and at your service. How are you feeling today, what brilliant ideas are on your mind, and which project or task would you like us to begin with?`;
}

export function CommandHubView({
  owner,
  company,
  websites,
  projects,
  tasks,
  conversations,
  settings,
  telemetry,
  isOnline,
  welcomeTriggerSignal = 0,
  onNavigate,
  onUpdateSettings,
  onEmergencyStop,
  onConversationsUpdated,
}: CommandHubViewProps) {
  const [focusedNode, setFocusedNode] = useState<FocusNodeId>("websites");
  const [orbState, setOrbState] = useState<OrbState>("ready");
  const [companionConvId, setCompanionConvId] = useState<string | null>(() => {
    const existing = conversations.find((c) => c.mode === "companion") || conversations[0];
    return existing ? existing.id : null;
  });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageActions, setMessageActions] = useState<Record<string, CommandAction>>({});
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [voiceMuted, setVoiceMuted] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [statusLabel, setStatusLabel] = useState("Ready for command");

  const orbCanvasRef = useRef<HTMLCanvasElement>(null);
  const barsCanvasRef = useRef<HTMLCanvasElement>(null);
  const feedEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  const vadTimerRef = useRef<number | null>(null);

  const orbStateRef = useRef<OrbState>("ready");
  orbStateRef.current = orbState;
  const boundaryPulseRef = useRef<number>(0);
  const lastActivityRef = useRef<number>(Date.now());
  const proactiveBusyRef = useRef<boolean>(false);
  const topicIndexRef = useRef<number>(0);
  const handledWelcomeSignalRef = useRef<number>(0);
  const lightweightModeRef = useRef<boolean>(false);
  lightweightModeRef.current =
    settings.lightweightAnimations ||
    settings.performanceMode === "lightweight" ||
    (settings.performanceMode === "auto" && telemetry.recommendedMode === "Lightweight");

  const quietHoursActive = isWithinQuietHours(settings);
  const speechSuppressed = voiceMuted || !settings.voiceEnabled || settings.doNotDisturb || quietHoursActive || telemetry.emergencyStopActive;

  useEffect(() => {
    if (!companionConvId) return;
    fetch(`/api/conversations/${companionConvId}/messages`)
      .then((r) => r.json())
      .then((list) => {
        if (Array.isArray(list)) setMessages(list);
      })
      .catch(() => {});
  }, [companionConvId]);

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, sending]);

  useEffect(() => {
    return () => {
      if (vadTimerRef.current) window.clearInterval(vadTimerRef.current);
      activeAudioRef.current?.pause();
      cancelOfflineVoice();
      recognitionRef.current?.stop();
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  const stopAllAudio = useCallback(() => {
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current.src = "";
      activeAudioRef.current = null;
    }
    cancelOfflineVoice();
    boundaryPulseRef.current = 0;
    if (orbStateRef.current === "speaking") {
      setOrbState("ready");
      setStatusLabel(settings.proactiveTalkEnabled ? "British companion active" : "Ready for command");
    }
  }, [settings.proactiveTalkEnabled]);

  // If Emergency Stop turns ON while speaking/recording, halt immediately
  useEffect(() => {
    if (telemetry.emergencyStopActive) {
      stopAllAudio();
      if (vadTimerRef.current) {
        window.clearInterval(vadTimerRef.current);
        vadTimerRef.current = null;
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      recognitionRef.current?.stop();
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      setRecording(false);
      setOrbState("ready");
      setStatusLabel("Emergency Stop active");
    }
  }, [telemetry.emergencyStopActive, stopAllAudio]);

  const speakAudioBase64 = useCallback(
    async (base64: string, mimeType = "audio/wav", fallbackText?: string) => {
      if (speechSuppressed) return;
      stopAllAudio();
      const src = `data:${mimeType};base64,${base64}`;
      const audio = new Audio(src);
      audio.volume = Math.max(0, Math.min(1, (settings.greetingVolume ?? 85) / 100));
      activeAudioRef.current = audio;

      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
            audioCtxRef.current = new AudioCtx();
          }
          if (audioCtxRef.current.state === "suspended") {
            await audioCtxRef.current.resume().catch(() => {});
          }
          const source = audioCtxRef.current.createMediaElementSource(audio);
          const analyser = audioCtxRef.current.createAnalyser();
          analyser.fftSize = 128;
          source.connect(analyser);
          analyser.connect(audioCtxRef.current.destination);
          analyserRef.current = analyser;
        }
      } catch {
        // Offline boundary pulse still visualizes voice
      }

      audio.onplay = () => {
        setOrbState("speaking");
        setStatusLabel("Speaking (British)");
      };
      audio.onended = () => {
        analyserRef.current = null;
        setOrbState("ready");
        setStatusLabel(settings.proactiveTalkEnabled ? "British companion active" : "Ready for command");
        lastActivityRef.current = Date.now();
      };
      audio.onerror = () => {
        analyserRef.current = null;
        setOrbState("ready");
      };

      try {
        await audio.play();
      } catch {
        if (fallbackText) {
          speakWithOfflineBritishVoice(fallbackText, settings.language, settings.voiceSpeed, {
            onStart: () => {
              setOrbState("speaking");
              setStatusLabel("Speaking (Offline British)");
            },
            onBoundary: () => {
              boundaryPulseRef.current = 1;
            },
            onEnd: () => {
              boundaryPulseRef.current = 0;
              setOrbState("ready");
              setStatusLabel(settings.proactiveTalkEnabled ? "British companion active" : "Ready for command");
              lastActivityRef.current = Date.now();
            },
          });
        } else {
          setOrbState("ready");
        }
      }
    },
    [
      speechSuppressed,
      settings.greetingVolume,
      settings.proactiveTalkEnabled,
      settings.language,
      settings.voiceSpeed,
      stopAllAudio,
    ]
  );

  const speakTextWithAurix = useCallback(
    async (text: string) => {
      if (speechSuppressed || !text.trim()) return;
      stopAllAudio();

      if (isOnline && !settings.offlineModeForced) {
        try {
          const res = await fetch("/api/voice/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text,
              voiceName: settings.voiceName,
              language: settings.language,
              speed: settings.voiceSpeed,
            }),
          });
          const data = await res.json();
          if (res.ok && data.audioBase64) {
            await speakAudioBase64(data.audioBase64, data.mimeType || "audio/wav", text);
            return;
          }
        } catch {
          // Fallback to offline British SpeechSynthesis
        }
      }

      speakWithOfflineBritishVoice(text, settings.language, settings.voiceSpeed, {
        onStart: () => {
          setOrbState("speaking");
          setStatusLabel("Speaking (Offline British)");
        },
        onBoundary: () => {
          boundaryPulseRef.current = 1;
        },
        onEnd: () => {
          boundaryPulseRef.current = 0;
          setOrbState("ready");
          setStatusLabel(settings.proactiveTalkEnabled ? "British companion active" : "Ready for command");
          lastActivityRef.current = Date.now();
        },
      });
    },
    [
      speechSuppressed,
      isOnline,
      settings.offlineModeForced,
      settings.voiceName,
      settings.language,
      settings.voiceSpeed,
      settings.proactiveTalkEnabled,
      stopAllAudio,
      speakAudioBase64,
    ]
  );

  useEffect(() => {
    if (!welcomeTriggerSignal || welcomeTriggerSignal === handledWelcomeSignalRef.current) return;
    handledWelcomeSignalRef.current = welcomeTriggerSignal;

    const welcomeText = buildImmediateBritishWelcome(settings.language);
    const localMsg: ChatMessage = {
      id: `welcome_${Date.now()}`,
      conversationId: companionConvId || "welcome",
      role: "assistant",
      content: welcomeText,
      language: settings.language,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, localMsg]);
    lastActivityRef.current = Date.now();
    if (!speechSuppressed) {
      speakTextWithAurix(welcomeText);
    }
  }, [welcomeTriggerSignal, settings.language, companionConvId, speechSuppressed, speakTextWithAurix]);

  const triggerProactiveTurn = useCallback(
    async (manual = false) => {
      if (proactiveBusyRef.current) return;
      if (telemetry.emergencyStopActive) return;
      if (!manual && (orbStateRef.current !== "ready" || sending || recording || settings.doNotDisturb || quietHoursActive)) {
        return;
      }

      proactiveBusyRef.current = true;
      if (manual) {
        setOrbState("thinking");
        setStatusLabel("Preparing guidance");
      }

      const focusTopic = FOCUS_TOPICS[topicIndexRef.current % FOCUS_TOPICS.length];
      topicIndexRef.current += 1;

      try {
        const res = await fetch("/api/proactive", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId: companionConvId || undefined,
            language: settings.language,
            focusTopic,
            withVoice: !speechSuppressed,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Proactive turn failed");

        if (data.conversationId) setCompanionConvId(data.conversationId);
        if (data.conversations) onConversationsUpdated(data.conversations);
        if (data.assistantMessage) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === data.assistantMessage.id)) return prev;
            return [...prev, data.assistantMessage];
          });
        }
        lastActivityRef.current = Date.now();

        if (!speechSuppressed) {
          if (data.audioBase64) {
            await speakAudioBase64(data.audioBase64, data.mimeType || "audio/wav", data.assistantMessage?.content);
          } else if (data.assistantMessage?.content) {
            await speakTextWithAurix(data.assistantMessage.content);
          } else {
            setOrbState("ready");
          }
        } else {
          setOrbState("ready");
        }
      } catch (err) {
        if (manual) {
          setNotice(err instanceof Error ? err.message : "Could not fetch proactive advice.");
          setOrbState("error");
          setTimeout(() => setOrbState("ready"), 2500);
        } else {
          setOrbState("ready");
        }
      } finally {
        proactiveBusyRef.current = false;
      }
    },
    [
      telemetry.emergencyStopActive,
      sending,
      recording,
      settings.doNotDisturb,
      quietHoursActive,
      companionConvId,
      settings.language,
      speechSuppressed,
      onConversationsUpdated,
      speakAudioBase64,
      speakTextWithAurix,
    ]
  );

  useEffect(() => {
    if (!settings.proactiveTalkEnabled || settings.doNotDisturb || quietHoursActive || telemetry.emergencyStopActive) {
      return;
    }
    const intervalMs = Math.max(12, settings.proactiveIntervalSeconds || 20) * 1000;

    const loop = window.setInterval(() => {
      const idleFor = Date.now() - lastActivityRef.current;
      if (idleFor >= intervalMs && orbStateRef.current === "ready" && !sending && !recording && !inputText.trim()) {
        triggerProactiveTurn(false);
      }
    }, 4500);

    return () => window.clearInterval(loop);
  }, [
    settings.proactiveTalkEnabled,
    settings.doNotDisturb,
    quietHoursActive,
    telemetry.emergencyStopActive,
    settings.proactiveIntervalSeconds,
    sending,
    recording,
    inputText,
    triggerProactiveTurn,
  ]);

  const sendCommandToAurix = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;
      if (telemetry.emergencyStopActive) {
        setNotice("Emergency Stop is active. Resume operations in the header before running commands.");
        return;
      }

      lastActivityRef.current = Date.now();
      setNotice(null);
      setSending(true);
      setOrbState("thinking");
      setStatusLabel("Processing command");
      stopAllAudio();

      try {
        const res = await fetch("/api/command/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            command: trimmed,
            conversationId: companionConvId || undefined,
            language: settings.language,
            withVoice: !speechSuppressed,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "AURIX command failed.");

        if (data.action) {
          setOrbState("executing");
          setStatusLabel("Executing action");
        }

        setCompanionConvId(data.conversationId);
        if (data.conversations) onConversationsUpdated(data.conversations);
        setMessages((prev) => [...prev, data.userMessage, data.assistantMessage]);

        if (data.action && data.assistantMessage?.id) {
          setMessageActions((prev) => ({
            ...prev,
            [data.assistantMessage.id]: data.action as CommandAction,
          }));
        }

        lastActivityRef.current = Date.now();

        if (!speechSuppressed) {
          if (data.audioBase64) {
            await speakAudioBase64(data.audioBase64, data.mimeType || "audio/wav", data.assistantMessage.content);
          } else {
            await speakTextWithAurix(data.assistantMessage.content);
          }
        } else {
          setOrbState("ready");
          setStatusLabel(settings.proactiveTalkEnabled ? "British companion active" : "Ready for command");
        }
      } catch (err) {
        setNotice(err instanceof Error ? err.message : "Failed to reach AURIX.");
        setOrbState("error");
        setStatusLabel("Command error");
        setTimeout(() => {
          setOrbState("ready");
          setStatusLabel("Ready for command");
        }, 2500);
      } finally {
        setSending(false);
      }
    },
    [
      sending,
      telemetry.emergencyStopActive,
      stopAllAudio,
      companionConvId,
      settings.language,
      settings.proactiveTalkEnabled,
      speechSuppressed,
      onConversationsUpdated,
      speakAudioBase64,
      speakTextWithAurix,
    ]
  );

  const processAudioBlob = useCallback(
    async (blob: Blob) => {
      setOrbState("thinking");
      setStatusLabel("Transcribing speech");
      try {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(String(reader.result || "").split(",")[1] || "");
          reader.onerror = () => reject(new Error("Could not read audio"));
          reader.readAsDataURL(blob);
        });
        const sttRes = await fetch("/api/voice/stt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            audioBase64: base64,
            mimeType: blob.type || "audio/webm",
            languageHint: settings.language,
          }),
        });
        const sttData = await sttRes.json();
        if (!sttRes.ok) throw new Error(sttData.error || "Transcription failed.");
        await sendCommandToAurix(sttData.transcript);
      } catch (err) {
        setNotice(err instanceof Error ? err.message : "Voice transcription unavailable — type your command below.");
        setOrbState("error");
        setStatusLabel("Voice error");
        setTimeout(() => {
          setOrbState("ready");
          setStatusLabel("Ready for command");
        }, 2500);
      }
    },
    [sendCommandToAurix, settings.language]
  );

  const stopRecordingCleanly = useCallback(() => {
    if (vadTimerRef.current) {
      window.clearInterval(vadTimerRef.current);
      vadTimerRef.current = null;
    }
    recognitionRef.current?.stop();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    setRecording(false);
    setOrbState("thinking");
    setStatusLabel("Processing speech");
  }, []);

  const toggleMicTalk = async () => {
    setNotice(null);
    lastActivityRef.current = Date.now();
    if (telemetry.emergencyStopActive) {
      setNotice("Emergency Stop is enabled. Resume operations first.");
      return;
    }

    if (recording) {
      stopRecordingCleanly();
      return;
    }

    stopAllAudio();

    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Mic API unavailable");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      let localAnalyser: AnalyserNode | null = null;
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
          audioCtxRef.current = new AudioCtx();
        }
        if (audioCtxRef.current.state === "suspended") {
          await audioCtxRef.current.resume().catch(() => {});
        }
        const source = audioCtxRef.current.createMediaStreamSource(stream);
        const analyser = audioCtxRef.current.createAnalyser();
        analyser.fftSize = 128;
        source.connect(analyser);
        analyserRef.current = analyser;
        localAnalyser = analyser;
      }

      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      recorder.onstop = async () => {
        if (vadTimerRef.current) {
          window.clearInterval(vadTimerRef.current);
          vadTimerRef.current = null;
        }
        analyserRef.current = null;
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (blob.size > 0) {
          await processAudioBlob(blob);
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setOrbState("listening");
      setStatusLabel(settings.handsFreeVadEnabled ? "Listening (Hands-Free VAD)" : "Listening to Muheeb");

      // Hands-Free VAD Silence Auto-Submit
      if (settings.handsFreeVadEnabled && localAnalyser) {
        const samples = new Uint8Array(localAnalyser.fftSize);
        let heardSpeech = false;
        let lastSpeechAt = Date.now();
        const threshold = Math.max(8, Math.min(45, 55 - (settings.vadSensitivity || 55) * 0.45));

        vadTimerRef.current = window.setInterval(() => {
          if (!localAnalyser) return;
          localAnalyser.getByteTimeDomainData(samples);
          let sumSq = 0;
          for (let i = 0; i < samples.length; i++) {
            const diff = samples[i] - 128;
            sumSq += diff * diff;
          }
          const rms = Math.sqrt(sumSq / samples.length);
          if (rms >= threshold) {
            heardSpeech = true;
            lastSpeechAt = Date.now();
          } else if (heardSpeech && Date.now() - lastSpeechAt > 1350) {
            stopRecordingCleanly();
          }
        }, 120);
      }
    } catch {
      const SpeechRec =
        (window as unknown as { SpeechRecognition?: new () => unknown; webkitSpeechRecognition?: new () => unknown })
          .SpeechRecognition ||
        (window as unknown as { webkitSpeechRecognition?: new () => unknown }).webkitSpeechRecognition;

      if (SpeechRec) {
        try {
          const rec = new SpeechRec() as {
            lang: string;
            interimResults: boolean;
            onresult: (ev: { results: ArrayLike<{ 0: { transcript: string } }> }) => void;
            onerror: () => void;
            onend: () => void;
            start: () => void;
            stop: () => void;
          };
          rec.lang = settings.language === "Urdu" ? "ur-PK" : settings.language === "Hindi" ? "hi-IN" : "en-GB";
          rec.interimResults = false;
          rec.onresult = (ev) => {
            const said = ev.results[0]?.[0]?.transcript || "";
            if (said.trim()) sendCommandToAurix(said);
          };
          rec.onerror = () => {
            setRecording(false);
            setOrbState("ready");
            setNotice("Live microphone is restricted in this preview frame. Type a command or upload audio.");
          };
          rec.onend = () => {
            setRecording(false);
            if (orbStateRef.current === "listening") setOrbState("ready");
          };
          recognitionRef.current = rec;
          rec.start();
          setRecording(true);
          setOrbState("listening");
          setStatusLabel("Listening to Muheeb");
          return;
        } catch {
          // Fall through
        }
      }
      setNotice("Browser or preview frame restricted live mic capture. Type below or upload an audio file.");
    }
  };

  // Bright Glassmorphism Orb + Real Audio Reactive Equalizer Canvas Loop (no fake jitter when idle)
  useEffect(() => {
    const orbCanvas = orbCanvasRef.current;
    const barsCanvas = barsCanvasRef.current;
    if (!orbCanvas || !barsCanvas) return;
    const oCtx = orbCanvas.getContext("2d");
    const bCtx = barsCanvas.getContext("2d");
    if (!oCtx || !bCtx) return;

    const dpr = window.devicePixelRatio || 1;
    const orbSize = 290;
    orbCanvas.width = orbSize * dpr;
    orbCanvas.height = orbSize * dpr;
    oCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const barsW = 264;
    const barsH = 40;
    barsCanvas.width = barsW * dpr;
    barsCanvas.height = barsH * dpr;
    bCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let raf = 0;
    let freqData: Uint8Array<ArrayBuffer> | null = null;
    const smoothBars = new Float32Array(32);

    const render = (now: number) => {
      const t = now / 1000;
      const state = orbStateRef.current;
      const analyser = analyserRef.current;
      const lite = lightweightModeRef.current;

      if (analyser) {
        if (!freqData || freqData.length !== analyser.frequencyBinCount) {
          freqData = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
        }
        analyser.getByteFrequencyData(freqData);
      }

      // Decay real SpeechSynthesis onBoundary pulse smoothly
      boundaryPulseRef.current *= 0.88;

      let avgEnergy = 0;
      for (let i = 0; i < 32; i++) {
        let target = 0.08;
        if (state === "ready") {
          target = lite ? 0.08 : 0.08 + 0.03 * Math.sin(t * 1.4 + i * 0.25);
        } else if (state === "listening") {
          const liveBin = freqData ? freqData[i % freqData.length] / 255 : 0;
          target = Math.max(0.12, Math.min(1, liveBin * 1.55));
        } else if (state === "speaking") {
          const liveBin = freqData ? freqData[(i * 2) % freqData.length] / 255 : 0;
          const pulse = boundaryPulseRef.current;
          if (liveBin > 0.03) {
            target = Math.min(1, liveBin * 1.4);
          } else {
            const shape = Math.exp(-Math.pow((i - 16) / 10, 2));
            target = 0.14 + pulse * 0.65 * shape;
          }
        } else if (state === "thinking" || state === "executing") {
          const wave = Math.sin(t * 5 - i * 0.35) * 0.5 + 0.5;
          target = 0.16 + wave * 0.32;
        } else if (state === "error") {
          target = 0.28;
        }
        smoothBars[i] += (target - smoothBars[i]) * 0.25;
        avgEnergy += smoothBars[i];
      }
      avgEnergy /= 32;

      const cx = orbSize / 2;
      const cy = orbSize / 2;
      oCtx.clearRect(0, 0, orbSize, orbSize);

      // Soft Bright Aura
      const auraR = 128 + avgEnergy * 16;
      const auraGrad = oCtx.createRadialGradient(cx, cy, 24, cx, cy, auraR);
      if (state === "error") {
        auraGrad.addColorStop(0, "rgba(225, 29, 72, 0.26)");
        auraGrad.addColorStop(0.55, "rgba(214, 173, 96, 0.12)");
      } else if (state === "listening") {
        auraGrad.addColorStop(0, "rgba(16, 185, 129, 0.32)");
        auraGrad.addColorStop(0.55, "rgba(6, 182, 212, 0.16)");
      } else if (state === "speaking") {
        auraGrad.addColorStop(0, "rgba(214, 173, 96, 0.32)");
        auraGrad.addColorStop(0.55, "rgba(16, 185, 129, 0.18)");
      } else if (state === "thinking" || state === "executing") {
        auraGrad.addColorStop(0, "rgba(6, 182, 212, 0.30)");
        auraGrad.addColorStop(0.55, "rgba(16, 185, 129, 0.14)");
      } else {
        auraGrad.addColorStop(0, "rgba(16, 185, 129, 0.18)");
        auraGrad.addColorStop(0.55, "rgba(6, 182, 212, 0.10)");
      }
      auraGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
      oCtx.fillStyle = auraGrad;
      oCtx.beginPath();
      oCtx.arc(cx, cy, auraR, 0, Math.PI * 2);
      oCtx.fill();

      // Precision Ring & Gold Caliper Arcs
      oCtx.save();
      oCtx.translate(cx, cy);
      if (!lite) oCtx.rotate(t * 0.15);
      oCtx.strokeStyle = state === "error" ? "rgba(225, 29, 72, 0.45)" : "rgba(16, 185, 129, 0.45)";
      oCtx.lineWidth = 1.4;
      oCtx.setLineDash([6, 6]);
      oCtx.beginPath();
      oCtx.arc(0, 0, 118, 0, Math.PI * 2);
      oCtx.stroke();

      oCtx.setLineDash([]);
      if (!lite) oCtx.rotate(-t * 0.35);
      oCtx.strokeStyle = state === "error" ? "rgba(225, 29, 72, 0.8)" : "rgba(214, 173, 96, 0.9)";
      oCtx.lineWidth = 2.5;
      for (const offset of [0, Math.PI]) {
        oCtx.beginPath();
        oCtx.arc(0, 0, 105, offset - 0.4, offset + 0.4);
        oCtx.stroke();
      }
      oCtx.restore();

      // 360-degree Waveform Ring
      const spikes = lite ? 32 : 64;
      const baseR = 72;
      oCtx.beginPath();
      for (let i = 0; i <= spikes; i++) {
        const idx = i % spikes;
        const amp = smoothBars[idx % 32];
        const angle = (idx / spikes) * Math.PI * 2 - Math.PI / 2;
        const r = baseR + amp * (state === "ready" ? 8 : 28);
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        if (i === 0) oCtx.moveTo(x, y);
        else oCtx.lineTo(x, y);
      }
      oCtx.closePath();
      oCtx.strokeStyle =
        state === "error"
          ? "#E11D48"
          : state === "listening"
            ? "#10B981"
            : state === "speaking"
              ? "#D6AD60"
              : state === "thinking" || state === "executing"
                ? "#06B6D4"
                : "rgba(16, 185, 129, 0.6)";
      oCtx.lineWidth = state === "ready" ? 1.5 : 2.2;
      oCtx.stroke();

      // Core Glassmorphism Sphere
      const sphereR = 50 + avgEnergy * 6;
      const sphereGrad = oCtx.createRadialGradient(cx - 14, cy - 14, 6, cx, cy, sphereR);
      if (state === "error") {
        sphereGrad.addColorStop(0, "#FFE4E6");
        sphereGrad.addColorStop(0.5, "#F43F5E");
        sphereGrad.addColorStop(1, "#9F1239");
      } else if (state === "speaking") {
        sphereGrad.addColorStop(0, "#FFFBEB");
        sphereGrad.addColorStop(0.45, "#D6AD60");
        sphereGrad.addColorStop(0.85, "#10B981");
        sphereGrad.addColorStop(1, "#047857");
      } else if (state === "thinking" || state === "executing") {
        sphereGrad.addColorStop(0, "#ECFEFF");
        sphereGrad.addColorStop(0.45, "#06B6D4");
        sphereGrad.addColorStop(1, "#0E7490");
      } else {
        sphereGrad.addColorStop(0, "#ECFDF5");
        sphereGrad.addColorStop(0.45, "#10B981");
        sphereGrad.addColorStop(1, "#047857");
      }

      oCtx.beginPath();
      oCtx.arc(cx, cy, sphereR, 0, Math.PI * 2);
      oCtx.fillStyle = sphereGrad;
      oCtx.fill();
      oCtx.strokeStyle = "rgba(255, 255, 255, 0.85)";
      oCtx.lineWidth = 1.6;
      oCtx.stroke();

      // Bottom 32-Bar Equalizer
      bCtx.clearRect(0, 0, barsW, barsH);
      const count = 32;
      const gap = 3.2;
      const barW = (barsW - gap * (count - 1)) / count;
      for (let i = 0; i < count; i++) {
        const energy = smoothBars[i];
        const barH = Math.max(4, energy * (barsH - 4));
        const x = i * (barW + gap);
        const y = (barsH - barH) / 2;

        bCtx.fillStyle =
          state === "error"
            ? "#E11D48"
            : state === "speaking"
              ? i % 2 === 0
                ? "#D6AD60"
                : "#10B981"
              : state === "thinking" || state === "executing"
                ? "#06B6D4"
                : "#10B981";
        bCtx.beginPath();
        bCtx.roundRect(x, y, barW, barH, 2);
        bCtx.fill();
      }

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, []);

  const openTasks = tasks.filter((t) => t.status !== "done");
  const activeProjects = projects.filter((p) => p.status === "active");
  const ramPct = Math.round((telemetry.usedMemoryBytes / telemetry.totalMemoryBytes) * 100);

  const branches: Array<{
    id: FocusNodeId;
    title: string;
    metric: string;
    sub: string;
    icon: React.ComponentType<{ className?: string }>;
    targetSection: AurixSectionId;
  }> = [
    {
      id: "websites",
      title: "Isolated Websites",
      metric: `${websites.length} Sites`,
      sub: "AM NEXORA · AM DIGITAL HUB",
      icon: Globe,
      targetSection: "websites",
    },
    {
      id: "projects",
      title: "Creative & Code Studio",
      metric: `${activeProjects.length} Active`,
      sub: "Image · Video · Writing · Websites",
      icon: FolderKanban,
      targetSection: "creative",
    },
    {
      id: "tasks",
      title: "Owner Queue",
      metric: `${openTasks.length} Open`,
      sub: "Daily & engineering tasks",
      icon: ListChecks,
      targetSection: "productivity",
    },
    {
      id: "company",
      title: company.name,
      metric: `${company.services.length} Services`,
      sub: `Founder: ${owner.name}`,
      icon: Building2,
      targetSection: "company",
    },
    {
      id: "system",
      title: "Self-Heal & Cyber",
      metric: `${ramPct}% RAM`,
      sub: `${telemetry.recommendedMode} Mode · Watchdog`,
      icon: Activity,
      targetSection: "selfheal",
    },
  ];

  const activeBranch = branches.find((b) => b.id === focusedNode) || branches[0];

  const downloadPictureSvgPng = (asset: CreativeAsset) => {
    if (!asset.svgMarkup) return;
    const img = new Image();
    const blob = new Blob([asset.svgMarkup], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = 1280;
      c.height = 720;
      const ctx = c.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0, 1280, 720);
        const a = document.createElement("a");
        a.href = c.toDataURL("image/png");
        a.download = `${asset.title.toLowerCase().replace(/[^a-z0-9]+/g, "_") || "aurix_art"}.png`;
        a.click();
      }
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  return (
    <div className="space-y-4">
      {telemetry.emergencyStopActive && (
        <div className="rounded-xl border border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-950/40 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-xs text-rose-800 dark:text-rose-200 font-medium">
            <OctagonAlert className="w-4 h-4 text-rose-600 shrink-0" />
            <span>
              Emergency Stop is engaged: proactive speech, audio output, and desktop automation are paused.
            </span>
          </div>
          <button
            type="button"
            onClick={() => onEmergencyStop(false)}
            className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
          >
            Resume Normal Operations
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-stretch">
        {/* LEFT + CENTER STAGE: BRIGHT GLASSMORPHISM ORB & WORKSPACE OVERVIEW */}
        <section className="xl:col-span-7 relative rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-[#0F1724]/95 backdrop-blur-xl shadow-sm p-5 sm:p-6 flex flex-col justify-between overflow-hidden min-h-[620px]">
          <div className="flex flex-wrap items-center justify-between gap-3 z-10">
            <div>
              <div className="text-xs text-[#64748B] dark:text-slate-400">
                British Voice Companion · {telemetry.recommendedMode} Hardware Profile ({telemetry.installedRamGb} GB RAM)
              </div>
              <h1 className="text-lg sm:text-xl font-bold text-[#202938] dark:text-white mt-0.5">
                Welcome, {owner.name}
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  onUpdateSettings({
                    ...settings,
                    proactiveTalkEnabled: !settings.proactiveTalkEnabled,
                  })
                }
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors whitespace-nowrap ${
                  settings.proactiveTalkEnabled
                    ? "bg-emerald-50 dark:bg-emerald-500/15 border-[#10B981]/50 text-emerald-700 dark:text-emerald-300"
                    : "bg-[#EEF2F7] dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-[#64748B] dark:text-slate-300"
                }`}
              >
                {settings.proactiveTalkEnabled ? (
                  <Pause className="w-3.5 h-3.5 text-[#10B981]" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
                <span>Always-On Talk: {settings.proactiveTalkEnabled ? "ON" : "Paused"}</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  onUpdateSettings({
                    ...settings,
                    doNotDisturb: !settings.doNotDisturb,
                  })
                }
                title="Do Not Disturb suppresses unsolicited spoken prompts"
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors whitespace-nowrap ${
                  settings.doNotDisturb
                    ? "bg-amber-50 dark:bg-amber-500/15 border-[#D6AD60] text-[#9A742E] dark:text-amber-300"
                    : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-[#64748B] dark:text-slate-300"
                }`}
              >
                <BellOff className="w-3.5 h-3.5" />
                <span>{settings.doNotDisturb ? "DND On" : "DND Off"}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!voiceMuted) stopAllAudio();
                  setVoiceMuted((v) => !v);
                }}
                aria-label={voiceMuted ? "Unmute AURIX voice" : "Mute AURIX voice"}
                className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-[#10B981] text-[#202938] dark:text-slate-200 cursor-pointer"
              >
                {voiceMuted ? (
                  <VolumeX className="w-4 h-4 text-rose-500" />
                ) : (
                  <Volume2 className="w-4 h-4 text-[#10B981]" />
                )}
              </button>
            </div>
          </div>

          {quietHoursActive && (
            <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-[#9A742E] dark:text-amber-300">
              <MoonStar className="w-3.5 h-3.5" />
              <span>
                Quiet Hours active ({settings.quietHoursStart}–{settings.quietHoursEnd}) — spoken interruptions paused
              </span>
            </div>
          )}

          {/* Center Combined Reactive Orb + Workspace Branch Cards */}
          <div className="relative my-4 grid grid-cols-1 md:grid-cols-12 gap-4 items-center z-10">
            <div className="md:col-span-7 flex flex-col items-center justify-center relative">
              <button
                type="button"
                onClick={toggleMicTalk}
                title="Click orb to speak with AURIX"
                className="relative group cursor-pointer focus:outline-none"
              >
                <canvas ref={orbCanvasRef} className="w-[260px] h-[260px] sm:w-[290px] sm:h-[290px] block" />
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-[10px] font-mono tracking-[0.22em] text-white/95 uppercase">AURIX 2.0</span>
                  <span className="text-sm font-display font-bold tracking-[0.16em] text-white mt-0.5 drop-shadow">
                    {orbState.toUpperCase()}
                  </span>
                </div>
              </button>

              <div className="-mt-2 flex flex-col items-center gap-2">
                <canvas ref={barsCanvasRef} className="w-[230px] sm:w-[264px] h-[40px] block" />
                <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-lg bg-[#EEF2F7] dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-xs font-medium text-[#202938] dark:text-slate-200">
                  <Mic className={`w-3.5 h-3.5 ${recording ? "text-rose-500" : "text-[#10B981]"}`} />
                  <span>{statusLabel}</span>
                </div>
              </div>
            </div>

            <div className="md:col-span-5 relative flex flex-col gap-2.5">
              <svg
                aria-hidden="true"
                viewBox="0 0 60 320"
                className="hidden md:block absolute -left-10 top-4 bottom-4 w-10 h-[calc(100%-2rem)] pointer-events-none"
                fill="none"
              >
                {[32, 92, 155, 218, 282].map((y, idx) => (
                  <path
                    key={y}
                    d={`M 0 160 C 26 160, 28 ${y}, 58 ${y}`}
                    stroke={branches[idx]?.id === focusedNode ? "#10B981" : "rgba(100,116,139,0.28)"}
                    strokeWidth={branches[idx]?.id === focusedNode ? "2.2" : "1.1"}
                  />
                ))}
              </svg>

              {branches.map((b) => {
                const Icon = b.icon;
                const selected = b.id === focusedNode;
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setFocusedNode(b.id)}
                    className={`w-full text-left rounded-xl px-3.5 py-2.5 border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                      selected
                        ? "bg-emerald-50/90 dark:bg-emerald-500/15 border-[#10B981] shadow-sm"
                        : "bg-[#F8FAFC] dark:bg-[#0B111B] border-slate-200 dark:border-slate-800 hover:border-[#06B6D4]"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          selected
                            ? "bg-[#10B981] text-white"
                            : "bg-white dark:bg-slate-800 text-[#64748B] dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-[#202938] dark:text-white truncate">{b.title}</div>
                        <div className="text-[11px] text-[#64748B] dark:text-slate-400 truncate">{b.sub}</div>
                      </div>
                    </div>
                    <div className="text-xs font-mono font-semibold text-emerald-700 dark:text-emerald-300 shrink-0 tabular-nums">
                      {b.metric}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-800 z-10 text-xs">
            <div className="text-[#64748B] dark:text-slate-400">
              {isOnline ? "Hybrid Cloud + Local Ready" : "100% Offline Engine Active"} · Voice:{" "}
              <span className="font-medium text-[#202938] dark:text-slate-200">
                British Male ({settings.voiceName})
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => triggerProactiveTurn(true)}
                disabled={sending || telemetry.emergencyStopActive}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#EEF2F7] dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-[#202938] dark:text-slate-100 font-medium cursor-pointer whitespace-nowrap"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#06B6D4]" />
                <span>Speak &amp; Advise</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate(activeBranch.targetSection)}
                className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-lg bg-[#10B981] hover:bg-emerald-600 text-white font-semibold cursor-pointer whitespace-nowrap"
              >
                <span>Open {activeBranch.title}</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </section>

        {/* RIGHT CONVERSATION, VOICE COMMANDS & LAUNCHER DRAWER */}
        <section className="xl:col-span-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-[#0F1724] backdrop-blur-xl shadow-sm p-5 flex flex-col justify-between min-h-[620px] max-h-[760px]">
          <div className="rounded-xl bg-[#F8FAFC] dark:bg-[#0B111B] border border-slate-200 dark:border-slate-800 p-4 space-y-3 shrink-0">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-[11px] font-mono uppercase tracking-[0.14em] text-[#06B6D4] font-semibold">
                  Live Voice Companion &amp; Commands
                </div>
                <h2 className="text-base font-semibold text-[#202938] dark:text-white mt-0.5">
                  {activeBranch.title} · {activeBranch.metric}
                </h2>
              </div>
              <select
                aria-label="Conversation language"
                value={settings.language}
                onChange={(e) =>
                  onUpdateSettings({
                    ...settings,
                    language: e.target.value as AurixLanguage,
                  })
                }
                className="bg-white dark:bg-[#0F1724] border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-[#202938] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#10B981]"
              >
                <option value="English">English (UK)</option>
                <option value="Urdu">Urdu</option>
                <option value="Hindi">Hindi</option>
              </select>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {[
                { label: "Open YouTube", cmd: "Open YouTube" },
                { label: "Open AM NEXORA", cmd: "Open AM NEXORA" },
                { label: "12-Step Self-Heal", cmd: "Run self heal" },
                { label: "Draw AI Picture", cmd: "Make a picture of futuristic AM VEYRONIX AI city" },
              ].map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => sendCommandToAurix(chip.cmd)}
                  className="px-2.5 py-1 rounded-lg bg-white dark:bg-[#0F1724] hover:border-[#10B981] border border-slate-200 dark:border-slate-700 text-xs font-medium text-[#202938] dark:text-slate-200 cursor-pointer transition-colors whitespace-nowrap"
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>

          {notice && (
            <div className="mt-2.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-[#D6AD60] px-3.5 py-2 text-xs text-[#202938] dark:text-amber-200 shrink-0">
              {notice}
            </div>
          )}

          {/* Live Conversation Transcript */}
          <div className="flex-1 overflow-y-auto py-3 pr-1 space-y-3 min-h-[260px]">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center px-4 text-xs text-[#64748B] dark:text-slate-400">
                <p>Click the orb to speak, tap &ldquo;Speak &amp; Advise&rdquo;, or type a command below.</p>
                <p className="mt-1">
                  Try: <span className="font-mono text-[#10B981]">&ldquo;Open YouTube&rdquo;</span> or{" "}
                  <span className="font-mono text-[#06B6D4]">&ldquo;Run self heal&rdquo;</span>
                </p>
              </div>
            ) : (
              messages.map((m) => {
                const isUser = m.role === "user";
                const act = messageActions[m.id];
                return (
                  <div key={m.id} className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}>
                    <div
                      className={`max-w-[90%] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm leading-relaxed border ${
                        isUser
                          ? "bg-[#10B981]/10 dark:bg-[#10B981]/20 border-[#10B981]/40 text-[#202938] dark:text-white"
                          : "bg-[#F8FAFC] dark:bg-[#0B111B] border-slate-200 dark:border-slate-800 text-[#202938] dark:text-slate-100"
                      }`}
                    >
                      <div className="whitespace-pre-wrap">{m.content}</div>

                      {act?.type === "open_url" && (
                        <div className="mt-2.5">
                          <a
                            href={act.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#10B981] hover:bg-emerald-600 text-white font-semibold text-xs"
                          >
                            <span>{act.label}</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      )}

                      {act?.type === "navigate" && (
                        <div className="mt-2.5">
                          <button
                            type="button"
                            onClick={() => onNavigate(act.section as AurixSectionId)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#10B981] hover:bg-emerald-600 text-white font-semibold text-xs cursor-pointer"
                          >
                            <span>{act.label}</span>
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      {act?.type === "self_heal" && (
                        <div className="mt-2.5 rounded-lg bg-white dark:bg-[#0F1724] border border-emerald-500/40 p-2.5 text-xs space-y-1.5">
                          <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-300 font-mono">
                            <span className="inline-flex items-center gap-1">
                              <ShieldCheck className="w-3.5 h-3.5" />
                              STATUS: {act.report.overallStatus.toUpperCase()}
                            </span>
                            <span className="tabular-nums">{act.report.repairedCount} repaired</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => onNavigate("selfheal")}
                            className="text-cyan-700 dark:text-cyan-400 hover:underline font-medium cursor-pointer"
                          >
                            Open 12-Step Self-Healer →
                          </button>
                        </div>
                      )}

                      {act?.type === "creative" && (
                        <div className="mt-2.5 rounded-lg bg-white dark:bg-[#0F1724] border border-slate-200 dark:border-slate-700 p-2.5 space-y-2">
                          {act.asset.svgMarkup && (
                            <>
                              <div
                                className="rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800"
                                dangerouslySetInnerHTML={{ __html: act.asset.svgMarkup }}
                              />
                              <button
                                type="button"
                                onClick={() => downloadPictureSvgPng(act.asset)}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#10B981] text-white text-xs font-semibold cursor-pointer"
                              >
                                <Download className="w-3 h-3" />
                                <span>Download PNG</span>
                              </button>
                            </>
                          )}
                          {act.asset.videoScenes && (
                            <button
                              type="button"
                              onClick={() => onNavigate("creative")}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#10B981] text-white text-xs font-semibold cursor-pointer"
                            >
                              <span>Open Motion Video Studio →</span>
                            </button>
                          )}
                        </div>
                      )}

                      {!isUser && (
                        <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-[#64748B] dark:text-slate-400">
                          <span>AURIX · British Male · {m.language || settings.language}</span>
                          <button
                            type="button"
                            onClick={() => speakTextWithAurix(m.content)}
                            className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300 hover:underline cursor-pointer font-medium"
                          >
                            <Volume2 className="w-3 h-3" />
                            <span>Speak</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={feedEndRef} />
          </div>

          {/* Bottom Command Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!inputText.trim() || sending) return;
              const msg = inputText;
              setInputText("");
              sendCommandToAurix(msg);
            }}
            className="rounded-xl bg-[#F8FAFC] dark:bg-[#0B111B] border border-slate-300 dark:border-slate-700 focus-within:border-[#10B981] p-2 shrink-0"
          >
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleMicTalk}
                title={recording ? "Stop listening" : "Speak to AURIX"}
                className={`p-2.5 rounded-lg border transition-colors cursor-pointer shrink-0 ${
                  recording
                    ? "bg-rose-600 border-rose-500 text-white"
                    : "bg-white dark:bg-[#0F1724] border-slate-200 dark:border-slate-700 hover:border-[#10B981] text-[#10B981]"
                }`}
              >
                {recording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>

              <input
                type="text"
                value={inputText}
                onChange={(e) => {
                  setInputText(e.target.value);
                  lastActivityRef.current = Date.now();
                }}
                placeholder="Ask AURIX, open YouTube/site, run self-heal, or create..."
                className="flex-1 bg-transparent px-2 py-1.5 text-sm text-[#202938] dark:text-white placeholder:text-[#64748B] focus:outline-none min-w-0"
              />

              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) processAudioBlob(file);
                  e.target.value = "";
                }}
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Upload audio clip"
                className="p-2.5 rounded-lg bg-white dark:bg-[#0F1724] border border-slate-200 dark:border-slate-700 hover:border-[#06B6D4] text-[#64748B] dark:text-slate-300 cursor-pointer shrink-0"
              >
                <Upload className="w-4 h-4" />
              </button>

              <button
                type="submit"
                disabled={sending || !inputText.trim() || telemetry.emergencyStopActive}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-[#10B981] hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold text-xs cursor-pointer shrink-0 whitespace-nowrap"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send</span>
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
