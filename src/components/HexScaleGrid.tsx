import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { useAudioData, visualizeAudio } from "@remotion/media-utils";
import { getMusicViz, getBassEnergy } from "../utils/audioColor";
import { lerpColor } from "../utils/themes";

// Hexagonal frequency grid — each hex maps to a frequency band by distance from center.
// Bass pulses at the center, treble ripples out to the edges.

const CANVAS_W = 1920;
const CANVAS_H = 1080;
const HEX_R = 56;          // pointy-top hex: radius center-to-vertex
const HEX_W = Math.sqrt(3) * HEX_R;   // ~97px
const HEX_H = 2 * HEX_R;              // 112px
const ROW_STEP = HEX_H * 0.75;        // 84px — rows overlap for tiling

// Pointy-top hexagon path centered at (0,0)
function hexPath(r: number): string {
  const pts = Array.from({ length: 6 }, (_, k) => {
    const a = (Math.PI / 180) * (60 * k - 30);
    return `${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`;
  });
  return `M ${pts.join(" L ")} Z`;
}

const INNER_PATH = hexPath(HEX_R * 0.84);
const OUTER_PATH = hexPath(HEX_R);
const NUM_FREQ_BINS = 64;

export interface HexScaleGridProps {
  audioSrc: string;
  colorA?: string;
  colorB?: string;
  spectrumType?: "bass" | "wide";
  reactivity?: number;
}

export const HexScaleGrid: React.FC<HexScaleGridProps> = ({
  audioSrc,
  colorA = "#FF2D9B",
  colorB = "#00B4FF",
  spectrumType = "wide",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const audioData = useAudioData(audioSrc);

  if (!audioData) return null;

  const viz = getMusicViz(
    visualizeAudio({ fps, frame, audioData, numberOfSamples: 256, smoothing: true }),
    NUM_FREQ_BINS,
    spectrumType,
  );
  const vizRaw = getMusicViz(
    visualizeAudio({ fps, frame, audioData, numberOfSamples: 256, smoothing: false }),
    NUM_FREQ_BINS,
    spectrumType,
  );
  const vizSmooth32 = visualizeAudio({ fps, frame, audioData, numberOfSamples: 32, smoothing: true });
  const bassEnergy = getBassEnergy(vizSmooth32);

  const cx = CANVAS_W / 2;
  const cy = CANVAS_H / 2;

  // Max distance from center to corner — used to map hex → freq bin
  const maxDist = Math.sqrt(cx * cx + cy * cy);

  // Build hex grid
  const rows = Math.ceil(CANVAS_H / ROW_STEP) + 2;
  const cols = Math.ceil(CANVAS_W / HEX_W) + 2;

  const hexes: React.ReactNode[] = [];

  for (let row = -1; row < rows; row++) {
    const isOdd = row % 2 !== 0;
    for (let col = -1; col < cols; col++) {
      const hx = col * HEX_W + (isOdd ? HEX_W * 0.5 : 0);
      const hy = row * ROW_STEP;

      // Distance from screen center → frequency bin
      const dx = hx - cx;
      const dy = hy - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const distT = Math.min(1, dist / maxDist);

      const binIdx = Math.floor(distT * (NUM_FREQ_BINS - 1));
      const amp = viz[binIdx] ?? 0;
      const rawAmp = vizRaw[binIdx] ?? 0;

      // Snap: transient energy on top of smooth
      const snap = Math.max(0, rawAmp - amp) * 1.8;
      const totalAmp = Math.min(1, amp + snap);

      // Aggressive scale — really punches on beats
      const scale = 0.82 + totalAmp * 0.65;

      // Color: center = colorA, edges = colorB
      const color = lerpColor(colorA, colorB, distT);

      // Much higher opacity range so hexes visibly flash
      const fillOpacity = 0.02 + totalAmp * 0.92;
      const strokeOpacity = 0.08 + totalAmp * 0.92;

      hexes.push(
        <g key={`${row}-${col}`} transform={`translate(${hx.toFixed(1)},${hy.toFixed(1)}) scale(${scale.toFixed(3)})`}>
          <path d={INNER_PATH} fill={color} fillOpacity={fillOpacity.toFixed(3)} />
          <path d={OUTER_PATH} fill="none" stroke={color} strokeWidth="2" strokeOpacity={strokeOpacity.toFixed(3)} />
        </g>,
      );
    }
  }

  // Beat flash — center hexes erupt on kick
  const kickTransient = Math.max(0, getBassEnergy(
    visualizeAudio({ fps, frame, audioData, numberOfSamples: 32, smoothing: false })
  ) - bassEnergy - 0.08) * 4;

  return (
    <svg
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
      viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
    >
      <defs>
        <filter id="hex-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <radialGradient id="hex-beat" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={colorA} stopOpacity={(kickTransient * 0.55).toFixed(3)} />
          <stop offset="60%" stopColor={colorA} stopOpacity={(kickTransient * 0.15).toFixed(3)} />
          <stop offset="100%" stopColor={colorA} stopOpacity="0" />
        </radialGradient>
      </defs>
      <g filter="url(#hex-glow)">{hexes}</g>
      {/* Beat flash radial burst from center */}
      {kickTransient > 0.05 && (
        <ellipse cx={cx} cy={cy} rx={600} ry={400} fill="url(#hex-beat)" style={{ mixBlendMode: "screen" }} />
      )}
    </svg>
  );
};
