# DEX MADE desktop bridge (Windows 10/11 + Chrome)

The DEX MADE interface is a local web application. Two things a browser cannot do by
itself live here, and both are real, inspectable code — not mockups.

## 1. Chrome / Gmail activation — `chrome-extension/`

A Manifest V3 extension that tells the local DEX MADE server when:

- Chrome starts (`chrome.runtime.onStartup`)
- a Gmail tab is opened (`chrome.webNavigation.onCommitted` on `mail.google.com`)

It sends exactly that: a source name and a short label, to
`http://127.0.0.1:3000/api/activation/event`. It **cannot** read page content,
messages, passwords or OTPs, and it never bypasses Google sign-in or 2-step
verification. Opening Gmail proves nothing about identity — DEX MADE decides on its
own whether the owner must verify with face or voice, and only unlocks the
personal session after a successful verification.

### Install

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select this `chrome-extension` folder
4. Start DEX MADE, then open Gmail in a new tab. DEX MADE records the event; if it is
   locked, the verification gate appears with the reason.

The same folder is downloadable from DEX MADE → **Chrome & Gmail Activation** →
*Download extension (.zip)*.

## 2. Start with Windows — `windows/aurix-autostart.ps1`

Starts the local DEX MADE server (hidden), waits until it answers, then opens DEX MADE
in its own Chrome app window. DEX MADE always boots **locked**; the owner must pass
face, voice or PIN verification before any personal data is shown.

### Install

1. Edit `$AurixRoot` in `aurix-autostart.ps1` to your DEX MADE folder (default `C:\DEX MADE`)
2. Press `Win+R`, run `shell:startup`
3. Put a shortcut to `aurix-autostart.ps1` in that folder
   (shortcut target: `powershell.exe -ExecutionPolicy Bypass -File "C:\DEX MADE\desktop\windows\aurix-autostart.ps1"`)

To disable automatic startup, delete that shortcut. The same switch exists in
DEX MADE → **Chrome & Gmail Activation** as a preference, but the actual Windows
autostart entry is the shortcut: Windows only starts programs that are
registered with it.

> Tested here: the extension's endpoint and the activation flow (on Linux). The
> PowerShell autostart script has **not** been executed on a Windows 10 machine
> in this environment — see the known limitations in
> `docs/AURIX_UPGRADE.md`.
