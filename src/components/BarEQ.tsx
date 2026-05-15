import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { useAudioData, visualizeAudio } from "@remotion/media-utils";
import { getFreqColor, getMusicViz } from "../utils/audioColor";

export interface BarEQProps {
  audioSrc: string;
  compact?: boolean;
  // ── Customization options ─────────────────────────────────────────────────
  reflection?: boolean; // mirror bars below the center line
  waveDelay?: boolean;  // bars ripple outward from center (cascade effect)
  rumble?: boolean;     // subtle deterministic per-bar jitter — feels alive
  layers?: boolean;     // render a bright white inner layer on top of colored bars
  // ── Theme colors ──────────────────────────────────────────────────────────
  colorA?: string;      // bass / left-side color (default: hot pink #FF2D9B)
  colorB?: string;      // treble / right-side color (default: electric blue #00B4FF)
}

const NUM_BARS = 64;
const CANVAS_W = 1920;

// Number of frame-offset samples used to create the wave delay ripple.
// More steps = smoother wave, but more visualizeAudio calls per frame.
const DELAY_STEPS       = 5;
const MAX_DELAY_FRAMES  = 14; // max frame offset at the outermost bars

function buildBandPeaks(
  audioData: ReturnType<typeof useAudioData>,
  fps: number,
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
    ),
  );
  return Array.from({ length: NUM_BARS }, (_, i) =>
    Math.max(...refs.map((r) => r[i] ?? 0), 0.08),
  );
}

export const BarEQ: React.FC<BarEQProps> = ({
  audioSrc,
  compact    = false,
  reflection = false,
  waveDelay  = false,
  rumble     = false,
  layers     = false,
  colorA     = "#FF2D9B",
  colorB     = "#00B4FF",
}) => {
  const frame     = useCurrentFrame();
  const { fps }   = useVideoConfig();
  const audioData = useAudioData(audioSrc);

  const bandPeaks = React.useMemo(
    () => buildBandPeaks(audioData, fps),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [audioData, fps],
  );

  if (!audioData) return null;

  const BAR_W   = compact ? 11 : 18;
  const BAR_GAP = compact ? 5  : 7;
  const MAX_H   = compact ? 200 : 420;
  const TOTAL_W = NUM_BARS * (BAR_W + BAR_GAP) - BAR_GAP;
  const START_X = (CANVAS_W - TOTAL_W) / 2;

  // Shift center up a bit when reflection is on so mirror bars stay on-canvas
  const CENTER_Y = reflection
    ? (compact ? 870 : 820)
    : (compact ? 930 : 930);

  const t = frame / fps;

  // ── Audio sampling ────────────────────────────────────────────────────────
  // Wave delay: pre-sample audio at DELAY_STEPS evenly-spaced frame offsets.
  // Bar i picks sample based on its distance from center → ripple effect.
  const getViz = (f: number) =>
    getMusicViz(
      visualizeAudio({ fps, frame: Math.max(0, f), audioData, numberOfSamples: 256, smoothing: true }),
      NUM_BARS,
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
      // Distance from center: 0 at middle bars, 1 at outermost bars
      const distFromCenter = Math.abs(i - (NUM_BARS - 1) / 2) / ((NUM_BARS - 1) / 2);
      const sampleIdx = Math.min(DELAY_STEPS - 1, Math.round(distFromCenter * (DELAY_STEPS - 1)));
      raw = delayedVizs[sampleIdx]?.[i] ?? 0;
    } else {
      raw = currentViz[i] ?? 0;
    }

    const peak        = bandPeaks[i] ?? 0.08;
    const normed      = (raw / peak) * 0.80;
    const rumbleNoise = rumble ? Math.sin(frame * 13.7 + i * 3.9) * 0.04 : 0;
    const ambient     = 0.015 + 0.015 * Math.sin(t * 3 + i * 0.45);
    return Math.max(ambient, normed + rumbleNoise);
  });

  const bassEnergy = visualization.slice(0, 4).reduce((a: number, b: number) => a + b, 0) / 4;
  const glowSize   = 3 + bassEnergy * 10;

  // ── Build bar elements ────────────────────────────────────────────────────
  const bars: React.ReactNode[] = [];

  for (let i = 0; i < NUM_BARS; i++) {
    const value = visualization[i] ?? 0;
    const h     = value * MAX_H;
    const x     = START_X + i * (BAR_W + BAR_GAP);
    const color = getFreqColor(i, NUM_BARS, colorA, colorB);

    // Primary colored bar (upward)
    bars.push(
      <rect
        key={`bar-${i}`}
        x={x} y={CENTER_Y - h}
        width={BAR_W} height={Math.max(h, 1)}
        fill={color} rx={3}
        opacity={layers ? 0.72 : (compact ? 0.8 : 0.95)}
      />,
    );

    // Dual layers: bright white inner bar sits on top at 75% height
    if (layers) {
      bars.push(
        <rect
          key={`layer-${i}`}
          x={x} y={CENTER_Y - h * 0.75}
          width={BAR_W} height={Math.max(h * 0.75, 1)}
          fill="rgba(255,255,255,0.82)" rx={3}
        />,
      );
    }

    // Reflection: mirror bars below the center line
    if (reflection) {
      const rh = h * 0.62;
      if (rh > 0.5) {
        bars.push(
          <rect
            key={`refl-${i}`}
            x={x} y={CENTER_Y}
            width={BAR_W} height={rh}
            fill={color} rx={3}
            opacity={0.42}
          />,
        );
        if (layers) {
          bars.push(
            <rect
              key={`refl-layer-${i}`}
              x={x} y={CENTER_Y}
              width={BAR_W} height={rh * 0.75}
              fill="rgba(255,255,255,0.35)" rx={3}
            />,
          );
        }
      }
    }
  }

  return (
    <svg
      style={{
        position: "absolute", inset: 0,
        width: "100%", height: "100%",
        overflow: "visible", pointerEvents: "none",
      }}
      viewBox={`0 0 ${CANVAS_W} 1080`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <filter id="bar-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation={glowSize} result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <linearGradient id="bar-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="rgba(8,8,24,0)"    />
          <stop offset="60%"  stopColor="rgba(8,8,24,0.55)" />
          <stop offset="100%" stopColor="rgba(8,8,24,0.7)"  />
        </linearGradient>
      </defs>

      {/* Background gradient + baseline — full mode only, no reflection clutter */}
      {!compact && !reflection && (
        <>
          <rect
            x={0} y={CENTER_Y - MAX_H - 40}
            width={CANVAS_W} height={MAX_H + 40 + MAX_H * 0.4 + 40}
            fill="url(#bar-bg)"
          />
          <line
            x1={START_X - 20} y1={CENTER_Y}
            x2={START_X + TOTAL_W + 20} y2={CENTER_Y}
            stroke="rgba(255,255,255,0.12)" strokeWidth={1}
          />
        </>
      )}

      <g filter="url(#bar-glow)">{bars}</g>
    </svg>
  );
};
