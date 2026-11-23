# AURIX 2.0 — Windows 10 & Windows 11 Installation Guide
**POWERED BY: AM VEYRONIX**

## System Requirements
- **OS**: Windows 10 (64-bit) or Windows 11 (64-bit)
- **Runtime**: Node.js 20+ LTS (`https://nodejs.org`)
- **Optional (Native PC Control & Offline Models)**:
  - Python 3.11+ (`https://python.org`) for `windows_native/python_core`
  - Ollama (`https://ollama.com`) for $0 local offline LLM execution
  - .NET 8 SDK + Inno Setup 6 (only if compiling the native C# WPF `.exe` installer)

---

## Step 1 — Extract the Downloaded Project ZIP
1. Right-click `AURIX_2.0_Complete_System_AM_VEYRONIX.zip` -> **Extract All...**
2. Extract to a clean folder such as `C:\Users\YourName\AURIX_2.0\`.

## Step 2 — Fast One-Click Launch (Recommended)
1. Double-click `windows_native\AURIX_Portable_Start.bat`.
2. On first launch, it automatically runs `npm install` to download local Node dependencies.
3. Your default browser opens `http://localhost:3000` showing the 8-second AURIX startup sequence and bright Command Hub.

*Or manually via PowerShell / Command Prompt:*
```powershell
cd C:\Users\YourName\AURIX_2.0
npm install
npm run dev
```

## Step 3 — Setting Up Local Offline AI Models (Optional, Free)
1. Install Ollama for Windows (`https://ollama.com`).
2. Pull a model matched to your hardware RAM:
   - **4 GB RAM / Entry Laptop (e.g., Dell Latitude E6420, Intel HD 3000)**:
     ```powershell
     ollama pull qwen2.5:0.5b
     ```
     *(Choose **Lightweight Mode** in AURIX Settings or System > AI Models)*
   - **8 GB RAM / Balanced Laptop**:
     ```powershell
     ollama pull qwen2.5:1.5b
     ```
   - **16 GB+ RAM / Workstation**:
     ```powershell
     ollama pull llama3.2:3b
     ```
3. AURIX automatically detects running Ollama models at `http://127.0.0.1:11434`.

## Step 4 — Optional Native Python Windows PC Automation
```powershell
cd windows_native\python_core
python -m pip install -r requirements.txt
python aurix_core.py
```

## Step 5 — Optional Cloud Gemini Enhancement
If you want optional cloud Gemini features while online, copy `.env.example` to `.env` and add your server-side `GEMINI_API_KEY`:
```env
GEMINI_API_KEY="your_api_key_here"
```
Never share `.env` publicly. Without a key, AURIX runs cleanly in Offline + Local Mode.

## Step 6 — Always-On Laptop Control (Voice Commands That Actually Act)
Laptop control works only while AURIX is running **on your own PC** (`windows_native\AURIX_Portable_Start.bat` or `npm run dev`).
The hosted browser preview cannot reach your computer, so it offers a clickable link instead of opening anything.

Start AURIX automatically with Windows (recommended):
```powershell
cd C:\Users\YourName\AURIX_2.0\windows_native
powershell -ExecutionPolicy Bypass -File .\installer\aurix_autostart.ps1
```
To undo, delete `AURIX 2.0.lnk` from `shell:startup`.

Voice / typed commands AURIX can execute on the laptop:
- “open YouTube” · “play my favourite music” · “open my company website”
- “open my Downloads folder” · “open my Projects folder”
- “search my laptop for report” (finds files/folders and reveals them in Explorer)
- “edit my file notes” (opens the file in your default editor)
- “open notepad / calculator / VS Code / Spotify”
- “what is my company growth today” (answered from AURIX's own project and audit data)

Social inboxes (Instagram, Facebook, TikTok, LinkedIn, YouTube): AURIX opens the platform's messages page in your
browser. Reading the message contents themselves requires that platform's own API/login, so it stays a page launch.

Every executed action is written to the Automation Center log, and Emergency Stop blocks all of them instantly.
