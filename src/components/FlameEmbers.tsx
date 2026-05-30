import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { useAudioData, visualizeAudio } from "@remotion/media-utils";
import { getBassEnergy } from "../utils/audioColor";
import { lerpColor } from "../utils/themes";

// Rising ember and spark particle visualizer — audio-reactive fire embers

const CANVAS_W = 1920;
const CANVAS_H = 1080;
const EMBER_COUNT = 36;
const SPARK_COUNT = 70;
const EMBER_LIFETIME = 5.5;
const SPARK_LIFETIME = 3.0;

function seed(i: number, salt: number): number {
  let h = (i * 374761393 + salt * 1013904223) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 1540483477) >>> 0;
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

export interface FlameEmbersProps {
  audioSrc: string;
  colorA?: string; // hot / bright ember color
  colorB?: string; // cool / dim color
}

export const FlameEmbers: React.FC<FlameEmbersProps> = ({
  audioSrc,
  colorA = "#FF2D9B",
  colorB = "#FF8C00",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const audioData = useAudioData(audioSrc);

  if (!audioData) return null;

  const t = frame / fps;
  const viz = visualizeAudio({ fps, frame, audioData, numberOfSamples: 32, smoothing: true });
  const bassEnergy = getBassEnergy(viz);
  const highEnergy = viz.slice(12, 24).reduce((a: number, b: number) => a + b, 0) / 12;
  const energy = Math.max(bassEnergy, highEnergy * 0.7);

  const elements: React.ReactNode[] = [];

  // ── Large glowing embers ──────────────────────────────────────────────────
  for (let i = 0; i < EMBER_COUNT; i++) {
    const phase = (i / EMBER_COUNT) * EMBER_LIFETIME;
    const prog = ((t + phase) % EMBER_LIFETIME) / EMBER_LIFETIME;

    // Spawn along the bottom, spread across width
    const spawnX = seed(i, 0) * CANVAS_W;
    const riseHeight = (CANVAS_H * 0.75 + seed(i, 1) * CANVAS_H * 0.2) * (1 + energy * 0.4);

    // Heavy horizontal wobble for organic look
    const wobbleAmp = 80 + seed(i, 2) * 120;
    const wobbleFreq = 0.4 + seed(i, 3) * 0.6;
    const wobble = Math.sin(t * wobbleFreq * Math.PI * 2 + i * 2.3) * wobbleAmp * prog;

    const x = spawnX + wobble;
    const y = CANVAS_H + 60 - prog * riseHeight;

    // Fade in fast, hold, fade out near top
    const fadeIn = Math.min(1, prog * 8);
    const fadeOut = prog > 0.7 ? 1 - ((prog - 0.7) / 0.3) ** 1.5 : 1;
    const opacity = fadeIn * fadeOut * (0.5 + seed(i, 4) * 0.5) * (0.6 + energy * 0.4);

    if (opacity < 0.02 || y < -20 || y > CANVAS_H + 60) continue;

    const size = (6 + seed(i, 5) * 10) * (1 + energy * 0.5) * Math.max(0.4, 1 - prog * 0.5);

    // Color: colorB at spawn, colorA at mid, near-white at top
    const colorT = Math.min(1, prog * 1.3);
    const color = colorT < 0.5
      ? lerpColor(colorB, colorA, colorT * 2)
      : lerpColor(colorA, "#ffffff", (colorT - 0.5) * 2);

    elements.push(
      <circle key={`e${i}`} cx={x.toFixed(1)} cy={y.toFixed(1)} r={Math.max(1, size).toFixed(1)} fill={color} opacity={opacity.toFixed(3)} />,
    );
  }

  // ── Small sparks ─────────────────────────────────────────────────────────
  for (let i = 0; i < SPARK_COUNT; i++) {
    const phase = (i / SPARK_COUNT) * SPARK_LIFETIME;
    const prog = ((t + phase) % SPARK_LIFETIME) / SPARK_LIFETIME;

    const spawnX = seed(i + 1000, 0) * CANVAS_W;
    const speed = 0.9 + seed(i + 1000, 1) * 0.7 + energy * 0.5;
    const riseHeight = CANVAS_H * 0.55 * speed;

    // Sparks drift less — mostly straight up with slight lean
    const lean = (seed(i + 1000, 2) - 0.5) * 60;
    const x = spawnX + lean * prog;
    const y = CANVAS_H + 30 - prog * riseHeight;

    const fadeIn = Math.min(1, prog * 15);
    const fadeOut = prog > 0.6 ? 1 - ((prog - 0.6) / 0.4) ** 2 : 1;
    const opacity = fadeIn * fadeOut * (0.4 + seed(i + 1000, 3) * 0.6) * (0.5 + energy * 0.5);

    if (opacity < 0.02 || y < -10 || y > CANVAS_H + 30) continue;

    const size = (1.2 + seed(i + 1000, 4) * 2.8) * Math.max(0.3, 1 - prog * 0.6);
    const colorT = seed(i + 1000, 5);
    const color = lerpColor(colorA, "#ffffff", colorT * 0.5);

    elements.push(
      <circle key={`s${i}`} cx={x.toFixed(1)} cy={y.toFixed(1)} r={Math.max(0.5, size).toFixed(1)} fill={color} opacity={opacity.toFixed(3)} />,
    );
  }

  if (elements.length === 0) return null;

  return (
    <svg
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
      viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
    >
      <defs>
        <filter id="emb-glow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="7" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g filter="url(#emb-glow)">{elements}</g>
    </svg>
  );
};
