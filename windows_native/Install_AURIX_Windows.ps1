# AURIX 2.0 — Windows 10/11 Setup Verification & Installer Helper
$ErrorActionPreference = "Continue"
Write-Host "=== AURIX 2.0 (AM VEYRONIX) Windows 10/11 Setup Check ===" -ForegroundColor Cyan

$ramGb = [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB, 2)
Write-Host "Detected RAM: $ramGb GB"
if ($ramGb -lt 6) {
  Write-Host "Recommended Profile: Lightweight Mode (Optimized for <=4GB RAM systems)" -ForegroundColor Yellow
} elseif ($ramGb -lt 14) {
  Write-Host "Recommended Profile: Balanced Mode" -ForegroundColor Green
} else {
  Write-Host "Recommended Profile: Advanced Mode" -ForegroundColor Green
}

$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) { Write-Host "Node.js: $($node.Source)" -ForegroundColor Green }
else { Write-Host "Node.js NOT FOUND - Install Node.js 20+ LTS from https://nodejs.org" -ForegroundColor Red }

$py = Get-Command python -ErrorAction SilentlyContinue
if ($py) { Write-Host "Python: $($py.Source)" -ForegroundColor Green }
else { Write-Host "Python 3.11+ optional for native desktop hardware control" -ForegroundColor Yellow }

$ollama = Get-Command ollama -ErrorAction SilentlyContinue
if ($ollama) { Write-Host "Ollama Offline AI: Installed" -ForegroundColor Green }
else { Write-Host "Ollama Offline AI: Optional - Install from https://ollama.com for local models" -ForegroundColor Yellow }
