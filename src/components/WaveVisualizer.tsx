import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { useAudioData, visualizeAudio } from "@remotion/media-utils";
import { getMusicViz } from "../utils/audioColor";

interface WaveVisualizerProps {
  audioSrc: string;
}

const NUM_SAMPLES = 256;
const CANVAS_W    = 1920;
const CANVAS_H    = 1080;
const CENTER_Y    = CANVAS_H / 2;
const MARGIN_X    = 60;
const WAVE_W      = CANVAS_W - MARGIN_X * 2;
const MAX_AMP     = 220; // large amplitude — fills roughly top & bottom third

export const WaveVisualizer: React.FC<WaveVisualizerProps> = ({ audioSrc }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const audioData = useAudioData(audioSrc);

  if (!audioData) return null;

  const t = frame / fps;

  const baseViz = getMusicViz(
    visualizeAudio({ fps, frame, audioData, numberOfSamples: 256, smoothing: true }),
    NUM_SAMPLES,
  );
  const viz = baseViz.map((v, i) => {
    const ambient = 0.01 + 0.01 * Math.sin(t * 2.5 + i * 0.3);
    return Math.max(ambient, v);
  });

  const bassEnergy = viz.slice(0, 4).reduce((a: number, b: number) => a + b, 0) / 4;
  const glowSize   = 4 + bassEnergy * 10;

  // Build upper and lower polyline point strings
  const upperPts: string[] = [];
  const lowerPts: string[] = [];

  for (let i = 0; i < NUM_SAMPLES; i++) {
    const x = MARGIN_X + (i / (NUM_SAMPLES - 1)) * WAVE_W;
    const amp = (viz[i] ?? 0) * MAX_AMP;
    upperPts.push(`${x.toFixed(1)},${(CENTER_Y - amp).toFixed(1)}`);
    lowerPts.push(`${x.toFixed(1)},${(CENTER_Y + amp).toFixed(1)}`);
  }

  // Filled shape: upper wave left→right, lower wave right→left
  const fillPoints = [
    ...upperPts,
    ...lowerPts.slice().reverse(),
  ].join(" ");

  return (
    <svg
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
      viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Pink → blue gradient across the width */}
        <linearGradient id="wave-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#FF2D9B" />
          <stop offset="50%"  stopColor="#9B5DE5" />
          <stop offset="100%" stopColor="#00B4FF" />
        </linearGradient>

        {/* Same gradient but faded for the fill */}
        <linearGradient id="wave-fill-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#FF2D9B" stopOpacity="0.18" />
          <stop offset="50%"  stopColor="#9B5DE5" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#00B4FF" stopOpacity="0.18" />
        </linearGradient>

        <filter id="wave-glow" x="-5%" y="-30%" width="110%" height="160%">
          <feGaussianBlur stdDeviation={glowSize} result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Dark veil behind the wave so it reads over bright images */}
        <linearGradient id="wave-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="rgba(8,8,24,0)"    />
          <stop offset="45%"  stopColor="rgba(8,8,24,0.45)" />
          <stop offset="55%"  stopColor="rgba(8,8,24,0.45)" />
          <stop offset="100%" stopColor="rgba(8,8,24,0)"    />
        </linearGradient>
      </defs>

      {/* Dark center band */}
      <rect
        x={0}
        y={CENTER_Y - MAX_AMP - 60}
        width={CANVAS_W}
        height={(MAX_AMP + 60) * 2}
        fill="url(#wave-bg)"
      />

      {/* Filled body between upper and lower wave */}
      <polygon
        points={fillPoints}
        fill="url(#wave-fill-grad)"
      />

      {/* Upper stroke */}
      <g filter="url(#wave-glow)">
        <polyline
          points={upperPts.join(" ")}
          fill="none"
          stroke="url(#wave-grad)"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.95}
        />

        {/* Lower stroke (mirror) */}
        <polyline
          points={lowerPts.join(" ")}
          fill="none"
          stroke="url(#wave-grad)"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.95}
        />

        {/* Center line */}
        <line
          x1={MARGIN_X}
          y1={CENTER_Y}
          x2={MARGIN_X + WAVE_W}
          y2={CENTER_Y}
          stroke="rgba(255,255,255,0.1)"
          strokeWidth={1}
        />
      </g>
    </svg>
  );
};
