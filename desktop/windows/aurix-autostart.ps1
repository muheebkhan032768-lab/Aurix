<#
  DEX MADE automatic startup (Windows 10/11)

  What this does
  --------------
  1. Starts the local DEX MADE server if it is not already listening on port 3000.
  2. Opens DEX MADE in its own Chrome app window.
  3. DEX MADE always boots LOCKED. No personal memory, configuration or training
     data is shown until the owner passes face, voice or PIN verification.

  Install
  -------
  Create a shortcut to this file in:
      shell:startup        (Win+R -> type: shell:startup)
  and set the shortcut's "Start in" folder to the DEX MADE project root.

  Edit $AurixRoot below if the project lives somewhere else.
#>

param(
  [string]$AurixRoot = "C:\DEX MADE",
  [int]$Port = 3000
)

$ErrorActionPreference = "Stop"

function Test-AurixPort {
  param([int]$PortNumber)
  try {
    return [bool](Get-NetTCPConnection -LocalPort $PortNumber -State Listen -ErrorAction SilentlyContinue)
  } catch {
    return $false
  }
}

if (-not (Test-AurixPort -PortNumber $Port)) {
  if (-not (Test-Path (Join-Path $AurixRoot "package.json"))) {
    Write-Error "DEX MADE project not found at $AurixRoot. Edit `$AurixRoot in this script."
    exit 1
  }
  # Hidden console keeps the server running without a stray terminal window.
  Start-Process -FilePath "cmd.exe" `
    -ArgumentList "/c cd /d `"$AurixRoot`" && npm run dev" `
    -WindowStyle Hidden

  $ready = $false
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 2
    try {
      Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/security/status" -UseBasicParsing -TimeoutSec 3 | Out-Null
      $ready = $true
      break
    } catch {
      # still starting
    }
  }
  if (-not $ready) {
    Write-Error "DEX MADE server did not answer on port $Port. Check the server logs."
    exit 1
  }
}

$chrome = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($chrome) {
  Start-Process -FilePath $chrome -ArgumentList "--app=http://127.0.0.1:$Port/"
} else {
  Start-Process "http://127.0.0.1:$Port/"
}
