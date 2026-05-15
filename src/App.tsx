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
  { id: "audiogram", name: "Audiogram (Full Width)" },
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
             // Convert string to words for aligner
             const userWords: AlignWord[] = currentRawLyrics.split(/\s+/).filter(x => x.length > 0).map((w, i) => ({ text: w, idx: i }));
             const aligned = forceAlign(userWords, e.data.result.chunks);
             setLines(aligned);
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
    { id: "midnight", name: "Midnight Cinematic", config: { themeId: 7, layout: "constellation", showParticles: true, particleDirection: "in", overlayType: "light-leak", overlayOpacity: 0.4 } },
    { id: "electric", name: "Electric Pulse", config: { themeId: 5, layout: "solidwave", showParticles: true, particleDirection: "up", overlayType: "scanlines", overlayOpacity: 0.3 } },
    { id: "minimal", name: "Modern Minimal", config: { themeId: 3, layout: "bottom", showParticles: false, overlayType: "none" } },
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

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setAudioUrl(url);
      const audio = new Audio(url);
      audio.onloadedmetadata = () => setAudioDuration(audio.duration);
    }
  };

  const handleBackgroundUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setBackgroundUrl(url);
      setBackgroundName(file.name);
      setBgIsVideo(file.type.startsWith("video/"));
    }
  };

  const handleLyricsUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLyricsName(file.name);
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target?.result as string);
          if (Array.isArray(parsed)) setLines(parsed);
          setShowLyrics(true);
        } catch { alert("Invalid JSON lyrics file."); }
      };
      reader.readAsText(file);
    }
  };

  const handleSync = async () => {
    if (!audioUrl || !rawLyrics.trim()) return;
    setIsSyncing(true);
    setSyncStatus("Decoding Audio...");
    try {
      const audioData = await decodeAudio(audioUrl);
      worker.current?.postMessage({ audio: audioData });
    } catch (err) { alert("Sync failed."); setIsSyncing(false); }
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
          <h1>AELOW Engine</h1>
          <p>Premium Lyric Video Generator</p>
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
               <textarea className="text-input" rows={3} placeholder="Paste lyrics here..." value={rawLyrics} onChange={e => setRawLyrics(e.target.value)} style={{fontSize: '12px'}} />
               <button className="primary-button" onClick={handleSync} disabled={isSyncing || !rawLyrics} style={{padding: '8px', fontSize: '12px', background: 'var(--accent-blue)'}}>
                 {isSyncing ? "Syncing..." : syncStatus === "SYNCED" ? "Synced ✓" : "Sync Lyrics"}
               </button>
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
          <button className="primary-button" onClick={handleRender} disabled={!audioUrl || !backgroundUrl || isRendering}>
            {isRendering ? `Rendering ${Math.round(progress)}%` : "Export MP4"}
          </button>
        </div>
      </div>

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
