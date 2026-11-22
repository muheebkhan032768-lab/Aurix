"""
AURIX 2.0 Security Module — Argon2id PIN Hashing & Lockout Controls
"""
import sqlite3
import time
from pathlib import Path
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError


class AurixSecurityManager:
    MAX_ATTEMPTS = 5
    LOCKOUT_SECONDS = 120

    def __init__(self, db_path: Path):
        self.ph = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=2)
        self.conn = sqlite3.connect(str(db_path))
        self.conn.execute(
            """CREATE TABLE IF NOT EXISTS auth_state (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                pin_hash TEXT,
                failed_attempts INTEGER DEFAULT 0,
                locked_until REAL DEFAULT 0
            )"""
        )
        self.conn.execute("INSERT OR IGNORE INTO auth_state (id) VALUES (1)")
        self.conn.commit()

    def set_pin(self, raw_pin: str):
        if len(raw_pin) < 4:
            raise ValueError("PIN must be at least 4 characters.")
        hashed = self.ph.hash(raw_pin)
        self.conn.execute(
            "UPDATE auth_state SET pin_hash = ?, failed_attempts = 0, locked_until = 0 WHERE id = 1",
            (hashed,),
        )
        self.conn.commit()

    def verify_pin(self, raw_pin: str) -> tuple[bool, str]:
        row = self.conn.execute("SELECT pin_hash, failed_attempts, locked_until FROM auth_state WHERE id = 1").fetchone()
        pin_hash, attempts, locked_until = row
        now = time.time()
        if locked_until and now < locked_until:
            return False, f"Account locked. Retry in {int(locked_until - now)}s."
        if not pin_hash:
            return True, "No PIN configured."
        try:
            self.ph.verify(pin_hash, raw_pin)
            self.conn.execute("UPDATE auth_state SET failed_attempts = 0, locked_until = 0 WHERE id = 1")
            self.conn.commit()
            return True, "Verified"
        except VerifyMismatchError:
            attempts += 1
            next_lock = now + self.LOCKOUT_SECONDS if attempts >= self.MAX_ATTEMPTS else 0
            self.conn.execute(
                "UPDATE auth_state SET failed_attempts = ?, locked_until = ? WHERE id = 1",
                (attempts, next_lock),
            )
            self.conn.commit()
            return False, "Temporary lockout active." if next_lock else f"Invalid PIN ({attempts}/{self.MAX_ATTEMPTS})"
