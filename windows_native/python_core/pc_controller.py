"""AURIX 2.0 — Native Windows PC Controller for Abdul Muheeb"""
import os
import shutil
import subprocess
import webbrowser
from datetime import datetime
from pathlib import Path
from typing import Dict, Any

EMERGENCY_FLAG = Path.home() / "AppData" / "Local" / "AM_VEYRONIX" / "AURIX" / "EMERGENCY_STOP.flag"

ALLOWED_APPS = {
    "notepad": ["notepad.exe"],
    "explorer": ["explorer.exe"],
    "chrome": ["cmd", "/c", "start", "chrome"],
    "edge": ["cmd", "/c", "start", "msedge"],
    "vscode": ["cmd", "/c", "code"],
    "terminal": ["wt.exe"],
    "calculator": ["calc.exe"],
    "taskmgr": ["taskmgr.exe"],
}


def check_emergency_stop() -> bool:
    return EMERGENCY_FLAG.exists()


def trigger_emergency_stop() -> Dict[str, Any]:
    EMERGENCY_FLAG.parent.mkdir(parents=True, exist_ok=True)
    EMERGENCY_FLAG.write_text(datetime.utcnow().isoformat(), encoding="utf-8")
    return {"ok": True, "emergency_stop": True, "flag_path": str(EMERGENCY_FLAG)}


def clear_emergency_stop() -> Dict[str, Any]:
    if EMERGENCY_FLAG.exists():
        EMERGENCY_FLAG.unlink()
    return {"ok": True, "emergency_stop": False}


def open_website(url: str) -> Dict[str, Any]:
    if check_emergency_stop():
        return {"ok": False, "error": "Blocked: Emergency Stop is active."}
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    webbrowser.open(url)
    return {"ok": True, "action": "open_website", "url": url}


def launch_app(app_key: str) -> Dict[str, Any]:
    if check_emergency_stop():
        return {"ok": False, "error": "Blocked: Emergency Stop is active."}
    cmd = ALLOWED_APPS.get(app_key.lower())
    if not cmd:
        return {"ok": False, "error": f"App '{app_key}' is not in the approved launcher table."}
    subprocess.Popen(cmd, shell=False)
    return {"ok": True, "action": "launch_app", "app": app_key}


def take_screenshot(output_dir: str | None = None) -> Dict[str, Any]:
    if check_emergency_stop():
        return {"ok": False, "error": "Blocked: Emergency Stop is active."}
    from PIL import ImageGrab
    dest_dir = Path(output_dir or (Path.home() / "Pictures" / "AURIX_Screenshots"))
    dest_dir.mkdir(parents=True, exist_ok=True)
    file_path = dest_dir / f"aurix_screen_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
    img = ImageGrab.grab()
    img.save(str(file_path))
    return {"ok": True, "path": str(file_path)}


def organize_downloads(confirm: bool = False) -> Dict[str, Any]:
    if check_emergency_stop():
        return {"ok": False, "error": "Blocked: Emergency Stop is active."}
    downloads = Path.home() / "Downloads"
    if not downloads.exists():
        return {"ok": False, "error": "Downloads folder not found."}
    if not confirm:
        files = [f.name for f in downloads.iterdir() if f.is_file()]
        return {"ok": False, "requires_confirmation": True, "preview_count": len(files), "sample": files[:15]}
    categories = {"Documents": {".pdf", ".docx", ".txt", ".xlsx"}, "Images": {".png", ".jpg", ".jpeg", ".webp", ".svg"}, "Archives": {".zip", ".rar", ".7z"}}
    moved = 0
    for f in downloads.iterdir():
        if not f.is_file():
            continue
        ext = f.suffix.lower()
        for folder, exts in categories.items():
            if ext in exts:
                target_dir = downloads / f"AURIX_Sorted_{folder}"
                target_dir.mkdir(exist_ok=True)
                shutil.move(str(f), str(target_dir / f.name))
                moved += 1
                break
    return {"ok": True, "moved": moved}


def edit_or_create_file(file_path: str, content: str, confirm: bool = False) -> Dict[str, Any]:
    if check_emergency_stop():
        return {"ok": False, "error": "Blocked: Emergency Stop is active."}
    if not confirm:
        return {"ok": False, "requires_confirmation": True, "path": file_path}
    target = Path(file_path).expanduser().resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    return {"ok": True, "path": str(target), "bytes": len(content)}


def check_windows_firewall() -> Dict[str, Any]:
    res = subprocess.run(["netsh", "advfirewall", "show", "allprofiles"], capture_output=True, text=True)
    return {"ok": res.returncode == 0, "summary": res.stdout[:1200]}
