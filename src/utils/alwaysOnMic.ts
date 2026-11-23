export interface AlwaysOnMicHandlers {
  /** True while DEX MADE is speaking, thinking or already recording. */
  shouldPause: () => boolean;
  /** Called with the transcript of each spoken phrase. */
  onTranscript: (text: string) => void;
  /** Microphone sensitivity from settings, 0-100. */
  sensitivity?: () => number;
  /** Language sent with each clip so Urdu and Hindi transcribe correctly. */
  language?: () => "English" | "Urdu" | "Hindi";
  /** Reuse the shared microphone stream instead of opening a second one. */
  getSharedStream?: () => MediaStream | null;
  onError?: (message: string) => void;
  onStateChange?: (listening: boolean) => void;
}

export interface AlwaysOnMicController {
  start: () => Promise<boolean>;
  stop: () => void;
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
 * Keeps the microphone open and turns each spoken phrase into a transcript.
 * Used by DEX MADE's companion mode so it can listen without a button, and it
 * works in browsers where live speech recognition is unavailable.
 */
export function createAlwaysOnMic(handlers: AlwaysOnMicHandlers): AlwaysOnMicController {
  let stream: MediaStream | null = null;
  let ownsStream = false;
  let context: AudioContext | null = null;
  let frame = 0;
  let active = false;
  let speaking = false;
  let silenceSince = 0;
  let clipStart = 0;
  let recorder: MediaRecorder | null = null;
  let chunks: BlobPart[] = [];
  let analyserRef: AnalyserNode | null = null;
  let samples = new Uint8Array(0);

  const teardown = () => {
    active = false;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        // Recorder may already be stopped.
      }
    }
    recorder = null;
    chunks = [];
    if (ownsStream) stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    ownsStream = false;
    if (context) {
      void context.close().catch(() => {});
      context = null;
    }
    handlers.onStateChange?.(false);
  };

  const finishClip = async (mimeType: string) => {
    const blob = new Blob(chunks, { type: mimeType || "audio/webm" });
    chunks = [];
    if (blob.size < 2000) return;
    try {
      const audioBase64 = await blobToBase64(blob);
      const res = await fetch("/api/voice/stt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioBase64,
          mimeType: blob.type || "audio/webm",
          languageHint: handlers.language?.(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Transcription failed.");
      const transcript = String(data.transcript || "").trim();
      if (transcript) handlers.onTranscript(transcript);
    } catch (err) {
      handlers.onError?.(
        err instanceof Error ? err.message : "I could not hear that clearly. Please say it again."
      );
    }
  };

  const startClip = () => {
    if (!stream) return;
    try {
      const next = new MediaRecorder(stream);
      chunks = [];
      next.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      next.onstop = () => void finishClip(next.mimeType);
      next.start();
      recorder = next;
      clipStart = performance.now();
    } catch {
      // Recording is unavailable; keep listening for the next phrase.
    }
  };

  const stopClip = () => {
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    recorder = null;
  };

  const listen = () => {
    if (!active || !context) return;
    const analyser = analyserRef;
    if (!analyser) return;
    analyser.getByteTimeDomainData(samples);
    let sum = 0;
    for (let i = 0; i < samples.length; i += 1) {
      const value = (samples[i] - 128) / 128;
      sum += value * value;
    }
    const rms = Math.sqrt(sum / samples.length);
    const sensitivity = Math.min(100, Math.max(0, handlers.sensitivity?.() ?? 65));
    // Higher sensitivity lowers the level needed to open the microphone.
    const threshold = 0.012 + ((100 - sensitivity) / 100) * 0.03;
    const now = performance.now();
    const canTalk = !handlers.shouldPause();

    if (canTalk && rms > threshold) {
      if (!speaking) {
        speaking = true;
        silenceSince = 0;
        startClip();
      }
      silenceSince = 0;
    } else if (speaking) {
      if (!silenceSince) silenceSince = now;
      const longEnough = now - clipStart > 400;
      if (longEnough && (rms <= threshold && now - silenceSince > 850)) {
        speaking = false;
        silenceSince = 0;
        stopClip();
      }
    }
    frame = requestAnimationFrame(listen);
  };

  return {
    async start() {
      if (active) return true;
      if (!navigator.mediaDevices?.getUserMedia) return false;
      try {
        const shared = handlers.getSharedStream?.() || null;
        ownsStream = !shared;
        stream = shared || (await navigator.mediaDevices.getUserMedia({ audio: true }));
        context = new AudioContext();
        await context.resume().catch(() => {});
        const source = context.createMediaStreamSource(stream);
        const analyser = context.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);
        analyserRef = analyser;
        samples = new Uint8Array(analyser.fftSize);
        active = true;
        handlers.onStateChange?.(true);
        frame = requestAnimationFrame(listen);
        return true;
      } catch {
        teardown();
        return false;
      }
    },
    stop: teardown,
  };
}
