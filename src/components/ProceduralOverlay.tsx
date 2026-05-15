import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";

// ── Types ─────────────────────────────────────────────────────────────────────
export type ProceduralOverlayType =
  | "none"         // No effect
  | "scanlines"    // CRT horizontal scan lines
  | "light-leak";   // Drifting radial gradient burst using theme colors

interface ProceduralOverlayProps {
  type:      ProceduralOverlayType;
  opacity?:  number;    // Overall intensity override
  colorA?:   string;    // Theme colorA
  colorB?:   string;    // Theme colorB
}

const W = 1920;
const H = 1080;

export const ProceduralOverlay: React.FC<ProceduralOverlayProps> = ({
  type,
  opacity,
  colorA = "#FF2D9B",
  colorB = "#00B4FF",
}) => {
  const frame = useCurrentFrame();

  if (type === "none") return null;

  // ── Scan Lines ──────────────────────────────────────────────────────────────
  if (type === "scanlines") {
    const op = opacity ?? 0.55;

    return (
      <AbsoluteFill style={{ pointerEvents: "none", opacity: op }}>
        <svg
          width="100%" height="100%"
          viewBox={`0 0 ${W} ${H}`}
          style={{ position: "absolute", inset: 0 }}
        >
          <defs>
            <pattern id="po-scan-pat" x="0" y="0" width={W} height="4" patternUnits="userSpaceOnUse">
              <line x1="0" y1="0" x2={W} y2="0" stroke="rgba(0,0,0,0.75)" strokeWidth="1.5" />
            </pattern>
          </defs>
          <rect width={W} height={H} fill="url(#po-scan-pat)" />
        </svg>
      </AbsoluteFill>
    );
  }

  // ── Light Leak ──────────────────────────────────────────────────────────────
  if (type === "light-leak") {
    const t = frame / 30;

    // Blob A: upper-left quadrant — amplitude capped so gradient fades to ~0 before frame edge
    const cx  = 34 + 12 * Math.sin(t * 0.17);           // range 22–46
    const cy  = 38 + 13 * Math.cos(t * 0.11 + 1.2);     // range 25–51
    const r   = 58 +  7 * Math.sin(t * 0.14);            // range 51–65

    // Blob B: lower-right quadrant, π phase-shifted so it always opposes A
    const cx2 = 66 + 12 * Math.sin(t * 0.13 + Math.PI); // range 54–78
    const cy2 = 62 + 14 * Math.cos(t * 0.09 + Math.PI + 0.8); // range 48–76
    const r2  = 54 +  7 * Math.cos(t * 0.16 + 0.5);     // range 47–61

    const op = opacity ?? 0.48;

    return (
      <AbsoluteFill style={{ pointerEvents: "none", opacity: op }}>
        <svg
          width="100%" height="100%"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{ position: "absolute", inset: 0 }}
        >
          <defs>
            <radialGradient id="po-leak-a" cx={`${cx}%`} cy={`${cy}%`} r={`${r}%`}>
              <stop offset="0%"   stopColor={colorA} stopOpacity="0.85" />
              <stop offset="15%"  stopColor={colorA} stopOpacity="0.38" />
              <stop offset="40%"  stopColor={colorA} stopOpacity="0.08" />
              <stop offset="70%"  stopColor={colorA} stopOpacity="0.01" />
              <stop offset="100%" stopColor={colorA} stopOpacity="0"    />
            </radialGradient>
            <radialGradient id="po-leak-b" cx={`${cx2}%`} cy={`${cy2}%`} r={`${r2}%`}>
              <stop offset="0%"   stopColor={colorB} stopOpacity="0.7"  />
              <stop offset="18%"  stopColor={colorB} stopOpacity="0.30" />
              <stop offset="45%"  stopColor={colorB} stopOpacity="0.06" />
              <stop offset="75%"  stopColor={colorB} stopOpacity="0.01" />
              <stop offset="100%" stopColor={colorB} stopOpacity="0"    />
            </radialGradient>
          </defs>
          <rect width="100" height="100" fill="url(#po-leak-a)" />
          <rect width="100" height="100" fill="url(#po-leak-b)" />
        </svg>
      </AbsoluteFill>
    );
  }

  return null;
};
