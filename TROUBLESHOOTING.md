# DEX MADE 2.0 — Troubleshooting & Diagnostics Guide

## 1. Microphone or Voice Playback Blocked in Browser
- **Symptom**: Orb stays idle when clicking Mic, or startup voice greeting does not play automatically.
- **Fix**:
  1. Ensure you clicked **Allow Access** (or **Continue & Speak**) on the post-startup prompt.
  2. Check Windows **Settings > Privacy & security > Microphone** -> allow Desktop apps and your browser.
  3. On Windows 10/11, ensure English (United Kingdom) speech pack (`Microsoft George` / `Microsoft Hazel`) is installed in **Settings > Time & language > Speech** for offline British voice synthesis.

## 2. Low-Memory / Older Laptop Performance (e.g., 4 GB RAM, Intel HD 3000)
- **Fix**:
  1. Open **Settings > Performance & Hardware Mode** and select **Lightweight Mode**.
  2. Enable **Lightweight Animations** to reduce GPU compositing overhead.
  3. Do not run 7B+ parameter local models in Ollama; use `qwen2.5:0.5b` or `tinyllama`, or rely on the built-in SQLite Offline Knowledge Engine.

## 3. Port 3000 Already in Use
- **Fix**: Close any earlier Node/DEX MADE terminal window, or run in PowerShell:
  ```powershell
  Get-NetTCPConnection -LocalPort 3000 | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
  ```

## 4. Self-Healing Recovery & Backup Restore
- **Fix**: Open **System > Self-Healer**, click **Scan System**, review the 12-step diagnostic trace, or restore any prior snapshot under **Saved Snapshots & Backups**.
