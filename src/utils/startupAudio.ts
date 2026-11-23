/**
 * Warm cinematic startup sound for DEX MADE, synthesized with the Web Audio
 * API (no samples, nothing copyrighted).
 *
 * Shape: a soft air swell and a slowly opening pad in A major, one gentle
 * sub-bass bloom as the name lands, then a single slow bell melody. Deliberately
 * no sharp impacts or repeated short beeps.
 */
export interface StartupAudioController {
  isSuspended: boolean;
  resume: () => Promise<boolean>;
  stop: () => void;
}

export function playProceduralStartupSound(
  volumePercent: number,
  durationSeconds: number
): StartupAudioController {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioCtx || volumePercent <= 0) {
    return {
      isSuspended: false,
      resume: async () => false,
      stop: () => {},
    };
  }

  const ctx = new AudioCtx();
  const master = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.setValueAtTime(-18, ctx.currentTime);
  comp.knee.setValueAtTime(22, ctx.currentTime);
  comp.ratio.setValueAtTime(3, ctx.currentTime);
  comp.attack.setValueAtTime(0.02, ctx.currentTime);
  comp.release.setValueAtTime(0.4, ctx.currentTime);

  const normalizedVol = Math.max(0, Math.min(1, volumePercent / 100)) * 0.5;
  master.gain.setValueAtTime(0.0001, ctx.currentTime);
  master.connect(comp);
  comp.connect(ctx.destination);

  const totalDur = Math.max(4, durationSeconds);
  const scale = totalDur / 8;

  const noiseLength = Math.floor(ctx.sampleRate * Math.min(4, 3.4 * scale));
  const noiseBuffer = ctx.createBuffer(1, noiseLength, ctx.sampleRate);
  const noiseData = noiseBuffer.getChannelData(0);
  for (let i = 0; i < noiseLength; i++) {
    noiseData[i] = Math.random() * 2 - 1;
  }

  const scheduleComposition = (startAt: number) => {
    master.gain.cancelScheduledValues(startAt);
    master.gain.setValueAtTime(0.0001, startAt);
    master.gain.exponentialRampToValueAtTime(normalizedVol, startAt + 0.9);
    master.gain.setValueAtTime(normalizedVol, startAt + Math.max(1.2, totalDur - 2.2));
    master.gain.exponentialRampToValueAtTime(0.0001, startAt + totalDur - 0.1);

    // Air swell — a slow, soft breath of filtered noise opening up.
    const air = ctx.createBufferSource();
    air.buffer = noiseBuffer;
    const airFilter = ctx.createBiquadFilter();
    airFilter.type = "bandpass";
    airFilter.Q.setValueAtTime(1.1, startAt);
    airFilter.frequency.setValueAtTime(240, startAt);
    airFilter.frequency.exponentialRampToValueAtTime(1500, startAt + 2.6 * scale);
    const airGain = ctx.createGain();
    airGain.gain.setValueAtTime(0.0001, startAt);
    airGain.gain.exponentialRampToValueAtTime(0.09, startAt + 1.8 * scale);
    airGain.gain.exponentialRampToValueAtTime(0.0001, startAt + 3.4 * scale);
    air.connect(airFilter);
    airFilter.connect(airGain);
    airGain.connect(master);
    air.start(startAt);
    air.stop(startAt + 3.5 * scale);

    // Warm pad in A major, slowly opening its filter as the name resolves.
    const padFreqs = [110.0, 164.81, 220.0, 277.18];
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = "lowpass";
    padFilter.frequency.setValueAtTime(420, startAt);
    padFilter.frequency.linearRampToValueAtTime(1900, startAt + 3.1 * scale);
    padFilter.frequency.linearRampToValueAtTime(900, startAt + totalDur);
    padFilter.connect(master);

    padFreqs.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = index < 2 ? "triangle" : "sine";
      osc.frequency.setValueAtTime(freq, startAt);
      osc.detune.setValueAtTime((index - 1.5) * 4, startAt);
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(index === 0 ? 0.16 : 0.09, startAt + 1.6 * scale);
      gain.gain.setValueAtTime(index === 0 ? 0.16 : 0.09, startAt + Math.max(1.8, totalDur - 2.4));
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + totalDur - 0.15);
      osc.connect(gain);
      gain.connect(padFilter);
      osc.start(startAt);
      osc.stop(startAt + totalDur);
    });

    // One gentle sub-bass bloom where the wordmark lands — rounded, no click.
    const bloomAt = startAt + 1.5 * scale;
    const bloom = ctx.createOscillator();
    const bloomGain = ctx.createGain();
    bloom.type = "sine";
    bloom.frequency.setValueAtTime(88, bloomAt);
    bloom.frequency.exponentialRampToValueAtTime(55, bloomAt + 1.4 * scale);
    bloomGain.gain.setValueAtTime(0.0001, bloomAt);
    bloomGain.gain.exponentialRampToValueAtTime(0.22, bloomAt + 0.22);
    bloomGain.gain.exponentialRampToValueAtTime(0.0001, bloomAt + 2.0 * scale);
    bloom.connect(bloomGain);
    bloomGain.connect(master);
    bloom.start(bloomAt);
    bloom.stop(bloomAt + 2.1 * scale);

    // Slow bell melody (A4 → C#5 → E5) with long, soft decays.
    const bells = [
      { freq: 440.0, at: startAt + 2.7 * scale, amp: 0.13 },
      { freq: 554.37, at: startAt + 3.4 * scale, amp: 0.11 },
      { freq: 659.25, at: startAt + 4.15 * scale, amp: 0.1 },
    ];
    bells.forEach((bell) => {
      const fundamental = ctx.createOscillator();
      const partial = ctx.createOscillator();
      const gain = ctx.createGain();
      const partialGain = ctx.createGain();
      fundamental.type = "sine";
      fundamental.frequency.setValueAtTime(bell.freq, bell.at);
      partial.type = "sine";
      partial.frequency.setValueAtTime(bell.freq * 2.01, bell.at);
      partialGain.gain.setValueAtTime(0.22, bell.at);
      gain.gain.setValueAtTime(0.0001, bell.at);
      gain.gain.exponentialRampToValueAtTime(bell.amp, bell.at + 0.06);
      gain.gain.exponentialRampToValueAtTime(0.0001, Math.min(startAt + totalDur, bell.at + 2.6 * scale));
      fundamental.connect(gain);
      partial.connect(partialGain);
      partialGain.connect(gain);
      gain.connect(master);
      fundamental.start(bell.at);
      partial.start(bell.at);
      fundamental.stop(Math.min(startAt + totalDur, bell.at + 2.7 * scale));
      partial.stop(Math.min(startAt + totalDur, bell.at + 2.7 * scale));
    });
  };

  let scheduled = false;
  if (ctx.state === "running") {
    scheduleComposition(ctx.currentTime);
    scheduled = true;
  } else {
    ctx.resume()
      .then(() => {
        if (!scheduled && ctx.state === "running") {
          scheduleComposition(ctx.currentTime);
          scheduled = true;
        }
      })
      .catch(() => {});
  }

  return {
    get isSuspended() {
      return ctx.state === "suspended";
    },
    resume: async () => {
      try {
        await ctx.resume();
        if (!scheduled && ctx.state === "running") {
          scheduleComposition(ctx.currentTime);
          scheduled = true;
        }
        return ctx.state === "running";
      } catch {
        return false;
      }
    },
    stop: () => {
      try {
        ctx.close();
      } catch {
        // Already closed
      }
    },
  };
}
