// Shared utilities for audio-reactive color and bass extraction
import { lerpColor } from "./themes";

// Default theme colors — kept as constants so callers don't need to import themes
const A = "#FF2D9B";  // hot pink (colorA default)
const B = "#00B4FF";  // electric blue (colorB default)

/**
 * Cycle smoothly between colorA and colorB over `cycleSecs` seconds.
 * Used for echo rings, reference circles, etc.
 */
export function getCycleColor(
  frame:     number,
  fps:       number,
  cycleSecs  = 28,
  colorA     = A,
  colorB     = B,
): string {
  const t        = frame / fps;
  const progress = (Math.sin((t / cycleSecs) * Math.PI * 2) + 1) / 2;
  return lerpColor(colorA, colorB, progress);
}

/**
 * Per-bar color: index 0 = colorA (bass), index total-1 = colorB (treble).
 */
export function getFreqColor(
  index:  number,
  total:  number,
  colorA  = A,
  colorB  = B,
): string {
  const t = index / Math.max(total - 1, 1);
  return lerpColor(colorA, colorB, t);
}

/** Extract bass energy (0–1) from the low-frequency bins of a visualization array. */
export function getBassEnergy(visualization: readonly number[]): number {
  if (!visualization.length) return 0;
  const bassBins = visualization.slice(0, 6);
  return bassBins.reduce((a, b) => a + b, 0) / bassBins.length;
}

/**
 * Remap a linear FFT array onto a logarithmic frequency scale.
 * (Legacy helper — prefer getMusicViz for all visualizers.)
 */
export function logRemap(visualization: readonly number[], numBars: number): number[] {
  const total = visualization.length;
  if (total === 0) return new Array(numBars).fill(0);
  const result: number[] = [];
  for (let i = 0; i < numBars; i++) {
    const t = i / Math.max(numBars - 1, 1);
    const binIndex = Math.round(Math.pow(total, t)) - 1;
    result.push(visualization[Math.min(Math.max(binIndex, 0), total - 1)] ?? 0);
  }
  return result;
}

/**
 * Music-optimised visualisation — replaces raw logRemap in every visualiser.
 *
 * Fixes two problems with naive log remapping:
 *   1. STAIRCASE: bunching of first 20+ bars onto bins 0–1.  t^1.5 + linear
 *      interpolation gives each bar a unique fractional bin.
 *   2. DEAD RIGHT SIDE: 40% of bars mapping to 8–22kHz silence.  Bins
 *      1–(40% of FFT) cover 0–8.8kHz; bass sits at ~50% of bars.
 */
export function getMusicViz(
  rawFft: readonly number[],
  numBars: number,
  scalar = 6,
  treble = 3.0,
): number[] {
  if (rawFft.length === 0) return new Array(numBars).fill(0);

  const minBin = 1;
  const maxBin = Math.min(rawFft.length - 1, Math.floor(rawFft.length * 0.4));
  const range  = maxBin - minBin;

  const result: number[] = [];
  for (let i = 0; i < numBars; i++) {
    const t        = i / Math.max(numBars - 1, 1);
    const rawIndex = minBin + Math.pow(t, 1.5) * range;
    const lo       = Math.floor(rawIndex);
    const hi       = Math.min(lo + 1, maxBin);
    const frac     = rawIndex - lo;
    const v        = (rawFft[lo] ?? 0) * (1 - frac) + (rawFft[hi] ?? 0) * frac;
    const boost    = scalar * (1 + Math.pow(t, 0.7) * treble);
    result.push(Math.min(1, v * boost));
  }
  return result;
}
