@echo off
title AURIX 2.0 - AM VEYRONIX Portable Launcher
echo ====================================================
echo   AURIX 2.0 — POWERED BY AM VEYRONIX
echo   Starting Personal AI Command Center...
echo ====================================================
cd /d "%~dp0.."

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js 20+ is not installed. Please install Node.js LTS from https://nodejs.org
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [SETUP] First-time launch: installing dependencies...
  call npm install
)

start "" http://localhost:3000
echo [RUN] Starting AURIX 2.0 server on http://localhost:3000 ...
call npm run dev
pause
