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

    const cx  = 50 + 30 * Math.sin(t * 0.17);
    const cy  = 42 + 26 * Math.cos(t * 0.11 + 1.2);
    const r   = 85 + 12 * Math.sin(t * 0.14);

    const cx2 = 50 + 34 * Math.sin(t * 0.13 + Math.PI);
    const cy2 = 56 + 28 * Math.cos(t * 0.09 + Math.PI + 0.8);
    const r2  = 78 + 12 * Math.cos(t * 0.16 + 0.5);

    const op = opacity ?? 0.48;

    // CSS radial-gradient on plain divs — no SVG viewport, no clipping, fills
    // the frame edge-to-edge no matter where the blob center drifts.
    return (
      <AbsoluteFill style={{ pointerEvents: "none", opacity: op }}>
        <div style={{
          position: "absolute", inset: 0,
          background: `radial-gradient(ellipse ${r}% ${r}% at ${cx}% ${cy}%, ${colorA}E6 0%, ${colorA}66 40%, ${colorA}00 100%)`,
        }} />
        <div style={{
          position: "absolute", inset: 0,
          background: `radial-gradient(ellipse ${r2}% ${r2}% at ${cx2}% ${cy2}%, ${colorB}BF 0%, ${colorB}47 45%, ${colorB}00 100%)`,
        }} />
      </AbsoluteFill>
    );
  }

  return null;
};
