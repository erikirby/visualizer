import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { useAudioData, visualizeAudio } from "@remotion/media-utils";
import { getMusicViz, getBassEnergy, applyReactivity } from "../utils/audioColor";
import { lerpColor } from "../utils/themes";

interface DNAHelixProps {
  audioSrc: string;
  colorA?: string;
  colorB?: string;
  spectrumType?: "bass" | "wide";
  reactivity?: number;
}

// ── Constants ────────────────────────────────────────────────────────────────
const CANVAS_W   = 1920;
const CANVAS_H   = 1080;
const CX         = CANVAS_W / 2;
const CY         = CANVAS_H / 2;
const NUM_NODES  = 80;    // Number of rungs
const ROTATIONS  = 3;     // Full twists
const PERSPECTIVE = 800;  // Focal length for 3D projection
const Z_DEPTH    = 300;   // How far forward/back it swings
const RADIUS     = 180;   // Base radius of the helix

// Floating background particles
const NUM_PARTICLES = 120;

/** Deterministic hash → [0, 1) */
function h(a: number, b: number): number {
  let x = ((a * 1664525 + 1013904223 + b * 22695477) & 0x7fffffff);
  x = (((x >> 16) ^ x) * 0x45d9f3b) & 0x7fffffff;
  return (x & 0x7fffffff) / 0x7fffffff;
}

export const DNAHelix: React.FC<DNAHelixProps> = ({
  audioSrc,
  colorA = "#FF2D9B",
  colorB = "#00B4FF",
  spectrumType = "wide",
  reactivity = 0,
}) => {
  const frame     = useCurrentFrame();
  const { fps }   = useVideoConfig();
  const audioData = useAudioData(audioSrc);

  const t = frame / fps;

  // Audio reactivity — Aggressive Temporal Smoothing
  // Sample a 3-frame window to "round off" sudden jumps/spikes
  const viz = audioData ? [0, 1, 2].map(offset => {
    const targetFrame = Math.max(0, frame - offset);
    return visualizeAudio({ fps, frame: targetFrame, audioData, numberOfSamples: 128, smoothing: true });
  }) : [];

  // Average the samples
  const averagedViz = viz.length > 0 ? viz[0].map((_, i) => {
    return (viz[0][i] + (viz[1]?.[i] ?? 0) + (viz[2]?.[i] ?? 0)) / 3;
  }) : new Array(128).fill(0);

  const smoothBars = getMusicViz(averagedViz as any, 128, spectrumType);
  const rawBarsForReact = reactivity > 0 && audioData
    ? getMusicViz(visualizeAudio({ fps, frame, audioData, numberOfSamples: 128, smoothing: false }), 128, spectrumType)
    : null;
  const bars = applyReactivity(smoothBars, rawBarsForReact, reactivity);
  const bassEnergy = getBassEnergy(bars);
  const bassScale  = 1 + bassEnergy * 0.32; // restored intensity slightly now that it's smooth
  const energy     = bars.reduce((a, b) => a + (b as number), 0) / bars.length;

  // Steady, constant spin
  const baseSpin  = 0.55;
  const rotTime   = t * baseSpin;

  // ── Traveling "Light Pulse" Sweep (Gaussian) ──────────────────────────────
  // A single smooth "hump" that scans across the structure.
  const pulseSpeed = 0.25;
  const pulsePos   = (t * pulseSpeed) % 2.5 - 0.75; // Sweeps from -0.75 to 1.75
  const pulseWidth = 0.15; 

  // ── 3D Projection Helper ───────────────────────────────────────────────────
  const project = (x: number, y: number, z: number) => {
    const scale = PERSPECTIVE / (PERSPECTIVE + z);
    return {
      px: CX + (x - CX) * scale,
      py: CY + (y - CY) * scale,
      scale,
      z,
    };
  };

  const nodes: React.ReactNode[] = [];
  const rungs: React.ReactNode[] = [];

  for (let i = 0; i < NUM_NODES; i++) {
    const frac = i / (NUM_NODES - 1);
    const x = (frac - 0.5) * CANVAS_W * 1.12 + CX;
    
    // Gaussian influence: high only near the pulse center
    const dist = Math.abs(frac - pulsePos);
    const influence = Math.exp(-Math.pow(dist / pulseWidth, 2));
    
    // Purely procedural radius pulse + Audio bass pulse
    const currentRadius = (RADIUS + influence * 110) * bassScale;
    
    const angle = frac * ROTATIONS * Math.PI * 2 + rotTime;
    
    // Strand A
    const yA = CY + Math.sin(angle) * currentRadius;
    const zA = Math.cos(angle) * Z_DEPTH;
    
    // Strand B
    const yB = CY - Math.sin(angle) * currentRadius;
    const zB = -Math.cos(angle) * Z_DEPTH;

    const pA = project(x, yA, zA);
    const pB = project(x, yB, zB);
    const col = lerpColor(colorA, colorB, frac);

    // Rung line
    rungs.push(
      <line key={`r${i}`}
        x1={pA.px.toFixed(1)} y1={pA.py.toFixed(1)}
        x2={pB.px.toFixed(1)} y2={pB.py.toFixed(1)}
        stroke={col}
        strokeWidth={(1.5 * pA.scale).toFixed(2)}
        opacity={(0.15 + (pA.scale + pB.scale) / 5 + influence * 0.35).toFixed(3)}
      />
    );

    // Node A
    const opA = (0.2 + pA.scale * 0.5 + influence * 0.4 + energy * 0.3).toFixed(3);
    nodes.push(
      <g key={`na${i}`} opacity={opA}>
        <circle
          cx={pA.px.toFixed(1)} cy={pA.py.toFixed(1)}
          r={(4 * pA.scale + influence * 8 * pA.scale).toFixed(2)}
          fill="#fff"
          style={{ filter: "blur(2px)" }}
        />
        <circle
          cx={pA.px.toFixed(1)} cy={pA.py.toFixed(1)}
          r={(2 * pA.scale).toFixed(2)}
          fill={col}
        />
      </g>
    );

    // Node B
    const opB = (0.2 + pB.scale * 0.5 + influence * 0.4 + energy * 0.3).toFixed(3);
    nodes.push(
      <g key={`nb${i}`} opacity={opB}>
        <circle
          cx={pB.px.toFixed(1)} cy={pB.py.toFixed(1)}
          r={(4 * pB.scale + influence * 8 * pB.scale).toFixed(2)}
          fill="#fff"
          style={{ filter: "blur(2px)" }}
        />
        <circle
          cx={pB.px.toFixed(1)} cy={pB.py.toFixed(1)}
          r={(2 * pB.scale).toFixed(2)}
          fill={col}
        />
      </g>
    );
  }

  // Background floating particles
  const bgParticles: React.ReactNode[] = [];
  for (let j = 0; j < NUM_PARTICLES; j++) {
    const xSeed = (j * 7919) % 2000;
    const ySeed = (j * 6271) % 2000;
    const zSeed = (j * 5449) % 1000;

    const x = (xSeed / 2000) * CANVAS_W;
    const y = ((ySeed / 2000) * CANVAS_H + t * 40) % CANVAS_H;
    const z = (zSeed / 1000) * 800 - 400; // Scattered in Z

    const proj = project(x, y, z);
    const op = (0.05 + (1 - Math.abs(z) / 400) * 0.2).toFixed(3);

    bgParticles.push(
      <circle key={`p${j}`}
        cx={proj.px.toFixed(1)} cy={proj.py.toFixed(1)}
        r={(1.5 * proj.scale).toFixed(2)}
        fill={colorB}
        opacity={op}
      />
    );
  }

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <svg
        style={{ width: "100%", height: "100%", pointerEvents: "none" }}
        viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
      >
        <defs>
          <filter id="dna-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g>{bgParticles}</g>

        <g filter="url(#dna-glow)">
          {rungs}
          {nodes}
        </g>
      </svg>
    </div>
  );
};
