import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { useAudioData, visualizeAudio } from "@remotion/media-utils";
import { getMusicViz } from "../utils/audioColor";
import { lerpColor } from "../utils/themes";

// Horizontal flowing northern-lights ribbons.
// Each ribbon occupies a vertical zone and maps to a frequency range.
// Ribbon thickness / brightness is fully audio-reactive.

const CANVAS_W = 1920;
const CANVAS_H = 1080;
const NUM_POINTS = 22;   // control points per ribbon edge
const NUM_FREQ = 64;

const BANDS = [
  { centerY: 0.76, maxH: 210, lo: 0,  hi: 8  },  // sub-bass   — bottom
  { centerY: 0.60, maxH: 190, lo: 8,  hi: 18 },  // bass
  { centerY: 0.46, maxH: 170, lo: 18, hi: 32 },  // low-mid    — center
  { centerY: 0.34, maxH: 150, lo: 32, hi: 48 },  // mid
  { centerY: 0.22, maxH: 130, lo: 48, hi: 64 },  // treble     — top
] as const;

// Catmull-Rom smooth path through a set of (x,y) points
function catmullPath(pts: [number, number][], close = false): string {
  const n = pts.length;
  if (n < 2) return "";
  let d = `M ${pts[0]![0].toFixed(1)} ${pts[0]![1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[Math.min(n - 1, i + 2)]!;
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  if (close) d += " Z";
  return d;
}

export interface AuroraWaveProps {
  audioSrc: string;
  colorA?: string;
  colorB?: string;
  spectrumType?: "bass" | "wide";
}

export const AuroraWave: React.FC<AuroraWaveProps> = ({
  audioSrc,
  colorA = "#FF2D9B",
  colorB = "#00B4FF",
  spectrumType = "wide",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const audioData = useAudioData(audioSrc);

  if (!audioData) return null;

  const t = frame / fps;
  const viz = getMusicViz(
    visualizeAudio({ fps, frame, audioData, numberOfSamples: 256, smoothing: true }),
    NUM_FREQ,
    spectrumType,
  );

  const elements: React.ReactNode[] = [];

  BANDS.forEach((band, bi) => {
    // Average energy across this band's frequency range
    const binCount = band.hi - band.lo;
    const energy = viz.slice(band.lo, band.hi).reduce((a, b) => a + b, 0) / binCount;

    const centerY = band.centerY * CANVAS_H;
    const halfH = Math.max(20, energy * band.maxH * 1.4);

    // Each band gets a color between colorA and colorB
    const colorT = bi / (BANDS.length - 1);
    const bandColor = lerpColor(colorA, colorB, colorT);

    // Unique wave parameters per band
    const freq1 = 0.6 + bi * 0.15;
    const freq2 = 1.1 + bi * 0.22;
    const speed1 = 0.18 + bi * 0.07;
    const speed2 = 0.28 + bi * 0.09;
    const waveAmp1 = 18 + energy * 55;
    const waveAmp2 = 12 + energy * 35;

    // Build top and bottom edge points
    const topPts: [number, number][] = [];
    const botPts: [number, number][] = [];

    for (let j = 0; j < NUM_POINTS; j++) {
      const xNorm = j / (NUM_POINTS - 1);
      const x = xNorm * CANVAS_W;

      const wave1 = Math.sin(xNorm * freq1 * Math.PI * 2 + t * speed1 * Math.PI * 2 + bi * 1.3) * waveAmp1;
      const wave2 = Math.sin(xNorm * freq2 * Math.PI * 2 - t * speed2 * Math.PI * 2 + bi * 2.1) * waveAmp2;

      topPts.push([x, centerY - halfH + wave1 + wave2 * 0.5]);
      botPts.push([x, centerY + halfH + wave2 + wave1 * 0.4]);
    }

    // Build closed ribbon path: top edge left→right, bottom edge right→left
    const topPath = catmullPath(topPts);
    const botReversed = catmullPath([...botPts].reverse());

    // Combine into one closed shape
    const closedPath = topPath + " " + botReversed.replace(/^M[^C]*/, "L") + " Z";

    const fillOpacity = 0.25 + energy * 0.65;
    const strokeOpacity = 0.3 + energy * 0.7;

    // Outer glow ribbon
    elements.push(
      <path
        key={`r${bi}`}
        d={closedPath}
        fill={bandColor}
        fillOpacity={(fillOpacity * 0.7).toFixed(3)}
        stroke={bandColor}
        strokeWidth="2"
        strokeOpacity={strokeOpacity.toFixed(3)}
      />,
    );

    // Bright inner ribbon (narrower, more opaque)
    const innerTopPts = topPts.map(([x, y], j) => {
      const botY = botPts[j]![1];
      return [x, y + (botY - y) * 0.22] as [number, number];
    });
    const innerBotPts = botPts.map(([x, y], j) => {
      const topY = topPts[j]![1];
      return [x, y - (y - topY) * 0.22] as [number, number];
    });

    const innerTop = catmullPath(innerTopPts);
    const innerBot = catmullPath([...innerBotPts].reverse());
    const innerPath = innerTop + " " + innerBot.replace(/^M[^C]*/, "L") + " Z";

    elements.push(
      <path
        key={`ri${bi}`}
        d={innerPath}
        fill={bandColor}
        fillOpacity={(0.1 + energy * 0.55).toFixed(3)}
        stroke={bandColor}
        strokeWidth="1"
        strokeOpacity={(0.6 + energy * 0.4).toFixed(3)}
      />,
    );
  });

  return (
    <svg
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
      viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
    >
      <defs>
        <filter id="aurora-glow" x="-5%" y="-30%" width="110%" height="160%">
          <feGaussianBlur stdDeviation="18" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g filter="url(#aurora-glow)" style={{ mixBlendMode: "screen" }}>
        {elements}
      </g>
    </svg>
  );
};
