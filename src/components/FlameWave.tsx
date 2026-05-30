import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { useAudioData, visualizeAudio } from "@remotion/media-utils";
import { getMusicViz } from "../utils/audioColor";

const NUM_FLAMES = 56;
const CANVAS_W = 1920;
const CANVAS_H = 1080;
const MARGIN = 100;
const MAX_FLAME_H = 580;
const BASE_Y = CANVAS_H;

function buildBandPeaks(
  audioData: ReturnType<typeof useAudioData>,
  fps: number,
): number[] {
  if (!audioData) return new Array(NUM_FLAMES).fill(0.1);
  const total = Math.floor(audioData.durationInSeconds * fps);
  const pcts = Array.from({ length: 15 }, (_, k) => (k + 1) / 16);
  const refs = pcts.map((pct) =>
    getMusicViz(
      visualizeAudio({
        fps,
        frame: Math.max(0, Math.min(Math.floor(pct * total), total - 1)),
        audioData,
        numberOfSamples: 256,
        smoothing: false,
      }),
      NUM_FLAMES,
    ),
  );
  return Array.from({ length: NUM_FLAMES }, (_, i) =>
    Math.max(...refs.map((r) => r[i] ?? 0), 0.08),
  );
}

export interface FlameWaveProps {
  audioSrc: string;
  colorA?: string; // main flame color (mid-height)
  colorB?: string; // base color (bottom)
  spectrumType?: "bass" | "wide";
  reactivity?: number;
}

export const FlameWave: React.FC<FlameWaveProps> = ({
  audioSrc,
  colorA = "#FF2D9B",
  colorB = "#FF8C00",
  spectrumType = "wide",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const audioData = useAudioData(audioSrc);

  const bandPeaks = React.useMemo(
    () => buildBandPeaks(audioData, fps),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [audioData, fps],
  );

  if (!audioData) return null;

  const t = frame / fps;
  const viz = getMusicViz(
    visualizeAudio({ fps, frame, audioData, numberOfSamples: 256, smoothing: true }),
    NUM_FLAMES,
    spectrumType,
  );

  const flameSpacing = (CANVAS_W - MARGIN * 2) / NUM_FLAMES;

  let maxH = 0;
  type FlameEntry = { outerPath: string; innerPath: string; opacity: number; normed: number };
  const flames: FlameEntry[] = [];

  for (let i = 0; i < NUM_FLAMES; i++) {
    const raw = viz[i] ?? 0;
    const peak = bandPeaks[i] ?? 0.08;
    const normed = Math.min(1, (raw / peak) * 0.55);

    // Organic flutter — multiple sin frequencies, scales with amplitude
    const flutter =
      Math.sin(t * 1.4 + i * 0.83) * 0.14 +
      Math.sin(t * 3.2 + i * 1.51) * 0.08 +
      Math.sin(t * 6.1 + i * 2.77) * 0.04;

    const ambient = 0.04 + 0.025 * Math.sin(t * 0.6 + i * 0.55);
    const val = Math.max(ambient, normed + flutter * Math.max(normed, 0.15));

    // Edge taper
    const edgeT = i / (NUM_FLAMES - 1);
    const edgeFade = Math.min(1, edgeT * 5, (1 - edgeT) * 5);
    const height = val * edgeFade * MAX_FLAME_H;

    if (height > maxH) maxH = height;

    const cx = MARGIN + (i + 0.5) * flameSpacing;
    const halfW = flameSpacing * 0.72;
    const innerHalfW = halfW * 0.55;

    // Tip sways horizontally
    const swayX = Math.sin(t * 1.1 + i * 2.03) * flameSpacing * 0.28;
    const tipX = cx + swayX;
    const tipY = BASE_Y - height;
    const innerTipY = BASE_Y - height * 0.65;
    const ctrlY = BASE_Y - height * 0.38;
    const innerCtrlY = BASE_Y - height * 0.65 * 0.38;

    const mkPath = (tx: number, ty: number, hw: number, cy_ctrl: number) => [
      `M ${(cx - hw).toFixed(1)} ${BASE_Y}`,
      `Q ${(tx - hw * 0.18).toFixed(1)} ${cy_ctrl.toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)}`,
      `Q ${(tx + hw * 0.18).toFixed(1)} ${cy_ctrl.toFixed(1)} ${(cx + hw).toFixed(1)} ${BASE_Y}`,
      "Z",
    ].join(" ");

    flames.push({
      outerPath: mkPath(tipX, tipY, halfW, ctrlY),
      innerPath: mkPath(tipX * 0.15 + cx * 0.85, innerTipY, innerHalfW, innerCtrlY),
      opacity: 0.68 + normed * 0.32,
      normed,
    });
  }

  const glowSize = 7 + maxH * 0.022;
  const gradTopY = Math.max(0, BASE_Y - maxH * 1.15);

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
    >
      <defs>
        <filter id="fw-glow" x="-5%" y="-25%" width="110%" height="150%">
          <feGaussianBlur stdDeviation={glowSize} result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <linearGradient id="fw-outer" x1="0" y1={BASE_Y} x2="0" y2={gradTopY} gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={colorB} stopOpacity="0.95" />
          <stop offset="50%" stopColor={colorA} stopOpacity="0.95" />
          <stop offset="100%" stopColor="#fff0f8" stopOpacity="0.8" />
        </linearGradient>
        <linearGradient id="fw-inner" x1="0" y1={BASE_Y} x2="0" y2={gradTopY} gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={colorA} />
          <stop offset="100%" stopColor="#ffffff" />
        </linearGradient>
      </defs>

      <g filter="url(#fw-glow)">
        {flames.map((f, i) => (
          <path key={i} d={f.outerPath} fill="url(#fw-outer)" opacity={f.opacity.toFixed(3)} />
        ))}
        {flames.map((f, i) => (
          <path key={`c${i}`} d={f.innerPath} fill="url(#fw-inner)" opacity={(f.normed * 0.85 + 0.1).toFixed(3)} />
        ))}
      </g>
    </svg>
  );
};
