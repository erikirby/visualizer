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
  // Remotion's canvas renderer rasterizes SVGs at their element dimensions and
  // clips at the SVG boundary. In the browser preview it looks fine, but on
  // export the gradient gets hard-clipped wherever it's still visible at the
  // SVG edge. Fix: make the SVG physically larger than the frame (by PAD px on
  // each side) and position it with negative offsets. The composition boundary
  // clips the overflow — but at the frame edge the gradient is smooth because
  // the hard SVG clip happens well outside the visible area.
  if (type === "light-leak") {
    const t = frame / 30;

    const cxPct = 50 + 30 * Math.sin(t * 0.17);
    const cyPct = 42 + 26 * Math.cos(t * 0.11 + 1.2);
    const rPct  = 85 + 12 * Math.sin(t * 0.14);

    const cx2Pct = 50 + 34 * Math.sin(t * 0.13 + Math.PI);
    const cy2Pct = 56 + 28 * Math.cos(t * 0.09 + Math.PI + 0.8);
    const r2Pct  = 78 + 12 * Math.cos(t * 0.16 + 0.5);

    const op = opacity ?? 0.48;

    // Extra pixels on every side — pushes the SVG boundary far outside the
    // visible frame so the gradient's hard clip is never seen.
    const PAD = 600;
    const totalW = W + 2 * PAD;   // 3120
    const totalH = H + 2 * PAD;   // 2280

    // Gradient positions: offset by PAD so (0%,0%) of the frame = (PAD,PAD)
    const b1cx = PAD + (cxPct / 100) * W;
    const b1cy = PAD + (cyPct / 100) * H;
    const b1r  = (rPct / 100) * W;

    const b2cx = PAD + (cx2Pct / 100) * W;
    const b2cy = PAD + (cy2Pct / 100) * H;
    const b2r  = (r2Pct / 100) * W;

    return (
      <AbsoluteFill style={{ pointerEvents: "none", opacity: op }}>
        <svg
          width={totalW}
          height={totalH}
          viewBox={`0 0 ${totalW} ${totalH}`}
          style={{
            position: "absolute",
            left: -PAD,
            top: -PAD,
          }}
        >
          <defs>
            <radialGradient id="ll-blob-a" cx={b1cx} cy={b1cy} r={b1r}
              gradientUnits="userSpaceOnUse">
              <stop offset="0%"   stopColor={colorA} stopOpacity={0.90} />
              <stop offset="40%"  stopColor={colorA} stopOpacity={0.40} />
              <stop offset="100%" stopColor={colorA} stopOpacity={0} />
            </radialGradient>

            <radialGradient id="ll-blob-b" cx={b2cx} cy={b2cy} r={b2r}
              gradientUnits="userSpaceOnUse">
              <stop offset="0%"   stopColor={colorB} stopOpacity={0.75} />
              <stop offset="45%"  stopColor={colorB} stopOpacity={0.28} />
              <stop offset="100%" stopColor={colorB} stopOpacity={0} />
            </radialGradient>
          </defs>

          <rect width={totalW} height={totalH} fill="url(#ll-blob-a)" />
          <rect width={totalW} height={totalH} fill="url(#ll-blob-b)" />
        </svg>
      </AbsoluteFill>
    );
  }

  return null;
};
