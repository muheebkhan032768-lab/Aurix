import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  Camera,
  CameraOff,
  Check,
  Eye,
  Hand,
  ListChecks,
  Mic,
  MicOff,
  Save,
  Sparkles,
  Square,
  Wand2,
  X,
} from "lucide-react";
import type { BiometricSnapshot, TrainingExample, TrainingMatch, TrainingStats } from "../../types/aurix";
import { useCamera, waitForVideo } from "../../biometrics/camera";
import { embedFrame, observeHand, VisionError, type HandObservation } from "../../biometrics/vision";
import { listenForCommands, speechRecognitionSupported } from "../../biometrics/voice";
import { markMemorySaved, patchRuntime } from "../../biometrics/runtime";
import { CameraPreviewDock } from "./CameraPreviewDock";

interface TeachAurixViewProps {
  snapshot: BiometricSnapshot;
  onOpenMemory: () => void;
  onRefresh: () => Promise<void>;
}

interface Candidate {
  imageDataUrl: string;
  embedding: number[];
  label: string;
  description: string;
  category: string;
  suggestionSource: "cloud" | "none";
}

interface IdentifyResult {
  matches: TrainingMatch[];
  knownExample: TrainingMatch | null;
  cloudLabel: string | null;
  cloudError: string | null;
  cloudConsent: boolean;
  cloudAvailable: boolean;
  imageDataUrl: string;
}

function speak(text: string) {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 0.85;
    const preferred = synth.getVoices().find((voice) => /male|daniel|alex|google uk english male/i.test(voice.name));
    if (preferred) utterance.voice = preferred;
    synth.speak(utterance);
  } catch {
    // Speech output is optional; the transcript is always on screen.
  }
}

export function TeachAurixView({ snapshot, onOpenMemory }: TeachAurixViewProps) {
  const camera = useCamera();
  const [position, setPosition] = useState<"right" | "left">("right");
  const [minimized, setMinimized] = useState(false);
  const [training, setTraining] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [identifyResult, setIdentifyResult] = useState<IdentifyResult | null>(null);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [lastSaved, setLastSaved] = useState<TrainingExample | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TrainingExample | null>(null);
  const [gesture, setGesture] = useState<HandObservation | null>(null);
  const [gestureMatches, setGestureMatches] = useState<TrainingMatch[]>([]);
  const [gestureSamples, setGestureSamples] = useState<number[][]>([]);
  const [gestureLabel, setGestureLabel] = useState("");
  const [gestureCommand, setGestureCommand] = useState("");
  const [tasks, setTasks] = useState<TrainingExample[]>([]);
  const [taskTrigger, setTaskTrigger] = useState("");
  const [taskUrls, setTaskUrls] = useState("");
  const [taskNote, setTaskNote] = useState("");
  const [runningTask, setRunningTask] = useState<TrainingExample | null>(null);
  const [stats, setStats] = useState<TrainingStats | null>(null);
  const [log, setLog] = useState<Array<{ id: string; text: string; at: string }>>([]);
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error" | "info"; text: string } | null>(null);
  const listenerRef = useRef<{ stop: () => void } | null>(null);

  const addLog = useCallback((text: string) => {
    setLog((entries) => [{ id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, text, at: new Date().toISOString() }, ...entries].slice(0, 12));
  }, []);

  const loadMemory = useCallback(async () => {
    try {
      const res = await fetch("/api/training");
      if (!res.ok) return;
      const data = await res.json();
      setStats(data.stats ?? null);
      setTasks((data.examples ?? []).filter((example: TrainingExample) => example.kind === "task"));
    } catch {
      // Memory stays as-is when the server is briefly unavailable.
    }
  }, []);

  useEffect(() => {
    void loadMemory();
  }, [loadMemory]);

  useEffect(() => () => listenerRef.current?.stop(), []);

  useEffect(() => {
    if (!training || secondsLeft === null) return;
    if (secondsLeft <= 0) {
      setMinimized(true);
      setSecondsLeft(null);
      addLog("Preview auto-minimized. Camera status stays visible in the indicator.");
      return;
    }
    const timer = window.setTimeout(() => setSecondsLeft((value) => (value === null ? null : value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [training, secondsLeft, addLog]);

  const stopTraining = useCallback(
    (reason = "Training mode stopped.") => {
      listenerRef.current?.stop();
      listenerRef.current = null;
      setListening(false);
      camera.stop();
      setTraining(false);
      setSecondsLeft(null);
      setMinimized(false);
      patchRuntime({ trainingMode: false });
      addLog(reason);
    },
    [camera, addLog]
  );

  const startTraining = async () => {
    setMessage(null);
    const video = await camera.start();
    if (!video || !(await waitForVideo(video))) {
      setMessage({ tone: "error", text: camera.error ?? "The camera could not start, so training mode did not begin." });
      addLog("Training mode could not start: camera unavailable.");
      return;
    }
    setTraining(true);
    setMinimized(false);
    setPosition("right");
    setSecondsLeft(snapshot.settings.trainingPreviewSeconds);
    patchRuntime({ trainingMode: true });
    addLog("Training mode active. Camera is live and visible.");
    speak("Training mode active. Show me an object and tell me what it is.");
  };

  const ensureCamera = async (): Promise<HTMLVideoElement | null> => {
    if (camera.status === "active" && camera.videoRef.current?.videoWidth) return camera.videoRef.current;
    const video = await camera.start();
    if (!video || !(await waitForVideo(video))) {
      setMessage({ tone: "error", text: camera.error ?? "The camera did not start." });
      return null;
    }
    return video;
  };

  const identify = async () => {
    setBusy("identify");
    setMessage(null);
    try {
      const video = await ensureCamera();
      if (!video) return;
      const frame = await embedFrame(video);
      const res = await fetch("/api/training/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ embedding: frame.embedding, imageDataUrl: frame.imageDataUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Identification failed.");
      const result: IdentifyResult = {
        matches: data.matches ?? [],
        knownExample: data.knownExample ?? null,
        cloudLabel: data.cloudLabel ?? null,
        cloudError: data.cloudError ?? null,
        cloudConsent: Boolean(data.cloudConsent),
        cloudAvailable: Boolean(data.cloudAvailable),
        imageDataUrl: frame.imageDataUrl,
      };
      setIdentifyResult(result);

      if (result.knownExample) {
        const line = `This appears to be your ${result.knownExample.example.label}. I also found your saved example (similarity ${(result.knownExample.score * 100).toFixed(0)}%).`;
        addLog(line);
        speak(line);
      } else if (result.cloudLabel) {
        addLog(`New observation — vision model: ${result.cloudLabel}`);
        speak("I can see something new. " + result.cloudLabel);
      } else if (result.cloudError) {
        addLog(`No confident match. Vision model error: ${result.cloudError}`);
        setMessage({ tone: "error", text: result.cloudError });
      } else {
        addLog("No confident match among approved examples. DEX MADE will not guess.");
        speak("I cannot confidently identify this object yet. Would you like to teach me?");
      }
    } catch (err) {
      setMessage({
        tone: "error",
        text: err instanceof VisionError ? err.message : err instanceof Error ? err.message : "Identification failed.",
      });
    } finally {
      setBusy(null);
    }
  };

  const captureCandidate = async (labelHint = "") => {
    setBusy("capture");
    setMessage(null);
    try {
      const video = await ensureCamera();
      if (!video) return;
      const frame = await embedFrame(video);
      const next: Candidate = {
        imageDataUrl: frame.imageDataUrl,
        embedding: frame.embedding,
        label: labelHint,
        description: "",
        category: "general",
        suggestionSource: "none",
      };
      setCandidate(next);
      addLog("Capture held for review. Nothing is saved until you approve it.");

      if (snapshot.settings.sendImagesToCloud) {
        const res = await fetch("/api/training/identify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ embedding: frame.embedding, imageDataUrl: frame.imageDataUrl }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.cloudLabel && !labelHint) {
            const suggestion = String(data.cloudLabel).split(/[.,]/)[0].trim().slice(0, 60);
            setCandidate((current) =>
              current && current.imageDataUrl === frame.imageDataUrl
                ? { ...current, label: suggestion, description: String(data.cloudLabel), suggestionSource: "cloud" }
                : current
            );
            addLog("Cloud vision suggested a label (consented). Review it before saving.");
          }
        }
      }
    } catch (err) {
      setMessage({
        tone: "error",
        text: err instanceof VisionError ? err.message : err instanceof Error ? err.message : "Capture failed.",
      });
    } finally {
      setBusy(null);
    }
  };

  const saveCandidate = async () => {
    if (!candidate) return;
    if (!candidate.label.trim()) {
      setMessage({ tone: "error", text: "Give this object a name before saving it." });
      return;
    }
    setBusy("save");
    try {
      const res = await fetch("/api/training", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "object",
          label: candidate.label,
          description: candidate.description,
          category: candidate.category,
          imageDataUrl: candidate.imageDataUrl,
          embedding: candidate.embedding,
          approved: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Saving failed.");
      setLastSaved(data.example);
      setCandidate(null);
      markMemorySaved();
      addLog(`Training example saved: "${data.example.label}".`);
      speak("Training example saved successfully.");
      await loadMemory();
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Saving failed." });
    } finally {
      setBusy(null);
    }
  };

  const deleteExample = async (example: TrainingExample) => {
    const res = await fetch(`/api/training/${example.id}`, { method: "DELETE" });
    if (res.ok) {
      addLog(`Training example deleted: "${example.label}".`);
      setLastSaved((current) => (current?.id === example.id ? null : current));
      setPendingDelete(null);
      await loadMemory();
    }
  };

  const detectGesture = async () => {
    setBusy("gesture");
    setMessage(null);
    try {
      const video = await ensureCamera();
      if (!video) return;
      const observation = await observeHand(video);
      setGesture(observation);
      const res = await fetch("/api/training/match-gesture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ descriptor: observation.descriptor }),
      });
      if (res.ok) {
        const data = await res.json();
        setGestureMatches(data.matches ?? []);
      }
      addLog(`Hand observed: ${observation.gesture.replace("_", " ")} (no meaning until you assign one).`);
    } catch (err) {
      setGesture(null);
      setMessage({
        tone: "error",
        text: err instanceof VisionError ? err.message : err instanceof Error ? err.message : "Gesture capture failed.",
      });
    } finally {
      setBusy(null);
    }
  };

  const addGestureSample = async () => {
    setBusy("gesture-sample");
    try {
      const video = await ensureCamera();
      if (!video) return;
      const observation = await observeHand(video);
      setGesture(observation);
      setGestureSamples((samples) => [...samples, observation.descriptor]);
      addLog(`Gesture sample ${gestureSamples.length + 1} of 3 captured (${observation.gesture.replace("_", " ")}).`);
    } catch (err) {
      setMessage({
        tone: "error",
        text: err instanceof VisionError ? err.message : err instanceof Error ? err.message : "Gesture capture failed.",
      });
    } finally {
      setBusy(null);
    }
  };

  const saveGesture = async () => {
    if (gestureSamples.length < 2 || !gestureLabel.trim() || !gestureCommand.trim()) {
      setMessage({ tone: "error", text: "Capture at least 2 gesture samples, then name the gesture and its command." });
      return;
    }
    const length = gestureSamples[0].length;
    const averaged = new Array(length).fill(0).map((_, index) => {
      let sum = 0;
      for (const sample of gestureSamples) sum += sample[index] ?? 0;
      return sum / gestureSamples.length;
    });
    setBusy("gesture-save");
    try {
      const res = await fetch("/api/training", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "gesture",
          label: gestureLabel,
          description: `Custom gesture → command: ${gestureCommand}`,
          category: "gesture",
          descriptor: averaged,
          trigger: gestureCommand,
          approved: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Saving the gesture failed.");
      setGestureSamples([]);
      setGestureLabel("");
      setGestureCommand("");
      markMemorySaved();
      addLog(`Gesture saved: "${data.example.label}" → ${data.example.trigger}.`);
      await loadMemory();
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Saving the gesture failed." });
    } finally {
      setBusy(null);
    }
  };

  const saveTask = async () => {
    const urls = taskUrls
      .split(/[\s,]+/)
      .map((url) => url.trim())
      .filter(Boolean);
    if (!taskTrigger.trim() || urls.length === 0) {
      setMessage({ tone: "error", text: "A trigger phrase and at least one http(s) URL are required." });
      return;
    }
    const invalid = urls.find((url) => !/^https?:\/\//i.test(url));
    if (invalid) {
      setMessage({ tone: "error", text: `"${invalid}" is not an http(s) URL.` });
      return;
    }
    setBusy("task");
    try {
      const res = await fetch("/api/training", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "task",
          label: taskTrigger,
          description: taskNote,
          category: "task",
          trigger: taskTrigger,
          action: { urls, note: taskNote, requiresConfirmation: true },
          approved: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Saving the task failed.");
      setTaskTrigger("");
      setTaskUrls("");
      setTaskNote("");
      markMemorySaved();
      addLog(`Custom task saved: "${data.example.label}" (${urls.length} action${urls.length > 1 ? "s" : ""}).`);
      await loadMemory();
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Saving the task failed." });
    } finally {
      setBusy(null);
    }
  };

  const runTask = (task: TrainingExample) => {
    setRunningTask(task);
  };

  const confirmRunTask = () => {
    if (!runningTask?.action?.urls) return;
    for (const url of runningTask.action.urls) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
    addLog(`Task executed after confirmation: "${runningTask.label}" opened ${runningTask.action.urls.length} approved URL(s).`);
    setRunningTask(null);
  };

  const handleTranscript = useCallback(
    (text: string) => {
      const lower = text.toLowerCase();
      addLog(`Voice: "${text}"`);
      if (/\b(?:stop|end|exit)\s+training\b/.test(lower)) {
        stopTraining("Training stopped by voice command.");
        return;
      }
      if (/\b(?:remember this object|save this example|save this object|save it)\b/.test(lower)) {
        if (candidate) void saveCandidate();
        else void captureCandidate();
        return;
      }
      if (/\b(?:discard this example|discard this object|throw this away)\b/.test(lower)) {
        setCandidate(null);
        addLog("Capture discarded. Nothing was saved.");
        return;
      }
      if (/\b(?:what is this|explain this object|what am i showing)\b/.test(lower)) {
        void identify();
        return;
      }
      if (/\b(?:show my training history|training history|search my training memory|training memory)\b/.test(lower)) {
        addLog("Opening the DEX MADE Memory Center.");
        onOpenMemory();
        return;
      }
      if (/\b(?:forget this example|delete this example)\b/.test(lower)) {
        if (lastSaved) {
          setPendingDelete(lastSaved);
          addLog(`Say "yes" to confirm deleting "${lastSaved.label}".`);
        } else {
          addLog("There is no just-saved example to forget. Delete from the Memory Center instead.");
        }
        return;
      }
      if (pendingDelete && /^(?:yes|confirm|do it|delete it)\b/.test(lower)) {
        void deleteExample(pendingDelete);
        return;
      }
      if (pendingDelete && /^(?:no|cancel|stop)\b/.test(lower)) {
        setPendingDelete(null);
        addLog("Deletion cancelled.");
        return;
      }
      const thisIs = lower.match(/\bthis is (?:my|a|an|the) (.+)$/);
      if (thisIs) {
        void captureCandidate(thisIs[1].replace(/[.?!]+$/, "").slice(0, 80));
        return;
      }
      addLog("Command not recognised in training mode. Use the on-screen controls or the documented phrases.");
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [candidate, lastSaved, pendingDelete, stopTraining, identify, captureCandidate, saveCandidate, deleteExample, onOpenMemory, addLog]
  );

  const toggleListening = () => {
    if (listening) {
      listenerRef.current?.stop();
      listenerRef.current = null;
      setListening(false);
      return;
    }
    setVoiceError(null);
    listenerRef.current = listenForCommands(
      handleTranscript,
      (error) => {
        setVoiceError(error);
        setListening(false);
      },
      "en-US"
    );
    setListening(true);
    addLog("Voice control listening. Try: “DEX MADE, remember this object”.");
  };

  const closeCamera = () => {
    if (training) stopTraining("Training stopped and camera released.");
    else {
      camera.stop();
      addLog("Camera closed and released.");
    }
  };

  const identified = identifyResult?.knownExample ?? null;

  return (
    <div className="space-y-4">
      <section className="nexus-panel rounded-2xl p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.22em] text-accent">
              <Sparkles className="h-3.5 w-3.5" /> Teach DEX MADE
            </div>
            <h1 className="mt-1 font-display text-lg font-bold tracking-wide text-white">Visual Learning Mode</h1>
            <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-slate-600 dark:text-[#94A8B8]">
              Show an object, say what it is, review the capture, then approve it. Nothing is stored until you press Save.
              {snapshot.settings.sendImagesToCloud
                ? " Cloud vision labeling is ON (consented) — captured frames can be sent to Gemini for a suggested name."
                : " Everything stays on this machine — cloud vision labeling is off."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.12em] ${
                training ? "border-[#00D9FF]/40 bg-[#00D9FF]/10 text-[#7FE9FF]" : "border-white/10 bg-white/5 text-muted-ink"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${training ? "animate-pulse bg-[#00D9FF]" : "bg-slate-500"}`} />
              {training ? "Training mode active" : "Training mode idle"}
            </span>
            {training ? (
              <button type="button" onClick={() => stopTraining()} className="inline-flex items-center gap-1.5 rounded-xl border border-rose-400/30 px-3 py-2 text-[11px] text-rose-300 hover:bg-rose-500/10 cursor-pointer">
                <Square className="h-3.5 w-3.5" /> Stop training
              </button>
            ) : (
              <button type="button" onClick={() => void startTraining()} className="inline-flex items-center gap-1.5 rounded-xl bg-[#00D9FF] px-3 py-2 text-[11px] font-semibold text-[#05080D] hover:bg-[#33E3FF] cursor-pointer">
                <Camera className="h-3.5 w-3.5" /> Enter training mode
              </button>
            )}
            <button
              type="button"
              onClick={toggleListening}
              disabled={!speechRecognitionSupported()}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[11px] cursor-pointer disabled:opacity-40 ${
                listening ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-800 dark:text-emerald-300" : "border-white/15 text-slate-600 dark:text-[#A9C8D5] hover:bg-white/5"
              }`}
            >
              {listening ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
              {listening ? "Listening — stop voice control" : "Voice control"}
            </button>
          </div>
        </div>

        {!speechRecognitionSupported() && (
          <p className="mt-2 rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-[10px] text-amber-200">
            This browser has no speech recognition, so spoken training commands are unavailable. The on-screen controls do the same work.
          </p>
        )}
        {voiceError && <p className="mt-2 rounded-xl border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-[10px] text-rose-200">{voiceError}</p>}
        {message && (
          <p
            className={`mt-2 rounded-xl border px-3 py-2 text-[11px] ${
              message.tone === "error"
                ? "border-rose-400/30 bg-rose-400/10 text-rose-200"
                : message.tone === "ok"
                  ? "border-emerald-400/35 bg-emerald-400/10 text-emerald-800 dark:text-emerald-300"
                  : "border-[#00D9FF]/25 bg-[#00D9FF]/10 text-[#A9E8F5]"
            }`}
          >
            {message.text}
          </p>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="nexus-panel rounded-2xl p-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void identify()}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#0B63D6] px-3 py-2 text-[11px] font-semibold text-white hover:bg-[#2E8DFF] disabled:opacity-40 cursor-pointer"
            >
              <Eye className="h-3.5 w-3.5" /> {busy === "identify" ? "Looking…" : "What is this?"}
            </button>
            <button
              type="button"
              onClick={() => void captureCandidate()}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#047857] px-3 py-2 text-[11px] font-semibold text-white hover:bg-emerald-600 disabled:opacity-40 cursor-pointer"
            >
              <Camera className="h-3.5 w-3.5" /> {busy === "capture" ? "Capturing…" : "Teach this object"}
            </button>
            <button
              type="button"
              onClick={() => void detectGesture()}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-2 text-[11px] text-slate-600 dark:text-[#A9C8D5] hover:bg-white/5 disabled:opacity-40 cursor-pointer"
            >
              <Hand className="h-3.5 w-3.5" /> {busy === "gesture" ? "Reading hand…" : "Read gesture"}
            </button>
            <button
              type="button"
              onClick={onOpenMemory}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-2 text-[11px] text-slate-600 dark:text-[#A9C8D5] hover:bg-white/5 cursor-pointer"
            >
              <ListChecks className="h-3.5 w-3.5" /> Training memory
            </button>
            <span className="ml-auto flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.14em]">
              <span className={`h-1.5 w-1.5 rounded-full ${camera.status === "active" ? "animate-pulse bg-rose-400" : "bg-slate-500"}`} />
              <span className={camera.status === "active" ? "text-rose-300" : "text-muted-ink"}>
                {camera.status === "active" ? "Camera active" : camera.status === "paused" ? "Camera paused" : "Camera off"}
              </span>
            </span>
          </div>

          {identifyResult && (
            <div className="mt-3 grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)]">
              <img src={identifyResult.imageDataUrl} alt="Observed object" className="h-[105px] w-full rounded-xl border border-white/10 object-cover" />
              <div className="min-w-0">
                <div className="text-[11px] font-semibold text-white">
                  {identified
                    ? `Matches your saved example: ${identified.example.label}`
                    : identifyResult.cloudLabel
                      ? "New observation (vision model)"
                      : "No confident identification"}
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-600 dark:text-[#94A8B8]">
                  {identified
                    ? identified.example.description || "No description was saved with this example."
                    : identifyResult.cloudLabel ?? "DEX MADE will not guess. Teach it this object, or lower the threshold by adding more examples."}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {identified && (
                    <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[9px] font-mono uppercase tracking-[0.1em] text-emerald-800 dark:text-emerald-300">
                      saved example · {(identified.score * 100).toFixed(0)}%
                    </span>
                  )}
                  {identifyResult.matches.slice(0, 3).map((match) => (
                    <span key={match.example.id} className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] font-mono text-slate-600 dark:text-[#94A8B8]">
                      {match.example.label} · {(match.score * 100).toFixed(0)}%
                    </span>
                  ))}
                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] font-mono text-muted-ink">
                    {identifyResult.cloudConsent ? "cloud labeling allowed" : "local only"}
                  </span>
                </div>
              </div>
            </div>
          )}

          {candidate && (
            <div className="mt-3 rounded-xl border border-[#10B981]/35 bg-[#047857]/5 p-3">
              <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.16em] text-emerald-800 dark:text-emerald-300">
                <Check className="h-3.5 w-3.5" /> Review before saving
              </div>
              <div className="mt-2 grid gap-3 sm:grid-cols-[160px_minmax(0,1fr)]">
                <img src={candidate.imageDataUrl} alt="Training capture" className="h-[120px] w-full rounded-xl border border-white/10 object-cover" />
                <div className="space-y-2">
                  <input
                    value={candidate.label}
                    onChange={(e) => setCandidate({ ...candidate, label: e.target.value })}
                    placeholder="Object name (e.g. my laptop)"
                    className="w-full rounded-xl border border-white/10 bg-[#05080D]/70 px-3 py-2 text-xs text-white placeholder:text-[#5B7185] outline-none focus:border-[#10B981]/50"
                  />
                  <textarea
                    value={candidate.description}
                    onChange={(e) => setCandidate({ ...candidate, description: e.target.value })}
                    rows={2}
                    placeholder="What is it for? (purpose, functions)"
                    className="w-full rounded-xl border border-white/10 bg-[#05080D]/70 px-3 py-2 text-xs text-white placeholder:text-[#5B7185] outline-none focus:border-[#10B981]/50"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={candidate.category}
                      onChange={(e) => setCandidate({ ...candidate, category: e.target.value })}
                      placeholder="Category"
                      className="w-32 rounded-xl border border-white/10 bg-[#05080D]/70 px-3 py-2 text-[11px] text-white outline-none focus:border-[#10B981]/50"
                    />
                    <button
                      type="button"
                      onClick={() => void saveCandidate()}
                      disabled={busy === "save"}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#047857] px-3 py-2 text-[11px] font-semibold text-white hover:bg-emerald-600 disabled:opacity-50 cursor-pointer"
                    >
                      <Save className="h-3.5 w-3.5" /> {busy === "save" ? "Saving…" : "Save example"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCandidate(null);
                        addLog("Capture discarded. Nothing was saved.");
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-rose-400/30 px-3 py-2 text-[11px] text-rose-300 hover:bg-rose-500/10 cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" /> Discard
                    </button>
                    {candidate.suggestionSource === "cloud" && (
                      <span className="text-[9px] font-mono uppercase tracking-[0.1em] text-muted-ink">suggested by cloud vision — verify it</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {pendingDelete && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-rose-400/35 bg-rose-400/10 px-3 py-2 text-[11px] text-rose-200">
              <span>Delete “{pendingDelete.label}” from training memory?</span>
              <button type="button" onClick={() => void deleteExample(pendingDelete)} className="rounded-lg bg-rose-500 px-2.5 py-1 text-[10px] font-semibold text-white cursor-pointer">
                Yes, delete
              </button>
              <button type="button" onClick={() => setPendingDelete(null)} className="rounded-lg border border-rose-300/40 px-2.5 py-1 text-[10px] cursor-pointer">
                Cancel
              </button>
            </div>
          )}

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-[#05080D]/50 p-3">
              <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.16em] text-slate-600 dark:text-[#A9C8D5]">
                <Hand className="h-3.5 w-3.5" /> Gesture teaching
              </div>
              {gesture && (
                <p className="mt-2 text-[11px] text-slate-600 dark:text-[#94A8B8]">
                  Hand seen: <span className="text-white">{gesture.gesture.replace("_", " ")}</span> — shape only, no meaning until you assign one.
                </p>
              )}
              {gestureMatches.length > 0 && (
                <p className="mt-1 text-[10px] text-muted-ink">
                  Closest taught gesture: {gestureMatches[0].example.label} ({(gestureMatches[0].score * 100).toFixed(0)}%) →{" "}
                  {gestureMatches[0].example.trigger ?? "no command"}
                  {gestureMatches[0].score >= 0.9 && (
                    <button
                      type="button"
                      onClick={() => {
                        const command = gestureMatches[0].example.trigger;
                        if (!command) return;
                        if (window.confirm(`Run the taught gesture command "${command}"?`)) {
                          addLog(`Gesture command executed after confirmation: ${command}`);
                          speak(`Running ${command}`);
                        }
                      }}
                      className="ml-1 underline decoration-dotted cursor-pointer"
                    >
                      run (asks first)
                    </button>
                  )}
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button type="button" onClick={() => void addGestureSample()} disabled={busy !== null || gestureSamples.length >= 3} className="rounded-lg border border-white/15 px-2.5 py-1.5 text-[10px] text-slate-600 dark:text-[#A9C8D5] hover:bg-white/5 disabled:opacity-40 cursor-pointer">
                  Capture sample {Math.min(gestureSamples.length + 1, 3)}/3
                </button>
                {gestureSamples.length > 0 && (
                  <button type="button" onClick={() => setGestureSamples([])} className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[10px] text-muted-ink hover:bg-white/5 cursor-pointer">
                    Reset samples
                  </button>
                )}
              </div>
              <input
                value={gestureLabel}
                onChange={(e) => setGestureLabel(e.target.value)}
                placeholder="Gesture name (e.g. Open palm)"
                className="mt-2 w-full rounded-lg border border-white/10 bg-[#05080D]/70 px-2.5 py-1.5 text-[11px] text-white placeholder:text-[#5B7185] outline-none"
              />
              <input
                value={gestureCommand}
                onChange={(e) => setGestureCommand(e.target.value)}
                placeholder="Command to assign (e.g. Open work dashboard)"
                className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#05080D]/70 px-2.5 py-1.5 text-[11px] text-white placeholder:text-[#5B7185] outline-none"
              />
              <button type="button" onClick={() => void saveGesture()} disabled={busy !== null || gestureSamples.length < 2} className="mt-2 w-full rounded-lg bg-[#0B63D6] px-2.5 py-1.5 text-[10px] font-semibold text-white hover:bg-[#2E8DFF] disabled:opacity-40 cursor-pointer">
                Save gesture
              </button>
            </div>

            <div className="rounded-xl border border-white/10 bg-[#05080D]/50 p-3">
              <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.16em] text-slate-600 dark:text-[#A9C8D5]">
                <Wand2 className="h-3.5 w-3.5" /> Custom task (voice trigger)
              </div>
              <input
                value={taskTrigger}
                onChange={(e) => setTaskTrigger(e.target.value)}
                placeholder="When I say… (e.g. Start work mode)"
                className="mt-2 w-full rounded-lg border border-white/10 bg-[#05080D]/70 px-2.5 py-1.5 text-[11px] text-white placeholder:text-[#5B7185] outline-none"
              />
              <textarea
                value={taskUrls}
                onChange={(e) => setTaskUrls(e.target.value)}
                rows={2}
                placeholder="https://calendar.google.com https://github.com"
                className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#05080D]/70 px-2.5 py-1.5 text-[11px] text-white placeholder:text-[#5B7185] outline-none"
              />
              <input
                value={taskNote}
                onChange={(e) => setTaskNote(e.target.value)}
                placeholder="Note (optional)"
                className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#05080D]/70 px-2.5 py-1.5 text-[11px] text-white placeholder:text-[#5B7185] outline-none"
              />
              <button type="button" onClick={() => void saveTask()} disabled={busy !== null} className="mt-2 w-full rounded-lg bg-[#047857] px-2.5 py-1.5 text-[10px] font-semibold text-white hover:bg-emerald-600 disabled:opacity-40 cursor-pointer">
                Save custom task
              </button>
              <p className="mt-1.5 text-[9px] leading-relaxed text-muted-ink">
                A browser can only open approved URLs — it cannot launch native Windows apps. Every run asks for confirmation first.
              </p>
              <div className="mt-2 space-y-1">
                {tasks.slice(0, 4).map((task) => (
                  <div key={task.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 px-2 py-1.5">
                    <span className="min-w-0 truncate text-[10px] text-slate-600 dark:text-[#A9C8D5]">{task.label}</span>
                    <button type="button" onClick={() => runTask(task)} className="shrink-0 rounded-md border border-white/15 px-2 py-0.5 text-[9px] text-accent hover:bg-white/5 cursor-pointer">
                      Run
                    </button>
                  </div>
                ))}
                {tasks.length === 0 && <p className="text-[10px] text-muted-ink">No custom tasks saved yet.</p>}
              </div>
              {runningTask && (
                <div className="mt-2 rounded-lg border border-amber-400/35 bg-amber-400/10 px-2 py-1.5 text-[10px] text-amber-200">
                  Open {runningTask.action?.urls?.length ?? 0} URL(s) for “{runningTask.label}”?
                  <div className="mt-1 flex gap-1.5">
                    <button type="button" onClick={confirmRunTask} className="rounded-md bg-amber-400 px-2 py-0.5 text-[9px] font-semibold text-[#05080D] cursor-pointer">
                      Confirm & open
                    </button>
                    <button type="button" onClick={() => setRunningTask(null)} className="rounded-md border border-amber-300/40 px-2 py-0.5 text-[9px] cursor-pointer">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <section className="nexus-panel rounded-2xl p-4">
            <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.18em] text-slate-600 dark:text-[#A9C8D5]">
              <Activity className="h-3.5 w-3.5" /> Session activity
            </div>
            <div className="mt-2 space-y-1.5">
              {log.length === 0 && <p className="text-[11px] text-muted-ink">No activity yet. Start training mode to begin.</p>}
              {log.map((entry) => (
                <div key={entry.id} className="rounded-lg border border-white/5 bg-[#05080D]/50 px-2.5 py-1.5">
                  <div className="text-[10px] leading-relaxed text-slate-600 dark:text-[#A9C8D5]">{entry.text}</div>
                  <div className="font-mono text-[9px] text-muted-ink">{entry.at.slice(11, 19)}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="nexus-panel rounded-2xl p-4">
            <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.18em] text-slate-600 dark:text-[#A9C8D5]">
              <span>Training memory</span>
              <span className="text-muted-ink">{stats?.total ?? 0} approved</span>
            </div>
            <div className="mt-2 space-y-1 text-[10px] text-muted-ink">
              <div className="flex justify-between"><span>Objects</span><span className="text-white">{stats?.byKind.object ?? 0}</span></div>
              <div className="flex justify-between"><span>Gestures</span><span className="text-white">{stats?.byKind.gesture ?? 0}</span></div>
              <div className="flex justify-between"><span>Voice commands</span><span className="text-white">{stats?.byKind.voice_command ?? 0}</span></div>
              <div className="flex justify-between"><span>Custom tasks</span><span className="text-white">{stats?.byKind.task ?? 0}</span></div>
            </div>
            <p className="mt-2 text-[9px] leading-relaxed text-muted-ink">
              Saved examples are retrieval memory, not model training. DEX MADE matches new observations against these embeddings locally.
            </p>
            {lastSaved && (
              <div className="mt-2 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-2 py-1.5 text-[10px] text-emerald-800 dark:text-emerald-300">
                Last saved: {lastSaved.label}
              </div>
            )}
          </section>

          <section className="nexus-panel rounded-2xl p-4">
            <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.18em] text-slate-600 dark:text-[#A9C8D5]">
              <CameraOff className="h-3.5 w-3.5" /> Camera privacy
            </div>
            <p className="mt-1.5 text-[10px] leading-relaxed text-muted-ink">
              The camera only runs in training mode or during verification you started. Closing it here releases the device immediately. The preview auto-minimizes after{" "}
              {snapshot.settings.trainingPreviewSeconds}s but the live indicator stays visible.
            </p>
          </section>
        </aside>
      </div>

      {(training || camera.status === "active" || camera.status === "paused") && (
        <CameraPreviewDock
          videoRef={camera.videoRef}
          position={position}
          minimized={minimized}
          paused={camera.status === "paused"}
          active={camera.status === "active"}
          secondsLeft={training ? secondsLeft : null}
          onMove={setPosition}
          onMinimize={() => setMinimized(true)}
          onMaximize={() => setMinimized(false)}
          onPause={camera.pause}
          onResume={camera.resume}
          onClose={closeCamera}
        />
      )}

      {lastSaved && (
        <div className="sr-only" role="status" aria-live="polite">
          Training example saved: {lastSaved.label}
        </div>
      )}
    </div>
  );
}
