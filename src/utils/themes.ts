// ── AELOW Color Themes ────────────────────────────────────────────────────────
// Each theme is a pair of hex colors:
//   colorA = "low energy" side  — bass, leftmost bar, center of radial shapes
//   colorB = "high energy" side — treble, rightmost bar, outer edge
//
// All visualizer components accept colorA/colorB props and use lerpColor() to
// interpolate between them.  getTheme(id) resolves a theme by CLI-passed number.

export interface Theme {
  id:     number;
  name:   string;
  colorA: string;  // hex #RRGGBB
  colorB: string;
}

export const THEMES: Theme[] = [
  { id: 1,  name: "Neon",         colorA: "#FF2D9B", colorB: "#00B4FF" }, // hot pink → electric blue (default)
  { id: 2,  name: "Violet Storm", colorA: "#9B2DFF", colorB: "#FF6B2D" }, // deep purple → amber
  { id: 3,  name: "Arctic",       colorA: "#2DFFEE", colorB: "#2D6BFF" }, // cyan → cobalt
  { id: 4,  name: "Solar",        colorA: "#FF8C00", colorB: "#FFE500" }, // orange → gold
  { id: 5,  name: "Toxic",        colorA: "#00FF88", colorB: "#FF2D9B" }, // neon green → hot pink
  { id: 6,  name: "Monochrome",   colorA: "#FFFFFF", colorB: "#8888AA" }, // white → cool grey
  { id: 7,  name: "Dark Violet",  colorA: "#1A0A2E", colorB: "#9B2DFF" }, // near-black → vivid purple
  { id: 8,  name: "Crimson Night",colorA: "#CC0000", colorB: "#0A0A0A" }, // deep red → near-black
  { id: 12, name: "Laser",        colorA: "#FF0A0A", colorB: "#FF8800" }, // vivid red → vivid orange
  { id: 13, name: "Neon Night",   colorA: "#DD0066", colorB: "#0044EE" }, // preview swatch only — cycling
];

export const DEFAULT_THEME = THEMES[0]!;

// ── Cycling themes ────────────────────────────────────────────────────────
// These themes slowly rotate through curated color pairs over the song.
// Each entry is [colorA, colorB] — complementary/split-complementary pairs.
export const CYCLING_THEME_IDS = [9, 10, 11, 13] as const;

const IRIDESCENT_PAIRS: [string, string][] = [
  ["#FF2D9B", "#00B4FF"],   // pink → blue
  ["#00B4FF", "#FFE500"],   // blue → gold
  ["#FFE500", "#9B2DFF"],   // gold → purple
  ["#9B2DFF", "#2DFFEE"],   // purple → cyan
  ["#2DFFEE", "#FF6B2D"],   // cyan → amber
  ["#FF6B2D", "#FF2D9B"],   // amber → pink (loops back)
];

// Dark cycling: black base, vivid accent cycles through red → purple → blue → orange
const ABYSS_PAIRS: [string, string][] = [
  ["#050505", "#CC0000"],  // black → deep red (Crimson Night)
  ["#050505", "#9B2DFF"],  // black → vivid purple (Dark Violet)
  ["#050505", "#0055FF"],  // black → electric blue
  ["#050505", "#FF5500"],  // black → vivid orange
];

// Neon Night: stays locked in pink/blue/purple — never goes warm or pastel.
// Designed for dark moody images with neon lighting.
const NEON_NIGHT_PAIRS: [string, string][] = [
  ["#DD0066", "#0044EE"],  // hot pink → electric blue (mirrors neon bar lighting)
  ["#0044EE", "#7700CC"],  // electric blue → vivid purple
  ["#7700CC", "#FF0088"],  // vivid purple → hot magenta
  ["#FF0088", "#0022BB"],  // hot magenta → deep blue
];

const PASTEL_PAIRS: [string, string][] = [
  ["#FF1493", "#1E90FF"],   // deep pink → electric blue
  ["#1E90FF", "#FFD700"],   // electric blue → golden yellow
  ["#FFD700", "#9400FF"],   // golden yellow → vivid purple
  ["#9400FF", "#00E87A"],   // vivid purple → vivid green
  ["#00E87A", "#FF6200"],   // vivid green → vivid orange
  ["#FF6200", "#FF1493"],   // vivid orange → deep pink (loops back)
];

/** Resolve a theme by id; falls back to Neon if unknown. */
export function getTheme(id?: number): Theme {
  if (id === undefined) return DEFAULT_THEME;
  return THEMES.find((t) => t.id === id) ?? DEFAULT_THEME;
}

/**
 * Get theme colors for a given time in seconds.
 * For static themes this just returns getTheme(id).
 * For cycling themes (9=Iridescent, 10=Pastel Rainbow) it smoothly
 * interpolates between curated color pairs.
 * Cycle duration: ~45 seconds per pair.
 */
export function getThemeAtTime(id: number | undefined, timeSec: number): { colorA: string; colorB: string } {
  if (id === 9 || id === 10 || id === 11 || id === 13) {
    const pairs = id === 9 ? IRIDESCENT_PAIRS : id === 10 ? PASTEL_PAIRS : id === 13 ? NEON_NIGHT_PAIRS : ABYSS_PAIRS;
    const cycleDuration = 45; // seconds per pair
    const totalCycle = pairs.length * cycleDuration;
    const t = (timeSec % totalCycle) / cycleDuration;
    const idx = Math.floor(t);
    const frac = t - idx;
    const currentPair = pairs[idx % pairs.length];
    const nextPair = pairs[(idx + 1) % pairs.length];
    // Lerp between current pair and next pair
    const [r1a, g1a, b1a] = hexToRgb(currentPair[0]);
    const [r2a, g2a, b2a] = hexToRgb(nextPair[0]);
    const [r1b, g1b, b1b] = hexToRgb(currentPair[1]);
    const [r2b, g2b, b2b] = hexToRgb(nextPair[1]);
    const toHex = (r: number, g: number, b: number) =>
      `#${Math.round(r).toString(16).padStart(2, '0')}${Math.round(g).toString(16).padStart(2, '0')}${Math.round(b).toString(16).padStart(2, '0')}`;
    return {
      colorA: toHex(r1a + (r2a - r1a) * frac, g1a + (g2a - g1a) * frac, b1a + (b2a - b1a) * frac),
      colorB: toHex(r1b + (r2b - r1b) * frac, g1b + (g2b - g1b) * frac, b1b + (b2b - b1b) * frac),
    };
  }
  const theme = getTheme(id);
  return { colorA: theme.colorA, colorB: theme.colorB };
}

/** Parse a #RRGGBB hex string → [r, g, b] integer tuple. */
export function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

/**
 * Linearly interpolate between two #RRGGBB hex colors.
 * t = 0 → colorA, t = 1 → colorB.  Returns an rgb() CSS string.
 */
export function lerpColor(colorA: string, colorB: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(colorA);
  const [r2, g2, b2] = hexToRgb(colorB);
  return `rgb(${Math.round(r1 + (r2 - r1) * t)},${Math.round(g1 + (g2 - g1) * t)},${Math.round(b1 + (b2 - b1) * t)})`;
}
