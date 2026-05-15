import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { useAudioData, visualizeAudio } from "@remotion/media-utils";
import { getFreqColor, getCycleColor, getMusicViz } from "../utils/audioColor";

interface RadialEQProps {
  audioSrc: string;
  layout: "center" | "bottom";
}

const NUM_BARS    = 80;
const INNER_R     = 200;
const MAX_BAR_H   = 400;
const BAR_WIDTH   = 4;
const CANVAS_W    = 1920;
const CANVAS_H    = 1080;

// Slow rotation speed for center layout — full revolution every 2 minutes
const ROT_DEG_PER_SEC = 3;

export const RadialEQ: React.FC<RadialEQProps> = ({ audioSrc, layout }) => {
  const frame     = useCurrentFrame();
  const { fps }   = useVideoConfig();
  const audioData = useAudioData(audioSrc);

  // Per-band normalization — same wide-spectrum technique as BarEQ
  const bandPeaks = React.useMemo(() => {
    if (!audioData) return new Array(NUM_BARS).fill(0.08);
    const total = Math.floor(audioData.durationInSeconds * fps);
    const halfBars = Math.floor(NUM_BARS / 2);
    const refs = [0.15, 0.3, 0.45, 0.6, 0.75].map((pct) => {
      const halfViz = getMusicViz(
        visualizeAudio({ fps, frame: Math.max(0, Math.min(Math.floor(pct * total), total - 1)), audioData, numberOfSamples: 256, smoothing: false }),
        halfBars,
      );
      return [...halfViz].reverse().concat(halfViz);
    });
    return Array.from({ length: NUM_BARS }, (_, i) => Math.max(...refs.map((r) => r[i] ?? 0), 0.08));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioData, fps]);

  if (!audioData) return null;

  const t = frame / fps;

  const halfBars = Math.floor(NUM_BARS / 2);
  const rawHalf = getMusicViz(
    visualizeAudio({ fps, frame, audioData, numberOfSamples: 256, smoothing: true }),
    halfBars,
  );
  const rawViz = [...rawHalf].reverse().concat(rawHalf);

  const visualization = rawViz.map((v, i) => {
    const peak    = bandPeaks[i] ?? 0.08;
    const normed  = (v / peak) * 0.55;
    const ambient = 0.012 + 0.012 * Math.sin(t * 3 + i * 0.45);
    return Math.max(ambient, Math.min(1, normed));
  });

  const dimColor   = getCycleColor(frame, fps, 28 * 1.5);
  // Calculate bass energy using the unmirrored raw half (where bass is at index 0)
  const bassEnergy = rawHalf.slice(0, 4).reduce((a: number, b: number) => a + b, 0) / 4;
  const glowSize   = 3 + bassEnergy * 12;

  const cx = CANVAS_W / 2;
  const cy = layout === "center" ? CANVAS_H / 2 : CANVAS_H * 0.82;

  const isBottom   = layout === "bottom";
  const startAngle = isBottom ? Math.PI : -Math.PI / 2;
  const totalAngle = isBottom ? Math.PI : Math.PI * 2;

  // Slow rotation for center layout — gives constant motion even during quiet sections
  const rotationDeg = isBottom ? 0 : (t * ROT_DEG_PER_SEC) % 360;

  const bars: React.ReactNode[] = [];
  for (let i = 0; i < NUM_BARS; i++) {
    const fraction = i / NUM_BARS;
    const angle    = startAngle + fraction * totalAngle;
    const barH     = (visualization[i] ?? 0) * MAX_BAR_H;
    const cosA     = Math.cos(angle);
    const sinA     = Math.sin(angle);

    bars.push(
      <line
        key={i}
        x1={(cx + cosA * INNER_R).toFixed(2)}
        y1={(cy + sinA * INNER_R).toFixed(2)}
        x2={(cx + cosA * (INNER_R + barH)).toFixed(2)}
        y2={(cy + sinA * (INNER_R + barH)).toFixed(2)}
        stroke={getFreqColor(i, NUM_BARS)}
        strokeWidth={BAR_WIDTH}
        strokeLinecap="round"
        opacity={0.95}
      />
    );
  }

  return (
    <svg
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        overflow: "visible",
        pointerEvents: "none",
      }}
      viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <filter id="eq-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={glowSize} result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <radialGradient id="eq-bg" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="rgba(8,8,24,0.55)" />
          <stop offset="100%" stopColor="rgba(8,8,24,0)"    />
        </radialGradient>
      </defs>

      <ellipse
        cx={cx} cy={cy}
        rx={INNER_R + MAX_BAR_H + 60}
        ry={INNER_R + MAX_BAR_H + 60}
        fill="url(#eq-bg)"
      />

      {/* Bars — wrapped in rotation for center layout */}
      <g
        filter="url(#eq-glow)"
        transform={rotationDeg !== 0 ? `rotate(${rotationDeg.toFixed(2)}, ${cx}, ${cy})` : undefined}
      >
        {bars}
      </g>

      <circle
        cx={cx} cy={cy}
        r={INNER_R - 2}
        fill="none"
        stroke={dimColor}
        strokeWidth={1}
        opacity={0.4}
      />
    </svg>
  );
};
