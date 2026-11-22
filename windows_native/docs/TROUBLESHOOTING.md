# AURIX 2.0 — Troubleshooting Guide

- **No Dedicated GPU Detected**: AURIX automatically selects `CPUExecutionProvider` and `Q4_0` quantization so it runs reliably on entry-level laptops without CUDA.
- **Windows Hello Unavailable**: Ensure a PIN/Hello face sensor is enrolled in Windows Settings -> Accounts -> Sign-in options. AURIX falls back automatically to Argon2id PIN verification.
- **Voice Input Silent**: Confirm Windows Privacy -> Microphone access is enabled for desktop apps and adjust Microphone Sensitivity in AURIX Settings.
- **Offline Mode**: When internet is unavailable, AURIX switches to local SQLite memory and local ONNX models if installed, clearly displaying Offline status.
