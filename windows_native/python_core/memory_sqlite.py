"""
AURIX 2.0 SQLite Memory Store — Strict Website & Project Isolation
"""
import sqlite3
from pathlib import Path


class AurixMemoryStore:
    def __init__(self, db_path: Path):
        self.conn = sqlite3.connect(str(db_path))
        self.conn.execute(
            """CREATE TABLE IF NOT EXISTS memories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                category TEXT NOT NULL,
                project_scope TEXT NOT NULL,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                approved INTEGER NOT NULL DEFAULT 1,
                updated_at TEXT NOT NULL
            )"""
        )
        self.conn.commit()

    def get_scoped_context(self, project_scope: str) -> str:
        rows = self.conn.execute(
            "SELECT category, project_scope, title, content FROM memories WHERE approved = 1 AND (project_scope = ? OR project_scope = 'Global')",
            (project_scope,),
        ).fetchall()
        return "\n".join(f"[{r[1]} · {r[0]}] {r[2]}: {r[3]}" for r in rows)
