# AURIX desktop bridge (Windows 10/11 + Chrome)

The AURIX interface is a local web application. Two things a browser cannot do by
itself live here, and both are real, inspectable code — not mockups.

## 1. Chrome / Gmail activation — `chrome-extension/`

A Manifest V3 extension that tells the local AURIX server when:

- Chrome starts (`chrome.runtime.onStartup`)
- a Gmail tab is opened (`chrome.webNavigation.onCommitted` on `mail.google.com`)

It sends exactly that: a source name and a short label, to
`http://127.0.0.1:3000/api/activation/event`. It **cannot** read page content,
messages, passwords or OTPs, and it never bypasses Google sign-in or 2-step
verification. Opening Gmail proves nothing about identity — AURIX decides on its
own whether the owner must verify with face or voice, and only unlocks the
personal session after a successful verification.

### Install

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select this `chrome-extension` folder
4. Start AURIX, then open Gmail in a new tab. AURIX records the event; if it is
   locked, the verification gate appears with the reason.

The same folder is downloadable from AURIX → **Chrome & Gmail Activation** →
*Download extension (.zip)*.

## 2. Start with Windows — `windows/aurix-autostart.ps1`

Starts the local AURIX server (hidden), waits until it answers, then opens AURIX
in its own Chrome app window. AURIX always boots **locked**; the owner must pass
face, voice or PIN verification before any personal data is shown.

### Install

1. Edit `$AurixRoot` in `aurix-autostart.ps1` to your AURIX folder (default `C:\AURIX`)
2. Press `Win+R`, run `shell:startup`
3. Put a shortcut to `aurix-autostart.ps1` in that folder
   (shortcut target: `powershell.exe -ExecutionPolicy Bypass -File "C:\AURIX\desktop\windows\aurix-autostart.ps1"`)

To disable automatic startup, delete that shortcut. The same switch exists in
AURIX → **Chrome & Gmail Activation** as a preference, but the actual Windows
autostart entry is the shortcut: Windows only starts programs that are
registered with it.

> Tested here: the extension's endpoint and the activation flow (on Linux). The
> PowerShell autostart script has **not** been executed on a Windows 10 machine
> in this environment — see the known limitations in
> `docs/AURIX_UPGRADE.md`.
