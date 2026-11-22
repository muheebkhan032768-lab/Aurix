"""
AURIX 2.0 Hybrid AI Router (Cloud + Local ONNX / CPU fallback)
"""
import os
import urllib.request


class HybridAIRouter:
    def __init__(self, hardware: dict):
        self.hardware = hardware
        self.active_provider = "cloud_gemini" if self.has_internet() else "local_onnx"

    @staticmethod
    def has_internet() -> bool:
        try:
            urllib.request.urlopen("https://generativelanguage.googleapis.com", timeout=2)
            return True
        except Exception:
            return False

    def select_local_quantization(self) -> str:
        tier = self.hardware.get("tier", "entry")
        if tier == "high":
            return "Q6_K / FP16 ONNX (CUDA/DirectML)"
        if tier == "mid":
            return "Q4_K_M ONNX (CPU/DirectML)"
        return "Q4_0 Compact CPU-Only"

    def generate(self, prompt: str, system_context: str) -> str:
        api_key = os.environ.get("GEMINI_API_KEY")
        if self.has_internet() and api_key:
            from google import genai
            client = genai.Client(api_key=api_key)
            resp = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=f"{system_context}\n\nOwner Request: {prompt}",
            )
            self.active_provider = "cloud_gemini"
            return resp.text or ""

        self.active_provider = "local_onnx_offline"
        return (
            f"[Offline Local Mode — {self.select_local_quantization()}] "
            "No cloud network or local ONNX model weight file is loaded at this path yet. "
            "Place an approved ONNX model in %LOCALAPPDATA%\\AM_VEYRONIX\\AURIX\\models to enable offline inference."
        )
