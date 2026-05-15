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
  return h / 4294967296;
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

  // Speed multiplier scales travel progress — NOT the lifetime.
  // Audio adds a very gentle nudge (0.3) so beats are felt but not violent.
  const speedMult = (reactiveSpeed ? 1 + energy * 0.3 : 1) * speedMultiplier;

  const elements: React.ReactNode[] = [];

  for (let i = 0; i < COUNT; i++) {
    // Phase offset staggers spawn times evenly across the fixed lifetime
    const phaseOffset    = (i / COUNT) * LIFETIME;
    const timeSinceSpawn = ((t + phaseOffset) % LIFETIME);
    const progress       = timeSinceSpawn / LIFETIME;  // 0 → 1 over LIFETIME

    // Travel progress — NO Math.min(1,...) clamp!
    // When speedMult > 1, travelProgress exceeds 1.0 and the particle
    // naturally exits off-screen. No hard stop line ever.
    const travelProgress = progress * speedMult;

    // Fade in quickly at spawn, fade out over last 20% of lifetime
    const fadeIn  = Math.min(1, progress * 10);
    const fadeOut = 1 - Math.pow(Math.max(0, (progress - 0.80) / 0.20), 2.0);

    let opacity: number;
    let x: number;
    let y: number;
    let size: number;

    if (isBurst) {
      // ── Burst / out ───────────────────────────────────────────────────────
      const goldenAngle  = i * 2.39996;
      const angleWobble  = Math.sin(t * 0.4 + i * 2.1) * 0.18;
      const angle        = goldenAngle + angleWobble;

      const speedVar     = 0.65 + seed(i, 5) * 0.70;
      const r            = travelProgress * BURST_MAX_R * speedVar;

      x = CX + Math.cos(angle) * r;
      y = CY + Math.sin(angle) * r;

      const baseSize = 1.8 + seed(i, 0) * 2.5;
      size           = (baseSize + energy * 3.0) * Math.max(0.3, 1 - travelProgress * 0.45);

      opacity = fadeIn * fadeOut * Math.min(1, 0.25 + energy * 3.5);

    } else if (isInward) {
      // ── Inward — edges toward center ────────────────────────────────────
      const goldenAngle = i * 2.39996;
      const angleWobble = Math.sin(t * 0.4 + i * 2.1) * 0.18;
      const angle       = goldenAngle + angleWobble;

      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);

      const edgeR  = 1 / Math.max(Math.abs(cosA) / HALF_W, Math.abs(sinA) / HALF_H);
      const startR = edgeR * (1.05 + seed(i, 5) * 0.30);

      // travelProgress scales the journey; when > 1 the particle passes center
      // and exits the other side, but it fades out before that happens
      const inwardProg = Math.min(1, travelProgress);
      const r = (1 - inwardProg) * startR;

      x = CX + cosA * r;
      y = CY + sinA * r;

      const baseSize = 1.8 + seed(i, 0) * 2.5;
      size           = (baseSize + energy * 2.5) * (1.0 - inwardProg * 0.4);

      // Fade in at edge; start fading at 65% travel, gone by 85%
      const fadeOut_in = 1 - Math.pow(Math.max(0, (progress - 0.65) / 0.20), 1.5);
      opacity = fadeIn * fadeOut_in * Math.min(1, 0.25 + energy * 3.5);

    } else {
      // ── Directional mist (up/down/left/right) ─────────────────────────────
      // Break up predictable patterns with per-particle distance offsets
      const spread1 = seed(i, 2);
      const spread2 = seed(i, 3);
      const distOffset = (seed(i, 4) - 0.5) * 200; // Scatter them along the travel axis (symmetric ±100)
      const drift   = Math.sin(t * 0.5 + i * 1.6) * 50 * spread2;

      const isVertical = direction === "up" || direction === "down";
      const travel     = isVertical ? TRAVEL_V : TRAVEL_H;
      // Subtracting the offset from the starting position helps scatter them
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
      size           = (baseSize + energy * 3.0) * Math.max(0.3, 1 - travelProgress * 0.35);

      opacity = fadeIn * fadeOut * Math.min(1, 0.35 + energy * 3.5);
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
