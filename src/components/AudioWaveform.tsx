import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { useAudioData, visualizeAudio } from "@remotion/media-utils";
import { getCycleColor } from "../utils/audioColor";

interface AudioWaveformProps {
  audioSrc: string;
}

const WIDTH  = 1400;
const HEIGHT = 56;   // max amplitude each side of center line
const CENTER_X = 960;
const CENTER_Y = 840; // sits just above the lyric zone

export const AudioWaveform: React.FC<AudioWaveformProps> = ({ audioSrc }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const audioData = useAudioData(audioSrc);

  if (!audioData) return null;

  const visualization = visualizeAudio({
    fps,
    frame,
    audioData,
    numberOfSamples: 128,
    smoothing: true,
  });

  const color = getCycleColor(frame, fps);

  // Build SVG points for a smooth waveform line
  const points: string[] = [];
  const step = WIDTH / (visualization.length - 1);

  for (let i = 0; i < visualization.length; i++) {
    const x = CENTER_X - WIDTH / 2 + i * step;
    // Mirror: positive values go up, create a wave shape
    const amp = visualization[i] * HEIGHT;
    // Alternate up/down using index to get a wave shape rather than all-positive bars
    const y = CENTER_Y - amp;
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }

  // Mirror the points bottom half for a full wave
  const mirrorPoints: string[] = [];
  for (let i = visualization.length - 1; i >= 0; i--) {
    const x = CENTER_X - WIDTH / 2 + i * step;
    const amp = visualization[i] * HEIGHT;
    const y = CENTER_Y + amp;
    mirrorPoints.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }

  const allPoints = [...points, ...mirrorPoints].join(" ");

  return (
    <svg
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible", pointerEvents: "none" }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <filter id="waveform-glow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Glow layer */}
      <polygon
        points={allPoints}
        fill={color}
        opacity={0.15}
      />

      {/* Top waveform line */}
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinejoin="round"
        filter="url(#waveform-glow)"
        opacity={0.9}
      />

      {/* Bottom mirror line */}
      <polyline
        points={mirrorPoints.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinejoin="round"
        opacity={0.5}
      />
    </svg>
  );
};
