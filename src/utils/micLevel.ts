export interface MicLevelMeter {
  /** Opens the microphone and starts reporting energy 0..1 (about 15 times a second). */
  start: () => Promise<MediaStream | null>;
  stop: () => void;
  getStream: () => MediaStream | null;
}

const EMIT_INTERVAL_MS = 66;

/**
 * Real microphone energy for the listening waveform. The stream it opens is
 * handed back so the recorder can reuse it instead of asking for the mic twice.
 */
export function createMicLevelMeter(onLevel: (level: number) => void): MicLevelMeter {
  let stream: MediaStream | null = null;
  let context: AudioContext | null = null;
  let frame = 0;
  let lastEmit = 0;

  const stop = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    if (context) {
      void context.close().catch(() => {});
      context = null;
    }
    onLevel(0);
  };

  const start = async (): Promise<MediaStream | null> => {
    if (stream) return stream;
    if (!navigator.mediaDevices?.getUserMedia) return null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const Ctor =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return stream;
      context = new Ctor();
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      context.createMediaStreamSource(stream).connect(analyser);
      const samples = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (let i = 0; i < samples.length; i += 1) {
          const value = (samples[i] - 128) / 128;
          sum += value * value;
        }
        const now = performance.now();
        if (now - lastEmit >= EMIT_INTERVAL_MS) {
          lastEmit = now;
          onLevel(Math.max(0, Math.min(1, Math.sqrt(sum / samples.length) * 4.5)));
        }
        frame = requestAnimationFrame(tick);
      };
      tick();
      return stream;
    } catch {
      stream = null;
      return null;
    }
  };

  return { start, stop, getStream: () => stream };
}
