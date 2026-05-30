import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { useAudioData, visualizeAudio } from "@remotion/media-utils";
import { getBassEnergy } from "../utils/audioColor";

// Overlays a character PNG (with white background) onto the composition.
// Uses an SVG feColorMatrix filter to remove the white background.
// Adds a beat-reactive colored glow aura around the character.

const CANVAS_W = 1920;
const CANVAS_H = 1080;

// Target rendered size and position (bottom-right quadrant, slightly off-center)
const CHAR_W = 700;
const CHAR_H = 700;
const CHAR_X = CANVAS_W - CHAR_W - 80;
const CHAR_Y = CANVAS_H - CHAR_H - 40;

export interface SalazzleOverlayProps {
  charSrc: string;
  colorA?: string;
  glowBase?: number;   // 0–1, default glow intensity
  glowBoost?: number;  // additional glow on bass hit
}

export const SalazzleOverlay: React.FC<SalazzleOverlayProps> = ({
  charSrc,
  colorA = "#FF2D9B",
  glowBase = 0.4,
  glowBoost = 1.2,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const audioData = useAudioData(charSrc);  // not used for audio — see note
  void audioData; // suppress unused warning

  // We need the audio from VisualizerMain's audio element.
  // Since we don't have the audioSrc here, use a lightweight placeholder.
  // The parent (VisualizerMain) already has the audio playing, so we just
  // use frame to drive a gentle ambient pulse.
  const t = frame / fps;
  const pulse = (Math.sin(t * 1.8) + 1) / 2 * 0.3; // gentle ambient breathe

  const glowIntensity = glowBase + pulse * glowBoost;
  const glowBlur = 18 + glowIntensity * 40;
  const scale = 1 + pulse * 0.015;

  const midX = CHAR_X + CHAR_W / 2;
  const midY = CHAR_Y + CHAR_H / 2;

  return (
    <svg
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
      viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
    >
      <defs>
        {/* Remove white background from official art PNG */}
        <filter id="sal-white-rm" colorInterpolationFilters="sRGB">
          <feColorMatrix
            type="matrix"
            values="1 0 0 0 0
                    0 1 0 0 0
                    0 0 1 0 0
                   -3 -3 -3 9 -1"
          />
        </filter>

        {/* Colored glow around the character */}
        <filter id="sal-glow" x="-40%" y="-40%" width="180%" height="180%" colorInterpolationFilters="sRGB">
          <feColorMatrix
            type="matrix"
            values="1 0 0 0 0
                    0 1 0 0 0
                    0 0 1 0 0
                   -3 -3 -3 9 -1"
            result="alpha-removed"
          />
          <feFlood floodColor={colorA} floodOpacity="1" result="flood" />
          <feComposite in="flood" in2="alpha-removed" operator="in" result="colored" />
          <feGaussianBlur in="colored" stdDeviation={glowBlur} result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="alpha-removed" />
          </feMerge>
        </filter>
      </defs>

      {/* Glow layer (blurred + colored) */}
      <image
        href={charSrc}
        x={CHAR_X}
        y={CHAR_Y}
        width={CHAR_W}
        height={CHAR_H}
        filter="url(#sal-glow)"
        opacity={(0.7 + glowIntensity * 0.3).toFixed(3)}
        transform={`scale(${scale.toFixed(4)}) translate(${((midX * (1 - scale)) / scale).toFixed(1)},${((midY * (1 - scale)) / scale).toFixed(1)})`}
        preserveAspectRatio="xMidYMid meet"
      />
    </svg>
  );
};

// Beat-reactive version that takes audioSrc
export interface SalazzleOverlayAudioProps extends Omit<SalazzleOverlayProps, "glowBase" | "glowBoost"> {
  audioSrc: string;
}

export const SalazzleOverlayAudio: React.FC<SalazzleOverlayAudioProps> = ({
  charSrc,
  colorA = "#FF2D9B",
  audioSrc,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const audioData = useAudioData(audioSrc);

  const { bassEnergy, transient } = React.useMemo(() => {
    if (!audioData) return { bassEnergy: 0, transient: 0 };
    const vizSmooth = visualizeAudio({ fps, frame, audioData, numberOfSamples: 32, smoothing: true });
    const vizRaw    = visualizeAudio({ fps, frame, audioData, numberOfSamples: 32, smoothing: false });
    const smooth = getBassEnergy(vizSmooth);
    const raw    = getBassEnergy(vizRaw);
    return { bassEnergy: smooth, transient: Math.max(0, raw - smooth - 0.08) * 3 };
  }, [audioData, frame, fps]);

  const glowIntensity = 0.3 + bassEnergy * 0.7 + transient * 0.8;
  const glowBlur = 14 + glowIntensity * 50;
  const scale = 1 + bassEnergy * 0.02 + transient * 0.03;

  const midX = CHAR_X + CHAR_W / 2;
  const midY = CHAR_Y + CHAR_H / 2;

  return (
    <svg
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
      viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
    >
      <defs>
        <filter id="sal-white-rm2" colorInterpolationFilters="sRGB">
          <feColorMatrix
            type="matrix"
            values="1 0 0 0 0
                    0 1 0 0 0
                    0 0 1 0 0
                   -3 -3 -3 9 -1"
          />
        </filter>
        <filter id="sal-glow2" x="-40%" y="-40%" width="180%" height="180%" colorInterpolationFilters="sRGB">
          <feColorMatrix
            type="matrix"
            values="1 0 0 0 0
                    0 1 0 0 0
                    0 0 1 0 0
                   -3 -3 -3 9 -1"
            result="alpha-removed"
          />
          <feFlood floodColor={colorA} floodOpacity="1" result="flood" />
          <feComposite in="flood" in2="alpha-removed" operator="in" result="colored" />
          <feGaussianBlur in="colored" stdDeviation={glowBlur} result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="alpha-removed" />
          </feMerge>
        </filter>
      </defs>

      <image
        href={charSrc}
        x={CHAR_X}
        y={CHAR_Y}
        width={CHAR_W}
        height={CHAR_H}
        filter="url(#sal-glow2)"
        opacity={(0.8 + glowIntensity * 0.2).toFixed(3)}
        transform={`scale(${scale.toFixed(4)}) translate(${((midX * (1 - scale)) / scale).toFixed(1)},${((midY * (1 - scale)) / scale).toFixed(1)})`}
        preserveAspectRatio="xMidYMid meet"
      />
    </svg>
  );
};
