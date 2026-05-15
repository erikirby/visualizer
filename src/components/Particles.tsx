import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { useAudioData, visualizeAudio } from "@remotion/media-utils";
import { getBassEnergy } from "../utils/audioColor";
import { lerpColor } from "../utils/themes";

export type ParticleDirection = "up" | "down" | "left" | "right" | "out" | "in";

interface ParticlesProps {
  audioSrc: string;
  direction?: ParticleDirection;
  reactiveSpeed?: boolean;
  speedMultiplier?: number;
  countMultiplier?: number;
  colorA?: string;
  colorB?: string;
}

const CANVAS_W = 1920;
const CANVAS_H = 1080;

// Fixed lifetime — NEVER changes frame-to-frame.
const LIFETIME = 8.0;

function seed(i: number, salt: number): number {
  let h = (i * 374761393 + salt * 1013904223) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 1540483477) >>> 0;
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

const MIST_COUNT  = 60;
const BURST_COUNT = 48;
const TRAVEL_V    = CANVAS_H + 120;
const TRAVEL_H    = CANVAS_W + 120;
const BURST_MAX_R = 1200;

const HALF_W = CANVAS_W / 2;
const HALF_H = CANVAS_H / 2;
const CX = CANVAS_W / 2;
const CY = CANVAS_H / 2;

export const Particles: React.FC<ParticlesProps> = ({
  audioSrc,
  direction     = "up",
  reactiveSpeed = true,
  speedMultiplier = 1.0,
  countMultiplier = 1.0,
  colorA        = "#FF2D9B",
  colorB        = "#00B4FF",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const audioData = useAudioData(audioSrc);

  if (!audioData) return null;

  const t = frame / fps;

  const viz        = visualizeAudio({ fps, frame, audioData, numberOfSamples: 32, smoothing: true });
  const bassEnergy = getBassEnergy(viz);
  const midEnergy  = viz.slice(6, 14).reduce((a: number, b: number) => a + b, 0) / 8;
  const energy     = Math.max(bassEnergy, midEnergy * 0.8);

  const isBurst   = direction === "out";
  const isInward  = direction === "in";
  const COUNT     = Math.round(((isBurst || isInward) ? BURST_COUNT : MIST_COUNT) * countMultiplier);

  const lifetimeSecs  = LIFETIME / speedMultiplier;
  // SUBTLE: reactiveSpeed boost reduced to 0.07 (was 0.15)
  const energyBoost   = reactiveSpeed ? 1 + energy * 0.07 : 1;

  const elements: React.ReactNode[] = [];

  for (let i = 0; i < COUNT; i++) {
    // ... rest of the loop logic remains the same ...
    const phaseOffset    = (i / COUNT) * lifetimeSecs;
    const timeSinceSpawn = ((t + phaseOffset) % lifetimeSecs);
    const progress       = timeSinceSpawn / lifetimeSecs;
    const travelProgress = progress * energyBoost;

    const particleBrightness = Math.pow(seed(i, 6), 1.6) * 0.78 + 0.12;
    const fadeIn       = Math.min(1, progress * 10);
    const fadeStart    = 0.60 + seed(i, 7) * 0.30;
    const fadeOut      = 1 - Math.pow(Math.max(0, (progress - fadeStart) / (1 - fadeStart)), 2.0);

    let opacity: number;
    let x: number;
    let y: number;
    let size: number;

    if (isBurst) {
      const goldenAngle  = i * 2.39996;
      const angleWobble  = Math.sin(t * 0.4 + i * 2.1) * 0.18;
      const angle        = goldenAngle + angleWobble;
      const speedVar     = 0.65 + seed(i, 5) * 0.70;
      const r            = travelProgress * BURST_MAX_R * speedVar;

      x = CX + Math.cos(angle) * r;
      y = CY + Math.sin(angle) * r;

      const baseSize = 2.5 + seed(i, 0) * 3.5;
      // SUBTLE: energy size boost reduced to 0.7 (was 1.5)
      size           = (baseSize + energy * 0.7) * Math.max(0.3, 1 - travelProgress * 0.45);
      // SUBTLE: energy opacity boost reduced to 0.5 (was 1.0)
      opacity = fadeIn * fadeOut * particleBrightness * Math.min(1, 0.4 + energy * 0.5);

    } else if (isInward) {
      const goldenAngle = i * 2.39996;
      const angleWobble = Math.sin(t * 0.4 + i * 2.1) * 0.18;
      const angle       = goldenAngle + angleWobble;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);

      const edgeR  = 1 / Math.max(Math.abs(cosA) / HALF_W, Math.abs(sinA) / HALF_H);
      const startR = edgeR * (1.05 + seed(i, 5) * 0.30);
      const inwardProg = Math.min(1, travelProgress);
      const r = (1 - inwardProg) * startR;

      x = CX + cosA * r;
      y = CY + sinA * r;

      const baseSize = 2.5 + seed(i, 0) * 3.5;
      // SUBTLE: energy size boost reduced to 0.7 (was 1.5)
      size           = (baseSize + energy * 0.7) * (1.0 - inwardProg * 0.4);
      // SUBTLE: energy opacity boost reduced to 0.5 (was 1.0)
      opacity = fadeIn * fadeOut * particleBrightness * Math.min(1, 0.4 + energy * 0.5);

    } else {
      const spread1 = seed(i, 2);
      const spread2 = seed(i, 3);
      const distOffset = (seed(i, 4) - 0.5) * 200;
      const drift   = Math.sin(t * 0.5 + i * 1.6) * 50 * spread2;

      const isVertical = direction === "up" || direction === "down";
      const travel     = isVertical ? TRAVEL_V : TRAVEL_H;
      const dist       = (travelProgress * travel) + distOffset;

      switch (direction) {
        case "up":
          x = spread1 * CANVAS_W + drift;
          y = CANVAS_H + 100 - dist;
          break;
        case "down":
          x = spread1 * CANVAS_W + drift;
          y = -100 + dist;
          break;
        case "left":
          x = CANVAS_W + 100 - dist;
          y = spread1 * CANVAS_H + drift;
          break;
        case "right":
        default:
          x = -100 + dist;
          y = spread1 * CANVAS_H + drift;
          break;
      }

      const baseSize = 2.5 + seed(i, 0) * 3.5;
      // SUBTLE: energy size boost reduced to 0.7 (was 1.5)
      size           = (baseSize + energy * 0.7) * Math.max(0.3, 1 - travelProgress * 0.35);
      // SUBTLE: energy opacity boost reduced to 0.5 (was 1.0)
      opacity = fadeIn * fadeOut * particleBrightness * Math.min(1, 0.5 + energy * 0.5);
    }

    if (opacity < 0.02) continue;

    const colorT = ((i / COUNT) + seed(i, 1) * 0.1) % 1;

    elements.push(
      <circle
        key={i}
        cx={x.toFixed(1)}
        cy={y.toFixed(1)}
        r={Math.max(0.8, size).toFixed(1)}
        fill={lerpColor(colorA, colorB, colorT)}
        opacity={opacity.toFixed(3)}
      />,
    );
  }

  if (elements.length === 0) return null;

  return (
    <svg
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
      viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <filter id="ptcl-glow" x="-150%" y="-150%" width="400%" height="400%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g filter="url(#ptcl-glow)">{elements}</g>
    </svg>
  );
};
