import React from "react";
import { Composition, staticFile } from "remotion";
import { getAudioDurationInSeconds, getVideoMetadata } from "@remotion/media-utils";
import { loadLyrics } from "./utils/parseLrc";
import { Main } from "./Main";
import type { MainProps } from "./Main";
import { VisualizerMain } from "./VisualizerMain";
import type { VisualizerProps, VisualizerLayout } from "./VisualizerMain";
import type { ParticleDirection } from "./components/Particles";

const FPS = 30;
const FALLBACK_DURATION_S = 30;

async function getAudioSrcAndDuration(): Promise<{ src: string; duration: number }> {
  for (const name of ["audio.wav", "audio.mp3", "audio.flac", "audio.aac", "audio.ogg", "audio.m4a"]) {
    try {
      const duration = await getAudioDurationInSeconds(staticFile(name));
      return { src: staticFile(name), duration };
    } catch { /* try next */ }
  }
  console.warn("No audio file found — using 30s fallback");
  return { src: staticFile("audio.wav"), duration: FALLBACK_DURATION_S };
}

async function getAudioMetadata(inputProps: Record<string, unknown> = {}) {
  if (inputProps.audioSrc && typeof inputProps.audioSrc === "string") {
    const src = inputProps.audioSrc;
    const duration = inputProps.audioDuration ? Number(inputProps.audioDuration) : FALLBACK_DURATION_S;
    return { durationInFrames: Math.ceil((duration + 1) * FPS), src, duration };
  }

  const { src, duration } = await getAudioSrcAndDuration();
  return { durationInFrames: Math.ceil((duration + 1) * FPS), src, duration };
}

type BackgroundInfo = {
  src: string;
  bgLoopType?:             "standard" | "pingpong";
  bgReversedSrc?:          string;
  bgVideoDurationInFrames?: number;
};

async function getBackgroundInfo(inputProps: Record<string, unknown> = {}): Promise<BackgroundInfo> {
  if (inputProps.backgroundSrc && typeof inputProps.backgroundSrc === "string") {
    return { src: inputProps.backgroundSrc };
  }

  try {
    const res = await fetch(staticFile("background-config.json"));
    if (!res.ok) return { src: staticFile("background.png") };

    const cfg = await res.json() as {
      file: string;
      loopType?: string;
      reversedFile?: string;
    };

    const src       = staticFile(cfg.file);
    const loopType  = cfg.loopType as "standard" | "pingpong" | undefined;

    if (!loopType) return { src };   // image background — no extra props needed

    // Video background — get duration so VisualBackground can build loop sequences
    try {
      const meta = await getVideoMetadata(src);
      const bgVideoDurationInFrames = Math.round(meta.durationInSeconds * FPS);
      const bgReversedSrc = cfg.reversedFile ? staticFile(cfg.reversedFile) : undefined;
      return { src, bgLoopType: loopType, bgReversedSrc, bgVideoDurationInFrames };
    } catch {
      // getVideoMetadata failed (unsupported format?) — fall back to simple standard loop
      return { src, bgLoopType: "standard" };
    }
  } catch { /* fall through */ }
  return { src: staticFile("background.png") };
}

async function getLyrics(inputProps: Record<string, unknown> = {}) {
  if (inputProps.lines && Array.isArray(inputProps.lines)) {
    return inputProps.lines;
  }

  try {
    const res = await fetch(staticFile("lyrics-config.json"));
    if (res.ok) {
      const cfg = await res.json() as { file: string };
      if (cfg.file === "none") return [];
      return loadLyrics(staticFile(cfg.file));
    }
  } catch { /* fall through */ }
  return [];
}

type CustomizationProps = {
  reflection?:        boolean;
  waveDelay?:         boolean;
  rumble?:            boolean;
  layers?:            boolean;
  particleDirection?: ParticleDirection;
  themeId?:           number;
  artistName?:        string;
  trackName?:         string;
};

// Pull customization flags forwarded from the CLI --props JSON.
// Booleans return undefined when absent so component-level layout defaults
// (e.g. SolidWave defaults reflection=true) are not clobbered.
function extractCustomization(inputProps: Record<string, unknown>): CustomizationProps {
  const out: CustomizationProps = {};
  if (inputProps["reflection"]        !== undefined) out.reflection        = Boolean(inputProps["reflection"]);
  if (inputProps["waveDelay"]         !== undefined) out.waveDelay         = Boolean(inputProps["waveDelay"]);
  if (inputProps["rumble"]            !== undefined) out.rumble            = Boolean(inputProps["rumble"]);
  if (inputProps["layers"]            !== undefined) out.layers            = Boolean(inputProps["layers"]);
  if (inputProps["particleDirection"] !== undefined) out.particleDirection = inputProps["particleDirection"] as ParticleDirection;
  if (inputProps["themeId"]           !== undefined) out.themeId           = Number(inputProps["themeId"]);
  if (inputProps["artistName"]        !== undefined) out.artistName        = inputProps["artistName"] as string;
  if (inputProps["trackName"]         !== undefined) out.trackName         = inputProps["trackName"]  as string;
  return out;
}

// Helper: build VisualizerProps for a given layout, forwarding customization
async function buildVisualizerProps(
  layout: VisualizerLayout,
  showParticles: boolean,
  inputProps: Record<string, unknown>,
): Promise<{ props: VisualizerProps; durationInFrames: number }> {
  const { src, duration, durationInFrames } = await getAudioMetadata(inputProps);
  const bgInfo  = await getBackgroundInfo(inputProps);
  const custom  = extractCustomization(inputProps);
  const props: VisualizerProps = {
    audioSrc: src, audioDuration: duration,
    layout, backgroundSrc: bgInfo.src, showParticles,
    bgLoopType:              bgInfo.bgLoopType,
    bgReversedSrc:           bgInfo.bgReversedSrc,
    bgVideoDurationInFrames: bgInfo.bgVideoDurationInFrames,
    ...custom,
  };
  return { props, durationInFrames };
}

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* ── Lyric Only ─────────────────────────────────────────────── */}
      <Composition
        id="LyricOnly"
        component={Main}
        fps={FPS} width={1920} height={1080}
        defaultProps={{
          lines: [], audioDuration: FALLBACK_DURATION_S,
          audioSrc: staticFile("audio.wav"),
          backgroundSrc: staticFile("background.png"),
          showWaveform: false, showParticles: true,
        }}
        calculateMetadata={async ({ props }) => {
          const inputProps = props as Record<string, unknown>;
          const { src, duration, durationInFrames } = await getAudioMetadata(inputProps);
          const bgInfo  = await getBackgroundInfo(inputProps);
          const lines   = await getLyrics(inputProps);
          
          const { artistName, trackName } = extractCustomization(inputProps);
          const mainProps: MainProps = {
            lines, audioDuration: duration, audioSrc: src,
            backgroundSrc:           bgInfo.src,
            bgLoopType:              bgInfo.bgLoopType,
            bgReversedSrc:           bgInfo.bgReversedSrc,
            bgVideoDurationInFrames: bgInfo.bgVideoDurationInFrames,
            showWaveform: false, showParticles: true,
            ...(artistName ? { artistName } : {}),
            ...(trackName  ? { trackName  } : {}),
          };
          return { durationInFrames, props: mainProps };
        }}
      />

      {/* ── Bars ───────────────────────────────────────────────────── */}
      <Composition
        id="VisualizerBottom"
        component={VisualizerMain}
        fps={FPS} width={1920} height={1080}
        defaultProps={{ audioSrc: staticFile("audio.wav"), audioDuration: FALLBACK_DURATION_S, layout: "bottom" as VisualizerLayout, backgroundSrc: staticFile("background.png"), showParticles: false }}
        calculateMetadata={async ({ props }) => buildVisualizerProps("bottom", false, props as Record<string, unknown>)}
      />

      {/* ── Solid Wave ─────────────────────────────────────────────── */}
      <Composition
        id="SolidWave"
        component={VisualizerMain}
        fps={FPS} width={1920} height={1080}
        defaultProps={{ audioSrc: staticFile("audio.wav"), audioDuration: FALLBACK_DURATION_S, layout: "solidwave" as VisualizerLayout, backgroundSrc: staticFile("background.png"), showParticles: false }}
        calculateMetadata={async ({ props }) => buildVisualizerProps("solidwave", false, props as Record<string, unknown>)}
      />

      {/* ── Frequency Rings ────────────────────────────────────────── */}
      <Composition
        id="FrequencyRings"
        component={VisualizerMain}
        fps={FPS} width={1920} height={1080}
        defaultProps={{ audioSrc: staticFile("audio.wav"), audioDuration: FALLBACK_DURATION_S, layout: "rings" as VisualizerLayout, backgroundSrc: staticFile("background.png"), showParticles: false }}
        calculateMetadata={async ({ props }) => buildVisualizerProps("rings", false, props as Record<string, unknown>)}
      />

      {/* ── Echo Pulse ─────────────────────────────────────────────── */}
      <Composition
        id="EchoPulse"
        component={VisualizerMain}
        fps={FPS} width={1920} height={1080}
        defaultProps={{ audioSrc: staticFile("audio.wav"), audioDuration: FALLBACK_DURATION_S, layout: "echo" as VisualizerLayout, backgroundSrc: staticFile("background.png"), showParticles: false }}
        calculateMetadata={async ({ props }) => buildVisualizerProps("echo", false, props as Record<string, unknown>)}
      />

      {/* ── + Particles variants ───────────────────────────────────── */}
      <Composition
        id="VisualizerBottomParticles"
        component={VisualizerMain}
        fps={FPS} width={1920} height={1080}
        defaultProps={{ audioSrc: staticFile("audio.wav"), audioDuration: FALLBACK_DURATION_S, layout: "bottom" as VisualizerLayout, backgroundSrc: staticFile("background.png"), showParticles: true }}
        calculateMetadata={async ({ props }) => buildVisualizerProps("bottom", true, props as Record<string, unknown>)}
      />

      <Composition
        id="SolidWaveParticles"
        component={VisualizerMain}
        fps={FPS} width={1920} height={1080}
        defaultProps={{ audioSrc: staticFile("audio.wav"), audioDuration: FALLBACK_DURATION_S, layout: "solidwave" as VisualizerLayout, backgroundSrc: staticFile("background.png"), showParticles: true }}
        calculateMetadata={async ({ props }) => buildVisualizerProps("solidwave", true, props as Record<string, unknown>)}
      />

      <Composition
        id="FrequencyRingsParticles"
        component={VisualizerMain}
        fps={FPS} width={1920} height={1080}
        defaultProps={{ audioSrc: staticFile("audio.wav"), audioDuration: FALLBACK_DURATION_S, layout: "rings" as VisualizerLayout, backgroundSrc: staticFile("background.png"), showParticles: true }}
        calculateMetadata={async ({ props }) => buildVisualizerProps("rings", true, props as Record<string, unknown>)}
      />

      <Composition
        id="EchoPulseParticles"
        component={VisualizerMain}
        fps={FPS} width={1920} height={1080}
        defaultProps={{ audioSrc: staticFile("audio.wav"), audioDuration: FALLBACK_DURATION_S, layout: "echo" as VisualizerLayout, backgroundSrc: staticFile("background.png"), showParticles: true }}
        calculateMetadata={async ({ props }) => buildVisualizerProps("echo", true, props as Record<string, unknown>)}
      />

      {/* ── Echo Pulse Solid ───────────────────────────────────────── */}
      <Composition
        id="EchoPulseSolid"
        component={VisualizerMain}
        fps={FPS} width={1920} height={1080}
        defaultProps={{ audioSrc: staticFile("audio.wav"), audioDuration: FALLBACK_DURATION_S, layout: "echo-solid" as VisualizerLayout, backgroundSrc: staticFile("background.png"), showParticles: false }}
        calculateMetadata={async ({ props }) => buildVisualizerProps("echo-solid", false, props as Record<string, unknown>)}
      />

      <Composition
        id="EchoPulseSolidParticles"
        component={VisualizerMain}
        fps={FPS} width={1920} height={1080}
        defaultProps={{ audioSrc: staticFile("audio.wav"), audioDuration: FALLBACK_DURATION_S, layout: "echo-solid" as VisualizerLayout, backgroundSrc: staticFile("background.png"), showParticles: true }}
        calculateMetadata={async ({ props }) => buildVisualizerProps("echo-solid", true, props as Record<string, unknown>)}
      />

      {/* ── DNA Helix ──────────────────────────────────────────────── */}
      <Composition
        id="DNAHelix"
        component={VisualizerMain}
        fps={FPS} width={1920} height={1080}
        defaultProps={{ audioSrc: staticFile("audio.wav"), audioDuration: FALLBACK_DURATION_S, layout: "dna" as VisualizerLayout, backgroundSrc: staticFile("background.png"), showParticles: false }}
        calculateMetadata={async ({ props }) => buildVisualizerProps("dna", false, props as Record<string, unknown>)}
      />

      <Composition
        id="DNAHelixParticles"
        component={VisualizerMain}
        fps={FPS} width={1920} height={1080}
        defaultProps={{ audioSrc: staticFile("audio.wav"), audioDuration: FALLBACK_DURATION_S, layout: "dna" as VisualizerLayout, backgroundSrc: staticFile("background.png"), showParticles: true }}
        calculateMetadata={async ({ props }) => buildVisualizerProps("dna", true, props as Record<string, unknown>)}
      />

      {/* ── Constellation Net ──────────────────────────────────────── */}
      <Composition
        id="ConstellationNet"
        component={VisualizerMain}
        fps={FPS} width={1920} height={1080}
        defaultProps={{ audioSrc: staticFile("audio.wav"), audioDuration: FALLBACK_DURATION_S, layout: "constellation" as VisualizerLayout, backgroundSrc: staticFile("background.png"), showParticles: false }}
        calculateMetadata={async ({ props }) => buildVisualizerProps("constellation", false, props as Record<string, unknown>)}
      />

      <Composition
        id="ConstellationNetParticles"
        component={VisualizerMain}
        fps={FPS} width={1920} height={1080}
        defaultProps={{ audioSrc: staticFile("audio.wav"), audioDuration: FALLBACK_DURATION_S, layout: "constellation" as VisualizerLayout, backgroundSrc: staticFile("background.png"), showParticles: true }}
        calculateMetadata={async ({ props }) => buildVisualizerProps("constellation", true, props as Record<string, unknown>)}
      />
    </>
  );
};
