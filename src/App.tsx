import React, { useState, useEffect, useRef } from "react";
import { Player } from "@remotion/player";
import { renderMediaOnWeb, canRenderMediaOnWeb } from "@remotion/web-renderer";
import { Upload, FileAudio, FileImage, FileText, Download, Loader2, ChevronDown, ChevronUp, Zap, Palette, Mic2, SlidersHorizontal } from "lucide-react";
import { RemotionRoot } from "./Root";
import { VisualizerMain, VisualizerProps, VisualizerLayout } from "./VisualizerMain";
import { Main } from "./Main";
import { forceAlign, AlignWord } from './utils/aligner';
import { extractVideoFrames, clearVideoFrames } from './utils/videoFrameExtractor';
// @ts-ignore - Vite specific worker import
import WhisperWorker from './whisper.worker.ts?worker';

// GA4 event helper — silently no-ops if gtag isn't loaded
function track(event: string, params?: Record<string, string | number | boolean>) {
  try { (window as any).gtag?.('event', event, params); } catch {}
}

// Pre-crop a blob image URL to exactly targetW×targetH using cover semantics.
// Remotion's internal canvas renderer ignores CSS objectFit, so we bake the crop in.
function cropImageToCover(src: string, targetW: number, targetH: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width  = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d")!;
      const imgAspect    = img.width / img.height;
      const targetAspect = targetW / targetH;
      let dw: number, dh: number, dx: number, dy: number;
      if (imgAspect > targetAspect) {
        dh = targetH; dw = targetH * imgAspect;
        dx = (targetW - dw) / 2; dy = 0;
      } else {
        dw = targetW; dh = targetW / imgAspect;
        dx = 0; dy = (targetH - dh) / 2;
      }
      ctx.drawImage(img, dx, dy, dw, dh);
      resolve(canvas.toDataURL("image/jpeg", 0.95));
    };
    img.onerror = () => reject(new Error("Failed to load background image for export"));
    img.src = src;
  });
}

// Analyze a background image URL and return the theme id whose colorA is
// complementary to the image's dominant saturated hue. Uses circular-mean
// for correct hue averaging across the hue wheel.
function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  const seg = Math.floor(h / 60) % 6;
  if (seg === 0) { r = c; g = x; }
  else if (seg === 1) { r = x; g = c; }
  else if (seg === 2) { g = c; b = x; }
  else if (seg === 3) { g = x; b = c; }
  else if (seg === 4) { r = x; b = c; }
  else { r = c; b = x; }
  const rr = Math.round((r + m) * 255), gg = Math.round((g + m) * 255), bb = Math.round((b + m) * 255);
  return `#${rr.toString(16).padStart(2, "0")}${gg.toString(16).padStart(2, "0")}${bb.toString(16).padStart(2, "0")}`;
}

// Extracts two vivid colors directly from the image pixels.
// Buckets hues into 30° slots, picks the top two that are ≥60° apart,
// then boosts both to vivid HSL so they pop against the video.
async function extractImageColors(imageUrl: string): Promise<{ colorA: string; colorB: string }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 64; canvas.height = 64;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, 64, 64);
      const data = ctx.getImageData(0, 0, 64, 64).data;

      const buckets = Array.from({ length: 12 }, () => ({ weight: 0 }));
      let totalL = 0;
      const pixelCount = data.length / 4;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i]! / 255, g = data[i + 1]! / 255, b = data[i + 2]! / 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
        const l = (max + min) / 2;
        totalL += l;
        if (d < 0.07 || l < 0.05 || l > 0.95) continue;
        const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        if (s < 0.1) continue;
        let h = 0;
        if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
        else if (max === g) h = ((b - r) / d + 2) * 60;
        else h = ((r - g) / d + 4) * 60;
        buckets[Math.floor(h / 30) % 12]!.weight += s * (1 - Math.abs(2 * l - 1));
      }

      const avgL = totalL / pixelCount;
      if (avgL < 0.18) {
        resolve({ colorA: "#9B2DFF", colorB: "#1A0A2E" });
        return;
      }

      const sorted = buckets
        .map((b, i) => ({ weight: b.weight, hue: i * 30 + 15 }))
        .filter(b => b.weight > 0)
        .sort((a, b) => b.weight - a.weight);

      if (sorted.length === 0) {
        resolve({ colorA: "#FF2D9B", colorB: "#00B4FF" });
        return;
      }

      const hueA = sorted[0]!.hue;
      const colorA = hslToHex(hueA, 0.88, 0.55);

      const second = sorted.slice(1).find(b => {
        const diff = Math.min(Math.abs(b.hue - hueA), 360 - Math.abs(b.hue - hueA));
        return diff >= 60;
      });
      const hueB = second ? second.hue : (hueA + 150) % 360;
      const colorB = hslToHex(hueB, 0.85, 0.52);

      resolve({ colorA, colorB });
    };
    img.onerror = () => resolve({ colorA: "#FF2D9B", colorB: "#00B4FF" });
    img.src = imageUrl;
  });
}

// Helper function to decode audio blob into Float32Array at 16kHz (Whisper format)
async function decodeAudio(url: string): Promise<Float32Array> {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  const data = audioBuffer.getChannelData(0);
  audioContext.close();
  return data;
}

// Pre-defined options
const layouts = [
  { id: "none", name: "None" },
  { id: "bottom", name: "Bottom Bars" },
  { id: "audiogram", name: "Bars (Full Width)" },
  { id: "solidwave", name: "Solid Wave" },
  { id: "rings", name: "Frequency Rings" },
  { id: "echo", name: "Circle" },
  { id: "echo-solid", name: "Circle (Solid)" },
  { id: "dna", name: "DNA Helix" },
  { id: "constellation", name: "Constellation Net" },
];

const themes = [
  { id: 1,  name: "Neon (Pink/Blue)" },
  { id: 2,  name: "Violet Storm (Purple/Amber)" },
  { id: 3,  name: "Arctic (Cyan/Cobalt)" },
  { id: 4,  name: "Solar (Orange/Gold)" },
  { id: 5,  name: "Toxic (Green/Pink)" },
  { id: 6,  name: "Monochrome (White/Grey)" },
  { id: 7,  name: "Dark Violet (Black/Purple)" },
  { id: 8,  name: "Crimson Night (Red/Black)" },
  { id: 12, name: "Laser (Red/Orange)" },
  { id: 9,  name: "Iridescent (Cycling)" },
  { id: 10, name: "Pastel Rainbow (Cycling)" },
  { id: 11, name: "Abyss (Dark Cycling)" },
];

const fontFamilies = [
  { id: "Inter", name: "Inter (Modern Tech)" },
  { id: "Oswald", name: "Oswald (Bold Cinematic)" },
  { id: "Playfair Display", name: "Playfair Display (Elegant Serif)" },
  { id: "Space Grotesk", name: "Space Grotesk (Edgy Geometric)" },
  { id: "Roboto", name: "Roboto (Standard Clean)" },
];

export const App = () => {
  // File state
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
  const [backgroundName, setBackgroundName] = useState<string | null>(null);
  const [bgIsVideo, setBgIsVideo] = useState<boolean>(false);
  const [bgVideoDurationInFrames, setBgVideoDurationInFrames] = useState<number | undefined>(undefined);
  const [lines, setLines] = useState<any[]>([]);
  const [lyricsName, setLyricsName] = useState<string | null>(null);
  
  // Whisper AI state
  const [rawLyrics, setRawLyrics] = useState<string>("");
  const rawLyricsRef = useRef<string>("");
  useEffect(() => { rawLyricsRef.current = rawLyrics; }, [rawLyrics]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<string>("");
  const worker = useRef<Worker | null>(null);

  useEffect(() => { track('app_opened'); }, []);

  useEffect(() => {
    worker.current = new WhisperWorker();
    worker.current?.addEventListener('message', (e) => {
      switch (e.data.status) {
        case 'loading': setSyncStatus('Starting AI...'); break;
        case 'progress': setSyncStatus(e.data.data?.progress ? `Downloading Model: ${Math.round(e.data.data.progress)}%` : 'Downloading Model...'); break;
        case 'transcribing': setSyncStatus('Transcribing Audio...'); break;
        case 'complete':
          setSyncStatus(''); setIsSyncing(false);
          if (e.data.result?.chunks) {
             const currentRawLyrics = rawLyricsRef.current;
             // Split into lines — each line becomes one display unit
             const lyricLines = currentRawLyrics.split('\n').map(l => l.trim()).filter(l => l.length > 0);
             // Build flat word list tagged with which line they belong to
             const userWords: AlignWord[] = [];
             lyricLines.forEach((line, lineIdx) => {
               line.split(/\s+/).filter(w => w.length > 0).forEach(word => {
                 userWords.push({ text: word, idx: userWords.length, lineIdx });
               });
             });
             // Map Xenova's { text, timestamp: [start, end] } format to AlignWord
             const whisperWords: AlignWord[] = (e.data.result.chunks as any[])
               .map((c, i) => ({
                 text: (c.text ?? '').trim(),
                 idx: i,
                 time: Array.isArray(c.timestamp) ? c.timestamp[0] : (c.time ?? 0),
               }))
               .filter(w => w.text.length > 0);
             const aligned = forceAlign(userWords, whisperWords);
             // Group back into LrcLine objects — one per original lyric line
             const totalLines = lyricLines.length;
             const dur = audioDurationRef.current;
             const lrcLines = lyricLines.map((lineText, lineIdx) => {
               const words = aligned.filter(w => w.lineIdx === lineIdx);
               const firstTimed = words.find(w => w.time !== undefined);
               // Fallback: place at proportional position in the song so missed
               // sections (e.g. first chorus) land near the right part of the audio
               // rather than piling up at time=0.
               const time = firstTimed?.time ?? (dur * (lineIdx / totalLines));
               return { time, text: lineText, words: words.map(w => w.text) };
             });
             // Spread any groups of lines that share the same timestamp.
             // This happens when Whisper compresses a repeated section (e.g. a chorus)
             // into fewer words than the user has lines, causing the aligner to jam
             // multiple lines onto one timestamp. Spreading them makes them readable.
             const fixed = [...lrcLines];
             let i = 0;
             while (i < fixed.length) {
               let j = i + 1;
               while (j < fixed.length && fixed[j].time === fixed[i].time) j++;
               if (j > i + 1) {
                 const groupTime = fixed[i].time;
                 const nextTime = j < fixed.length ? fixed[j].time : groupTime + (j - i) * 2.5;
                 const count = j - i;
                 for (let k = 0; k < count; k++) {
                   fixed[i + k] = { ...fixed[i + k], time: groupTime + (nextTime - groupTime) * k / count };
                 }
               }
               i = j;
             }
             setLines(fixed);
             setShowLyrics(true);
             setSyncStatus("SYNCED");
          }
          break;
      }
    });
    return () => worker.current?.terminate();
  }, []);

  // Main visualizer state
  const [layout, setLayout] = useState<VisualizerLayout>("bottom");
  const [themeId, setThemeId] = useState<number>(1);
  const [showParticles, setShowParticles] = useState<boolean>(false);
  const [particleDirection, setParticleDirection] = useState<any>("auto");
  const [particleSpeed, setParticleSpeed] = useState<number>(0.3);
  const [particleCount, setParticleCount] = useState<number>(1.0);
  const [particleOpacity, setParticleOpacity] = useState<number>(1.0);
  const [customColorA, setCustomColorA] = useState<string | null>(null);
  const [customColorB, setCustomColorB] = useState<string | null>(null);

  // Sensible particle density per layout — applied when particles are first turned on
  const PARTICLE_COUNT_DEFAULTS: Partial<Record<VisualizerLayout, number>> = {
    bottom: 4.0, audiogram: 4.0, solidwave: 4.0,
    rings: 3.0, echo: 5.0, "echo-solid": 5.0,
    dna: 3.0, constellation: 4.0,
  };
  const handleToggleParticles = (on: boolean) => {
    setShowParticles(on);
    if (on) {
      setParticleCount(PARTICLE_COUNT_DEFAULTS[layout] ?? 2.0);
      setParticleSpeed(0.3);
    }
  };
  const [reflection, setReflection] = useState<boolean>(true);
  const [showTitles, setShowTitles] = useState<boolean>(true);
  const [artistName, setArtistName] = useState<string>("");
  const [trackName, setTrackName] = useState<string>("");
  const [reverseTitles, setReverseTitles] = useState<boolean>(false);
  const [fontFamily, setFontFamily] = useState<string>("Inter");
  const [showLyrics, setShowLyrics] = useState<boolean>(false);
  const [pulseMovement, setPulseMovement] = useState<boolean>(true);
  const [pulseFlash, setPulseFlash] = useState<boolean>(true);
  const [particlePulse, setParticlePulse] = useState<boolean>(true);
  const [showConstellationNames, setShowConstellationNames] = useState<boolean>(true);
  const [overlayType, setOverlayType] = useState<any>("none");
  const [overlayOpacity, setOverlayOpacity] = useState<number>(0.5);
  const [spectrumType, setSpectrumType] = useState<"bass" | "wide">("wide");
  const [constellationDrawSpeed, setConstellationDrawSpeed] = useState<number>(1);
  const [fineTuneOpen, setFineTuneOpen] = useState<boolean>(false);
  
  const [audioDuration, setAudioDuration] = useState<number>(30);
  const audioDurationRef = useRef<number>(30);
  useEffect(() => { audioDurationRef.current = audioDuration; }, [audioDuration]);

  const presets = [
    { id: "midnight",    name: "Neon Constellation", desc: "Cosmic, electric",  colorA: "#FF2D9B", colorB: "#00B4FF", config: { themeId: 1, layout: "constellation", showParticles: true,  particleDirection: "in",  particleSpeed: 0.18, particleCount: 1.26, particlePulse: false, overlayType: "light-leak", overlayOpacity: 0.4 } },
    { id: "electric",    name: "Acid Wave",           desc: "Punchy, toxic",     colorA: "#00FF88", colorB: "#FF2D9B", config: { themeId: 5, layout: "solidwave",     showParticles: true,  particleDirection: "up",  overlayType: "scanlines",   overlayOpacity: 0.3 } },
    { id: "minimal",     name: "Ice Cold",             desc: "Minimal, clean",    colorA: "#2DFFEE", colorB: "#2D6BFF", config: { themeId: 3, layout: "bottom",        showParticles: false, overlayType: "none" } },
    { id: "iridescent",  name: "Iridescent Orbit",    desc: "Fluid, dreamy",     colorA: "#FF6B2D", colorB: "#9B2DFF", config: { themeId: 9, layout: "echo",          showParticles: true,  particleDirection: "out", overlayType: "light-leak", overlayOpacity: 0.4 } },
    { id: "violetRings", name: "Violet Rings",         desc: "Dark, pulsing",     colorA: "#9B2DFF", colorB: "#FF6B2D", config: { themeId: 2, layout: "rings",         showParticles: true,  particleDirection: "out", particleSpeed: 0.22, particleCount: 3.0,  particlePulse: true, overlayType: "light-leak", overlayOpacity: 0.45 } },
  ];

  const applyPreset = (preset: any) => {
    const c = preset.config;
    if (c.themeId !== undefined) setThemeId(c.themeId);
    if (c.layout !== undefined) setLayout(c.layout as VisualizerLayout);
    if (c.showParticles !== undefined) setShowParticles(c.showParticles);
    if (c.particleDirection !== undefined) setParticleDirection(c.particleDirection);
    if (c.particleSpeed !== undefined) setParticleSpeed(c.particleSpeed);
    if (c.particleCount !== undefined) setParticleCount(c.particleCount);
    if (c.particlePulse !== undefined) setParticlePulse(c.particlePulse);
    if (c.overlayType !== undefined) setOverlayType(c.overlayType);
    if (c.overlayOpacity !== undefined) setOverlayOpacity(c.overlayOpacity);
  };

  const handleVibeMatch = async () => {
    const goodLayouts: VisualizerLayout[] = ["constellation", "rings", "echo", "solidwave", "bottom", "audiogram", "dna"];
    const randomLayout = goodLayouts[Math.floor(Math.random() * goodLayouts.length)]!;
    const dirs = ["up", "down", "in", "out", "auto"];
    const randomDir = dirs[Math.floor(Math.random() * dirs.length)]!;
    const showP = Math.random() > 0.2;
    const overlayOpts = ["none", "none", "light-leak", "scanlines"];
    const randomOverlay = overlayOpts[Math.floor(Math.random() * overlayOpts.length)]!;

    setLayout(randomLayout);
    setShowParticles(showP);
    if (showP) {
      setParticleDirection(randomDir);
      setParticleSpeed(0.12 + Math.random() * 0.32);
      setParticleCount(PARTICLE_COUNT_DEFAULTS[randomLayout] ?? 3.0);
      setParticlePulse(Math.random() > 0.3);
    }
    setOverlayType(randomOverlay);
    if (randomOverlay === "light-leak") setOverlayOpacity(0.3 + Math.random() * 0.25);

    if (backgroundUrl && !bgIsVideo) {
      const { colorA, colorB } = await extractImageColors(backgroundUrl);
      setCustomColorA(colorA);
      setCustomColorB(colorB);
    } else {
      setCustomColorA(null);
      setCustomColorB(null);
      setThemeId(themes[Math.floor(Math.random() * themes.length)]!.id);
    }
  };

  const [isRendering, setIsRendering] = useState(false);
  const [renderStatus, setRenderStatus] = useState("Rendering");
  const [showHelp, setShowHelp] = useState(false);
  const [canExport, setCanExport] = useState<boolean | null>(null);
  const [audioReady, setAudioReady] = useState(false);



  useEffect(() => {
    canRenderMediaOnWeb({ container: "mp4", width: 1920, height: 1080 })
      .then(({ canRender }) => setCanExport(canRender));
  }, []);

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 200 * 1024 * 1024) { alert("Audio file must be under 200MB."); return; }
    setAudioReady(false);
    const url = URL.createObjectURL(file);
    setAudioUrl(url);
    const audio = new Audio(url);
    audio.onloadedmetadata = () => { setAudioDuration(audio.duration); setAudioReady(true); };
    audio.onerror = () => alert("Couldn't read that audio file. Try MP3 or WAV.");
  };

  const handleBackgroundUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500 * 1024 * 1024) { alert("Background file must be under 500MB."); return; }
    setBackgroundName(file.name);
    const isVid = file.type.startsWith("video/");
    setBgIsVideo(isVid);
    if (isVid) {
      const blobUrl = URL.createObjectURL(file);
      setBackgroundUrl(blobUrl);
      const vid = document.createElement("video");
      vid.preload = "metadata";
      vid.onloadedmetadata = () => {
        setBgVideoDurationInFrames(Math.round(vid.duration * 30));
      };
      vid.src = blobUrl;
    } else {
      setBgVideoDurationInFrames(undefined);
      // Images: blob URL is fine — Remotion's Img component handles it correctly.
      setBackgroundUrl(URL.createObjectURL(file));
    }
  };

  const handleLyricsUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert("Lyrics file must be under 5MB."); return; }
    setLyricsName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (!Array.isArray(parsed)) { alert("Invalid lyrics file: expected a JSON array."); return; }
        const valid = parsed.every(item => typeof item === "object" && item !== null && "time" in item && "text" in item);
        if (!valid) { alert("Invalid lyrics format: each entry needs a 'time' and 'text' field."); return; }
        setLines(parsed);
        setShowLyrics(true);
      } catch { alert("Couldn't parse lyrics file. Make sure it's valid JSON."); }
    };
    reader.readAsText(file);
  };

  const handleSync = async () => {
    if (!audioUrl || !rawLyrics.trim()) return;
    const lyricsSnapshot = rawLyricsRef.current;
    track('sync_started');
    setIsSyncing(true);
    setSyncStatus("Decoding Audio...");
    try {
      const audioData = await decodeAudio(audioUrl);
      worker.current?.postMessage({ audio: audioData, text: lyricsSnapshot });
    } catch (err: any) {
      alert(`Sync failed: ${err?.message ?? "couldn't decode audio"}`);
      setIsSyncing(false);
    }
  };

  const handleRender = async (testMode = false) => {
    const fullFrames = Math.ceil(audioDuration * 30);
    const durationInFrames = testMode ? Math.min(150, fullFrames) : fullFrames;
    track('export_started', {
      layout,
      theme_id: themeId,
      background_type: bgIsVideo ? 'video' : 'image',
      particles_on: showParticles,
      lyrics_on: showLyrics,
      overlay: overlayType ?? 'none',
      test_mode: testMode,
    });
    setIsRendering(true);
    setRenderStatus("Rendering 0%");
    try {
      const { canRender, issues } = await canRenderMediaOnWeb({
        container: "mp4",
        width: 1920,
        height: 1080,
      });
      if (!canRender) {
        const msg = issues.filter(i => i.severity === "error").map(i => i.message).join("\n");
        alert(`Your browser doesn't support video export.\n\n${msg}\n\nPlease use Chrome or Edge.`);
        return;
      }

      // For image backgrounds: pre-crop to 1920×1080 cover so internal renderer shows no bars.
      let exportBackgroundUrl = backgroundUrl;
      if (!bgIsVideo && backgroundUrl?.startsWith("blob:")) {
        setRenderStatus("Preparing background...");
        exportBackgroundUrl = await cropImageToCover(backgroundUrl, 1920, 1080);
      }

      // For video backgrounds: extract frames as JPEGs first, then render internally.
      if (bgIsVideo && backgroundUrl && bgVideoDurationInFrames) {
        setRenderStatus("Extracting video frames 0%");
        await extractVideoFrames(
          backgroundUrl,
          30,
          bgVideoDurationInFrames / 30,
          (pct) => setRenderStatus(`Extracting video frames ${Math.round(pct * 100)}%`),
        );
        setRenderStatus("Rendering 0%");
      }

      const exportProps = { ...inputProps, backgroundSrc: exportBackgroundUrl || "", isExporting: true };

      const result = await renderMediaOnWeb({
        composition: {
          component: VisualizerMain,
          id: "Visualizer",
          width: 1920,
          height: 1080,
          fps: 30,
          durationInFrames,
          defaultProps: exportProps,
        },
        inputProps: exportProps,
        container: "mp4",
        videoBitrate: 25_000_000,
        // Internal renderer only — allowHtmlInCanvas breaks SVG/canvas capture entirely.
        // Image BGs: pre-cropped JPEG data URL via cropImageToCover (handles objectFit:cover).
        // Video BGs: pre-extracted JPEG frames via BlobVideoFrame.
        onProgress: ({ progress }) => setRenderStatus(`Rendering ${Math.round(progress * 100)}%`),
      });

      if (backgroundUrl) clearVideoFrames(backgroundUrl);
      const blob = await result.getBlob();
      track('export_completed', { layout, theme_id: themeId, test_mode: testMode });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const suffix = testMode ? "-5sec-test" : "";
      a.download = `${(artistName || "visualizer").replace(/\s+/g, "-")}-${(trackName || "export").replace(/\s+/g, "-")}${suffix}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error(err);
      if (backgroundUrl) clearVideoFrames(backgroundUrl);
      alert(`Export failed: ${err?.message ?? "Unknown error"}`);
    } finally {
      setIsRendering(false);
      setRenderStatus("Rendering");
    }
  };

  const inputProps: VisualizerProps = {
    audioSrc: audioUrl || "",
    audioDuration,
    layout,
    backgroundSrc: backgroundUrl || "",
    bgIsVideo,
    bgVideoDurationInFrames,
    reflection,
    showParticles,
    particleDirection,
    particleSpeed,
    particleCount,
    particleOpacity,
    particlePulse,
    ...(customColorA ? { customColorA } : {}),
    ...(customColorB ? { customColorB } : {}),
    themeId,
    overlayType,
    overlayOpacity,
    artistName,
    trackName,
    reverseTitles,
    showTitles,
    fontFamily,
    lines,
    showLyrics,
    pulseMovement,
    pulseFlash,
    showConstellationNames,
    constellationDrawSpeed,
    showVisualizer: true,
    spectrumType
  };

  return (
    <div className="app-container">
      <div className="sidebar">
        <div className="sidebar-header">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <img src="/favicon.svg" alt="Kirbai" style={{ width: 32, height: 32 }} />
              <h1>Kirbai Vision</h1>
            </div>
            <button
              onClick={() => setShowHelp(true)}
              style={{ background: "none", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "50%", width: 28, height: 28, color: "var(--text-secondary)", cursor: "pointer", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
              title="How to use"
            >?</button>
          </div>
          <p>Visualizer & Lyric Video Creator</p>
          <p style={{ fontSize: 11, color: "var(--text-secondary)", opacity: 0.7, marginTop: 4 }}>
            ⚠ Export requires <strong>Chrome or Edge</strong>
          </p>
        </div>

        <div className="sidebar-content">

          {/* ── 1. Media Assets ─────────────────────────────────── */}
          <div className="section-title" style={{ marginTop: 0 }}>
            <Upload size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 5, marginBottom: 1 }} />
            1. Media Assets
          </div>
          <div className="control-group">
            <label>Audio File</label>
            <label className="file-upload">
              <FileAudio className="file-upload-icon" size={20} />
              <span className="file-upload-text">{audioUrl ? "✓ Audio Loaded" : "Upload MP3/WAV"}</span>
              <input type="file" accept="audio/*" onChange={handleAudioUpload} />
            </label>
          </div>
          <div className="control-group">
            <label>Background</label>
            <label className="file-upload">
              <FileImage className="file-upload-icon" size={20} />
              <span className="file-upload-text">{backgroundName ? `✓ ${backgroundName}` : "Upload Image or Video"}</span>
              <input type="file" accept="image/*,video/*" onChange={handleBackgroundUpload} />
            </label>
          </div>

          {/* ── Quick Start ──────────────────────────────────────── */}
          <div className="section-title">
            <Zap size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 5, marginBottom: 1 }} />
            Quick Start
          </div>
          <div className="presets-grid">
            {presets.map(p => (
              <button key={p.id} className="preset-button" onClick={() => applyPreset(p)}>
                <span className="preset-swatch" style={{ background: `linear-gradient(135deg, ${p.colorA}, ${p.colorB})` }} />
                <span className="preset-name">{p.name}</span>
                <span className="preset-desc">{p.desc}</span>
              </button>
            ))}
            <button className="preset-button" onClick={handleVibeMatch}>
              <span className="preset-swatch" style={{ background: "linear-gradient(135deg, #FF2D9B, #9B2DFF, #00B4FF, #00FF88, #FFE500)" }} />
              <span className="preset-name">Vibe Match</span>
              <span className="preset-desc">{backgroundUrl && !bgIsVideo ? "Color-matched to image" : "Fully randomized"}</span>
            </button>
          </div>

          {/* ── 2. Visual Design ─────────────────────────────────── */}
          <div className="section-title">
            <Palette size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 5, marginBottom: 1 }} />
            2. Visual Design
          </div>
          <div className="control-group">
            <label>Theme</label>
            <select className="select-input" value={themeId} onChange={e => { setThemeId(Number(e.target.value)); setCustomColorA(null); setCustomColorB(null); }}>
              {themes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="control-group">
            <label>Layout</label>
            <select className="select-input" value={layout} onChange={e => setLayout(e.target.value as VisualizerLayout)}>
              {layouts.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>

          {/* Fine-tune collapsible */}
          <button className={`fine-tune-toggle${fineTuneOpen ? " open" : ""}`} onClick={() => setFineTuneOpen(!fineTuneOpen)}>
            <SlidersHorizontal size={12} />
            Fine-tune
            {fineTuneOpen ? <ChevronUp size={12} style={{ marginLeft: "auto" }} /> : <ChevronDown size={12} style={{ marginLeft: "auto" }} />}
          </button>

          {fineTuneOpen && (
            <div className="advanced-panel">
              <div className="control-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  Spectrum
                  <div className="tooltip-container">
                    <span className="tooltip-icon">?</span>
                    <div className="tooltip-content">
                      <strong>BASS:</strong> Focuses on low-end energy (0–3kHz). Ideal for kick-heavy tracks.
                      <br /><br />
                      <strong>WIDE:</strong> Maps the full frequency range (0–9kHz) for a more detailed, active look.
                    </div>
                  </div>
                </label>
                <div className="segmented-control">
                  <button className={spectrumType === "bass" ? "active" : ""} onClick={() => setSpectrumType("bass")}>BASS</button>
                  <button className={spectrumType === "wide" ? "active" : ""} onClick={() => setSpectrumType("wide")}>WIDE</button>
                </div>
              </div>

              {(layout === "bottom" || layout === "audiogram" || layout === "solidwave" || layout === "echo" || layout === "echo-solid") && (
                <div className="toggle-group">
                  <label>Mirror Reflection</label>
                  <label className="switch">
                    <input type="checkbox" checked={reflection} onChange={e => setReflection(e.target.checked)} />
                    <span className="slider"></span>
                  </label>
                </div>
              )}

              <div className="toggle-group">
                <label>Beat Zoom</label>
                <label className="switch">
                  <input type="checkbox" checked={pulseMovement} onChange={e => setPulseMovement(e.target.checked)} />
                  <span className="slider"></span>
                </label>
              </div>

              <div className="toggle-group">
                <label>Beat Flash</label>
                <label className="switch">
                  <input type="checkbox" checked={pulseFlash} onChange={e => setPulseFlash(e.target.checked)} />
                  <span className="slider"></span>
                </label>
              </div>

              {layout === "constellation" && (
                <>
                  <div className="toggle-group">
                    <label>Star Names</label>
                    <label className="switch">
                      <input type="checkbox" checked={showConstellationNames} onChange={e => setShowConstellationNames(e.target.checked)} />
                      <span className="slider"></span>
                    </label>
                  </div>
                  <div className="control-group">
                    <label>Draw Speed <span className="label-value">{constellationDrawSpeed.toFixed(1)}x</span></label>
                    <input type="range" className="range-input" min={0.25} max={4} step={0.25} value={constellationDrawSpeed} onChange={e => setConstellationDrawSpeed(parseFloat(e.target.value))} />
                  </div>
                </>
              )}
            </div>
          )}

          <div className="toggle-group">
            <label>Particles</label>
            <label className="switch">
              <input type="checkbox" checked={showParticles} onChange={e => handleToggleParticles(e.target.checked)} />
              <span className="slider"></span>
            </label>
          </div>

          {showParticles && (
            <div className="advanced-panel">
              <div className="control-group">
                <label>Direction</label>
                <select className="select-input" value={particleDirection} onChange={e => setParticleDirection(e.target.value)}>
                  <option value="auto">Auto</option>
                  <option value="up">Up</option>
                  <option value="down">Down</option>
                  <option value="in">Inwards</option>
                  <option value="out">Outwards</option>
                </select>
              </div>
              <div className="control-group">
                <label>Speed <span className="label-value">{parseFloat((particleSpeed / 0.3).toFixed(1))}x</span></label>
                <input type="range" className="range-input" min="0.05" max="0.55" step="0.025" value={particleSpeed} onChange={e => setParticleSpeed(Number(e.target.value))} />
              </div>
              <div className="control-group">
                <label>Amount <span className="label-value">{Math.round(particleCount / 4.0 * 100)}%</span></label>
                <input type="range" className="range-input" min="0.25" max="16" step="0.25" value={particleCount} onChange={e => setParticleCount(Number(e.target.value))} />
              </div>
              <div className="control-group">
                <label>Opacity <span className="label-value">{Math.round(particleOpacity * 100)}%</span></label>
                <input type="range" className="range-input" min="0.2" max="2.5" step="0.05" value={particleOpacity} onChange={e => setParticleOpacity(Number(e.target.value))} />
              </div>
              <div className="toggle-group">
                <label>Audio Reactive</label>
                <label className="switch">
                  <input type="checkbox" checked={particlePulse} onChange={e => setParticlePulse(e.target.checked)} />
                  <span className="slider"></span>
                </label>
              </div>
            </div>
          )}

          <div className="control-group">
            <label>Texture</label>
            <select className="select-input" value={overlayType} onChange={e => setOverlayType(e.target.value)}>
              <option value="none">None</option>
              <option value="scanlines">Scan Lines</option>
              <option value="light-leak">Light Leak</option>
            </select>
          </div>

          {overlayType === "light-leak" && (
            <div className="control-group">
              <label>Intensity <span className="label-value">{Math.round(overlayOpacity * 100)}%</span></label>
              <input type="range" className="range-input" min={0} max={1} step={0.01} value={overlayOpacity} onChange={e => setOverlayOpacity(parseFloat(e.target.value))} />
            </div>
          )}

          {/* ── 3. Lyrics & Titles ───────────────────────────────── */}
          <div className="section-title">
            <Mic2 size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 5, marginBottom: 1 }} />
            3. Lyrics &amp; Titles
          </div>

          <div className="toggle-group">
            <label>Display Titles</label>
            <label className="switch">
              <input type="checkbox" checked={showTitles} onChange={e => setShowTitles(e.target.checked)} />
              <span className="slider"></span>
            </label>
          </div>

          {showTitles && (
            <div className="advanced-panel">
              <div className="control-group">
                <label>Artist</label>
                <input className="text-input" value={artistName} onChange={e => setArtistName(e.target.value)} />
              </div>
              <div className="control-group">
                <label>Track</label>
                <input className="text-input" value={trackName} onChange={e => setTrackName(e.target.value)} />
              </div>
              <div className="control-group">
                <label>Font</label>
                <select className="select-input" value={fontFamily} onChange={e => setFontFamily(e.target.value)}>
                  {fontFamilies.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
              <div className="toggle-group">
                <label>Swap Name Order</label>
                <label className="switch">
                  <input type="checkbox" checked={reverseTitles} onChange={e => setReverseTitles(e.target.checked)} />
                  <span className="slider"></span>
                </label>
              </div>
            </div>
          )}

          <div className="toggle-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              Lyrics
              <span className="beta-badge">BETA</span>
            </label>
            <label className="switch">
              <input type="checkbox" checked={showLyrics} onChange={e => setShowLyrics(e.target.checked)} />
              <span className="slider"></span>
            </label>
          </div>

          {showLyrics && (
            <div className="advanced-panel">
              <textarea className="text-input" rows={3}
                placeholder="Paste lyrics here (one line per lyric line)..."
                value={rawLyrics}
                onChange={e => setRawLyrics(e.target.value)}
                onBlur={e => {
                  const cleaned = e.target.value
                    .replace(/\[.*?\]/g, "")
                    .split('\n')
                    .map(l => l.replace(/\s+/g, ' ').trim())
                    .filter(l => l.length > 0)
                    .join('\n');
                  setRawLyrics(cleaned);
                }}
                style={{ fontSize: '12px' }}
              />
              <button className="primary-button" onClick={handleSync} disabled={isSyncing || !rawLyrics}
                style={{ padding: '8px', fontSize: '12px', background: 'var(--accent-blue)', lineHeight: 1.4 }}>
                {isSyncing ? (
                  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <span>Syncing...</span>
                    <span style={{ fontSize: '10px', opacity: 0.8 }}>{syncStatus || "may take a few min"}</span>
                  </span>
                ) : syncStatus === "SYNCED" ? "Synced ✓" : "Sync Lyrics"}
              </button>
              {syncStatus === "SYNCED" && !isSyncing && (
                <p style={{ color: 'var(--text-secondary)', fontSize: '11px', textAlign: 'center', margin: 0, lineHeight: 1.4 }}>
                  Edit lyrics above and hit Sync again to update
                </p>
              )}
              <p style={{ color: 'rgba(255,200,80,0.65)', fontSize: '10px', textAlign: 'center', margin: 0, lineHeight: 1.5 }}>
                AI accuracy varies — timing may be imperfect. Re-sync as needed.
              </p>
            </div>
          )}
        </div>

        <div className="sidebar-footer">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button
              className="primary-button"
              onClick={() => handleRender(false)}
              disabled={!audioReady || !backgroundUrl || isRendering || canExport === false}
              title={canExport === false ? "Export requires Chrome or Edge" : !audioReady ? "Load an audio file first" : ""}
            >
              {isRendering ? renderStatus : canExport === false ? "Export (Chrome/Edge only)" : "Export MP4"}
            </button>
            <button
              className="primary-button"
              onClick={() => handleRender(true)}
              disabled={!audioReady || !backgroundUrl || isRendering || canExport === false}
              title="Export first 5 seconds only — great for quickly checking your settings"
              style={{ fontSize: 13, opacity: 0.6, padding: "10px" }}
            >
              5s Test Export
            </button>
          </div>
        </div>
      </div>

      {showHelp && (
        <div
          onClick={() => setShowHelp(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: "#111126", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, maxWidth: 540, width: "100%", maxHeight: "88vh", overflowY: "auto", position: "relative", padding: "36px 40px" }}
          >
            <button onClick={() => setShowHelp(false)} style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", color: "var(--text-secondary)", fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
            <h2 style={{ fontFamily: "Syne, sans-serif", fontSize: 22, fontWeight: 700, background: "linear-gradient(90deg, #FF2D9B, #00B4FF)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginBottom: 8 }}>Kirbai Vision</h2>
            <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 12 }}>Create a music visualizer in 4 steps.</p>
            <p style={{ fontSize: 12, background: "rgba(255,180,0,0.08)", border: "1px solid rgba(255,180,0,0.2)", borderRadius: 8, padding: "8px 12px", color: "rgba(255,200,80,0.9)", marginBottom: 20, lineHeight: 1.5 }}>
              ⚠ <strong>Export requires Chrome or Edge.</strong> Safari and Firefox do not support MP4 export — you'll get an error. Preview works in any browser.
            </p>
            {[
              { n: "1", title: "Upload your audio", body: "MP3 or WAV, up to 200MB. The preview activates once both audio and a background are loaded." },
              { n: "2", title: "Upload a background", body: "Any image or video. If your video is shorter than the audio, it will loop continuously to fill the full length." },
              { n: "3", title: "Style it", body: "Pick a visualizer layout and theme. Toggle particles, screen pulse, and overlays. Use Quick Start presets to get something great fast." },
              { n: "4", title: "Lyrics (optional) & export", body: "Paste lyrics and hit Sync — AI times them to the audio automatically. Each line break becomes one lyric line. Bracket tags like [Verse] and [Chorus] are stripped automatically, so copying from Suno works perfectly. If the timing is off, edit your lyrics and hit Sync again — you can re-sync as many times as you need. When you're happy, hit Export MP4 (Chrome or Edge only). Use the 5s Test button first to check your settings before committing to a full render." },
            ].map(step => (
              <div key={step.n} style={{ display: "flex", gap: 16, marginBottom: 20 }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg, #FF2D9B, #7b2fff)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0, marginTop: 2 }}>{step.n}</div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{step.title}</div>
                  <div style={{ color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.5 }}>{step.body}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="preview-area">
        <div className="preview-container">
          <div className="player-wrapper">
            {audioUrl && backgroundUrl ? (
              <Player component={VisualizerMain} inputProps={{...inputProps, isExporting: false}} durationInFrames={Math.ceil(audioDuration * 30)} fps={30} compositionWidth={1920} compositionHeight={1080} style={{ width: "100%", height: "100%" }} controls />
            ) : (
              <div className="empty-state">
                <FileAudio className="empty-state-icon" />
                <h2>Load assets to preview</h2>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
