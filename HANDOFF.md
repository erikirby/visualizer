# AELOW Lyric Video Engine — Agent Handoff Document

Use this file to brief any AI agent (Claude, Antigravity, etc.) on the full project context
before starting work. Keep it updated when major architecture changes are made.

---

## What This Project Is

A **Remotion v4** video rendering engine that generates music visualizer and lyric videos for
**AELOW** (Erik Henry's AI music artist project). Users run `bash render.sh` from Terminal,
pick a song and style, and get a rendered `.mp4` in `out/`.

**Tech stack:** TypeScript · React · Remotion v4 · `@remotion/media-utils` · `@remotion/google-fonts`

---

## File Structure

```
lyric-video-engine/
├── render.sh                  ← User-facing CLI. All rendering goes through here.
├── src/
│   ├── index.ts               ← Remotion entry point
│   ├── Root.tsx               ← Registers ALL compositions. Single source of truth for IDs.
│   ├── Main.tsx               ← LyricOnly composition component
│   ├── VisualizerMain.tsx     ← All visualizer compositions share this one component
│   ├── components/
│   │   ├── BarEQ.tsx          ← EQ bars at bottom (compact mode for VisualizerBottom)
│   │   ├── SolidWave.tsx      ← Smooth Catmull-Rom filled waveform, vertically centered
│   │   ├── FrequencyRings.tsx ← 6 concentric rings, each locked to a frequency band
│   │   ├── EchoPulse.tsx      ← Radial EQ — "bars" variant or "solid" (donut) variant
│   │   ├── DNAHelix.tsx       ← Horizontal dual-strand helix with depth simulation
│   │   ├── ConstellationNet.tsx ← Particle network with audio-reactive line connections
│   │   ├── Particles.tsx      ← Particle system: up/down/left/right/out/in directions
│   │   ├── ArtistBug.tsx      ← Artist name + track name overlay (top-left always)
│   │   ├── LyricEngine.tsx    ← Line-by-line lyric display with spring entrance animation
│   │   ├── VisualBackground.tsx ← Background image/video with bass-reactive scale
│   │   ├── AudioWaveform.tsx  ← Legacy waveform used only in LyricOnly
│   │   ├── RadialEQ.tsx       ← Legacy component, not in active use
│   │   └── WaveVisualizer.tsx ← Legacy component, not in active use
│   └── utils/
│       ├── themes.ts          ← 6 color themes, getTheme(), lerpColor(), hexToRgb()
│       ├── audioColor.ts      ← getMusicViz, getFreqColor, getBassEnergy, getCycleColor
│       └── parseLrc.ts        ← LRC/JSON lyric parser
├── songs/                     ← Song library (album/song structure)
│   └── <album>/<song>/
│       ├── audio.wav or audio.mp3   (real files or symlinks to central library)
│       ├── background.png           (1920×1080)
│       └── lyrics.json              (optional, from AELOW Sync Lyrics tool)
├── out/                       ← Rendered video output
└── _render_assets/            ← Temp staging dir (auto-created/destroyed per render)
```

---

## Compositions (Remotion IDs → render.sh menu numbers)

| ID | Menu # | Description |
|----|--------|-------------|
| `LyricOnly` | 2 | Lyrics + particles, no visualizer |
| `VisualizerBottom` | 3 | EQ bars at bottom of frame |
| `SolidWave` | 4 | Smooth filled waveform, vertically centered, mirrored |
| `FrequencyRings` | 5 | 6 concentric rings |
| `EchoPulse` | 6 | Radial EQ bars with ghost ripples |
| `EchoPulseSolid` | 7 | Radial filled wave (donut) with ghost ripples |
| `VisualizerBottomParticles` | 8 | Bars + particles |
| `FrequencyRingsParticles` | 9 | Rings + inward particles |
| `EchoPulseParticles` | 10 | Echo bars + particles |
| `EchoPulseSolidParticles` | — | Echo solid + particles (in Root.tsx, not yet in menu) |
| `SolidWaveParticles` | — | Solid wave + particles (in Root.tsx, not yet in menu) |
| `DNAHelix` | 8 | Horizontal dual-strand helix, depth-simulated |
| `DNAHelixParticles` | 13 | DNA helix + particles |
| `ConstellationNet` | 9 | Particle network with line connections |
| `ConstellationNetParticles` | 14 | Constellation + particles |

Menu option 0 = curated 8-clip showcase. Option 11 = render all styles.

---

## Visual Style / Brand

- **Colors:** Hot pink `#FF2D9B` ↔ Electric blue `#00B4FF` — everything uses this palette
- **Background:** `#080818` deep navy, overlaid with user's background image/video
- **Fonts:** Syne (Google Fonts via `@remotion/google-fonts`) — 700 for artist name, 400 for track
- **Beat flash:** Pink `rgba(255,45,155,…)` full-screen overlay on kick transients, `mixBlendMode: "screen"`

---

## Audio Pipeline (Critical — read before touching audio code)

### `getMusicViz()` in `utils/audioColor.ts`
The core FFT→bar mapping. Do NOT replace with raw `visualizeAudio()` output.

**Why it exists:** Raw FFT has two problems:
1. **Staircase**: `Math.pow(total, t)` bunches first 20+ bars onto bins 0–1 (identical values)
2. **Dead right side**: 40% of bars map to 8–22kHz silence

**What it does:**
- Uses bins 1 → 40% of FFT (skips DC, caps at ~8.8kHz)
- `t^1.5` curve: gentler than log, puts bass at ~50% of bars
- Linear interpolation between adjacent bins (every bar is unique)
- Progressive treble boost: `scalar * (1 + t^0.7 * treble)` where scalar=6, treble=3.0

### Per-band normalization (BarEQ, SolidWave)
15 reference timestamps sampled across the song. Each bar is normalized by its own
historical peak × 0.55 target. Prevents quiet songs from looking flat.

### Beat flash / kick transient detection
```ts
const kickTransient = Math.max(0, rawBass - smoothBass - 0.08) * 4;
```
Fires only on sharp bass attack (rawBass spikes above the smoothed baseline).
Controls the pink screen flash in VisualizerMain. Intentionally NOT triggered by sustained bass.

### Deterministic noise
Rumble effect uses `Math.sin(frame * 13.7 + i * 3.9) * 0.04` — deterministic, safe for
Remotion's frame-parallel render. **Never use `Math.random()` in render functions.**

---

## Key Design Decisions and Reasoning

### 1. Reflection defaults differ by layout
`SolidWave` defaults `reflection = true` (mirrored wave looks better centered).
`BarEQ` defaults `reflection = false` (bars at bottom don't need mirroring).

**How it's implemented:** `extractCustomization()` in Root.tsx returns `undefined` (not `false`)
for absent boolean props. VisualizerMain applies:
```ts
const effectiveReflection = reflection ?? (layout === "solidwave");
```
**Do not** change `extractCustomization()` to return `false` as default — it will break
SolidWave's reflection.

### 2. EchoPulse seam smoothing
The circle maps bass (bar 0, pink) clockwise to treble (bar 79, blue). Where they meet is a
potential amplitude cliff. Fix: `applySeamBlend()` linearly ramps the last 8 bars' heights
toward bar 0's height. **Colors are NOT changed** — only amplitudes taper. This preserves the
full pink→blue sweep while eliminating the visual cliff.

### 3. EchoPulseSolid donut
Smooth Catmull-Rom closed path through all 80 bar-tip positions. Inner circle punched out via
`fillRule="evenodd"`. Gradient anchored to screen space (`gradientUnits="userSpaceOnUse"`) so
the color shifts as the shape rotates — intentional aesthetic.
`SOLID_BAR_SCALE = 0.60` caps max radius at ~440px so the shape doesn't fill the frame.

### 4. Inward particles ("in" direction)
Uses rectangular screen-edge intersection (not a fixed radius circle):
```ts
const edgeR = 1 / Math.max(Math.abs(cosA) / HALF_W, Math.abs(sinA) / HALF_H);
```
This places spawn points exactly at the screen edge for every angle. Particles fade out at
~65% travel so they don't pile up at center.

### 5. Golden angle particle distribution
`i * 2.39996` radians (137.508°) — maximally uniform coverage, no visible spokes.
No rotation over time (removed after it looked like a "rotating hose").

### 6. Artist/track name overlay
Always top-left (`x=72, y=64`). Never bottom-right — conflicts with YouTube UI.
`size="full"` for visualizer compositions, `size="small"` for LyricOnly (lyrics are the star).
Fades in over 1 second via `interpolate`.

### 7. Wave delay effect
Pre-samples audio at 5 frame offsets (0 to 14 frames back). Edge bars use older audio,
creating a center-outward ripple. Controlled by `waveDelay` prop.

### 8. SolidWave width
`MARGIN = 210` (horizontal margins). Keeps wave at ~75% of screen width.
`CENTER_Y = 540` (vertically centered). `MAX_H = 280`.

---

## CLI Props Flow

render.sh → `--props '{"reflection":true,"layers":true,...}'`
→ Remotion passes to `calculateMetadata({ props })`
→ `extractCustomization(props)` in Root.tsx (returns only defined keys, never false defaults)
→ spread into composition props via `buildVisualizerProps()`
→ VisualizerMain receives and applies

**For new props:** add to `CustomizationProps` type, `extractCustomization()`, and
`buildVisualizerProps()` in Root.tsx. Then add to render.sh prompts and `build_props()`.

---

## Rendering Infrastructure

### `_render_assets/` staging directory
Remotion's bundler breaks on symlinks. render.sh copies/hard-links all assets into this
temp folder before rendering and deletes it after. The `--public-dir` flag points here.

### Audio detection
Tries `audio.wav` first, then `audio.mp3`. Works with either real files or symlinks.

### Config files written by render.sh
- `background-config.json` → tells Root.tsx which background file to use (avoids 404 logs)
- `lyrics-config.json` → tells Root.tsx whether lyrics exist (`{"file":"none"}` if not)

### `calculateMetadata` must use `({ props })` form
```ts
calculateMetadata={async ({ props }) => buildVisualizerProps(..., props as Record<string, unknown>)}
```
The legacy `async ()` form works but loses CLI `--props` forwarding.

---

## Lyric System

- **Format:** Line-by-line (not word-by-word karaoke)
- **Entrance:** Spring-based scale pop when a new line appears
- **Pre-roll:** `LEAD_SECS = 0.35` — line appears 0.35s before its timestamp
- **Exit:** Previous line ghost-fades over 1.2s from 0.28 opacity
- **File format:** `lyrics.json` (generated by AELOW Sync Lyrics tool)

---

## Customization Options (all CLI-passable via `--props`)

| Prop | Type | Default | Works on |
|------|------|---------|----------|
| `reflection` | boolean | false (true for solidwave) | BarEQ, SolidWave |
| `waveDelay` | boolean | false | BarEQ, SolidWave |
| `rumble` | boolean | false | BarEQ, SolidWave |
| `layers` | boolean | false | BarEQ, SolidWave, EchoPulse |
| `themeId` | 1–6 | 1 (Neon) | all visualizers |
| `showParticles` | boolean | false | all visualizers |
| `particleDirection` | "up"\|"down"\|"left"\|"right"\|"out"\|"in" | layout-dependent | Particles |
| `artistName` | string | undefined | all |
| `trackName` | string | undefined | all |

## Color Themes

Defined in `src/utils/themes.ts`. All components accept `colorA`/`colorB` string props (hex).
VisualizerMain resolves `themeId` → `{colorA, colorB}` via `getTheme()` and fans out to all children.

| ID | Name | colorA | colorB |
|----|------|--------|--------|
| 1 | Neon | `#FF2D9B` hot pink | `#00B4FF` electric blue |
| 2 | Violet Storm | `#9B2DFF` deep purple | `#FF6B2D` amber |
| 3 | Arctic | `#2DFFEE` cyan | `#2D6BFF` cobalt |
| 4 | Solar | `#FF8C00` orange | `#FFE500` gold |
| 5 | Toxic | `#00FF88` neon green | `#FF2D9B` hot pink |
| 6 | Monochrome | `#FFFFFF` white | `#8888AA` cool grey |

**Particle direction defaults by layout:**
- `bottom` → `"up"`
- `rings` → `"in"` (converge from screen edges)
- `solidwave`, `echo`, `echo-solid` → `"out"`

---

## Things NOT Yet Implemented (potential future work)

- Layers on FrequencyRings (rings get a bright inner stroke at each band)
- SolidWaveParticles in render.sh menu (composition exists, not exposed)
- EchoPulseSolidParticles in render.sh menu (composition exists, not exposed)
- Custom color themes (currently hardcoded pink→blue everywhere)
- Custom font selection
- Particle density / count customization
- Per-song config file (background, lyrics, effects all in one JSON)

---

## Running the Project

```bash
# First time only — installs node_modules
npm install

# Normal usage
bash render.sh
```

TypeScript check: `npx tsc --noEmit`
Remotion studio (live preview): `npx remotion studio src/index.ts --public-dir _render_assets`
Note: for studio preview you need to manually populate `_render_assets/` with audio + background.
