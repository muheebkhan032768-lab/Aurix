/**
 * Cinematic sci-fi startup sound synthesizer using Web Audio API.
 * Features: tension whoosh riser -> sudden sub-bass impact & metallic emergence ->
 * cyan sweep harmonic -> futuristic digital activation chime.
 * 100% procedural, zero copyrighted samples.
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
  comp.threshold.setValueAtTime(-14, ctx.currentTime);
  comp.knee.setValueAtTime(18, ctx.currentTime);
  comp.ratio.setValueAtTime(4, ctx.currentTime);
  comp.attack.setValueAtTime(0.005, ctx.currentTime);
  comp.release.setValueAtTime(0.25, ctx.currentTime);

  const normalizedVol = Math.max(0, Math.min(1, volumePercent / 100)) * 0.52;
  master.gain.setValueAtTime(0.0001, ctx.currentTime);
  master.connect(comp);
  comp.connect(ctx.destination);

  const totalDur = Math.max(4, durationSeconds);
  const scale = totalDur / 8;

  // Create reusable filtered noise buffer for cinematic air whoosh & impact transient
  const noiseLength = Math.floor(ctx.sampleRate * Math.min(4, 3.2 * scale));
  const noiseBuffer = ctx.createBuffer(1, noiseLength, ctx.sampleRate);
  const noiseData = noiseBuffer.getChannelData(0);
  for (let i = 0; i < noiseLength; i++) {
    noiseData[i] = Math.random() * 2 - 1;
  }

  const scheduleComposition = (startAt: number) => {
    master.gain.cancelScheduledValues(startAt);
    master.gain.setValueAtTime(0.0001, startAt);
    master.gain.exponentialRampToValueAtTime(normalizedVol, startAt + 0.35);
    master.gain.setValueAtTime(normalizedVol, startAt + 6.4 * scale);
    master.gain.exponentialRampToValueAtTime(0.0001, startAt + totalDur - 0.08);

    // PHASE 1 (0.0s -> 1.95s): Deep Sub Tension + Rising Cinematic Air Whoosh
    const whoosh = ctx.createBufferSource();
    whoosh.buffer = noiseBuffer;
    const whooshFilter = ctx.createBiquadFilter();
    whooshFilter.type = "bandpass";
    whooshFilter.Q.setValueAtTime(2.6, startAt);
    whooshFilter.frequency.setValueAtTime(120, startAt);
    whooshFilter.frequency.exponentialRampToValueAtTime(3400, startAt + 1.92 * scale);

    const whooshGain = ctx.createGain();
    whooshGain.gain.setValueAtTime(0.0001, startAt);
    whooshGain.gain.exponentialRampToValueAtTime(0.32, startAt + 1.85 * scale);
    whooshGain.gain.exponentialRampToValueAtTime(0.0001, startAt + 2.25 * scale);

    whoosh.connect(whooshFilter);
    whooshFilter.connect(whooshGain);
    whooshGain.connect(master);
    whoosh.start(startAt);
    whoosh.stop(startAt + 2.35 * scale);

    // Rising turbine/energy synth leading into the impact
    const riser = ctx.createOscillator();
    const riserGain = ctx.createGain();
    riser.type = "sawtooth";
    riser.frequency.setValueAtTime(55, startAt + 0.1 * scale);
    riser.frequency.exponentialRampToValueAtTime(220, startAt + 1.95 * scale);

    const riserLp = ctx.createBiquadFilter();
    riserLp.type = "lowpass";
    riserLp.frequency.setValueAtTime(180, startAt);
    riserLp.frequency.exponentialRampToValueAtTime(1800, startAt + 1.95 * scale);

    riserGain.gain.setValueAtTime(0.0001, startAt);
    riserGain.gain.exponentialRampToValueAtTime(0.18, startAt + 1.88 * scale);
    riserGain.gain.exponentialRampToValueAtTime(0.0001, startAt + 2.1 * scale);

    riser.connect(riserLp);
    riserLp.connect(riserGain);
    riserGain.connect(master);
    riser.start(startAt);
    riser.stop(startAt + 2.15 * scale);

    // PHASE 2 (1.95s): SUDDEN CINEMATIC EMERGENCE IMPACT ("Something massive appears")
    const impactAt = startAt + 1.95 * scale;

    // 2A. Deep Sub-Bass Drop Boom (135Hz -> 34Hz)
    const boom = ctx.createOscillator();
    const boomGain = ctx.createGain();
    boom.type = "sine";
    boom.frequency.setValueAtTime(140, impactAt);
    boom.frequency.exponentialRampToValueAtTime(34, impactAt + 0.42 * scale);

    boomGain.gain.setValueAtTime(0.0001, impactAt);
    boomGain.gain.exponentialRampToValueAtTime(0.75, impactAt + 0.018);
    boomGain.gain.exponentialRampToValueAtTime(0.0001, impactAt + 1.65 * scale);

    boom.connect(boomGain);
    boomGain.connect(master);
    boom.start(impactAt);
    boom.stop(impactAt + 1.75 * scale);

    // 2B. Crisp Mechanical/Metallic Snap Burst at Impact
    const snap = ctx.createBufferSource();
    snap.buffer = noiseBuffer;
    const snapHp = ctx.createBiquadFilter();
    snapHp.type = "highpass";
    snapHp.frequency.setValueAtTime(1400, impactAt);
    const snapGain = ctx.createGain();
    snapGain.gain.setValueAtTime(0.36, impactAt);
    snapGain.gain.exponentialRampToValueAtTime(0.0001, impactAt + 0.28 * scale);

    snap.connect(snapHp);
    snapHp.connect(snapGain);
    snapGain.connect(master);
    snap.start(impactAt);
    snap.stop(impactAt + 0.35 * scale);

    // 2C. Lush Metallic Sci-Fi Chord Swell (D3, A3, E4, F#4)
    const chordFreqs = [146.83, 220.0, 329.63, 369.99];
    const chordFilter = ctx.createBiquadFilter();
    chordFilter.type = "lowpass";
    chordFilter.frequency.setValueAtTime(2400, impactAt);
    chordFilter.frequency.exponentialRampToValueAtTime(650, startAt + totalDur);
    chordFilter.connect(master);

    chordFreqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = idx < 2 ? "triangle" : "sine";
      osc.frequency.setValueAtTime(freq, impactAt);
      osc.detune.setValueAtTime((idx - 1.5) * 6, impactAt);
      g.gain.setValueAtTime(0.0001, impactAt);
      g.gain.exponentialRampToValueAtTime(idx === 0 ? 0.24 : 0.14, impactAt + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, startAt + totalDur - 0.15);
      osc.connect(g);
      g.connect(chordFilter);
      osc.start(impactAt);
      osc.stop(startAt + totalDur);
    });

    // PHASE 3 (4.15s -> 5.8s): Electric Cyan Sweep Scanner + Digital Activation Chimes
    const sweepAt = startAt + 4.15 * scale;
    const sweepOsc = ctx.createOscillator();
    const sweepGain = ctx.createGain();
    sweepOsc.type = "sine";
    sweepOsc.frequency.setValueAtTime(380, sweepAt);
    sweepOsc.frequency.exponentialRampToValueAtTime(1180, sweepAt + 1.15 * scale);
    sweepGain.gain.setValueAtTime(0.0001, sweepAt);
    sweepGain.gain.exponentialRampToValueAtTime(0.14, sweepAt + 0.35 * scale);
    sweepGain.gain.exponentialRampToValueAtTime(0.0001, sweepAt + 1.35 * scale);
    sweepOsc.connect(sweepGain);
    sweepGain.connect(master);
    sweepOsc.start(sweepAt);
    sweepOsc.stop(sweepAt + 1.45 * scale);

    // Crisp dual-tone activation chime as tagline settles
    const chimes = [
      { freq: 587.33, at: startAt + 4.95 * scale, amp: 0.22 }, // D5
      { freq: 880.0, at: startAt + 5.18 * scale, amp: 0.26 }, // A5
      { freq: 1174.66, at: startAt + 5.42 * scale, amp: 0.15 }, // D6
    ];
    chimes.forEach((c) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(c.freq, c.at);
      g.gain.setValueAtTime(0.0001, c.at);
      g.gain.exponentialRampToValueAtTime(c.amp, c.at + 0.025);
      g.gain.exponentialRampToValueAtTime(0.0001, Math.min(startAt + totalDur, c.at + 2.1 * scale));
      osc.connect(g);
      g.connect(master);
      osc.start(c.at);
      osc.stop(Math.min(startAt + totalDur, c.at + 2.2 * scale));
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
