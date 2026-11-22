"""AURIX 2.0 — 12-Step Self-Healing Watchdog"""
import ast
import shutil
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any

def create_backup_snapshot(source_dir: Path, backup_dir: Path) -> Path:
    backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    archive_base = backup_dir / f"aurix_py_snapshot_{stamp}"
    zip_path = shutil.make_archive(str(archive_base), "zip", root_dir=str(source_dir))
    return Path(zip_path)

def verify_python_syntax(root_dir: str) -> List[Dict[str, Any]]:
    issues = []
    for py_file in Path(root_dir).rglob("*.py"):
        try:
            ast.parse(py_file.read_text(encoding="utf-8"))
        except SyntaxError as exc:
            issues.append({"file": str(py_file), "line": exc.lineno, "error": exc.msg})
    return issues

def heal_sqlite_db(db_path: str) -> Dict[str, Any]:
    conn = sqlite3.connect(db_path)
    try:
        res = conn.execute("PRAGMA integrity_check;").fetchone()
        ok = bool(res and res[0] == "ok")
        if not ok:
            conn.execute("VACUUM;")
        return {"ok": ok, "integrity": res[0] if res else "unknown"}
    finally:
        conn.close()
