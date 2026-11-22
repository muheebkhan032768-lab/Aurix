# AURIX Owner Identity, Visual Learning & Activation — implementation notes

This document describes the upgrade that adds owner authentication, the
TEACH AURIX visual learning mode, training memory, and Chrome/Gmail activation
to AURIX 2.0. It records what is real, how it was tested, and what is **not**
verified.

## 1. Module map

| Area | Server | Browser |
| --- | --- | --- |
| Biometric store, OR policy, session | `server/biometricStore.ts` | — |
| Matching math (face geometry, cepstrum, pitch) | `server/biometricMath.ts` | — |
| Training memory (approved examples only) | `server/trainingStore.ts` | — |
| Local model delivery | `server/visionAssets.ts` | — |
| HTTP API | `server/biometricRoutes.ts` | — |
| Face / object / hand inference | — | `src/biometrics/vision.ts` |
| MFCC + pitch capture, speech recognition | — | `src/biometrics/voice.ts` |
| Camera lifecycle | — | `src/biometrics/camera.ts` |
| Live status store + rail | — | `src/biometrics/runtime.ts`, `components/biometrics/AurixStatusRail.tsx` |
| Identity gate (lock screen) | — | `components/biometrics/AuthGate.tsx` |
| Enrollment / policy / event log | — | `components/biometrics/IdentityCenterView.tsx` |
| TEACH AURIX mode | — | `components/learning/TeachAurixView.tsx` |
| Floating camera preview | — | `components/learning/CameraPreviewDock.tsx` |
| AURIX Memory Center | — | `components/learning/TrainingMemoryCenterView.tsx` |
| Chrome/Gmail + Windows autostart | — | `components/integration/ActivationView.tsx` |
| Chrome extension | `desktop/chrome-extension/` | — |
| Windows startup script | `desktop/windows/aurix-autostart.ps1` | — |

New UI sections: **Personal Authentication**, **Teach AURIX**, **Training Memory**
(primary nav) and **Chrome & Gmail Activation** (More modules).

## 2. Authentication

- **OR policy**: `POST /api/biometrics/verify/face` and `…/verify/voice` each
  unlock the session on success. One enabled method is enough. A method that is
  switched off or unenrolled returns an explicit denial reason — it is never
  silently skipped.
- **Matching happens on the server.** The browser sends a fresh sample; the
  enrolled template never leaves the backend.
- **Templates are encrypted at rest** with AES-256-GCM using a key generated on
  first use at `data/biometric.key` (mode 0600). They are never logged or
  returned by any endpoint.
- **Face**: MediaPipe `blaze_face_short_range` detects exactly one face,
  `face_landmarker` supplies 478 landmarks, and the MobileNet-V3 embedder
  produces an appearance vector. Score = `0.6 × cosine(embedding) +
  0.4 × facial-geometry similarity`, best over the enrollment samples.
- **Liveness**: a blink must be detected (`eyeBlinkLeft` and `eyeBlinkRight`
  blendshapes above 0.32 during a ~2.8 s window) before a face can unlock. A
  printed photo or a still image cannot pass.
- **Voice**: MFCC frames (13 coefficients, 40 ms hop) plus median F0 are
  extracted in the browser; the raw audio is never stored or uploaded.
  Score = `0.5 × cosine(cepstral mean) + 0.5 × pitch similarity`, best over the
  enrolled utterances.
- **Replay protection**: each voice attempt gets a fresh challenge —
  `<configured auth phrase> + two random words` — and the spoken transcript must
  contain those words. A recording of a previous attempt cannot pass. If the
  browser has no speech recognition, voice verification is refused with a clear
  message (or the challenge requirement can be disabled in the policy panel).
- **PIN fallback** works only when a PIN actually exists; with no PIN configured
  the API refuses PIN unlock instead of accepting anything.
- **Session**: unlock / lock / logout, configurable inactivity auto-lock (the
  existing AURIX timeout), and a status rail that only shows activity that is
  really happening.

### Calibration (why the voice score looks the way it does)

The first implementation used CMVN + DTW on MFCC frames. Calibration with
synthesized voices (3 speakers, different F0 and formants, 4 takes each) showed
it did **not** separate speakers at all:

```
dtw cmvn (original)  within 0.772–0.802 | between 0.769–0.803   ← useless
cos mean cepstrum    within 0.870–0.997 | between 0.053–0.930
0.5 cepstrum + 0.5 pitch  within 0.883–0.981 | between 0.132–0.654  ← shipped
```

The shipped score separates the synthetic speakers cleanly, so the default
threshold is **0.78**. Real voices vary more than synthesized ones: enroll three
recordings, then tune the threshold in Personal Authentication. Rejected
attempts record their score in the verification event log.

## 3. TEACH AURIX — visual learning

- Start with the **Enter training mode** button or by saying “Hello AURIX, enter
  training mode” (voice command routing) or “enter training mode”.
- The floating camera preview is ~1/8 of the viewport, sits on the **right** by
  default, moves **left**, keeps the camera aspect ratio (letterboxed, never
  stretched), and can be minimized, paused, resumed and closed. After the
  configured 60 s it **auto-minimizes** while a live-camera indicator stays
  visible. Closing it releases the device.
- **What is this?** embeds the current frame, retrieves the closest approved
  examples locally and reports the similarity. If nothing matches confidently it
  says so instead of guessing. With “Cloud vision labeling” enabled (off by
  default) the frame is also sent to Gemini for a suggested label; the UI marks
  that suggestion as cloud-derived.
- **Teach this object** captures a frame into a review card. Nothing is written
  until **Save example** is pressed; **Discard** drops the capture. AURIX never
  saves frames on its own.
- **Gestures**: MediaPipe hand landmarks classify open palm / fist / thumb /
  victory shapes (shape only, no meaning). Teaching captures 2–3 samples, names
  the gesture and assigns a command; detection above 0.9 similarity offers to run
  the command after confirmation.
- **Custom tasks**: a trigger phrase plus approved URLs. Running a task asks for
  confirmation, then opens the URLs. A browser cannot launch native Windows apps
  — that limitation is stated in the UI.
- **Architecture honesty**: saved examples are an approved dataset plus
  embeddings used for retrieval. Saving an image does **not** train a model.
  Optional fine-tuning remains a separate, documented future process.

## 4. Privacy controls

- Camera/microphone open only for an action the owner started; tracks are
  stopped in `finally` blocks so the OS indicator turns off.
- No frame is stored without approval; no audio is stored at all.
- Biometric templates are encrypted and never exposed; deletion and re-enrollment
  are one click in Personal Authentication.
- Personal training memory is refused with HTTP 423 while the session is locked,
  so the API cannot be used to read it from a locked state.
- Images leave the machine only when “Cloud vision labeling” is enabled.

## 5. Chrome / Gmail and Windows startup

- The Chrome extension (`desktop/chrome-extension`, downloadable from the
  Activation page) reports only “Chrome started” and “Gmail opened” to
  `http://127.0.0.1:3000/api/activation/event`. It reads no page content, and
  opening Gmail never counts as identity proof: AURIX still requires face or
  voice, and only asks when the session is locked.
- The Windows startup script starts the server hidden, waits for it to answer,
  and opens AURIX in a Chrome app window. AURIX boots locked.

## 6. Setup

1. Dependencies: `@mediapipe/tasks-vision` is in `package.json`; `bun install`
   (or `npm install`) installs it.
2. The four task models (face detector, face landmarker, hand landmarker,
   MobileNet-V3 embedder, ~16 MB total) are downloaded once by the AURIX server
   into `data/models` and served from `/api/vision/models/*`; the MediaPipe WASM
   runtime is served from `/mediapipe/wasm`. No CDN is used at inference time.
3. Grant camera/microphone permission to the AURIX window, then enroll in
   Personal Authentication.
4. Windows autostart and the Chrome bridge: see `desktop/README.md`.

## 7. Test report

### Automated API tests (31 checks, all passing)

Run inside the running app (`docker compose exec web node --input-type=module -`
with the test script). Highlights:

- training: unapproved save rejected; approved save + image asset + list + search
  + edit + embedding match + identify + delete all verified.
- locked-session protection: `GET /api/training` → 423 while locked.
- face: consent required; enrollment; owner face granted (score 1.000); unknown
  face denied (0.461); missing blink denied.
- voice: consent required; enrollment; challenge issued; owner voice granted
  (0.984); replay without challenge words denied; unknown voice denied (0.159);
  expired challenge denied.
- OR policy: with face switched off, face is denied with “switched off” while
  voice still grants.
- activation: while unlocked → `session_active` (no re-ask); while locked →
  `authenticate` + pending; with no credentials → `setup_required`.
- PIN guard: with no PIN configured, PIN unlock returns 400 instead of unlocking.
- model delivery: all four models served (229 KB / 3.7 MB / 7.8 MB / 4.1 MB) and
  the MediaPipe WASM bundle answers 200.
- test records (training example, face/voice templates) were deleted afterwards;
  final state: no enrollment, no training examples, session locked in setup mode.

### Voice calibration experiment

Synthesized-speech benchmark described in §2 (12 utterances, 3 speakers).
The original score failed; the shipped score separates within/between cleanly.

### Browser checks (preview)

- Home, Personal Authentication, Teach AURIX, Training Memory and Chrome/Gmail
  Activation all render with no console errors; status rail present.
- Identity gate: with a test template enrolled, the dashboard is not rendered,
  the face method is offered with the liveness note, and the PIN tab refuses with
  “No owner PIN is configured”.
- Activation test signal with no credentials returns the `setup_required`
  message in the UI.
- Camera: the sandbox preview iframe blocks `getUserMedia`; TEACH AURIX reports
  “The camera could not start…” and does not pretend training started. Camera
  and microphone flows therefore were **not** exercised end-to-end here.

## 8. Not verified / known limitations

- **No real face or voice accuracy testing** in this environment: no camera,
  microphone, or human subject. Thresholds are calibrated on synthetic speech
  and should be tuned by the owner using the self-check score and event log.
- **Browser inference not exercised**: models are downloaded and served, but
  MediaPipe face/hand/embedder inference in the browser could not run without a
  camera in the preview frame.
- **Windows-specific behavior untested** here (Linux sandbox): the PowerShell
  autostart script and the “start with Windows” shortcut were not executed on
  Windows 10. The Chrome extension was not loaded in a real Chrome profile.
- **A browser cannot launch native Windows applications.** Custom tasks open
  approved URLs only; the native Windows bundle remains the path for OS-level
  automation.
- **Face matching** is a lightweight local pipeline (generic embedder + facial
  geometry + blink liveness). It is not a certified biometric system; identical
  twins, poor lighting or heavy occlusions may produce wrong decisions, so keep
  the PIN fallback configured.
- **No model fine-tuning** is implemented; memory is retrieval-only.
