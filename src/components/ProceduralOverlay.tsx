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

    // Blobs drift freely — overflow="visible" on the SVG removes the viewport clip
    // so gradients bleed naturally to (and past) the screen edges with no hard line.
    const cx  = 50 + 30 * Math.sin(t * 0.17);
    const cy  = 42 + 26 * Math.cos(t * 0.11 + 1.2);
    const r   = 85 + 12 * Math.sin(t * 0.14);

    // Blob B: π phase-shifted so it always sits opposite A
    const cx2 = 50 + 34 * Math.sin(t * 0.13 + Math.PI);
    const cy2 = 56 + 28 * Math.cos(t * 0.09 + Math.PI + 0.8);
    const r2  = 78 + 12 * Math.cos(t * 0.16 + 0.5);

    const op = opacity ?? 0.48;

    return (
      <AbsoluteFill style={{ pointerEvents: "none", opacity: op }}>
        <svg
          width="100%" height="100%"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          overflow="visible"
          style={{ position: "absolute", inset: 0 }}
        >
          <defs>
            {/* userSpaceOnUse: cx/cy/r are direct 0-100 coords, unaffected by rect size */}
            <radialGradient id="po-leak-a" gradientUnits="userSpaceOnUse" cx={cx} cy={cy} r={r}>
              <stop offset="0%"   stopColor={colorA} stopOpacity="0.9"  />
              <stop offset="40%"  stopColor={colorA} stopOpacity="0.4"  />
              <stop offset="100%" stopColor={colorA} stopOpacity="0"    />
            </radialGradient>
            <radialGradient id="po-leak-b" gradientUnits="userSpaceOnUse" cx={cx2} cy={cy2} r={r2}>
              <stop offset="0%"   stopColor={colorB} stopOpacity="0.75" />
              <stop offset="45%"  stopColor={colorB} stopOpacity="0.28" />
              <stop offset="100%" stopColor={colorB} stopOpacity="0"    />
            </radialGradient>
          </defs>
          {/* Oversized rects so fill renders in the overflow area beyond the viewport */}
          <rect x="-50" y="-50" width="200" height="200" fill="url(#po-leak-a)" />
          <rect x="-50" y="-50" width="200" height="200" fill="url(#po-leak-b)" />
        </svg>
      </AbsoluteFill>
    );
  }

  return null;
};
