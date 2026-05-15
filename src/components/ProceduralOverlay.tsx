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
  // Uses SVG radial gradients (Remotion's canvas renderer captures SVG but not
  // CSS background-image on divs).  The viewBox is padded 50 % beyond each edge
  // so gradients have room to fade to transparent before hitting the viewport
  // boundary — eliminating the hard-clip bars that appear with a tight viewBox.
  if (type === "light-leak") {
    const t = frame / 30;

    // Blob centres oscillate across 20–80 % of the *visible* frame …
    const cx  = 50 + 30 * Math.sin(t * 0.17);          // % of W
    const cy  = 42 + 26 * Math.cos(t * 0.11 + 1.2);    // % of H
    const r   = 85 + 12 * Math.sin(t * 0.14);           // % radius

    const cx2 = 50 + 34 * Math.sin(t * 0.13 + Math.PI);
    const cy2 = 56 + 28 * Math.cos(t * 0.09 + Math.PI + 0.8);
    const r2  = 78 + 12 * Math.cos(t * 0.16 + 0.5);

    const op = opacity ?? 0.48;

    // ── Padded viewBox geometry ────────────────────────────────────────────
    // PAD = fraction of each dimension added on every side.
    // A gradient blob with r ≈ 97 % and cx near 16 % needs ~81 % extra room
    // on the left edge.  50 % padding gives ~960 px of fade-out space on each
    // side — more than enough for the biggest blobs to reach zero opacity.
    const PAD = 0.5;
    const vbX = -W * PAD;                   // e.g. -960
    const vbY = -H * PAD;                   // e.g. -540
    const vbW = W * (1 + 2 * PAD);          // e.g. 3840
    const vbH = H * (1 + 2 * PAD);          // e.g. 2160

    // Convert visible-frame-percentage positions into padded-viewBox coords:
    const toVBx = (pct: number) => (pct / 100) * W;   // stays in W coords
    const toVBy = (pct: number) => (pct / 100) * H;   // stays in H coords

    // Radii in viewBox units — % of W is a reasonable base.
    const toR = (pct: number) => (pct / 100) * W;

    const b1cx = toVBx(cx);
    const b1cy = toVBy(cy);
    const b1r  = toR(r);

    const b2cx = toVBx(cx2);
    const b2cy = toVBy(cy2);
    const b2r  = toR(r2);

    return (
      <AbsoluteFill style={{ pointerEvents: "none", opacity: op }}>
        <svg
          width="100%"
          height="100%"
          viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
          preserveAspectRatio="none"
          style={{ position: "absolute", inset: 0 }}
        >
          <defs>
            {/* Blob A — colorA */}
            <radialGradient id="ll-blob-a" cx={b1cx} cy={b1cy} r={b1r}
              gradientUnits="userSpaceOnUse">
              <stop offset="0%"   stopColor={colorA} stopOpacity={0.90} />
              <stop offset="40%"  stopColor={colorA} stopOpacity={0.40} />
              <stop offset="100%" stopColor={colorA} stopOpacity={0} />
            </radialGradient>

            {/* Blob B — colorB */}
            <radialGradient id="ll-blob-b" cx={b2cx} cy={b2cy} r={b2r}
              gradientUnits="userSpaceOnUse">
              <stop offset="0%"   stopColor={colorB} stopOpacity={0.75} />
              <stop offset="45%"  stopColor={colorB} stopOpacity={0.28} />
              <stop offset="100%" stopColor={colorB} stopOpacity={0} />
            </radialGradient>
          </defs>

          {/* Fill rects span the entire padded viewBox so the gradient is
              never cut short by the rect boundary either. */}
          <rect x={vbX} y={vbY} width={vbW} height={vbH} fill="url(#ll-blob-a)" />
          <rect x={vbX} y={vbY} width={vbW} height={vbH} fill="url(#ll-blob-b)" />
        </svg>
      </AbsoluteFill>
    );
  }

  return null;
};
