/**
 * Matching math for DEX MADE biometric verification.
 *
 * Everything here runs on the local DEX MADE server: the browser only ever sends
 * a fresh sample, and the enrolled template never leaves the backend.
 *
 * Voice scoring was calibrated with synthesized speech (see
 * docs/AURIX_UPGRADE.md): cepstral-mean cosine + pitch similarity separated
 * speakers cleanly (within-speaker ≥ 0.88, between-speaker ≤ 0.66), while a
 * CMVN + DTW score did not separate them at all.
 */

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Facial geometry similarity: compares normalized inter-landmark distances.
 * Two captures of the same face stay close; a different face or a photo of a
 * different person drifts further away.
 */
export function geometrySimilarity(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let total = 0;
  for (let i = 0; i < a.length; i += 1) {
    const denom = Math.max(0.02, Math.abs(a[i]), Math.abs(b[i]));
    total += Math.min(1, Math.abs(a[i] - b[i]) / denom);
  }
  return Math.max(0, 1 - total / a.length);
}

export function l2Normalize(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  if (!norm) return vector;
  return vector.map((v) => v / norm);
}

/**
 * Average cepstral envelope of an utterance, ignoring c0 (frame energy) so the
 * comparison is about vocal-tract shape rather than loudness.
 */
export function cepstralMean(frames: number[][]): number[] {
  if (!frames.length) return [];
  const dims = frames[0].length;
  const out: number[] = [];
  for (let d = 1; d < dims; d += 1) {
    let sum = 0;
    for (const frame of frames) sum += frame[d] ?? 0;
    out.push(sum / frames.length);
  }
  return out;
}

/**
 * Relative pitch similarity: identical median F0 → 1, an octave apart → ~0.06.
 * Pitch is one of the strongest cues for distinguishing speakers, especially
 * across different voice types.
 */
export function pitchSimilarity(a: number, b: number): number {
  if (!a || !b) return 0.5;
  return Math.exp(-Math.abs(Math.log(a / b)) * 4);
}
