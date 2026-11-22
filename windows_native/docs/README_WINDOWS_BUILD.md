# AURIX 2.0 — Native Windows 10/11 x64 Installation & Build Guide

## Prerequisites (Windows 10/11 64-bit)
1. .NET 8.0 SDK (x64)
2. Python 3.11+ (x64)
3. Inno Setup 6 (for generating the Windows Installer)

## Build Steps
1. Open PowerShell inside `installer/`.
2. Run `./build_x64.ps1` to freeze the Python AI core and publish the self-contained C# WPF executable.
3. Open `installer/aurix_installer.iss` in Inno Setup Compiler and click **Build -> Compile** to produce `AURIX_2.0_Setup_x64.exe`.
4. Set your `GEMINI_API_KEY` environment variable or Windows Credential Manager entry for cloud mode, and optionally place local ONNX model weights under `%LOCALAPPDATA%\AM_VEYRONIX\AURIX\models`.
