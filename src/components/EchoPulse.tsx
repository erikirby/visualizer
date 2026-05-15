import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { useAudioData, visualizeAudio } from "@remotion/media-utils";
import { getFreqColor, getCycleColor, getBassEnergy, getMusicViz } from "../utils/audioColor";

export type EchoPulseVariant = "bars" | "solid";

interface EchoPulseProps {
  audioSrc: string;
  variant?: EchoPulseVariant;
  layers?: boolean;
  colorA?: string;
  colorB?: string;
}

const NUM_BARS   = 80;
const INNER_R    = 200;
const MAX_BAR_H  = 300;
const BAR_WIDTH  = 4;
const CANVAS_W   = 1920;
const CANVAS_H   = 1080;
const ECHO_COUNT = 5;
const ECHO_GAP   = 7;

const SEAM_BLEND = 8;   // bars on the trailing edge that get smoothed
// Solid variant is scaled down so it doesn't fill the full frame
const SOLID_BAR_SCALE = 0.60;  // max radius = 200 + 400*0.6 = 440px

// Soft saturation — value curves up but never hits the hard ceiling
function soft(v: number): number {
  return v <= 0.65 ? v : 0.65 + (v - 0.65) * 0.2;
}

// ── Seam smoothing ────────────────────────────────────────────────────────────
// The original frequency mapping (bass→treble clockwise) is preserved untouched.
// Only the HEIGHT of the last SEAM_BLEND bars is linearly ramped toward bar 0's
// height, so the amplitude cliff at the seam becomes a gradual taper.
// Colors (getFreqColor) are NOT changed — only amplitudes.
function applySeamBlend(bars: readonly number[]): number[] {
  const n  = bars.length;
  const h0 = bars[0] ?? 0;
  return bars.map((h, i) => {
    const distFromEnd = n - 1 - i;
    if (distFromEnd >= SEAM_BLEND) return h;
    // t = 0 at the very last bar → fully becomes h0
    // t = 1 at the blend boundary → fully unchanged
    const t = distFromEnd / SEAM_BLEND;
    return h * t + h0 * (1 - t);
  });
}

// ── Smooth closed radial path (Catmull-Rom) ────────────────────────────────
// `rs[i]` = radius at angular position i/n * 2π (starting from 12 o'clock).
function buildRadialPath(rs: readonly number[], cx: number, cy: number): string {
  const n = rs.length;
  if (n < 3) return "";

  const pts: [number, number][] = rs.map((r, i) => {
    const angle = -Math.PI / 2 + (i / n) * Math.PI * 2;
    return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r];
  });
  const get = (i: number): [number, number] => pts[((i % n) + n) % n]!;

  let d = `M ${pts[0]![0].toFixed(1)} ${pts[0]![1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = get(i - 1);
    const [x1, y1] = get(i);
    const [x2, y2] = get(i + 1);
    const [x3, y3] = get(i + 2);
    const cp1x = x1 + (x2 - x0) / 6;
    const cp1y = y1 + (y2 - y0) / 6;
    const cp2x = x2 - (x3 - x1) / 6;
    const cp2y = y2 - (y3 - y1) / 6;
    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  }
  return d + " Z";
}

// A full SVG circle as a sub-path — combined with evenodd fill rule to punch
// a clean circular hole in the center of the solid variant.
function circleSubPath(cx: number, cy: number, r: number): string {
  const x1 = (cx + r).toFixed(1);
  const x2 = (cx - r).toFixed(1);
  const y  = cy.toFixed(1);
  const rs = r.toFixed(1);
  return `M ${x1} ${y} A ${rs} ${rs} 0 1 0 ${x2} ${y} A ${rs} ${rs} 0 1 0 ${x1} ${y} Z`;
}

export const EchoPulse: React.FC<EchoPulseProps> = ({
  audioSrc,
  variant = "bars",
  layers  = false,
  colorA  = "#FF2D9B",
  colorB  = "#00B4FF",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const audioData = useAudioData(audioSrc);

  if (!audioData) return null;

  const rawBars  = getMusicViz(
    visualizeAudio({ fps, frame, audioData, numberOfSamples: 256, smoothing: true }),
    NUM_BARS,
  );
  // Seam-blended bars: original frequency mapping, heights tapered at the wrap point
  const liveBars = applySeamBlend(rawBars);

  const cx = CANVAS_W / 2;
  const cy = CANVAS_H / 2;
  const t  = frame / fps;

  const mainColor   = getCycleColor(frame, fps, 28, colorA, colorB);
  // Solid mode uses a gentler glow so the diffuse halo doesn't blow out the shape
  const glowSize    = variant === "solid"
    ? 2 + getBassEnergy(rawBars) * 5
    : 3 + getBassEnergy(rawBars) * 10;
  const rotationDeg = (t * 2.5) % 360;

  // Echo rings — trailing bass-energy history, ripple outward
  const echoRadii: number[] = [];
  for (let e = 1; e <= ECHO_COUNT; e++) {
    const pastFrame = Math.max(0, frame - e * ECHO_GAP);
    const pastViz   = visualizeAudio({ fps, frame: pastFrame, audioData, numberOfSamples: 32, smoothing: true });
    echoRadii.push(INNER_R + getBassEnergy(pastViz) * MAX_BAR_H * 0.7);
  }

  // ── Bars variant ──────────────────────────────────────────────────────────
  const barsEls: React.ReactNode[] = [];
  if (variant === "bars") {
    for (let i = 0; i < NUM_BARS; i++) {
      const angle = -Math.PI / 2 + (i / NUM_BARS) * Math.PI * 2;
      const barH  = soft(liveBars[i] ?? 0) * MAX_BAR_H;
      const cosA  = Math.cos(angle);
      const sinA  = Math.sin(angle);
      const color = getFreqColor(i, NUM_BARS, colorA, colorB);  // original color sweep preserved

      barsEls.push(
        <line key={i}
          x1={(cx + cosA * INNER_R).toFixed(2)}
          y1={(cy + sinA * INNER_R).toFixed(2)}
          x2={(cx + cosA * (INNER_R + barH)).toFixed(2)}
          y2={(cy + sinA * (INNER_R + barH)).toFixed(2)}
          stroke={color}
          strokeWidth={BAR_WIDTH}
          strokeLinecap="round"
          opacity={0.95}
        />,
      );

      // Layers: bright white inner bar at 75% height
      if (layers) {
        barsEls.push(
          <line key={`l${i}`}
            x1={(cx + cosA * INNER_R).toFixed(2)}
            y1={(cy + sinA * INNER_R).toFixed(2)}
            x2={(cx + cosA * (INNER_R + barH * 0.75)).toFixed(2)}
            y2={(cy + sinA * (INNER_R + barH * 0.75)).toFixed(2)}
            stroke="rgba(255,255,255,0.72)"
            strokeWidth={BAR_WIDTH * 0.55}
            strokeLinecap="round"
            opacity={0.95}
          />,
        );
      }
    }
  }

  // ── Solid variant — path data ─────────────────────────────────────────────
  // Use seam-blended liveBars (original frequency mapping) scaled down so the
  // shape doesn't dominate the frame. SOLID_BAR_SCALE caps max radius at ~440px.
  const outerRs = Array.from({ length: NUM_BARS }, (_, i) =>
    INNER_R + soft(liveBars[i] ?? 0) * MAX_BAR_H * SOLID_BAR_SCALE,
  );
  const innerLayerRs = layers
    ? Array.from({ length: NUM_BARS }, (_, i) =>
        INNER_R + soft(liveBars[i] ?? 0) * MAX_BAR_H * SOLID_BAR_SCALE * 0.75,
      )
    : [];

  const holePath       = variant === "solid" ? circleSubPath(cx, cy, INNER_R) : "";
  const outerPath      = variant === "solid" ? buildRadialPath(outerRs, cx, cy) : "";
  const innerLayerPath = (variant === "solid" && layers)
    ? buildRadialPath(innerLayerRs, cx, cy)
    : "";

  return (
    <svg
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
      viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <filter id="echo-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={glowSize} result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <radialGradient id="echo-bg" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="rgba(8,8,24,0.55)" />
          <stop offset="100%" stopColor="rgba(8,8,24,0)"    />
        </radialGradient>
        {/* Solid variant gradient — anchored to screen space so color stays
            fixed as the shape rotates, creating a dynamic color-shift sweep */}
        {variant === "solid" && (
          <radialGradient
            id="ep-solid-grad"
            cx={cx} cy={cy}
            r={INNER_R + MAX_BAR_H}
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%"   stopColor={colorA} stopOpacity={0.90} />
            <stop offset="100%" stopColor={colorB} stopOpacity={0.85} />
          </radialGradient>
        )}
      </defs>

      {/* Dark center veil */}
      <ellipse
        cx={cx} cy={cy}
        rx={INNER_R + MAX_BAR_H + 80}
        ry={INNER_R + MAX_BAR_H + 80}
        fill="url(#echo-bg)"
      />

      {/* Echo rings — trailing bass energy, rippling outward */}
      {echoRadii.map((r, e) => (
        <circle key={`echo-${e}`}
          cx={cx} cy={cy} r={r}
          fill="none" stroke={mainColor}
          strokeWidth={1.5 - e * 0.2}
          opacity={(1 - (e + 1) / (ECHO_COUNT + 1)) * 0.55}
        />
      ))}

      {/* Inner reference ring */}
      <circle cx={cx} cy={cy} r={INNER_R - 2}
        fill="none"
        stroke={getCycleColor(frame, fps, 42, colorA, colorB)}
        strokeWidth={1} opacity={0.35}
      />

      {/* Live EQ — slow rotation */}
      <g filter="url(#echo-glow)" transform={`rotate(${rotationDeg.toFixed(2)}, ${cx}, ${cy})`}>

        {variant === "bars" && barsEls}

        {variant === "solid" && (
          <>
            {/* Main donut: outer wave shape with inner circle punched out */}
            <path
              d={`${outerPath} ${holePath}`}
              fill="url(#ep-solid-grad)"
              fillRule="evenodd"
              opacity={layers ? 0.55 : 0.65}
            />
            {/* Layers: bright white inner donut at 75% radial extent */}
            {layers && innerLayerPath && (
              <path
                d={`${innerLayerPath} ${holePath}`}
                fill="rgba(255,255,255,0.70)"
                fillRule="evenodd"
              />
            )}
          </>
        )}

      </g>
    </svg>
  );
};
