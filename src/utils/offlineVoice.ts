import type { AurixLanguage } from "../types/aurix";

export interface OfflineVoiceCallbacks {
  onStart?: () => void;
  onEnd?: () => void;
  onBoundary?: () => void;
}

/**
 * 100% Free Offline British Male SpeechSynthesis helper.
 * Exposes available UK/male voices honestly and pulses onBoundary events for real speech pacing.
 */
export function getAvailableBritishVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return [];
  const voices = window.speechSynthesis.getVoices();
  return voices.filter(
    (v) => v.lang.toLowerCase().includes("gb") || /george|ryan|daniel|arthur|hazel|libby|oliver/i.test(v.name)
  );
}

export function speakWithOfflineBritishVoice(
  text: string,
  language: AurixLanguage = "English",
  speed = 1.0,
  callbacks?: OfflineVoiceCallbacks,
  preferredVoiceUri?: string
): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return false;
  }

  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);

    const voices = window.speechSynthesis.getVoices();
    const pickVoice = () => {
      if (preferredVoiceUri) {
        const match = voices.find((v) => v.voiceURI === preferredVoiceUri || v.name === preferredVoiceUri);
        if (match) return match;
      }
      if (language === "Urdu") {
        return (
          voices.find((v) => v.lang.toLowerCase().startsWith("ur")) ||
          voices.find((v) => v.lang.toLowerCase().includes("gb"))
        );
      }
      if (language === "Hindi") {
        return (
          voices.find((v) => v.lang.toLowerCase().startsWith("hi")) ||
          voices.find((v) => v.lang.toLowerCase().includes("gb"))
        );
      }
      const gbVoices = voices.filter((v) => v.lang.toLowerCase().includes("gb"));
      const preferredMale = gbVoices.find((v) =>
        /male|george|ryan|daniel|arthur|oliver|alfie|guy/i.test(v.name)
      );
      return (
        preferredMale ||
        gbVoices[0] ||
        voices.find((v) => /male|david|mark|daniel/i.test(v.name)) ||
        voices[0]
      );
    };

    const chosen = pickVoice();
    if (chosen) utter.voice = chosen;
    utter.lang = language === "Urdu" ? "ur-PK" : language === "Hindi" ? "hi-IN" : "en-GB";
    utter.rate = Math.max(0.75, Math.min(1.25, speed * 0.98));
    utter.pitch = 0.86;

    utter.onstart = () => callbacks?.onStart?.();
    utter.onboundary = () => callbacks?.onBoundary?.();
    utter.onend = () => callbacks?.onEnd?.();
    utter.onerror = () => callbacks?.onEnd?.();

    window.speechSynthesis.speak(utter);
    return true;
  } catch {
    callbacks?.onEnd?.();
    return false;
  }
}

export function cancelOfflineVoice() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}
