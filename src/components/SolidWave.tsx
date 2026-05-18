import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { useAudioData, visualizeAudio } from "@remotion/media-utils";
import { getMusicViz } from "../utils/audioColor";

// Smooth filled waveform — the "Solid Flat" style.
// Renders a smooth bezier curve filled below it (mountain/wave shape).
// Supports the same customization options as BarEQ.

export interface SolidWaveProps {
  audioSrc: string;
  reflection?: boolean;
  waveDelay?: boolean;
  rumble?: boolean;
  layers?: boolean;
  colorA?: string;  // left / bass color  (default: #FF2D9B)
  colorB?: string;  // right / treble color (default: #00B4FF)
  spectrumType?: "bass" | "wide";
  yOffset?: number; // vertical shift in SVG units (positive = down)
}

const NUM_BARS          = 96;   // more points = smoother curve
const CANVAS_W          = 1920;
const CANVAS_H          = 1080;
const CENTER_Y          = 540;  // vertically centered for standalone use
const MAX_H             = 280;  // max wave height above / below center
const MARGIN            = 210;  // horizontal margin — keeps wave at ~75% of screen width
const DELAY_STEPS       = 5;
const MAX_DELAY_FRAMES  = 14;

function buildBandPeaks(
  audioData: ReturnType<typeof useAudioData>,
  fps: number,
  spectrumType: "bass" | "wide" = "wide",
): number[] {
  if (!audioData) return new Array(NUM_BARS).fill(0.1);
  const total = Math.floor(audioData.durationInSeconds * fps);
  const pcts  = Array.from({ length: 15 }, (_, k) => (k + 1) / 16);
  const refs  = pcts.map((pct) =>
    getMusicViz(
      visualizeAudio({
        fps,
        frame: Math.max(0, Math.min(Math.floor(pct * total), total - 1)),
        audioData,
        numberOfSamples: 256,
        smoothing: false,
      }),
      NUM_BARS,
      spectrumType,
    ),
  );
  return Array.from({ length: NUM_BARS }, (_, i) =>
    Math.max(...refs.map((r) => r[i] ?? 0), 0.08),
  );
}

// Catmull-Rom to cubic bezier smooth path through evenly-spaced X points.
// Returns an SVG `d` string for the filled shape, closed at `closeY`.
function buildSmoothPath(
  ys: number[],
  xs: number[],
  closeY: number,
): string {
  const n = xs.length;
  if (n < 2) return "";

  let d = `M ${xs[0]!.toFixed(1)} ${closeY} L ${xs[0]!.toFixed(1)} ${ys[0]!.toFixed(1)}`;

  for (let i = 0; i < n - 1; i++) {
    const x0 = xs[Math.max(0, i - 1)]!;
    const x1 = xs[i]!;
    const x2 = xs[i + 1]!;
    const x3 = xs[Math.min(n - 1, i + 2)]!;

    const y0 = ys[Math.max(0, i - 1)]!;
    const y1 = ys[i]!;
    const y2 = ys[i + 1]!;
    const y3 = ys[Math.min(n - 1, i + 2)]!;

    // Catmull-Rom → cubic bezier control points
    const cp1x = x1 + (x2 - x0) / 6;
    const cp1y = y1 + (y2 - y0) / 6;
    const cp2x = x2 - (x3 - x1) / 6;
    const cp2y = y2 - (y3 - y1) / 6;

    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  }

  d += ` L ${xs[n - 1]!.toFixed(1)} ${closeY} Z`;
  return d;
}

export const SolidWave: React.FC<SolidWaveProps> = ({
  audioSrc,
  reflection = true,   // mirrored by default — one-sided centered wave looks off
  waveDelay  = false,
  rumble     = false,
  layers     = false,
  colorA     = "#FF2D9B",
  colorB     = "#00B4FF",
  spectrumType = "wide",
  yOffset    = 0,
}) => {
  const frame     = useCurrentFrame();
  const { fps }   = useVideoConfig();
  const audioData = useAudioData(audioSrc);

  const bandPeaks = React.useMemo(
    () => buildBandPeaks(audioData, fps, spectrumType),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [audioData, fps, spectrumType],
  );

  if (!audioData) return null;

  const t = frame / fps;

  const STEP    = (CANVAS_W - MARGIN * 2) / (NUM_BARS - 1);
  const xs      = Array.from({ length: NUM_BARS }, (_, i) => MARGIN + i * STEP);
  const cy      = CENTER_Y + yOffset;

  // ── Audio sampling ────────────────────────────────────────────────────────
  const getViz = (f: number) =>
    getMusicViz(
      visualizeAudio({ fps, frame: Math.max(0, f), audioData, numberOfSamples: 256, smoothing: true }),
      NUM_BARS,
      spectrumType,
    );

  const currentViz = getViz(frame);
  const delayedVizs: number[][] | null = waveDelay
    ? Array.from({ length: DELAY_STEPS }, (_, k) =>
        k === 0 ? currentViz : getViz(frame - Math.round((k / (DELAY_STEPS - 1)) * MAX_DELAY_FRAMES))
      )
    : null;

  // ── Per-bar visualization values ─────────────────────────────────────────
  const visualization = Array.from({ length: NUM_BARS }, (_, i) => {
    let raw: number;
    if (delayedVizs) {
      const distFromCenter = Math.abs(i - (NUM_BARS - 1) / 2) / ((NUM_BARS - 1) / 2);
      const sampleIdx = Math.min(DELAY_STEPS - 1, Math.round(distFromCenter * (DELAY_STEPS - 1)));
      raw = delayedVizs[sampleIdx]?.[i] ?? 0;
    } else {
      raw = currentViz[i] ?? 0;
    }

    const peak        = bandPeaks[i] ?? 0.08;
    const normed      = (raw / peak) * 0.55;
    const rumbleNoise = rumble ? Math.sin(frame * 13.7 + i * 3.9) * 0.03 : 0;
    const ambient     = 0.012 + 0.01 * Math.sin(t * 2.8 + i * 0.35);
    // Soft saturation above 0.7 — wave curves up but never hits a hard ceiling
    const rawVal = normed + rumbleNoise;
    const softVal = rawVal <= 0.7 ? rawVal : 0.7 + (rawVal - 0.7) * 0.22;
    // Edge taper — wave fades to 0 at left/right margins instead of a hard vertical cut
    const edgeT    = i / (NUM_BARS - 1);
    const edgeFade = Math.min(1, edgeT * 9, (1 - edgeT) * 9);
    return Math.max(ambient * edgeFade, softVal * edgeFade);
  });

  const bassEnergy = visualization.slice(0, 4).reduce((a: number, b: number) => a + b, 0) / 4;
  const glowSize   = 4 + bassEnergy * 12;

  // ── Build SVG paths ───────────────────────────────────────────────────────
  const ysTop     = visualization.map((v) => cy - v * MAX_H);
  const ysLayer   = visualization.map((v) => cy - v * MAX_H * 0.75);
  const ysRefl    = visualization.map((v) => cy + v * MAX_H * 0.6);
  const ysRLayer  = visualization.map((v) => cy + v * MAX_H * 0.6 * 0.75);

  const pathMain   = buildSmoothPath(ysTop,    xs, cy);
  const pathLayer  = layers     ? buildSmoothPath(ysLayer,  xs, cy) : "";
  const pathRefl   = reflection ? buildSmoothPath(ysRefl,   xs, cy) : "";
  const pathRLayer = (reflection && layers) ? buildSmoothPath(ysRLayer, xs, cy) : "";

  return (
    <svg
      style={{
        position: "absolute", inset: 0,
        width: "100%", height: "100%",
        overflow: "visible", pointerEvents: "none",
      }}
      viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Glow filter */}
        <filter id="sw-glow" x="-20%" y="-40%" width="140%" height="180%">
          <feGaussianBlur stdDeviation={glowSize} result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Primary gradient: colorA left → colorB right */}
        <linearGradient id="sw-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor={colorA} />
          <stop offset="100%" stopColor={colorB} />
        </linearGradient>


        {/* Subtle dark vignette behind the wave */}
        <radialGradient id="sw-bg" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="rgba(8,8,24,0.4)" />
          <stop offset="100%" stopColor="rgba(8,8,24,0)"   />
        </radialGradient>
      </defs>

      {/* Background vignette */}
      <ellipse
        cx={CANVAS_W / 2} cy={cy}
        rx={CANVAS_W * 0.55} ry={MAX_H * 1.6}
        fill="url(#sw-bg)"
      />

      <g filter="url(#sw-glow)">
        {/* Reflection (below center) — same gradient + opacity as primary */}
        {reflection && (
          <>
            <path d={pathRefl} fill="url(#sw-grad)" opacity={layers ? 0.75 : 0.92} />
            {layers && <path d={pathRLayer} fill="rgba(255,255,255,0.78)" />}
          </>
        )}

        {/* Primary wave (above center) */}
        <path d={pathMain} fill="url(#sw-grad)" opacity={layers ? 0.75 : 0.92} />

        {/* Bright inner layer */}
        {layers && <path d={pathLayer} fill="rgba(255,255,255,0.78)" />}
      </g>

      {/* Center line — subtle anchor */}
      <line
        x1={MARGIN} y1={cy}
        x2={CANVAS_W - MARGIN} y2={cy}
        stroke="rgba(255,255,255,0.1)" strokeWidth={1}
      />
    </svg>
  );
};
