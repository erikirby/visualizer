import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { Audio } from "@remotion/media";
import { useAudioData, visualizeAudio } from "@remotion/media-utils";
import { VisualBackground } from "./components/VisualBackground";
import { BarEQ } from "./components/BarEQ";
import { SolidWave } from "./components/SolidWave";
import { FrequencyRings } from "./components/FrequencyRings";
import { EchoPulse } from "./components/EchoPulse";
import { DNAHelix } from "./components/DNAHelix";
import { ConstellationNet } from "./components/ConstellationNet";
import { FullWidthBars } from "./components/FullWidthBars";
import { Particles } from "./components/Particles";
import type { ParticleDirection } from "./components/Particles";
import { getBassEnergy } from "./utils/audioColor";
import { getThemeAtTime } from "./utils/themes";
import { ArtistBug } from "./components/ArtistBug";
import { OverlayLayer } from "./components/OverlayLayer";
import { ProceduralOverlay } from "./components/ProceduralOverlay";
import type { ProceduralOverlayType } from "./components/ProceduralOverlay";
import { LyricEngine } from "./components/LyricEngine";

export type VisualizerLayout =
  | "none"
  | "bottom"
  | "audiogram"
  | "solidwave"
  | "rings"
  | "echo"
  | "echo-solid"
  | "dna"
  | "constellation";

export type VisualizerProps = {
  audioSrc: string;
  audioDuration: number;
  layout: VisualizerLayout;
  backgroundSrc: string;
  bgIsVideo?: boolean;
  // Video background looping (set by calculateMetadata from background-config.json)
  bgLoopType?:             "standard" | "pingpong";
  bgReversedSrc?:          string;
  bgVideoDurationInFrames?: number;
  // Particles
  showParticles?: boolean;
  particleDirection?: ParticleDirection;
  particleSpeed?: number;
  particleCount?: number;
  particleOpacity?: number;
  // Visualizer customization (applies to bottom + solidwave)
  reflection?: boolean;
  waveDelay?: boolean;
  rumble?: boolean;
  layers?: boolean;
  // Color theme (1–6, defaults to 1 = Neon pink→blue)
  themeId?: number;
  // Built-in procedural texture effect (no files needed — pure code)
  // "grain" | "scanlines" | "light-leak" | "vhs" | "none"
  overlayType?: ProceduralOverlayType;
  overlayOpacity?: number;
  // Custom texture video upload (power-user alternative to overlayType)
  overlaySrc?: string;
  overlayBlendMode?: "screen" | "overlay" | "soft-light" | "multiply";
  overlayDurationInFrames?: number;
  // Artist / track name overlay
  artistName?: string;
  trackName?: string;
  reverseTitles?: boolean;
  showTitles?: boolean;
  fontFamily?: string;
  lines?: any[];
  showLyrics?: boolean;
  showVisualizer?: boolean;
  pulseMovement?: boolean;
  pulseFlash?: boolean;
  particlePulse?: boolean;
  showConstellationNames?: boolean;
  constellationDrawSpeed?: number;
  isExporting?: boolean;
  spectrumType?: "bass" | "wide";
  customColorA?: string;
  customColorB?: string;
} & Record<string, unknown>;

export const VisualizerMain: React.FC<VisualizerProps> = ({
  audioSrc,
  audioDuration,
  layout,
  backgroundSrc,
  bgIsVideo,
  bgLoopType,
  bgReversedSrc,
  bgVideoDurationInFrames,
  showParticles     = false,
  particleDirection,
  particleSpeed     = 1.0,
  particleCount     = 1.0,
  particleOpacity   = 1.0,
  reflection,                    // undefined = use layout default
  waveDelay         = false,
  rumble            = false,
  layers            = false,
  themeId,
  overlayType,
  overlaySrc,
  overlayBlendMode,
  overlayOpacity,
  overlayDurationInFrames,
  artistName,
  trackName,
  reverseTitles = false,
  showTitles = true,
  fontFamily = "Inter",
  lines = [],
  showLyrics = true,
  showVisualizer = true,
  pulseMovement = true,
  pulseFlash = true,
  particlePulse = true,
  showConstellationNames = true,
  constellationDrawSpeed = 1,
  isExporting = false,
  spectrumType = "wide",
  customColorA,
  customColorB,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const audioData = useAudioData(audioSrc as string);
  const currentTime = frame / fps;

  // Resolve theme colors — custom colors (from Vibe Match) override the theme
  const { colorA: themeColorA, colorB: themeColorB } = getThemeAtTime(themeId, currentTime);
  const colorA = customColorA ?? themeColorA;
  const colorB = customColorB ?? themeColorB;

  // SolidWave looks best mirrored by default; bars do not.
  const effectiveReflection = reflection ?? (layout === "solidwave");

  const { bassScale, beatFlash } = React.useMemo(() => {
    if (!audioData) return { bassScale: 1, beatFlash: 0 };

    // Raw transient detection
    const vizRaw    = visualizeAudio({ fps, frame, audioData, numberOfSamples: 32, smoothing: false });
    // Ultra-smooth sampling for movement (128 samples averages out jitter)
    const vizSmooth = visualizeAudio({ fps, frame, audioData, numberOfSamples: 128, smoothing: true  });
    
    const rawBass    = getBassEnergy(vizRaw);
    const smoothBass = getBassEnergy(vizSmooth);
    
    // Detect punchy transients for the flash
    const kickTransient = Math.max(0, rawBass - smoothBass - 0.10) * 3;

    return {
      bassScale: 1 + smoothBass * 0.035, // reduced from 0.06
      beatFlash: Math.min(1, kickTransient),
    };
  }, [audioData, frame, fps]);

  // Particle direction default varies by layout
  const particleDir: ParticleDirection =
    particleDirection ??
    (layout === "bottom" || layout === "audiogram" || layout === "dna" ? "up" :
     layout === "rings" || layout === "constellation" ? "in" : "out");

  // Shared props for bar-based layouts
  const barProps = { reflection: effectiveReflection, waveDelay, rumble, layers, colorA, colorB, spectrumType };

  // Beat flash uses colorA so it matches the theme (e.g. green pulse for Toxic theme)
  const flashColor = colorA;

  return (
    <AbsoluteFill style={{ background: "#080818" }}>
      <Audio src={audioSrc as string} />
      <VisualBackground
        bassScale={pulseMovement ? bassScale : 1}
        backgroundSrc={backgroundSrc as string}
        bgIsVideo={bgIsVideo}
        bgLoopType={bgLoopType}
        bgReversedSrc={bgReversedSrc as string | undefined}
        bgVideoDurationInFrames={bgVideoDurationInFrames}
        isExporting={isExporting}
      />

      {/* Built-in procedural texture (no files needed) */}
      {overlayType && overlayType !== "none" && (
        <ProceduralOverlay
          type={overlayType as ProceduralOverlayType}
          opacity={overlayOpacity}
          colorA={colorA}
          colorB={colorB}
        />
      )}

      {/* Custom texture video upload (power-user path) */}
      {overlaySrc && !overlayType && (
        <OverlayLayer
          overlaySrc={overlaySrc as string}
          overlayBlendMode={overlayBlendMode}
          overlayOpacity={overlayOpacity}
          overlayDurationInFrames={overlayDurationInFrames}
        />
      )}

      {showVisualizer && layout === "bottom"        && <BarEQ audioSrc={audioSrc as string} compact {...barProps} />}
      {showVisualizer && layout === "audiogram"     && <FullWidthBars audioSrc={audioSrc as string} reflection={effectiveReflection} colorA={colorA} colorB={colorB} />}
      {showVisualizer && layout === "solidwave"     && <SolidWave audioSrc={audioSrc as string} {...barProps} />}
      {showVisualizer && layout === "rings"         && <FrequencyRings audioSrc={audioSrc as string} colorA={colorA} colorB={colorB} spectrumType={spectrumType} />}
      {showVisualizer && layout === "echo"          && <EchoPulse audioSrc={audioSrc as string} layers={layers} colorA={colorA} colorB={colorB} reflection={effectiveReflection} spectrumType={spectrumType} />}
      {showVisualizer && layout === "echo-solid"    && <EchoPulse audioSrc={audioSrc as string} variant="solid" layers={layers} colorA={colorA} colorB={colorB} reflection={effectiveReflection} spectrumType={spectrumType} />}
      {showVisualizer && layout === "dna"           && <DNAHelix audioSrc={audioSrc as string} colorA={colorA} colorB={colorB} />}
      {showVisualizer && layout === "constellation" && <ConstellationNet audioSrc={audioSrc as string} colorA={colorA} colorB={colorB} seed={Math.floor((audioDuration as number) * 100)} showNames={showConstellationNames} drawSpeed={constellationDrawSpeed} spectrumType={spectrumType} />}

      {showParticles && (
        <Particles audioSrc={audioSrc as string} direction={particleDir} reactiveSpeed={particlePulse} speedMultiplier={particleSpeed} countMultiplier={particleCount} opacityMultiplier={particleOpacity} colorA={colorA} colorB={colorB} />
      )}

      {/* Lyrics Engine — independently toggled */}
      {showLyrics && (
        <LyricEngine
          lines={lines as any[]}
          audioDuration={audioDuration}
          bottomOffset={layout === "bottom" || layout === "audiogram" ? 320 : undefined}
          fontFamily={fontFamily}
          colorA={colorA}
        />
      )}

      {showTitles && artistName && trackName && (
        <ArtistBug artistName={artistName} trackName={trackName} size="full" reverseTitles={reverseTitles} fontFamily={fontFamily} colorA={colorA} colorB={colorB} />
      )}

      {pulseFlash && beatFlash > 0.05 && (
        <AbsoluteFill
          style={{
            background: `${flashColor}${Math.round(beatFlash * 0.08 * 255).toString(16).padStart(2, "0")}`,
            mixBlendMode: "screen",
            pointerEvents: "none",
          }}
        />
      )}
    </AbsoluteFill>
  );
};
