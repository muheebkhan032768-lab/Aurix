# AURIX Holographic Avatar

The AURIX presence is a real-time Three.js / WebGL neural-mesh head, rendered in
the centre of the Command Center. It is one consistent 3D model seen from the
front, three-quarter, left and right — not a set of images.

Brand: **AURIX — PERSONAL AI ASSISTANT · POWERED BY AM VEYRONIX**

## What the avatar is (and is not)

The head is generated **procedurally** in `src/avatar/FacialRig.ts`: an ellipsoid
is sculpted with gaussian features (forehead, brow ridge, eye sockets,
cheekbones, nose bridge/tip/wings, lips, mouth crease, chin, jaw taper, ears).
The neural lattice, facial contours and neck are sampled from that same surface,
so every viewing angle comes from one model.

There is **no Blender source file and no shipped `.glb`** in this repository.
That is a deliberate, honest choice: no Blender authoring was possible in this
environment, and a placeholder binary would not be a real rigged character.
Instead the avatar is genuine 3D geometry in code, and an optional GLB
replacement path is provided (see below). Do not describe the avatar as a
downloaded or Blender-authored asset.

## Architecture

```
src/avatar/
  configuration/avatar.config.ts  quality presets, palette, motion limits, asset path
  FacialRig.ts                    procedural head sculpt + lip-sync weights
  NeuralMesh.ts                   head lattice, facial contours, neck lattice
  HologramMaterial.ts             point / line / scan shaders (GPU deformation)
  ParticleSystem.ts               projection base, halo, drifting motes
  EyeAnimation.ts                 eyes, brows, randomised blinking, gaze saccades
  HeadMovement.ts                 idle sway, pointer parallax, speaking nod
  LipSyncController.ts            viseme -> mouth uniforms, fallback labelling
  AvatarStateManager.ts           voice state -> idle/listening/thinking/speaking/interrupted/error/paused
  AvatarLoader.ts                 optional GLB -> neural cloud replacement
  AvatarScene.ts                  renderer, camera, resize, loop, visibility pause
src/components/cockpit/HolographicHead3D.tsx   React host + HUD (view buttons, fullscreen)
src/components/cockpit/HolographicFace.tsx     SVG fallback when WebGL is unavailable
```

The React component only forwards state; the render loop never re-renders React.

## Voice and lip-sync

`src/utils/voiceBus.ts` is the single source of truth the avatar reads:

| Field | Meaning |
| --- | --- |
| `state` | `idle · listening · processing · speaking · error` |
| `reply` | the line being spoken |
| `spokenChars` | character offset currently voiced, `-1` when silent |
| `level` | live microphone energy |
| `history` | finished transcript entries (speaker, text, timestamp) |

Speech events are raised by `src/utils/companionVoice.ts`
(`onStart`, word progress, `onEnd`) and by the voice engine's
`onSpeechStart / onAudioProgress / onSpeechEnd / onSpeechInterrupted` equivalents.

Two sync modes are reported in the HUD and the `data-mouth` attribute:

- **`tracked`** — the provider reports character progress; the character at that
  offset is mapped to a viseme (`src/utils/visemes.ts`, English + Urdu + Hindi
  script). This is character-timed, not phoneme-exact.
- **`audio-fallback`** — no character timing (e.g. a clip whose duration is the
  only signal). The mouth follows playback progress and a talk rhythm. The UI
  says **audio fallback**; never claim phoneme-exact sync in this mode.
- **`closed`** — speech ended; the mouth eases back to the rest shape.

The mouth closes immediately when speech stops or is interrupted, then the
avatar holds a short amber **INTERRUPTED** state before returning to listening.

## States

| State | Behaviour |
| --- | --- |
| IDLE | gentle sway, random blinking, slow particle drift |
| LISTENING | attentive gaze saccades, mouth closed, illumination follows mic level |
| THINKING | calm neural pulse, slightly higher particle energy |
| SPEAKING | viseme-driven mouth, jaw motion, small nods, blinking |
| INTERRUPTED | mouth closes at once, brief amber accent, then back to listening |
| ERROR | rose accent, avatar stays available |
| PAUSED | render loop stopped while the document is hidden |

## Performance

| Preset | Lattice | DPR cap | FPS | Motes | Bloom-like halo | Scan beam |
| --- | --- | --- | --- | --- | --- | --- |
| ECO / performance mode | 52 × 38 | 1.0 | 30 | 50 | no | no |
| BALANCED | 92 × 66 | 1.5 | 60 | 120 | yes | yes |
| HIGH QUALITY | 116 × 84 | 2.0 | 60 | 220 | yes | yes |

Also: one shared uniforms object drives all passes, static `BufferGeometry` (no
per-frame CPU vertex work), additive points/lines (few draw calls), render loop
suspended on `visibilitychange`, and a WebGL-context-loss fallback to the SVG
face. The Command Center's ECO / BALANCED / PERFORMANCE switch selects the preset.

## Dashboard layout

`src/components/cockpit/CommandCenterView.tsx`:

- left rail: Dashboard, Workspace, AI Memory, Developer Mode, Quick Website
  Access, My Projects, Daily Tasks, Notes (`DashboardRail.tsx`)
- centre: the avatar stage (tall, never covered by a card)
- right rail: AI Status, API Connection, Voice Status, Training Mode, System
  Information, Recent Activity (`StatusRail.tsx`) + the live transcript

Below 1280 px the three columns stack with the avatar first. The avatar can be
shown full screen from the button in its top-right corner.

## Run it

```sh
npm install
npm run dev
# http://localhost:3000
```

Inside the Base44 sandbox the preview already runs the bind-mounted source:

```sh
docker compose --project-name app --project-directory "$BASE44_PROJECT_ROOT" \
  -f "$BASE44_CONFIG_ROOT/docker-compose.base44.yml" up -d
```

Type check: `./node_modules/.bin/tsc --noEmit`.

## Replacing the model with a GLB

1. Author the head in Blender (metres, +Y up, face looking down +Z, head centred
   on the origin, one head+neck mesh is enough).
2. Export GLB to `public/assets/avatar/aurix-face.glb`.
3. Reload. `AvatarLoader.ts` samples the model's vertices and triangle edges and
   renders them as the same cyan neural cloud. If the file is missing, is HTML
   (SPA fallback) or fails to parse, the procedural face is used and nothing
   breaks.

Limitation: the GLB path is visual only — visemes still drive the procedural
rig. Morph targets named `aa, ee, oh, oo, mm, fv, th, ss, nn` are reserved for a
future adapter; they are not applied yet. Do not claim GLB lip-sync until that
adapter exists and has been tested with a real asset.

## Testing report

Verified in the running preview and with an in-container script:

| # | Check | Status |
| --- | --- | --- |
| 1 | 3D asset loads and renders (canvas, WebGL) | Pass — canvas sized 440×574, avatar visible |
| 2 | Same face from front / 3-4 / left / right | Pass — four captures from the same model |
| 3 | Face is blue neural mesh (points + lines) | Pass — cyan lattice, contours, eyes |
| 4 | Starts front-facing | Pass — `data-avatar-view="front"` on load |
| 5 | Natural rotation | Pass — view switching + idle sway/parallax |
| 6 | Natural blinking | Implemented with randomised 2.4–7.2 s intervals; not visible in a still capture |
| 7 | Mouth follows speech | Lip-sync logic 17/17 checks; live audio **not automatically verified** (see below) |
| 8 | Mouth returns to idle after speech | Pass — `LipSyncController` returns to `closed`/rest |
| 9 | Transcript updates with speech | Word-by-word highlighting implemented; audio playback not verifiable here |
| 10 | Cards never cover the avatar | Pass — 3-column grid, no horizontal overflow at 1280 or mobile |
| 11 | Missing asset / WebGL failure handled | Code paths present (loader returns null, SVG fallback); not force-tested |
| 12 | Performance mode | ECO preset (coarser lattice, 30 fps, DPR 1) wired to the mode switch |
| 13 | Existing website commands | Untouched; not exercised (opens external tabs) |
| 14 | No excessive CPU/RAM | fps cap + hidden-tab pause + adaptive DPR; not profiled |

### Why live speech is not automatically verified

The managed preview browser blocks audio playback without a trusted user
gesture (`play()` throws `NotAllowedError`) and exposes zero
`speechSynthesis` voices. The TTS endpoint itself returns audio (HTTP 200,
~130 KB WAV). On a real browser, clicking **Continue & Speak** is a trusted
gesture, so the greeting plays and the mouth follows it. Please confirm the
spoken greeting and the microphone conversation by hand in your own preview.
