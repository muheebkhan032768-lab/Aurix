"""
AURIX 2.0 — Native Windows AI Core Orchestrator
Creator: Abdul Muheeb | Company: AM VEYRONIX
"""
import json
import platform
import psutil
import sys
from pathlib import Path
from ai_router import HybridAIRouter
from memory_sqlite import AurixMemoryStore
from security_argon2 import AurixSecurityManager


class AurixOrchestrator:
    def __init__(self, data_dir: Path):
        self.data_dir = data_dir
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.memory = AurixMemoryStore(self.data_dir / "aurix_local.db")
        self.security = AurixSecurityManager(self.data_dir / "security.db")
        self.router = HybridAIRouter(self.detect_hardware_profile())

    def detect_hardware_profile(self) -> dict:
        ram_gb = round(psutil.virtual_memory().total / (1024 ** 3), 2)
        cores = psutil.cpu_count(logical=True) or 2
        has_cuda = False
        try:
            import torch
            has_cuda = torch.cuda.is_available()
        except ImportError:
            has_cuda = False

        tier = "high" if (ram_gb >= 16 and (has_cuda or cores >= 8)) else ("mid" if ram_gb >= 8 else "entry")
        return {
            "os": f"{platform.system()} {platform.release()}",
            "arch": platform.machine(),
            "cpu_cores": cores,
            "ram_gb": ram_gb,
            "gpu_cuda": has_cuda,
            "tier": tier,
            "execution_provider": "CUDAExecutionProvider" if has_cuda else "CPUExecutionProvider",
        }

    def handle_request(self, payload: dict) -> dict:
        action = payload.get("action")
        if action == "status":
            return {"ok": True, "hardware": self.detect_hardware_profile()}
        if action == "chat":
            prompt = payload.get("prompt", "")
            scope = payload.get("website_scope", "Global")
            context = self.memory.get_scoped_context(scope)
            reply = self.router.generate(prompt=prompt, system_context=context)
            return {"ok": True, "reply": reply, "provider": self.router.active_provider}
        if action == "verify_pin":
            ok, msg = self.security.verify_pin(payload.get("pin", ""))
            return {"ok": ok, "message": msg}
        return {"ok": False, "error": f"Unknown action: {action}"}


if __name__ == "__main__":
    orchestrator = AurixOrchestrator(Path.home() / "AppData" / "Local" / "AM_VEYRONIX" / "AURIX")
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            res = orchestrator.handle_request(req)
        except Exception as exc:
            res = {"ok": False, "error": str(exc)}
        print(json.dumps(res), flush=True)
