import React, { useEffect, useRef, useState } from "react";
import { Activity, Mic, MicOff, Square, Volume2 } from "lucide-react";
import type { AppSettings, AurixLanguage } from "../types/aurix";
import {
  cancelOfflineVoice,
  getAvailableBritishVoices,
  speakWithOfflineBritishVoice,
} from "../utils/offlineVoice";

interface VoiceAssistantViewProps {
  settings: AppSettings;
  onUpdateSettings: (next: AppSettings) => Promise<void>;
}

interface VoiceTurn {
  id: string;
  userText: string;
  aurixText: string;
  language: string;
  timestamp: string;
}

export function VoiceAssistantView({ settings, onUpdateSettings }: VoiceAssistantViewProps) {
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [wakeListening, setWakeListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [testingMic, setTestingMic] = useState(false);
  const [micLevelPct, setMicLevelPct] = useState(0);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedBrowserVoice, setSelectedBrowserVoice] = useState("");
  const [turns, setTurns] = useState<VoiceTurn[]>([]);
  const [testPhrase, setTestPhrase] = useState(
    "Good day, Abdul Muheeb. AURIX is active in my British persona and ready to assist AM VEYRONIX."
  );
  const [statusMessage, setStatusMessage] = useState("Ready for voice interaction.");
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  const micTestStreamRef = useRef<MediaStream | null>(null);
  const micTestTimerRef = useRef<number | null>(null);
  const boundaryPulseRef = useRef<number>(0);

  useEffect(() => {
    const syncVoices = () => {
      const list = getAvailableBritishVoices();
      setAvailableVoices(list);
      if (!selectedBrowserVoice && list[0]) {
        setSelectedBrowserVoice(list[0].voiceURI);
      }
    };
    syncVoices();
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.onvoiceschanged = syncVoices;
    }
    return () => {
      if (micTestTimerRef.current) window.clearInterval(micTestTimerRef.current);
      micTestStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [selectedBrowserVoice]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      boundaryPulseRef.current *= 0.88;

      const bars = 48;
      const gap = w / bars;
      let freqData: Uint8Array<ArrayBuffer> | null = null;
      if (analyserRef.current && (recording || testingMic || speaking)) {
        freqData = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(freqData);
      }

      for (let i = 0; i < bars; i++) {
        let amp = 0.08;
        if (freqData) {
          const idx = Math.min(freqData.length - 1, i * 2);
          amp = Math.max(0.08, freqData[idx] / 255);
        } else if (speaking) {
          const shape = Math.exp(-Math.pow((i - 24) / 14, 2));
          amp = 0.14 + boundaryPulseRef.current * 0.72 * shape;
        } else if (processing) {
          amp = 0.22;
        }
        const barH = Math.max(4, amp * (h * 0.8));
        const x = i * gap + gap * 0.25;
        const y = (h - barH) / 2;
        ctx.fillStyle = recording || testingMic ? "#10B981" : speaking ? "#D6AD60" : "#CBD5E1";
        ctx.fillRect(x, y, Math.max(3, gap * 0.5), barH);
      }
      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [recording, speaking, processing, testingMic]);

  const stopAudioPlayback = () => {
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current = null;
    }
    cancelOfflineVoice();
    boundaryPulseRef.current = 0;
    setSpeaking(false);
  };

  const toggleMicVolumeTest = async () => {
    setError(null);
    if (testingMic) {
      if (micTestTimerRef.current) {
        window.clearInterval(micTestTimerRef.current);
        micTestTimerRef.current = null;
      }
      micTestStreamRef.current?.getTracks().forEach((t) => t.stop());
      micTestStreamRef.current = null;
      analyserRef.current = null;
      setTestingMic(false);
      setMicLevelPct(0);
      setStatusMessage("Microphone test finished.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micTestStreamRef.current = stream;
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;
      source.connect(analyser);
      audioCtxRef.current = audioCtx;
      analyserRef.current = analyser;

      const samples = new Uint8Array(analyser.fftSize);
      micTestTimerRef.current = window.setInterval(() => {
        analyser.getByteTimeDomainData(samples);
        let sumSq = 0;
        for (let i = 0; i < samples.length; i++) {
          const d = samples[i] - 128;
          sumSq += d * d;
        }
        const rms = Math.sqrt(sumSq / samples.length);
        setMicLevelPct(Math.min(100, Math.round(rms * 2.8)));
      }, 90);

      setTestingMic(true);
      setStatusMessage("Live microphone input meter active — speak normally to test clarity.");
    } catch {
      setError("Microphone access denied or unavailable in this browser frame.");
    }
  };

  const playMaleVoice = async (text: string) => {
    stopAudioPlayback();
    setSpeaking(true);
    setStatusMessage(`Speaking via AURIX British Persona (${settings.voiceName})...`);
    if (!settings.offlineModeForced) {
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
          const audio = new Audio(`data:${data.mimeType || "audio/wav"};base64,${data.audioBase64}`);
          activeAudioRef.current = audio;
          audio.onended = () => {
            setSpeaking(false);
            setStatusMessage("Ready for voice interaction.");
          };
          audio.onerror = () => {
            setSpeaking(false);
            setError("Browser could not play generated WAV audio.");
          };
          await audio.play();
          return;
        }
      } catch {
        // Fallback smoothly below
      }
    }

    const ok = speakWithOfflineBritishVoice(
      text,
      settings.language,
      settings.voiceSpeed,
      {
        onStart: () => setSpeaking(true),
        onBoundary: () => {
          boundaryPulseRef.current = 1;
        },
        onEnd: () => {
          boundaryPulseRef.current = 0;
          setSpeaking(false);
          setStatusMessage("Ready for voice interaction.");
        },
      },
      selectedBrowserVoice || undefined
    );
    if (!ok) {
      setSpeaking(false);
      setError("Speech synthesis unavailable in this browser.");
    }
  };

  const startRecording = async () => {
    setError(null);
    stopAudioPlayback();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;
      source.connect(analyser);
      audioCtxRef.current = audioCtx;
      analyserRef.current = analyser;

      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        audioCtx.close().catch(() => {});
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        await processAudioBlob(blob);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setStatusMessage("Listening to Abdul Muheeb...");
    } catch {
      setError("Microphone access denied or unavailable in this browser.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  const processAudioBlob = async (blob: Blob) => {
    setProcessing(true);
    setStatusMessage("Transcribing speech...");
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(String(reader.result || "").split(",")[1] || "");
        reader.onerror = () => reject(new Error("Audio read failed."));
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

      setStatusMessage("AURIX reasoning...");
      const chatRes = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: sttData.transcript,
          language: settings.language,
          model: settings.activeModel,
          thinkingLevel: settings.thinkingLevel,
          mode: "voice",
        }),
      });
      const chatData = await chatRes.json();
      if (!chatRes.ok) throw new Error(chatData.error || "AI reply failed.");

      const replyText = chatData.assistantMessage.content;
      setTurns((prev) => [
        {
          id: `vt_${Date.now()}`,
          userText: sttData.transcript,
          aurixText: replyText,
          language: settings.language,
          timestamp: new Date().toLocaleTimeString(),
        },
        ...prev,
      ]);
      await playMaleVoice(replyText);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Voice pipeline failed.");
      setStatusMessage("Ready for voice interaction.");
    } finally {
      setProcessing(false);
    }
  };

  const toggleWakePhraseListener = () => {
    if (wakeListening) {
      recognitionRef.current?.stop();
      setWakeListening(false);
      setStatusMessage("Wake-word listener stopped.");
      return;
    }

    const SpeechRec =
      (window as unknown as { SpeechRecognition?: new () => unknown; webkitSpeechRecognition?: new () => unknown })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => unknown }).webkitSpeechRecognition;

    if (!SpeechRec) {
      setError("Browser SpeechRecognition API is unavailable here. Use Push-to-Talk microphone recording.");
      return;
    }

    const rec = new SpeechRec() as {
      continuous: boolean;
      interimResults: boolean;
      lang: string;
      onresult: (ev: { results: ArrayLike<{ 0: { transcript: string } }> }) => void;
      onerror: () => void;
      start: () => void;
      stop: () => void;
    };
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = settings.language === "Urdu" ? "ur-PK" : settings.language === "Hindi" ? "hi-IN" : "en-GB";
    rec.onresult = (ev) => {
      const last = ev.results[ev.results.length - 1]?.[0]?.transcript || "";
      if (last.toLowerCase().includes(settings.wakePhrase.toLowerCase())) {
        rec.stop();
        setWakeListening(false);
        startRecording();
      }
    };
    rec.onerror = () => setWakeListening(false);
    rec.start();
    recognitionRef.current = rec;
    setWakeListening(true);
    setStatusMessage(`Listening for wake phrase "${settings.wakePhrase}"...`);
  };

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Waveform & Controls */}
        <div className="lg:col-span-7 bg-white dark:bg-[#0F1724] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 flex flex-col justify-between shadow-sm">
          <div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-[#202938] dark:text-white">
                  AURIX Voice Engine &amp; Mic Diagnostics
                </h2>
                <p className="text-xs text-[#64748B] dark:text-slate-400 mt-1">{statusMessage}</p>
              </div>
              <span className="text-xs font-mono text-[#06B6D4] font-semibold">
                {settings.voiceName} · {settings.language}
              </span>
            </div>

            <div className="mt-5 bg-[#F8FAFC] dark:bg-[#0B111B] border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <canvas ref={canvasRef} width={620} height={110} className="w-full h-28" />
            </div>

            {/* Live Mic Volume Test Bar */}
            <div className="mt-4 rounded-xl bg-[#F8FAFC] dark:bg-[#0B111B] border border-slate-200 dark:border-slate-800 p-3.5 space-y-2">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-medium text-[#202938] dark:text-slate-200 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-[#10B981]" />
                  <span>Live Microphone Volume Test</span>
                </span>
                <span className="font-mono text-[#64748B] tabular-nums">{micLevelPct}%</span>
              </div>
              <div className="h-2.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-[#10B981] transition-all duration-75"
                  style={{ width: `${micLevelPct}%` }}
                />
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-2.5">
            {!recording ? (
              <button
                type="button"
                onClick={startRecording}
                disabled={processing}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#10B981] hover:bg-emerald-600 disabled:opacity-50 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
              >
                <Mic className="w-4 h-4" />
                <span>{processing ? "Processing..." : settings.pushToTalk ? "Push to Speak" : "Start Voice Input"}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={stopRecording}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                <Square className="w-4 h-4" />
                <span>Stop &amp; Send</span>
              </button>
            )}

            <button
              type="button"
              onClick={toggleMicVolumeTest}
              className={`inline-flex items-center gap-2 px-3.5 py-2.5 rounded-lg border text-xs font-medium cursor-pointer whitespace-nowrap ${
                testingMic
                  ? "border-[#10B981] bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                  : "border-slate-300 dark:border-slate-700 text-[#202938] dark:text-slate-200"
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>{testingMic ? "Stop Mic Test" : "Test Microphone"}</span>
            </button>

            <button
              type="button"
              onClick={toggleWakePhraseListener}
              className={`inline-flex items-center gap-2 px-3.5 py-2.5 rounded-lg border text-xs font-medium cursor-pointer whitespace-nowrap ${
                wakeListening
                  ? "border-[#06B6D4] text-cyan-700 dark:text-cyan-300 bg-cyan-50 dark:bg-cyan-500/15"
                  : "border-slate-300 dark:border-slate-700 text-[#202938] dark:text-slate-200"
              }`}
            >
              {wakeListening ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
              <span>{wakeListening ? `Wake Active` : `Enable Wake Phrase`}</span>
            </button>

            {speaking && (
              <button
                type="button"
                onClick={stopAudioPlayback}
                className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-lg border border-[#D6AD60] bg-amber-50 dark:bg-amber-500/10 text-[#9A742E] dark:text-amber-300 text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                <Square className="w-3.5 h-3.5" />
                <span>Interrupt Voice</span>
              </button>
            )}
          </div>

          {error && (
            <div className="mt-4 p-3 rounded-lg bg-rose-50 dark:bg-rose-500/10 border border-rose-300 dark:border-rose-700 text-xs text-rose-700 dark:text-rose-300">
              {error}
            </div>
          )}
        </div>

        {/* Voice Identity Calibration */}
        <div className="lg:col-span-5 bg-white dark:bg-[#0F1724] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4 shadow-sm">
          <h3 className="text-base font-bold text-[#202938] dark:text-white">
            British Voice Identity &amp; Calibration
          </h3>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs text-[#64748B] dark:text-slate-400">
              <span>Cloud Persona</span>
              <select
                value={settings.voiceName}
                onChange={(e) =>
                  onUpdateSettings({ ...settings, voiceName: e.target.value as AppSettings["voiceName"] })
                }
                className="mt-1 w-full bg-[#F8FAFC] dark:bg-[#0B111B] border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-[#202938] dark:text-white"
              >
                <option value="Charon">Charon (Calm Executive)</option>
                <option value="Fenrir">Fenrir (Deep Precision)</option>
                <option value="Puck">Puck (Crisp Energetic)</option>
              </select>
            </label>

            <label className="block text-xs text-[#64748B] dark:text-slate-400">
              <span>Primary Language</span>
              <select
                value={settings.language}
                onChange={(e) =>
                  onUpdateSettings({ ...settings, language: e.target.value as AurixLanguage })
                }
                className="mt-1 w-full bg-[#F8FAFC] dark:bg-[#0B111B] border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-[#202938] dark:text-white"
              >
                <option value="English">English (UK)</option>
                <option value="Urdu">Urdu</option>
                <option value="Hindi">Hindi</option>
              </select>
            </label>
          </div>

          <label className="block text-xs text-[#64748B] dark:text-slate-400">
            <span>Installed Offline British Voices ({availableVoices.length} detected)</span>
            <select
              value={selectedBrowserVoice}
              onChange={(e) => setSelectedBrowserVoice(e.target.value)}
              className="mt-1 w-full bg-[#F8FAFC] dark:bg-[#0B111B] border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-[#202938] dark:text-white"
            >
              {availableVoices.length === 0 ? (
                <option value="">Default System Speech Engine</option>
              ) : (
                availableVoices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name} ({v.lang})
                  </option>
                ))
              )}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <label className="flex items-center gap-2 text-xs text-[#202938] dark:text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.handsFreeVadEnabled}
                onChange={(e) =>
                  onUpdateSettings({ ...settings, handsFreeVadEnabled: e.target.checked })
                }
                className="accent-[#10B981]"
              />
              <span>Hands-Free VAD Auto-Submit</span>
            </label>
            <label className="flex items-center gap-2 text-xs text-[#202938] dark:text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.pushToTalk}
                onChange={(e) =>
                  onUpdateSettings({ ...settings, pushToTalk: e.target.checked })
                }
                className="accent-[#10B981]"
              />
              <span>Push-to-Talk Mode</span>
            </label>
          </div>

          <label className="block text-xs text-[#64748B] dark:text-slate-400">
            <span>Speaking Speed: {settings.voiceSpeed.toFixed(2)}x</span>
            <input
              type="range"
              min="0.75"
              max="1.35"
              step="0.05"
              value={settings.voiceSpeed}
              onChange={(e) => onUpdateSettings({ ...settings, voiceSpeed: Number(e.target.value) })}
              className="mt-1.5 w-full accent-[#10B981]"
            />
          </label>

          <label className="block text-xs text-[#64748B] dark:text-slate-400">
            <span>VAD / Mic Sensitivity: {settings.vadSensitivity}%</span>
            <input
              type="range"
              min="15"
              max="100"
              step="5"
              value={settings.vadSensitivity}
              onChange={(e) =>
                onUpdateSettings({ ...settings, vadSensitivity: Number(e.target.value) })
              }
              className="mt-1.5 w-full accent-[#10B981]"
            />
          </label>

          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
            <label className="block text-xs text-[#64748B] dark:text-slate-400">
              <span>Test Voice Synthesis</span>
              <textarea
                rows={2}
                value={testPhrase}
                onChange={(e) => setTestPhrase(e.target.value)}
                className="mt-1 w-full bg-[#F8FAFC] dark:bg-[#0B111B] border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-[#202938] dark:text-white"
              />
            </label>
            <button
              type="button"
              onClick={() => playMaleVoice(testPhrase)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#10B981] hover:bg-emerald-600 text-white text-xs font-semibold cursor-pointer"
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>Play AURIX British Voice</span>
            </button>
          </div>
        </div>
      </section>

      {/* Voice History */}
      <section className="bg-white dark:bg-[#0F1724] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
        <h3 className="text-base font-bold text-[#202938] dark:text-white mb-4">
          Voice Conversation Log
        </h3>
        {turns.length === 0 ? (
          <p className="text-sm text-[#64748B] dark:text-slate-400">
            Record a voice prompt above to transcribe and hear AURIX respond in your British Male voice configuration.
          </p>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {turns.map((t) => (
              <div key={t.id} className="py-4 space-y-1.5">
                <div className="flex items-center justify-between text-xs text-[#64748B]">
                  <span>Abdul Muheeb ({t.language})</span>
                  <span className="font-mono tabular-nums">{t.timestamp}</span>
                </div>
                <p className="text-sm font-semibold text-[#202938] dark:text-white">{t.userText}</p>
                <p className="text-sm text-[#64748B] dark:text-slate-300">{t.aurixText}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
