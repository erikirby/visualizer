import React, { useState, useEffect, useRef } from "react";
import { Player } from "@remotion/player";
import { renderMediaOnWeb, canRenderMediaOnWeb } from "@remotion/web-renderer";
import { Upload, FileAudio, FileImage, FileText, Download, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { RemotionRoot } from "./Root";
import { VisualizerMain, VisualizerProps, VisualizerLayout } from "./VisualizerMain";
import { Main } from "./Main";
import { forceAlign, AlignWord } from './utils/aligner';
// @ts-ignore - Vite specific worker import
import WhisperWorker from './whisper.worker.ts?worker';

// Helper function to decode audio blob into Float32Array at 16kHz (Whisper format)
async function decodeAudio(url: string): Promise<Float32Array> {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  return audioBuffer.getChannelData(0);
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
  { id: 1, name: "Neon (Pink/Blue)" },
  { id: 2, name: "Violet Storm (Purple/Amber)" },
  { id: 3, name: "Arctic (Cyan/Cobalt)" },
  { id: 4, name: "Solar (Orange/Gold)" },
  { id: 5, name: "Toxic (Green/Pink)" },
  { id: 6, name: "Monochrome (White/Grey)" },
  { id: 7, name: "Dark Violet (Black/Purple)" },
  { id: 8, name: "Crimson Night (Red/Black)" },
  { id: 9, name: "Iridescent (Cycling)" },
  { id: 10, name: "Pastel Rainbow (Cycling)" },
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
             const lrcLines = lyricLines.map((lineText, lineIdx) => {
               const words = aligned.filter(w => w.lineIdx === lineIdx);
               const firstTimed = words.find(w => w.time !== undefined);
               const time = firstTimed?.time ?? 0;
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
  const [particleSpeed, setParticleSpeed] = useState<number>(1.0);
  const [particleCount, setParticleCount] = useState<number>(1.0);
  const [reflection, setReflection] = useState<boolean>(true);
  const [showTitles, setShowTitles] = useState<boolean>(true);
  const [artistName, setArtistName] = useState<string>("AELOW");
  const [trackName, setTrackName] = useState<string>("MY TRACK");
  const [reverseTitles, setReverseTitles] = useState<boolean>(false);
  const [fontFamily, setFontFamily] = useState<string>("Inter");
  const [showLyrics, setShowLyrics] = useState<boolean>(true);
  const [screenPulse, setScreenPulse] = useState<boolean>(true);
  const [particlePulse, setParticlePulse] = useState<boolean>(true);
  const [showConstellationNames, setShowConstellationNames] = useState<boolean>(true);
  const [overlayType, setOverlayType] = useState<any>("none");
  const [overlayOpacity, setOverlayOpacity] = useState<number>(0.5);
  
  const [showAdvancedVisualizer, setShowAdvancedVisualizer] = useState<boolean>(false);
  const [audioDuration, setAudioDuration] = useState<number>(30);

  const presets = [
    { id: "midnight", name: "Neon Constellation", config: { themeId: 1, layout: "constellation", showParticles: true, particleDirection: "in", overlayType: "light-leak", overlayOpacity: 0.4 } },
    { id: "electric", name: "Acid Wave", config: { themeId: 5, layout: "solidwave", showParticles: true, particleDirection: "up", overlayType: "scanlines", overlayOpacity: 0.3 } },
    { id: "minimal", name: "Ice Cold", config: { themeId: 3, layout: "bottom", showParticles: false, overlayType: "none" } },
    { id: "iridescent", name: "Iridescent Orbit", config: { themeId: 9, layout: "echo", showParticles: true, particleDirection: "out", overlayType: "light-leak", overlayOpacity: 0.4 } },
  ];

  const applyPreset = (preset: any) => {
    const c = preset.config;
    if (c.themeId !== undefined) setThemeId(c.themeId);
    if (c.layout !== undefined) setLayout(c.layout as VisualizerLayout);
    if (c.showParticles !== undefined) setShowParticles(c.showParticles);
    if (c.particleDirection !== undefined) setParticleDirection(c.particleDirection);
    if (c.overlayType !== undefined) setOverlayType(c.overlayType);
    if (c.overlayOpacity !== undefined) setOverlayOpacity(c.overlayOpacity);
  };

  const [isRendering, setIsRendering] = useState(false);
  const [progress, setProgress] = useState(0);
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
    const url = URL.createObjectURL(file);
    setBackgroundUrl(url);
    setBackgroundName(file.name);
    setBgIsVideo(file.type.startsWith("video/"));
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

  const handleRender = async () => {
    setIsRendering(true);
    setProgress(0);
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

      const result = await renderMediaOnWeb({
        composition: {
          component: VisualizerMain,
          id: "Visualizer",
          width: 1920,
          height: 1080,
          fps: 30,
          durationInFrames: Math.ceil(audioDuration * 30),
          defaultProps: inputProps,
        },
        inputProps,
        container: "mp4",
        onProgress: ({ progress }) => setProgress(Math.round(progress * 100)),
      });

      const blob = await result.getBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(artistName || "visualizer").replace(/\s+/g, "-")}-${(trackName || "export").replace(/\s+/g, "-")}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error(err);
      alert(`Export failed: ${err?.message ?? "Unknown error"}`);
    } finally {
      setIsRendering(false);
      setProgress(0);
    }
  };

  const inputProps: VisualizerProps = {
    audioSrc: audioUrl || "",
    audioDuration,
    layout,
    backgroundSrc: backgroundUrl || "",
    showParticles,
    particleDirection,
    particleSpeed,
    particleCount,
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
    screenPulse,
    particlePulse,
    showConstellationNames,
    showVisualizer: true
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
        </div>

        <div className="sidebar-content">
          <div className="section-title" style={{ marginTop: 0 }}>Quick Start</div>
          <div className="presets-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
            {presets.map(p => (
              <button key={p.id} className="preset-button" onClick={() => applyPreset(p)}
                style={{ padding: '10px', fontSize: '11px', fontWeight: '600', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', cursor: 'pointer' }}>
                {p.name}
              </button>
            ))}
          </div>

          <div className="section-title">1. Media Assets</div>
          <div className="control-group">
            <label>Audio File</label>
            <label className="file-upload">
              <FileAudio className="file-upload-icon" size={20} />
              <span className="file-upload-text">{audioUrl ? "Audio Loaded" : "Upload MP3/WAV"}</span>
              <input type="file" accept="audio/*" onChange={handleAudioUpload} />
            </label>
          </div>
          <div className="control-group">
            <label>Background</label>
            <label className="file-upload">
              <FileImage className="file-upload-icon" size={20} />
              <span className="file-upload-text">{backgroundName || "Upload Image/Video"}</span>
              <input type="file" accept="image/*,video/*" onChange={handleBackgroundUpload} />
            </label>
          </div>

          <div className="section-title">2. Visual Design</div>
          <div className="control-group">
            <label>Layout</label>
            <select className="select-input" value={layout} onChange={e => setLayout(e.target.value as VisualizerLayout)}>
              {layouts.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div className="control-group">
            <label>Theme</label>
            <select className="select-input" value={themeId} onChange={e => setThemeId(Number(e.target.value))}>
              {themes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          {(layout === "constellation" || layout === "solidwave") && (
            <div onClick={() => setShowAdvancedVisualizer(!showAdvancedVisualizer)} style={{ fontSize: '11px', color: 'var(--accent-blue)', cursor: 'pointer', textAlign: 'right', marginTop: '-12px', fontWeight: 600 }}>
              {showAdvancedVisualizer ? "− HIDE DETAILS" : "+ CUSTOMIZE LAYOUT"}
            </div>
          )}

          {showAdvancedVisualizer && (layout === "constellation" || layout === "solidwave") && (
            <div className="advanced-panel" style={{ padding: '12px', background: 'rgba(0,0,0,0.15)', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {layout === "constellation" && (
                <div className="toggle-group">
                  <label>Show Star Names</label>
                  <label className="switch">
                    <input type="checkbox" checked={showConstellationNames} onChange={e => setShowConstellationNames(e.target.checked)} />
                    <span className="slider"></span>
                  </label>
                </div>
              )}
              {layout === "solidwave" && (
                <div className="toggle-group">
                  <label>Mirror Reflection</label>
                  <label className="switch">
                    <input type="checkbox" checked={reflection} onChange={e => setReflection(e.target.checked)} />
                    <span className="slider"></span>
                  </label>
                </div>
              )}
            </div>
          )}

          <div className="toggle-group">
            <label>Show Particles</label>
            <label className="switch">
              <input type="checkbox" checked={showParticles} onChange={e => setShowParticles(e.target.checked)} />
              <span className="slider"></span>
            </label>
          </div>

          {showParticles && (
            <div className="advanced-panel" style={{ padding: '12px', background: 'rgba(0,0,0,0.15)', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
                <label>Speed — {particleSpeed.toFixed(1)}x</label>
                <input type="range" min="0.25" max="3" step="0.25" value={particleSpeed} onChange={e => setParticleSpeed(Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--accent-pink)', cursor: 'pointer' }} />
              </div>
              <div className="control-group">
                <label>Amount — {Math.round(particleCount * 100)}%</label>
                <input type="range" min="0.25" max="4" step="0.25" value={particleCount} onChange={e => setParticleCount(Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--accent-pink)', cursor: 'pointer' }} />
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

          <div className="toggle-group">
            <label>Screen Pulse (Bass Zoom)</label>
            <label className="switch">
              <input type="checkbox" checked={screenPulse} onChange={e => setScreenPulse(e.target.checked)} />
              <span className="slider"></span>
            </label>
          </div>

          <div className="section-title">3. Content & Overlay</div>
          <div className="toggle-group">
            <label>Display Titles</label>
            <label className="switch">
              <input type="checkbox" checked={showTitles} onChange={e => setShowTitles(e.target.checked)} />
              <span className="slider"></span>
            </label>
          </div>

          {showTitles && (
            <div className="advanced-panel" style={{ padding: '12px', background: 'rgba(0,0,0,0.15)', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
            </div>
          )}

          <div className="toggle-group">
            <label>Show Lyrics</label>
            <label className="switch">
              <input type="checkbox" checked={showLyrics} onChange={e => setShowLyrics(e.target.checked)} />
              <span className="slider"></span>
            </label>
          </div>

          {showLyrics && (
             <div className="advanced-panel" style={{ padding: '12px', background: 'rgba(0,0,0,0.15)', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
               <textarea className="text-input" rows={3} placeholder="Paste lyrics here (one line per lyric)..." value={rawLyrics} onChange={e => {
                 const cleaned = e.target.value
                   .replace(/\[.*?\]/g, "")
                   .split('\n')
                   .map(l => l.replace(/\s+/g, ' ').trim())
                   .filter(l => l.length > 0)
                   .join('\n');
                 setRawLyrics(cleaned);
               }} style={{fontSize: '12px'}} />
               <button className="primary-button" onClick={handleSync} disabled={isSyncing || !rawLyrics}
                 style={{padding: '8px', fontSize: '12px', background: 'var(--accent-blue)', lineHeight: 1.4}}>
                 {isSyncing ? (
                   <span style={{display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
                     <span>Syncing...</span>
                     <span style={{fontSize: '10px', opacity: 0.8}}>may take a few min</span>
                   </span>
                 ) : syncStatus === "SYNCED" ? "Synced ✓" : "Sync Lyrics"}
               </button>
               {syncStatus === "SYNCED" && !isSyncing && (
                 <p style={{color: 'var(--text-secondary)', fontSize: '11px', textAlign: 'center', margin: 0, lineHeight: 1.4}}>
                   Edit lyrics above and hit Sync again to update
                 </p>
               )}
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
        </div>

        <div className="sidebar-footer">
          <button
            className="primary-button"
            onClick={handleRender}
            disabled={!audioReady || !backgroundUrl || isRendering || canExport === false}
            title={canExport === false ? "Export requires Chrome or Edge" : !audioReady ? "Load an audio file first" : ""}
          >
            {isRendering ? `Rendering ${Math.round(progress)}%` : canExport === false ? "Export (Chrome/Edge only)" : "Export MP4"}
          </button>
        </div>
      </div>

      {showHelp && (
        <div
          onClick={() => setShowHelp(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: "#111126", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: "36px 40px", maxWidth: 480, width: "90%", position: "relative" }}
          >
            <button onClick={() => setShowHelp(false)} style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", color: "var(--text-secondary)", fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
            <h2 style={{ fontFamily: "Syne, sans-serif", fontSize: 22, fontWeight: 700, background: "linear-gradient(90deg, #FF2D9B, #00B4FF)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginBottom: 8 }}>Kirbai Vision</h2>
            <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 28 }}>Create a music visualizer in 4 steps.</p>
            {[
              { n: "1", title: "Upload your audio", body: "MP3 or WAV, up to 200MB. The preview activates once both audio and a background are loaded." },
              { n: "2", title: "Upload a background", body: "Any image or video. If your video is shorter than the audio, it will loop continuously to fill the full length." },
              { n: "3", title: "Style it", body: "Pick a visualizer layout and theme. Toggle particles, screen pulse, and overlays. Use Quick Start presets to get something great fast." },
              { n: "4", title: "Lyrics (optional) & export", body: "Paste lyrics and hit Sync — AI times them to the audio automatically. Each line break becomes one lyric line. Bracket tags like [Verse] and [Chorus] are stripped automatically, so copying from Suno works perfectly. If the timing is off, edit your lyrics and hit Sync again — you can re-sync as many times as you need. When you're happy, hit Export MP4 (Chrome or Edge only)." },
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
              <Player component={VisualizerMain} inputProps={inputProps} durationInFrames={Math.ceil(audioDuration * 30)} fps={30} compositionWidth={1920} compositionHeight={1080} style={{ width: "100%", height: "100%" }} controls />
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
