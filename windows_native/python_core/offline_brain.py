"""AURIX 2.0 — Free Local & Offline AI Brain"""
import urllib.request
import json

def list_local_ollama_models() -> list[dict]:
    try:
        with urllib.request.urlopen("http://127.0.0.1:11434/api/tags", timeout=2) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data.get("models", [])
    except Exception:
        return []

def ask_local_ollama(prompt: str, model: str = "qwen2.5:1.5b") -> str | None:
    try:
        req = urllib.request.Request(
            "http://127.0.0.1:11434/api/chat",
            data=json.dumps({
                "model": model,
                "stream": False,
                "messages": [{"role": "user", "content": prompt}],
            }).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data.get("message", {}).get("content")
    except Exception:
        return None
