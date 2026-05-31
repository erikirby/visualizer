import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { useAudioData, visualizeAudio } from "@remotion/media-utils";
import { getMusicViz, getBassEnergy } from "../utils/audioColor";
import { lerpColor } from "../utils/themes";

// Radial lines from center, one per frequency bin, slowly rotating.
// Distinct from EchoPulse: emanates from a single point (not a ring),
// has continuous rotation, and uses line geometry not arcs.

const CANVAS_W = 1920;
const CANVAS_H = 1080;
const CX = CANVAS_W / 2;
const CY = CANVAS_H / 2;

const NUM_SPOKES = 120;       // frequency bins mapped around the circle
const INNER_R = 28;           // spokes start this far from center
const MAX_SPOKE_LEN = 480;    // max spoke length at full amplitude
const ROTATE_SPEED = 12;      // degrees per second

const NUM_FREQ = NUM_SPOKES;

function buildBandPeaks(
  audioData: ReturnType<typeof useAudioData>,
  fps: number,
): number[] {
  if (!audioData) return new Array(NUM_FREQ).fill(0.1);
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
      NUM_FREQ,
    ),
  );
  return Array.from({ length: NUM_FREQ }, (_, i) =>
    Math.max(...refs.map((r) => r[i] ?? 0), 0.08),
  );
}

export interface StarburstVizProps {
  audioSrc: string;
  colorA?: string;
  colorB?: string;
  spectrumType?: "bass" | "wide";
  reactivity?: number;
}

export const StarburstViz: React.FC<StarburstVizProps> = ({
  audioSrc,
  colorA = "#FF2D9B",
  colorB = "#00B4FF",
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
    NUM_FREQ,
    spectrumType,
  );

  const vizSmooth = visualizeAudio({ fps, frame, audioData, numberOfSamples: 32, smoothing: true });
  const bassEnergy = getBassEnergy(vizSmooth);

  // Continuous rotation
  const rotationDeg = (t * ROTATE_SPEED) % 360;
  const rotationRad = (rotationDeg * Math.PI) / 180;

  const glowLines: React.ReactNode[] = [];
  const brightLines: React.ReactNode[] = [];

  for (let i = 0; i < NUM_SPOKES; i++) {
    const angle = rotationRad + (i / NUM_SPOKES) * Math.PI * 2;
    const raw = viz[i] ?? 0;
    const peak = bandPeaks[i] ?? 0.08;
    const normed = Math.min(1, (raw / peak) * 0.55);

    // Ambient so spokes never fully disappear
    const ambient = 0.06 + 0.03 * Math.sin(t * 0.8 + i * 0.4);
    const amp = Math.max(ambient, normed);

    const spokeLen = amp * MAX_SPOKE_LEN;
    const innerR = INNER_R + bassEnergy * 20;

    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const x1 = CX + cos * innerR;
    const y1 = CY + sin * innerR;
    const x2 = CX + cos * (innerR + spokeLen);
    const y2 = CY + sin * (innerR + spokeLen);

    // Color cycles around the circle: colorA at 0°, colorB at 180°, colorA at 360°
    const colorT = (Math.sin((i / NUM_SPOKES) * Math.PI) + 1) / 2;
    const color = lerpColor(colorA, colorB, colorT);

    // Outer glow layer: wide, semi-transparent
    glowLines.push(
      <line
        key={`g${i}`}
        x1={x1.toFixed(1)} y1={y1.toFixed(1)}
        x2={x2.toFixed(1)} y2={y2.toFixed(1)}
        stroke={color}
        strokeWidth={(4 + amp * 6).toFixed(1)}
        strokeOpacity={(amp * 0.45).toFixed(3)}
        strokeLinecap="round"
      />,
    );

    // Inner bright layer: thin, high opacity
    brightLines.push(
      <line
        key={`b${i}`}
        x1={x1.toFixed(1)} y1={y1.toFixed(1)}
        x2={x2.toFixed(1)} y2={y2.toFixed(1)}
        stroke={color}
        strokeWidth={(1.5 + amp * 2).toFixed(1)}
        strokeOpacity={(0.6 + amp * 0.4).toFixed(3)}
        strokeLinecap="round"
      />,
    );
  }

  // Central pulse circle — bass-reactive
  const pulseR = INNER_R * 0.7 + bassEnergy * 60;

  return (
    <svg
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
      viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
    >
      <defs>
        <filter id="sb-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="10" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <radialGradient id="sb-center" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={colorA} stopOpacity={(0.3 + bassEnergy * 0.7).toFixed(3)} />
          <stop offset="100%" stopColor={colorA} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Central glow */}
      <circle cx={CX} cy={CY} r={pulseR * 3} fill="url(#sb-center)" />

      <g filter="url(#sb-glow)">
        {glowLines}
        {brightLines}
        {/* Center dot */}
        <circle
          cx={CX} cy={CY}
          r={(6 + bassEnergy * 18).toFixed(1)}
          fill={colorA}
          opacity={(0.8 + bassEnergy * 0.2).toFixed(3)}
        />
      </g>
    </svg>
  );
};
