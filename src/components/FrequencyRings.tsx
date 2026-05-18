import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { useAudioData, visualizeAudio } from "@remotion/media-utils";
import { getFreqColor, getMusicViz, applyReactivity } from "../utils/audioColor";

interface FrequencyRingsProps {
  audioSrc: string;
  colorA?: string;
  colorB?: string;
  spectrumType?: "bass" | "wide";
  reactivity?: number;
}

// Six rings — each locked to one frequency band
// Inner = sub-bass, outer = air frequencies
const BANDS = 6;
const BASE_RADII  = [80, 155, 230, 305, 380, 455];
const MAX_EXPAND  = 60;   // max px a ring expands at full energy
const CANVAS_W    = 1920;
const CANVAS_H    = 1080;

export const FrequencyRings: React.FC<FrequencyRingsProps> = ({
  audioSrc,
  colorA = "#FF2D9B",
  colorB = "#00B4FF",
  spectrumType = "wide",
  reactivity = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const audioData = useAudioData(audioSrc);

  if (!audioData) return null;

  const NUM_VIZ = 128;
  const smoothBars = getMusicViz(
    visualizeAudio({ fps, frame, audioData, numberOfSamples: 256, smoothing: true }),
    NUM_VIZ, spectrumType,
  );
  const rawBars = reactivity > 0
    ? getMusicViz(visualizeAudio({ fps, frame, audioData, numberOfSamples: 256, smoothing: false }), NUM_VIZ, spectrumType)
    : null;
  const raw = applyReactivity(smoothBars, rawBars, reactivity);

  const cx = CANVAS_W / 2;
  const cy = CANVAS_H / 2;

  // Average energy per band
  const binsPerBand = NUM_VIZ / BANDS;
  const bandEnergies = Array.from({ length: BANDS }, (_, i) => {
    const start = Math.floor(i * binsPerBand);
    const end   = Math.floor((i + 1) * binsPerBand);
    const slice = raw.slice(start, end);
    const avg   = slice.reduce((a, b) => a + b, 0) / Math.max(slice.length, 1);
    return avg;
  });

  // Glow size driven by overall energy
  const overallEnergy = bandEnergies.reduce((a, b) => a + b, 0) / BANDS;
  const glowSize = 4 + overallEnergy * 14;

  const rings: React.ReactNode[] = [];

  for (let i = 0; i < BANDS; i++) {
    const energy  = bandEnergies[i];
    const r       = BASE_RADII[i] + energy * MAX_EXPAND;
    const sw      = 1.5 + energy * 10;
    const color   = getFreqColor(Math.floor(i * (NUM_VIZ / (BANDS - 1))), NUM_VIZ, colorA, colorB);
    const opacity = 0.35 + energy * 0.6;

    // Subtle filled aura
    rings.push(
      <circle
        key={`aura-${i}`}
        cx={cx} cy={cy} r={r}
        fill={color}
        fillOpacity={energy * 0.06}
        stroke="none"
      />
    );

    // Main ring stroke
    rings.push(
      <circle
        key={`ring-${i}`}
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke={color}
        strokeWidth={sw}
        opacity={opacity}
      />
    );
  }

  return (
    <svg
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
      viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <filter id="rings-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation={glowSize} result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        {/* Separate filter for center dot — userSpaceOnUse avoids square clipping on small elements */}
        <filter id="dot-glow" filterUnits="userSpaceOnUse" x="820" y="400" width="280" height="280">
          <feGaussianBlur stdDeviation={glowSize} result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <radialGradient id="rings-bg" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="rgba(8,8,24,0.6)" />
          <stop offset="100%" stopColor="rgba(8,8,24,0)"   />
        </radialGradient>
      </defs>

      {/* Dark center veil so rings read against any image */}
      <ellipse
        cx={cx} cy={cy}
        rx={BASE_RADII[BANDS - 1] + MAX_EXPAND + 80}
        ry={BASE_RADII[BANDS - 1] + MAX_EXPAND + 80}
        fill="url(#rings-bg)"
      />

      <g filter="url(#rings-glow)">{rings}</g>

      {/* Center dot */}
      <circle
        cx={cx} cy={cy} r={6 + overallEnergy * 14}
        fill={getFreqColor(0, NUM_VIZ, colorA, colorB)}
        opacity={0.9}
        filter="url(#dot-glow)"
      />
    </svg>
  );
};
