import React from "react";
import { AbsoluteFill } from "remotion";
import { Audio } from "@remotion/media";
import { VisualBackground } from "./components/VisualBackground";
import { Particles } from "./components/Particles";
import { ArtistBug } from "./components/ArtistBug";
import { LyricEngine } from "./components/LyricEngine";
import { AudioWaveform } from "./components/AudioWaveform";
import { OverlayLayer } from "./components/OverlayLayer";
import { ProceduralOverlay } from "./components/ProceduralOverlay";
import type { ProceduralOverlayType } from "./components/ProceduralOverlay";
import type { LrcLine } from "./utils/parseLrc";

export type MainProps = {
  lines: LrcLine[];
  audioDuration: number;
  audioSrc: string;
  backgroundSrc: string;
  bgLoopType?: "standard" | "pingpong";
  bgReversedSrc?: string;
  bgVideoDurationInFrames?: number;
  // Built-in procedural texture effect (no files needed)
  overlayType?: ProceduralOverlayType;
  overlayOpacity?: number;
  // Custom texture video upload (power-user path)
  overlaySrc?: string;
  overlayBlendMode?: "screen" | "overlay" | "soft-light" | "multiply";
  overlayDurationInFrames?: number;
  showWaveform?: boolean;
  showParticles?: boolean;
  artistName?: string;
  trackName?: string;
  reverseTitles?: boolean;
  showTitles?: boolean;
  fontFamily?: string;
} & Record<string, unknown>;

export const Main: React.FC<MainProps> = ({
  lines = [],
  audioDuration,
  audioSrc,
  backgroundSrc,
  bgLoopType,
  bgReversedSrc,
  bgVideoDurationInFrames,
  overlayType,
  overlaySrc,
  overlayBlendMode,
  overlayOpacity,
  overlayDurationInFrames,
  showWaveform = false,
  showParticles = true,
  artistName,
  trackName,
  reverseTitles = false,
  showTitles = true,
  fontFamily = "Inter",
}) => {
  return (
    <AbsoluteFill style={{ background: "#080818" }}>
      <Audio src={audioSrc as string} />
      
      <VisualBackground
        bassScale={1}
        backgroundSrc={backgroundSrc as string}
        bgLoopType={bgLoopType}
        bgReversedSrc={bgReversedSrc as string | undefined}
        bgVideoDurationInFrames={bgVideoDurationInFrames}
      />

      {overlayType && overlayType !== "none" && (
        <ProceduralOverlay
          type={overlayType as ProceduralOverlayType}
          opacity={overlayOpacity}
          colorA="#FF2D9B"
          colorB="#00B4FF"
        />
      )}

      {overlaySrc && !overlayType && (
        <OverlayLayer
          overlaySrc={overlaySrc as string}
          overlayBlendMode={overlayBlendMode}
          overlayOpacity={overlayOpacity}
          overlayDurationInFrames={overlayDurationInFrames}
        />
      )}

      {showParticles && (
        <Particles audioSrc={audioSrc as string} direction="up" reactiveSpeed colorA="#FF2D9B" colorB="#00B4FF" />
      )}

      {showWaveform && (
        <div style={{ position: "absolute", bottom: 100, width: "100%" }}>
          <AudioWaveform audioSrc={audioSrc as string} />
        </div>
      )}

      <LyricEngine lines={lines} audioDuration={audioDuration} fontFamily={fontFamily} />

      {showTitles && artistName && trackName && (
        <ArtistBug artistName={artistName} trackName={trackName} size="small" reverseTitles={reverseTitles} fontFamily={fontFamily} />
      )}
    </AbsoluteFill>
  );
};
