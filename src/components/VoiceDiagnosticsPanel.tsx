import React, { useEffect, useState } from "react";
import { Activity, Mic, Play, Square, Volume2 } from "lucide-react";
import type { AppSettings, AurixLanguage } from "../types/aurix";
import { getDeviceVoiceOptions, getPreferredDeviceVoice, hasNaturalDeviceVoice } from "../utils/offlineVoice";
import {
  getVoiceEngineSnapshot,
  isCapturing,
  speak as engineSpeak,
  startCapture,
  stopCapture,
  stopSpeaking,
  subscribeVoiceEngine,
} from "../utils/voiceEngine";
import { DEFAULT_VOICE_SHORTCUTS, formatShortcut } from "../utils/shortcuts";

interface VoiceDiagnosticsPanelProps {
  settings: AppSettings;
  onUpdateSettings: (next: AppSettings) => Promise<void>;
}

const SAMPLE = "Hello, I am DEX MADE. I am ready when you are.";

/**
 * Voice settings and audio diagnostics. Everything here talks to the same
 * voice engine the cockpit uses, so a test here is a real microphone or
 * speaker test rather than a mock.
 */
export function VoiceDiagnosticsPanel({ settings, onUpdateSettings }: VoiceDiagnosticsPanelProps) {
  const [snapshot, setSnapshot] = useState(getVoiceEngineSnapshot);
  const [testing, setTesting] = useState(false);
  const [heard, setHeard] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [permission, setPermission] = useState("unknown");

  useEffect(() => subscribeVoiceEngine(setSnapshot), []);

  useEffect(() => {
    let cancelled = false;
    const permissions = navigator.permissions;
    if (!permissions?.query) return;
    permissions
      .query({ name: "microphone" as PermissionName })
      .then((status) => {
        if (cancelled) return;
        setPermission(status.state);
        status.onchange = () => setPermission(status.state);
      })
      .catch(() => setPermission("unknown"));
    return () => {
      cancelled = true;
    };
  }, []);

  const deviceVoices = getDeviceVoiceOptions(settings.language);
  const activeDeviceVoice = getPreferredDeviceVoice(settings.language, settings.voiceId);
  const shortcuts = settings.voiceShortcuts || DEFAULT_VOICE_SHORTCUTS;

  const runMicTest = async () => {
    if (isCapturing()) {
      stopSpeaking();
      return;
    }
    setHeard(null);
    setMessage("Speak a sentence now — recording for four seconds…");
    setTesting(true);
    const started = await startCapture();
    if (!started) {
      setTesting(false);
      setMessage(getVoiceEngineSnapshot().error || "The microphone could not be opened.");
      return;
    }
    window.setTimeout(() => {
      void stopCapture({
        language: settings.language,
        autoDetectLanguage: settings.autoDetectLanguage,
        minDurationMs: 600,
      }).then((result) => {
        setTesting(false);
        if (result.error) setMessage(result.error);
        else if (result.silent) setMessage("No clear speech was heard. Check the input device and try again.");
        else {
          setHeard(result.transcript);
          setMessage("Microphone test complete.");
        }
      });
    }, 4000);
  };

  const runVoiceTest = () => {
    void engineSpeak(SAMPLE, {
      voiceName: settings.voiceName,
      language: settings.language,
      speed: settings.voiceSpeed,
      voiceId: settings.voiceId,
      volume: settings.voiceVolume,
    });
  };

  const engineLabel =
    snapshot.engine === "gemini" ? "Gemini cloud voice" : "Device voice (local, free)";

  return (
    <section className="bg-white dark:bg-[#0F1724] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="text-base font-bold text-[#202938] dark:text-white">Voice Engine &amp; Audio</h2>
          <p className="text-xs text-[#64748B] dark:text-slate-400 mt-0.5">
            Microphone, speech recognition, DEX MADE voice and diagnostics. Muting DEX MADE never disables the microphone.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void runMicTest()}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-[#202938] dark:text-slate-200 cursor-pointer"
          >
            <Mic className="w-3.5 h-3.5" />
            <span>{testing ? "Stop test" : "Test microphone"}</span>
          </button>
          <button
            type="button"
            onClick={runVoiceTest}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-[#202938] dark:text-slate-200 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5" />
            <span>Test voice</span>
          </button>
          <button
            type="button"
            onClick={() => stopSpeaking()}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-[#202938] dark:text-slate-200 cursor-pointer"
          >
            <Square className="w-3.5 h-3.5" />
            <span>Stop voice</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <label className="flex items-center gap-2 text-xs text-[#202938] dark:text-slate-200 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.micEnabled}
            onChange={(e) => onUpdateSettings({ ...settings, micEnabled: e.target.checked })}
            className="accent-[#10B981]"
          />
          <span>Microphone input</span>
        </label>
        <label className="flex items-center gap-2 text-xs text-[#202938] dark:text-slate-200 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.voiceEnabled}
            onChange={(e) => onUpdateSettings({ ...settings, voiceEnabled: e.target.checked })}
            className="accent-[#10B981]"
          />
          <span>DEX MADE voice output</span>
        </label>
        <label className="flex items-center gap-2 text-xs text-[#202938] dark:text-slate-200 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.autoDetectLanguage}
            onChange={(e) => onUpdateSettings({ ...settings, autoDetectLanguage: e.target.checked })}
            className="accent-[#10B981]"
          />
          <span>Auto-detect language</span>
        </label>
        <label className="flex items-center gap-2 text-xs text-[#202938] dark:text-slate-200 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.pushToTalk}
            onChange={(e) => onUpdateSettings({ ...settings, pushToTalk: e.target.checked })}
            className="accent-[#10B981]"
          />
          <span>Push-to-talk</span>
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <label className="block text-xs text-[#64748B]">
          <span>Recognition language</span>
          <select
            value={settings.language}
            disabled={settings.autoDetectLanguage}
            onChange={(e) =>
              onUpdateSettings({ ...settings, language: e.target.value as AurixLanguage })
            }
            className="mt-1 w-full bg-[#F8FAFC] dark:bg-[#0B111B] border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-[#202938] dark:text-white disabled:opacity-50"
          >
            <option value="English">English</option>
            <option value="Urdu">Urdu</option>
            <option value="Hindi">Hindi</option>
          </select>
        </label>

        <label className="block text-xs text-[#64748B]">
          <span>DEX MADE cloud voice (Gemini)</span>
          <select
            value={settings.voiceName}
            onChange={(e) =>
              onUpdateSettings({
                ...settings,
                voiceName: e.target.value as AppSettings["voiceName"],
              })
            }
            className="mt-1 w-full bg-[#F8FAFC] dark:bg-[#0B111B] border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-[#202938] dark:text-white"
          >
            <option value="Charon">Charon — deep, composed British male</option>
            <option value="Fenrir">Fenrir — warm, confident male</option>
            <option value="Puck">Puck — bright, youthful male</option>
          </select>
        </label>

        <label className="block text-xs text-[#64748B]">
          <span>Device voice (offline fallback)</span>
          <select
            value={settings.voiceId || ""}
            onChange={(e) => onUpdateSettings({ ...settings, voiceId: e.target.value })}
            className="mt-1 w-full bg-[#F8FAFC] dark:bg-[#0B111B] border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-[#202938] dark:text-white"
          >
            <option value="">Automatic — best male voice on this device</option>
            {deviceVoices.map((voice) => (
              <option key={voice.uri} value={voice.uri}>
                {voice.natural ? "★ " : ""}
                {voice.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="block text-xs text-[#64748B]">
          <span>Voice speed · {(settings.voiceSpeed ?? 1).toFixed(2)}×</span>
          <input
            type="range"
            min={0.8}
            max={1.2}
            step={0.05}
            value={settings.voiceSpeed}
            onChange={(e) => onUpdateSettings({ ...settings, voiceSpeed: Number(e.target.value) })}
            className="mt-2 w-full accent-[#10B981]"
          />
        </label>
        <label className="block text-xs text-[#64748B]">
          <span>Voice volume · {Math.round((settings.voiceVolume ?? 2) * 100)}% (50–300%)</span>
          <input
            type="range"
            min={0.5}
            max={3}
            step={0.05}
            value={settings.voiceVolume ?? 2}
            onChange={(e) => onUpdateSettings({ ...settings, voiceVolume: Number(e.target.value) })}
            className="mt-2 w-full accent-[#10B981]"
          />
        </label>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-[#F8FAFC] dark:bg-[#0B111B] p-3 space-y-2">
        <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.16em] text-[#64748B] dark:text-slate-400">
          <Activity className="w-3 h-3" />
          Audio diagnostics
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
          <div className="text-[#64748B] dark:text-slate-400">
            Mic permission <span className="text-[#202938] dark:text-white font-semibold">{permission}</span>
          </div>
          <div className="text-[#64748B] dark:text-slate-400">
            Microphone{" "}
            <span className="text-[#202938] dark:text-white font-semibold">
              {snapshot.micReady ? "ready" : "not open"}
            </span>
          </div>
          <div className="text-[#64748B] dark:text-slate-400">
            Voice engine <span className="text-[#202938] dark:text-white font-semibold">{engineLabel}</span>
          </div>
          <div className="text-[#64748B] dark:text-slate-400">
            State <span className="text-[#202938] dark:text-white font-semibold">{snapshot.state}</span>
          </div>
          <div className="text-[#64748B] dark:text-slate-400">
            Device voices <span className="text-[#202938] dark:text-white font-semibold">{deviceVoices.length}</span>
          </div>
          <div className="text-[#64748B] dark:text-slate-400 truncate">
            Active device voice{" "}
            <span className="text-[#202938] dark:text-white font-semibold">
              {activeDeviceVoice ? activeDeviceVoice.name : "none installed"}
            </span>
          </div>
          <div className="text-[#64748B] dark:text-slate-400">
            Natural voice{" "}
            <span className="text-[#202938] dark:text-white font-semibold">
              {hasNaturalDeviceVoice() ? "available" : "basic"}
            </span>
          </div>
          <div className="text-[#64748B] dark:text-slate-400">
            Talk key{" "}
            <span className="text-[#202938] dark:text-white font-semibold">
              {formatShortcut(shortcuts.pushToTalk)}
            </span>
          </div>
          <div className="text-[#64748B] dark:text-slate-400">
            Interrupt{" "}
            <span className="text-[#202938] dark:text-white font-semibold">
              {formatShortcut(shortcuts.cancel)}
            </span>
          </div>
        </div>
        {snapshot.error && (
          <p className="text-[11px] text-rose-600 dark:text-rose-300">{snapshot.error}</p>
        )}
        {message && <p className="text-[11px] text-[#64748B] dark:text-slate-300">{message}</p>}
        {heard && (
          <p className="text-[11px] text-[#202938] dark:text-slate-100">
            <Volume2 className="inline w-3 h-3 mr-1 text-[#10B981]" />
            Heard: “{heard}”
          </p>
        )}
      </div>
    </section>
  );
}
