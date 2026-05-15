import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { useAudioData, visualizeAudio } from "@remotion/media-utils";
import { getMusicViz, getFreqColor, getBassEnergy } from "../utils/audioColor";

// ── Config ────────────────────────────────────────────────────────────────────
const NUM_BARS  = 160;          // more bars = denser, audiogram-style
const CANVAS_W  = 1920;
const CANVAS_H  = 1080;
const BAR_UNIT  = CANVAS_W / NUM_BARS;  // 12 px per slot
const BAR_W     = BAR_UNIT - 2;         // 10 px bar, 2 px gap
const MAX_H     = 300;                  // tallest a bar can get (px)
const BASELINE  = 1080;                 // y-coordinate of the floor line (flush to bottom edge)
const REFL_MAX  = 90;                   // max reflection height below baseline

// ── Band-peak normalization ───────────────────────────────────────────────────
// Pre-scan the track at 15 representative frames and build a per-band ceiling.
// This makes quiet high-frequency bands actually move, not sit flat.
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

// ── Component ─────────────────────────────────────────────────────────────────
export interface FullWidthBarsProps {
  audioSrc:    string;
  colorA?:     string;
  colorB?:     string;
  reflection?: boolean;   // mirror bars below baseline (default true)
}

export const FullWidthBars: React.FC<FullWidthBarsProps> = ({
  audioSrc,
  colorA     = "#FF2D9B",
  colorB     = "#00B4FF",
  reflection = true,
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

  // Current-frame visualization
  const viz = getMusicViz(
    visualizeAudio({ fps, frame, audioData, numberOfSamples: 256, smoothing: true }),
    NUM_BARS,
  );

  const bassEnergy = getBassEnergy(viz);
  const glowSize   = 3 + bassEnergy * 14;

  // ── Build bar geometry ────────────────────────────────────────────────────
  const mainBars: React.ReactNode[] = [];
  const reflBars: React.ReactNode[] = [];

  for (let i = 0; i < NUM_BARS; i++) {
    const peak    = bandPeaks[i] ?? 0.08;
    const raw     = viz[i] ?? 0;
    // Normalize to peak, scale to 0.65 so there's always headroom
    const normed  = (raw / peak) * 0.65;
    // Tiny ambient pulse so bars are never completely dead
    const ambient = 0.015 + 0.012 * Math.sin(frame * 0.06 + i * 0.38);
    const value   = Math.max(ambient, Math.min(1, normed));

    const h     = value * MAX_H;
    const x     = i * BAR_UNIT;
    const color = getFreqColor(i, NUM_BARS, colorA, colorB);

    // Main bar — upward from baseline
    mainBars.push(
      <rect
        key={`b${i}`}
        x={x}
        y={BASELINE - h}
        width={BAR_W}
        height={Math.max(h, 2)}
        fill={color}
        rx={1}
        opacity={0.92}
      />,
    );

    // Reflection — downward, fades at REFL_MAX
    if (reflection) {
      const rh = Math.min(h * 0.38, REFL_MAX);
      if (rh > 1) {
        reflBars.push(
          <rect
            key={`r${i}`}
            x={x}
            y={BASELINE + 1}
            width={BAR_W}
            height={rh}
            fill={color}
            rx={1}
            opacity={0.22}
          />,
        );
      }
    }
  }

  // ── SVG gradients / geometry ──────────────────────────────────────────────
  const scrimTop    = BASELINE - MAX_H - 40;
  const scrimHeight = MAX_H + REFL_MAX + 80;

  return (
    <svg
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        overflow: "visible",
        pointerEvents: "none",
      }}
      viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Glow filter — spread up/down from bars, not left/right */}
        <filter id="fw-glow" x="-1%" y="-60%" width="102%" height="220%">
          <feGaussianBlur stdDeviation={glowSize} result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Dark scrim behind bars for readability over busy backgrounds */}
        <linearGradient id="fw-scrim" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="rgba(8,8,24,0)"    />
          <stop offset="55%"  stopColor="rgba(8,8,24,0.50)" />
          <stop offset="100%" stopColor="rgba(8,8,24,0.78)" />
        </linearGradient>

        {/* Reflection fade mask — bars dissolve into the floor */}
        <linearGradient id="fw-refl-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="white" stopOpacity="1" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <mask id="fw-refl-mask">
          <rect
            x={0}
            y={BASELINE}
            width={CANVAS_W}
            height={REFL_MAX + 20}
            fill="url(#fw-refl-fade)"
          />
        </mask>
      </defs>

      {/* Scrim gradient */}
      <rect
        x={0}
        y={scrimTop}
        width={CANVAS_W}
        height={scrimHeight}
        fill="url(#fw-scrim)"
      />

      {/* Thin baseline separator line */}
      <line
        x1={0}   y1={BASELINE}
        x2={CANVAS_W} y2={BASELINE}
        stroke="rgba(255,255,255,0.10)"
        strokeWidth={1}
      />

      {/* Main bars with glow */}
      <g filter="url(#fw-glow)">{mainBars}</g>

      {/* Reflection bars — masked to fade out, no glow (keeps them subtle) */}
      <g mask="url(#fw-refl-mask)">{reflBars}</g>
    </svg>
  );
};
