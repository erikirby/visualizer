# AELOW Engine — Web App Developer Reference

This document is the contract between the **Remotion engine** (Claude's domain) and the
**web app UI** (your domain). The engine is a black box — you pass it props, it renders
video. This file tells you exactly what props exist and what they do.

**Rule:** Never edit files in `src/components/`, `src/utils/`, `src/VisualizerMain.tsx`,
`src/Main.tsx`, or `src/Root.tsx`. Your files are `src/App.tsx`, `src/index.css`,
`src/vite-entry.tsx`, and `vite.config.ts`.

---

## How the Web App Works

```
User uploads files + picks settings
        ↓
App.tsx builds an `inputProps` object
        ↓
<Player component={VisualizerMain | Main} inputProps={...} />  ← live preview
        ↓
renderMediaOnWeb({ composition: { component, ...}, inputProps }) ← export MP4
```

There are two root components:
- **`VisualizerMain`** — for all visualizer styles (bars, wave, rings, DNA, etc.)
- **`Main`** — for Lyric Only mode (lyrics + waveform, no visualizer)

Pick which one to use based on `layout === "lyric-only"`.

---

## VisualizerMain Props (all optional unless marked required)

```typescript
import type { VisualizerProps } from "./VisualizerMain";
```

### Required
| Prop | Type | Notes |
|------|------|-------|
| `audioSrc` | `string` | Object URL from `URL.createObjectURL(file)` |
| `audioDuration` | `number` | Seconds. Get from `audio.duration` after `loadedmetadata`. |
| `layout` | `VisualizerLayout` | See layouts table below. |
| `backgroundSrc` | `string` | Object URL of image OR video file. |

### Color Theme
| Prop | Type | Default | Notes |
|------|------|---------|-------|
| `themeId` | `1–6` | `1` | Resolves to a `colorA`/`colorB` pair. See themes table. |

### Background Video (standard loop)
| Prop | Type | Default | Notes |
|------|------|---------|-------|
| `bgLoopType` | `"standard" \| "pingpong"` | `undefined` (= image) | Set to `"standard"` when background is a video file. |
| `bgVideoDurationInFrames` | `number` | `undefined` | `Math.round(videoDuration * 30)`. Required when bgLoopType is set. |
| `bgReversedSrc` | `string` | `undefined` | Object URL of the reversed video clip. Required only for `"pingpong"`. See Ping-Pong section below. |

### Texture Effect — Built-in Procedural (no files, no uploads)

These effects are 100% code — pure SVG/math driven by `frame`. No video files needed.
**This is the primary texture option for regular users.**

| Prop | Type | Default | Notes |
|------|------|---------|-------|
| `overlayType` | `"none" \| "grain" \| "scanlines" \| "light-leak" \| "vhs"` | `undefined` | Which built-in effect to apply. `undefined` and `"none"` both mean no effect. |
| `overlayOpacity` | `number` | per-type default | Intensity override (0–1). Each type has a sensible built-in default so this is optional. |

**What each type looks like:**
- `"grain"` — Animated film grain. Different noise every frame. Screen blend. Default opacity 0.32.
- `"scanlines"` — CRT horizontal scan lines. Darkens slightly. Default opacity 0.55.
- `"light-leak"` — Drifting radial gradient that uses the active theme's colorA/colorB. Screen blend. Default opacity 0.38.
- `"vhs"` — Combination: grain + scan lines + rolling bright horizontal band. Default opacity 0.45.

**Wire up in App.tsx (Gemini):**
```typescript
// Just a dropdown — no file handling needed
<select value={overlayType} onChange={e => setOverlayType(e.target.value)}>
  <option value="none">No Effect</option>
  <option value="grain">Film Grain</option>
  <option value="scanlines">Scan Lines</option>
  <option value="light-leak">Light Leak</option>
  <option value="vhs">VHS Glitch</option>
</select>

// Pass to inputProps:
{ overlayType, overlayOpacity }   // overlayOpacity is optional
```

### Texture Overlay — Custom Video Upload (power-user path)

Only expose this if you want to let users upload their own texture clips.
Normal users don't need this — use `overlayType` above instead.

| Prop | Type | Default | Notes |
|------|------|---------|-------|
| `overlaySrc` | `string` | `undefined` | Object URL of a video file. Only used when `overlayType` is not set. |
| `overlayBlendMode` | `"screen" \| "overlay" \| "soft-light" \| "multiply"` | `"screen"` | CSS `mix-blend-mode`. |
| `overlayOpacity` | `number` | `0.45` | Shared with `overlayType` path. |
| `overlayDurationInFrames` | `number` | `undefined` | `Math.round(video.duration * 30)`. Required for looping. |

### Particles
| Prop | Type | Default | Notes |
|------|------|---------|-------|
| `showParticles` | `boolean` | `false` | Adds a particle layer on top of the visualizer. |
| `particleDirection` | `"up" \| "down" \| "left" \| "right" \| "out" \| "in"` | Layout-dependent | Defaults: `bottom`→up, `rings`/`constellation`→in, others→out. Only relevant if `showParticles` is true. |

### Visualizer Modifiers (only affect certain layouts)
| Prop | Type | Default | Affects |
|------|------|---------|---------|
| `reflection` | `boolean` | `true` for SolidWave, `false` otherwise | `bottom`, `solidwave` |
| `waveDelay` | `boolean` | `false` | `bottom`, `solidwave` — center-outward ripple effect |
| `rumble` | `boolean` | `false` | `bottom`, `solidwave` — low-frequency camera shake |
| `layers` | `boolean` | `false` | `bottom`, `solidwave`, `echo` — adds depth/layering |

### Artist Bug (overlay)
| Prop | Type | Notes |
|------|------|-------|
| `artistName` | `string` | Shows top-left overlay. Both must be set or neither shows. |
| `trackName` | `string` | |

---

## Main Props (Lyric Only mode)

```typescript
import type { MainProps } from "./Main";
```

Same `audioSrc`, `audioDuration`, `backgroundSrc`, `bgLoopType`, `bgVideoDurationInFrames`,
`bgReversedSrc`, `overlaySrc`, `overlayBlendMode`, `overlayOpacity`, `overlayDurationInFrames`,
`artistName`, `trackName` props as above, plus:

| Prop | Type | Default | Notes |
|------|------|---------|-------|
| `lines` | `LrcLine[]` | `[]` | Timestamped lyric lines. See Lyric System below. |
| `showParticles` | `boolean` | `true` | Particles are on by default for lyric-only. |
| `showWaveform` | `boolean` | `false` | Legacy waveform bar (usually leave false). |

---

## Layouts

```typescript
type VisualizerLayout =
  | "bottom"        // EQ bars at bottom of frame
  | "solidwave"     // Smooth filled waveform, vertically centered
  | "rings"         // 6 concentric frequency rings
  | "echo"          // Radial EQ bars with ghost ripples
  | "echo-solid"    // Radial filled wave (donut) with ghost ripples
  | "dna"           // Horizontal dual-strand DNA helix
  | "constellation" // Real astronomical constellations tracing to the beat
```

For `"lyric-only"` in your UI, set `component = Main` instead of `VisualizerMain`.

---

## Color Themes

`themeId` is an integer 1–6. The engine resolves it internally — you never pass hex colors directly.

| ID | Name | colorA | colorB | Character |
|----|------|--------|--------|-----------|
| 1 | Neon | `#FF2D9B` hot pink | `#00B4FF` electric blue | Default — energetic, modern |
| 2 | Violet Storm | `#9B2DFF` deep purple | `#FF6B2D` amber | Dramatic, intense |
| 3 | Arctic | `#2DFFEE` cyan | `#2D6BFF` cobalt | Cold, crisp |
| 4 | Solar | `#FF8C00` orange | `#FFE500` gold | Warm, summery |
| 5 | Toxic | `#00FF88` neon green | `#FF2D9B` hot pink | Edgy, electric |
| 6 | Monochrome | `#FFFFFF` white | `#8888AA` cool grey | Minimal, cinematic |

---

## Lyric System

Lyrics must be an array of `LrcLine` objects:

```typescript
interface LrcLine {
  time:  number;   // seconds from track start when this line appears
  text:  string;   // the lyric line
  words: any[];    // leave as empty array []
}
```

### How to get lyrics (three paths):

**Path 1 — Whisper AI auto-sync (already in App.tsx)**
The Whisper Web Worker (`whisper.worker.ts`) transcribes audio client-side using
`Xenova/whisper-tiny.en`. It downloads ~40MB model on first use (cached after).
- User optionally pastes raw lyrics text (improves accuracy as an `initial_prompt`)
- Or leaves blank for pure auto-detect
- Returns timestamped `chunks` → map to `LrcLine[]`

**Path 2 — Upload `.json` lyrics file (already in App.tsx)**
User uploads a pre-made `lyrics.json`. Format = `LrcLine[]` array.

**Path 3 — Manual entry (not yet in UI)**
A textarea where users can type `[MM:SS.xx] lyric line` LRC format, parsed client-side.
The engine has a `parseLrc()` utility at `src/utils/parseLrc.ts` you can import.

---

## Video Background

### Standard Loop (implement now)

When the user uploads a video file, detect it by MIME type and wire these props:

```typescript
const isVideo = file.type.startsWith("video/");

if (isVideo) {
  // Get video duration via HTML5 video element
  const video = document.createElement("video");
  video.src = objectUrl;
  video.onloadedmetadata = () => {
    setBgVideoDurationInFrames(Math.round(video.duration * 30));
    video.remove();
  };
  setBgLoopType("standard");
} else {
  setBgLoopType(undefined);
  setBgVideoDurationInFrames(undefined);
}
```

Pass to inputProps:
```typescript
{
  backgroundSrc,
  bgLoopType,                  // "standard" | undefined
  bgVideoDurationInFrames,     // number | undefined
}
```

The engine handles the rest — it detects video vs image and loops accordingly.

### Ping-Pong Loop (future — needs ffmpeg.wasm)

Ping-pong reverses every other loop cycle for seamless non-matching clips
(e.g. a 5-second clip where start frame ≠ end frame).

**How to implement:** Use `@ffmpeg/ffmpeg` (ffmpeg compiled to WebAssembly — runs entirely
in the browser, no server needed). Install: `npm install @ffmpeg/ffmpeg @ffmpeg/util`.

```typescript
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

async function createReversedVideo(originalFile: File): Promise<string> {
  const ffmpeg = new FFmpeg();
  await ffmpeg.load();
  await ffmpeg.writeFile("input.mp4", await fetchFile(originalFile));
  await ffmpeg.exec(["-i", "input.mp4", "-vf", "reverse", "-an", "reversed.mp4"]);
  const data = await ffmpeg.readFile("reversed.mp4");
  const blob = new Blob([data], { type: "video/mp4" });
  return URL.createObjectURL(blob);
}
```

Then pass:
```typescript
{
  bgLoopType: "pingpong",
  bgReversedSrc: reversedObjectUrl,   // from createReversedVideo()
  bgVideoDurationInFrames,
}
```

ffmpeg.wasm is ~30MB to load — show a loading state. Processing time depends on video length
(a 10s clip reverses in ~5–15s in the browser). Cache the reversed URL so it only runs once.

**Note:** ffmpeg.wasm requires `SharedArrayBuffer`, which needs these HTTP headers on your
dev server and hosting:
```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```
For Vite dev server, add to `vite.config.ts`:
```typescript
server: {
  headers: {
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp",
  },
}
```

---

## Rendering

### Live preview
```typescript
import { Player } from "@remotion/player";

<Player
  component={layout === "lyric-only" ? Main : VisualizerMain}
  inputProps={inputProps}
  durationInFrames={Math.ceil(audioDuration * 30)}
  fps={30}
  compositionWidth={1920}
  compositionHeight={1080}
  style={{ width: "100%", height: "100%" }}
  controls
/>
```

### Export MP4
```typescript
import { renderMediaOnWeb } from "@remotion/web-renderer";

const { getBlob } = await renderMediaOnWeb({
  composition: {
    component: layout === "lyric-only" ? Main : VisualizerMain,
    durationInFrames: Math.ceil(audioDuration * 30),
    fps: 30,
    width: 1920,
    height: 1080,
    id: "aelow-export",
    defaultProps: inputProps,
  },
  inputProps,
  onProgress: ({ progress }) => setProgress(progress * 100),
});

const blob = await getBlob();
// → URL.createObjectURL(blob) → trigger download
```

---

## What's Already in App.tsx

- ✅ Audio file upload + duration detection
- ✅ Background image/video upload (standard loop, auto duration detection)
- ✅ Whisper AI lyric sync (Web Worker, runs entirely in browser)
- ✅ Manual `.json` lyrics upload
- ✅ Layout selector (including Audiogram Full Width)
- ✅ Theme selector (themeId 1–6)
- ✅ Particles toggle
- ✅ Reflection toggle (SolidWave only)
- ✅ Artist name / track name fields
- ✅ Live preview via `@remotion/player`
- ✅ Export MP4 via `@remotion/web-renderer` with progress bar

## What's NOT Yet in App.tsx (needs building)

- ❌ Texture effect dropdown — `overlayType` ("none" / "grain" / "scanlines" / "light-leak" / "vhs"). Just a `<select>` and an optional opacity slider. See Texture Effect section above — no file handling needed.
- ❌ Ping-pong loop option (needs ffmpeg.wasm — high memory, may not be worth it)
- ❌ `waveDelay`, `rumble`, `layers` toggles (low priority — niche options)
- ❌ Manual LRC text entry (Path 3 in Lyric System)

---

## Do Not Touch

These files are owned by the engine layer. Editing them will break rendering:

```
src/components/     ← all visualizer components
src/utils/          ← audioColor.ts, themes.ts, parseLrc.ts
src/VisualizerMain.tsx
src/Main.tsx
src/Root.tsx
src/LyricBars.tsx
```

If you need a new engine feature (new layout, new prop, etc.) — flag it. Claude handles those.

---

## Brand / Style Reference

- Background: `#080818` deep navy
- Panel background: `#111126`
- Border color: `#2a2a4a`
- Accent pink: `#FF2D9B`
- Accent blue: `#00B4FF`
- Font: Syne (already loaded via Google Fonts in `index.css`)
- Aesthetic: ultra-minimalist dark mode, glassmorphism, zero filler, premium feel
