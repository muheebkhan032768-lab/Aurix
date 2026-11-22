"""
AURIX 2.0 Voice Engine — Wake Word, Speech Recognition & Male TTS
Languages: English, Urdu, Hindi
"""
import pyttsx3


class AurixVoiceEngine:
    def __init__(self, wake_phrase: str = "Hello AURIX"):
        self.wake_phrase = wake_phrase.lower()
        self.engine = pyttsx3.init("sapi5")
        self.configure_male_voice(rate=178)

    def configure_male_voice(self, rate: int = 178):
        voices = self.engine.getProperty("voices")
        for v in voices:
            if "david" in v.name.lower() or "male" in v.name.lower():
                self.engine.setProperty("voice", v.id)
                break
        self.engine.setProperty("rate", rate)
        self.engine.setProperty("volume", 0.95)

    def speak(self, text: str):
        self.engine.say(text)
        self.engine.runAndWait()

    def matches_wake_phrase(self, transcript: str) -> bool:
        return self.wake_phrase in transcript.lower()
