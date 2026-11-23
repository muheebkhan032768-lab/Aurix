/**
 * Viseme mapping for DEX MADE's holographic face.
 *
 * A viseme is the mouth shape a sound produces. The face does not need a full
 * phoneme engine: mapping the character that is being spoken right now onto a
 * small set of shapes is enough to look convincingly in sync, and it works for
 * English, Urdu and Hindi script without a language model.
 */
export type Viseme = "rest" | "aa" | "ee" | "oh" | "oo" | "mm" | "fv" | "th" | "ss" | "nn";

export interface VisemeShape {
  /** Vertical jaw opening, 0..1. */
  open: number;
  /** Horizontal stretch, 0..1. */
  wide: number;
  /** Lip rounding, 0..1. */
  round: number;
}

export const VISEME_SHAPES: Record<Viseme, VisemeShape> = {
  rest: { open: 0.04, wide: 0.34, round: 0.08 },
  aa: { open: 1, wide: 0.58, round: 0 },
  ee: { open: 0.34, wide: 1, round: 0 },
  oh: { open: 0.72, wide: 0.3, round: 0.85 },
  oo: { open: 0.3, wide: 0.14, round: 1 },
  mm: { open: 0, wide: 0.3, round: 0.14 },
  fv: { open: 0.1, wide: 0.48, round: 0 },
  th: { open: 0.24, wide: 0.4, round: 0 },
  ss: { open: 0.08, wide: 0.82, round: 0 },
  nn: { open: 0.2, wide: 0.36, round: 0 },
};

export const VISEME_LABEL: Record<Viseme, string> = {
  rest: "REST",
  aa: "AA",
  ee: "EE",
  oh: "OH",
  oo: "OO",
  mm: "MM",
  fv: "FV",
  th: "TH",
  ss: "SS",
  nn: "NN",
};

const CHAR_VISEMES: Record<string, Viseme> = {
  // Latin
  a: "aa", á: "aa", à: "aa", ä: "aa",
  e: "ee", é: "ee", è: "ee", i: "ee", í: "ee", y: "ee",
  o: "oh", ó: "oh", ö: "oh",
  u: "oo", ú: "oo", ü: "oo", w: "oo",
  m: "mm", b: "mm", p: "mm",
  f: "fv", v: "fv",
  t: "th", d: "nn", n: "nn", l: "nn", r: "nn", g: "nn", k: "ss", c: "ss", s: "ss", z: "ss", x: "ss", j: "ss", q: "oo", h: "aa",
  // Urdu
  ا: "aa", آ: "aa", أ: "aa", ہ: "aa", ھ: "aa", ع: "aa", ء: "aa",
  و: "oo", ۆ: "oh", ۋ: "oo", ی: "ee", ے: "ee", ي: "ee", ئ: "ee",
  م: "mm", ب: "mm", پ: "mm",
  ف: "fv",
  ت: "th", ٹ: "th", ط: "th", ث: "th",
  ن: "nn", ں: "nn", د: "nn", ڈ: "nn", ر: "nn", ڑ: "nn", ل: "nn", گ: "nn", ک: "ss", ق: "ss", خ: "ss",
  س: "ss", ص: "ss", ش: "ss", ز: "ss", ذ: "ss", ض: "ss", ظ: "ss", ژ: "ss", چ: "ss", ج: "ss",
  // Hindi (Devanagari)
  अ: "aa", आ: "aa", ऑ: "oh", ए: "ee", ऐ: "ee", इ: "ee", ई: "ee", ओ: "oh", औ: "oh", उ: "oo", ऊ: "oo",
  म: "mm", ब: "mm", प: "mm", भ: "mm", फ: "fv", व: "fv",
  त: "th", थ: "th", ट: "th", ठ: "th", द: "nn", ध: "nn", ड: "nn", ढ: "nn",
  न: "nn", ण: "nn", ङ: "nn", ञ: "nn", ल: "nn", ळ: "nn", र: "nn", य: "ee", ह: "aa",
  क: "ss", ख: "ss", ग: "nn", घ: "nn", च: "ss", छ: "ss", ज: "ss", झ: "ss", श: "ss", ष: "ss", स: "ss", ज़: "ss",
};

/** The mouth shape for one character, or null for punctuation and spaces. */
export function visemeForChar(char: string | undefined): Viseme | null {
  if (!char) return null;
  return CHAR_VISEMES[char.toLowerCase()] || null;
}

/**
 * The mouth shape for the character at `index` in `text`. Punctuation is
 * skipped forward so the mouth closes between words instead of freezing.
 */
export function visemeAt(text: string, index: number): Viseme {
  if (!text || index < 0) return "rest";
  for (let i = index; i < Math.min(text.length, index + 3); i += 1) {
    const char = text[i];
    if (/\s/.test(char)) return "rest";
    const viseme = visemeForChar(char);
    if (viseme) return viseme;
  }
  return "rest";
}

/** Rough speaking pace used when a clip's real duration is unknown. */
export const CHARS_PER_SECOND = 13;

export function estimatedSpeechMs(text: string): number {
  return Math.max(600, (text.trim().length / CHARS_PER_SECOND) * 1000);
}
