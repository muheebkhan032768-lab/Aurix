# AURIX 2.0 — Backup & Recovery Guide

## Exporting Backups
- In the AURIX Command Center, open **Settings -> Memory & Backups** and click **Export JSON Backup**.
- On native Windows installations, back up `%LOCALAPPDATA%\AM_VEYRONIX\AURIX\aurix_local.db` and `security.db`.

## PIN Lockout Recovery
- 5 consecutive incorrect PIN entries trigger a 120-second cooldown lockout.
- If the owner forgets the PIN on native Windows, authenticate via Windows Hello or clear `pin_hash` from `security.db` using an administrator recovery shell after physical device verification.
