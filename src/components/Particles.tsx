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

// Fixed lifetime — NEVER changes frame-to-frame. This is critical.
// Changing lifetime per-frame causes all particles to teleport (jitter).
const LIFETIME = 8.0;

// Deterministic per-particle hash — different salts produce uncorrelated outputs.
// The old linear formula had the same slope for every salt, so x-position and
// travel-progress were always correlated, producing visible diagonal lines.
function seed(i: number, salt: number): number {
  let h = (i * 374761393 + salt * 1013904223) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 1540483477) >>> 0;
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296; // >>> 0 forces unsigned — XOR can leave h negative in JS
}

// ── Per-direction constants ────────────────────────────────────────────────
const MIST_COUNT  = 60;
const BURST_COUNT = 48;

// Travel distances — full screen so particles exit off the far edge
const TRAVEL_V    = CANVAS_H + 120;   // vertical (up/down)
const TRAVEL_H    = CANVAS_W + 120;   // horizontal (left/right)
const BURST_MAX_R = 1200;             // radial — reaches past screen corners

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

  // Lifetime scales inversely with speed so particles ALWAYS cross the full screen.
  // Slow speed = long life = same distance, slower velocity.
  // Energy adds a gentle nudge without affecting lifetime.
  const lifetimeSecs  = LIFETIME / speedMultiplier;
  const energyBoost   = reactiveSpeed ? 1 + energy * 0.15 : 1; // halved boost (was 0.3)

  const elements: React.ReactNode[] = [];

  for (let i = 0; i < COUNT; i++) {
    // ... rest of the loop logic remains the same ...
    // travelProgress: at progress=1.0, particle has crossed the full screen.
    const travelProgress = progress * energyBoost;

    // ...
    let opacity: number;
    let x: number;
    let y: number;
    let size: number;

    if (isBurst) {
      // ── Burst / out ───────────────────────────────────────────────────────
      // ...
      const r            = travelProgress * BURST_MAX_R * speedVar;

      x = CX + Math.cos(angle) * r;
      y = CY + Math.sin(angle) * r;

      const baseSize = 2.5 + seed(i, 0) * 3.5;
      size           = (baseSize + energy * 1.5) * Math.max(0.3, 1 - travelProgress * 0.45); // halved (was 3.0)

      opacity = fadeIn * fadeOut * particleBrightness * Math.min(1, 0.4 + energy * 1.0); // dampened (was 0.3 + 2.5)

    } else if (isInward) {
      // ── Inward — edges toward center ────────────────────────────────────
      // ...
      x = CX + cosA * r;
      y = CY + sinA * r;

      const baseSize = 2.5 + seed(i, 0) * 3.5;
      size           = (baseSize + energy * 1.5) * (1.0 - inwardProg * 0.4); // halved (was 3.0)

      // Fade in at edge
      opacity = fadeIn * fadeOut * particleBrightness * Math.min(1, 0.4 + energy * 1.0); // dampened (was 0.3 + 2.5)

    } else {
      // ── Directional mist (up/down/left/right) ─────────────────────────────
      // ...
      const baseSize = 2.5 + seed(i, 0) * 3.5;
      size           = (baseSize + energy * 1.5) * Math.max(0.3, 1 - travelProgress * 0.35); // halved (was 3.0)

      opacity = fadeIn * fadeOut * particleBrightness * Math.min(1, 0.5 + energy * 1.0); // dampened (was 0.45 + 2.5)
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
