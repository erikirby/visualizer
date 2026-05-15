import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { useAudioData, visualizeAudio } from "@remotion/media-utils";
import { getMusicViz, getBassEnergy } from "../utils/audioColor";
import { lerpColor } from "../utils/themes";

interface ConstellationNetProps {
  audioSrc: string;
  colorA?:  string;
  colorB?:  string;
  // Derived from audioDuration in VisualizerMain — different songs = different layouts.
  seed?: number;
  showNames?: boolean;
  spectrumType?: "bass" | "wide";
}

const W = 1920;
const H = 1080;
// Sky canvas is 40% larger so stars populate off-screen during drift
const SKY_W = Math.round(W * 1.4);
const SKY_H = Math.round(H * 1.4);
const SKY_OFFSET_X = Math.round((SKY_W - W) / 2);
const SKY_OFFSET_Y = Math.round((SKY_H - H) / 2);
// How long (seconds) for one full drift oscillation — very slow
const DRIFT_PERIOD_S = 900;  // 15-minute arc cycle

// ── Constellation definitions ─────────────────────────────────────────────────
// stars: [x,y] normalized 0–1 in bounding box  ·  edges: index pairs
interface ConDef { name: string; stars: [number, number][]; edges: [number, number][]; }

const CONSTELLATIONS: ConDef[] = [
  {
    name: "Orion",
    stars: [[0.48,0.05],[0.15,0.32],[0.82,0.28],[0.62,0.57],[0.48,0.60],[0.34,0.63],[0.20,0.95],[0.82,0.93]],
    edges: [[0,1],[0,2],[1,2],[1,5],[2,3],[3,4],[4,5],[5,6],[3,7]],
  },
  {
    name: "Ursa Major",
    stars: [[0.00,0.48],[0.20,0.65],[0.48,0.72],[0.44,0.42],[0.64,0.28],[0.82,0.14],[1.00,0.00]],
    edges: [[0,1],[1,2],[2,3],[3,0],[3,4],[4,5],[5,6]],
  },
  {
    name: "Cassiopeia",
    stars: [[0.00,0.28],[0.25,0.75],[0.50,0.12],[0.75,0.68],[1.00,0.24]],
    edges: [[0,1],[1,2],[2,3],[3,4]],
  },
  {
    name: "Aries",
    stars: [[0.00,0.38],[0.42,0.55],[0.60,0.62],[0.82,0.18]],
    edges: [[0,1],[1,2],[0,3]],
  },
  {
    name: "Taurus",
    stars: [[0.08,0.12],[0.28,0.55],[0.44,0.42],[0.58,0.28],[0.38,0.70],[0.52,0.58],[0.75,0.38],[0.88,0.15],[0.90,0.82]],
    edges: [[0,1],[1,2],[1,4],[2,3],[3,6],[6,7],[4,5],[6,8]],
  },
  {
    name: "Gemini",
    stars: [[0.20,0.00],[0.80,0.00],[0.10,0.35],[0.45,0.35],[0.05,0.62],[0.62,0.48],[0.00,0.90],[0.88,0.75]],
    edges: [[0,2],[0,3],[1,3],[1,5],[2,4],[4,6],[3,5],[5,7],[6,7]],
  },
  {
    name: "Cancer",
    stars: [[0.05,0.85],[0.40,0.55],[0.55,0.32],[0.88,0.05],[0.85,0.90]],
    edges: [[0,1],[1,2],[2,3],[1,4]],
  },
  {
    name: "Leo",
    stars: [[0.12,0.82],[0.20,0.52],[0.32,0.20],[0.44,0.05],[0.56,0.18],[0.60,0.50],[0.72,0.52],[1.00,0.40],[0.80,0.72]],
    edges: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,0],[5,6],[6,7],[6,8]],
  },
  {
    name: "Virgo",
    stars: [[0.72,0.95],[0.50,0.62],[0.18,0.50],[0.55,0.38],[0.72,0.25],[0.40,0.22],[0.28,0.70],[0.88,0.55]],
    edges: [[0,7],[7,4],[4,3],[3,1],[1,0],[1,6],[6,2],[3,5]],
  },
  {
    name: "Libra",
    stars: [[0.78,0.12],[0.22,0.62],[0.05,0.08],[0.95,0.88],[0.42,0.92]],
    edges: [[2,0],[0,1],[0,3],[1,4],[3,4],[2,1]],
  },
  {
    name: "Scorpius",
    stars: [
      [0.45,0.00],[0.28,0.08],[0.20,0.25],[0.38,0.18],[0.55,0.08],
      [0.15,0.40],[0.18,0.52],[0.25,0.63],[0.33,0.72],
      [0.42,0.80],[0.53,0.85],[0.65,0.82],[0.78,0.72],[0.85,0.60],
    ],
    edges: [[0,1],[0,4],[1,3],[1,2],[2,5],[3,4],[5,6],[6,7],[7,8],[8,9],[9,10],[10,11],[11,12],[12,13]],
  },
  {
    name: "Sagittarius",
    stars: [[0.58,0.90],[0.44,0.70],[0.28,0.45],[0.72,0.38],[0.62,0.55],[0.72,0.72],[0.85,0.25],[0.42,0.28]],
    edges: [[0,1],[1,2],[0,5],[5,4],[4,3],[3,6],[6,7],[7,2],[1,4],[3,4]],
  },
  {
    name: "Capricornus",
    stars: [[0.00,0.15],[0.12,0.25],[0.38,0.05],[0.62,0.18],[0.80,0.45],[0.88,0.55],[0.70,0.72],[0.48,0.82],[0.28,0.72],[0.14,0.55]],
    edges: [[0,1],[0,9],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,8],[8,9],[9,1],[3,6]],
  },
  {
    name: "Aquarius",
    stars: [[0.25,0.05],[0.00,0.28],[0.38,0.28],[0.45,0.55],[0.55,0.38],[0.65,0.22],[0.75,0.15],[0.60,0.65]],
    edges: [[0,2],[1,2],[2,4],[4,5],[5,6],[4,3],[3,7]],
  },
  {
    name: "Pisces",
    stars: [[0.52,0.38],[0.62,0.20],[0.75,0.10],[0.88,0.22],[0.88,0.45],[0.10,0.58],[0.25,0.78],[0.44,0.88],[0.60,0.75]],
    edges: [[0,1],[1,2],[2,3],[3,4],[4,0],[0,8],[8,7],[7,6],[6,5],[5,0]],
  },
  {
    name: "Lyra",
    stars: [[0.50,0.00],[0.20,0.58],[0.42,0.88],[0.58,0.88],[0.80,0.58]],
    edges: [[0,1],[0,4],[1,2],[2,3],[3,4],[1,4]],
  },
  {
    name: "Cygnus",
    stars: [[0.50,0.00],[0.50,0.48],[0.50,1.00],[0.00,0.44],[1.00,0.44]],
    edges: [[0,1],[1,2],[3,1],[1,4]],
  },
  {
    name: "Aquila",
    stars: [[0.50,0.00],[0.38,0.30],[0.50,0.50],[0.62,0.30],[0.18,0.52],[0.50,0.82],[0.82,0.44]],
    edges: [[0,1],[1,2],[2,3],[3,0],[2,4],[2,5],[2,6]],
  },
  {
    name: "Perseus",
    stars: [[0.62,0.00],[0.78,0.20],[0.55,0.30],[0.35,0.45],[0.20,0.58],[0.40,0.68],[0.60,0.60],[0.80,0.40]],
    edges: [[0,1],[0,2],[2,3],[3,4],[3,5],[3,6],[1,7],[7,2]],
  },
  {
    name: "Boötes",
    stars: [[0.50,0.00],[0.20,0.30],[0.50,0.50],[0.80,0.30],[0.08,0.60],[0.92,0.58],[0.50,1.00]],
    edges: [[0,1],[0,3],[1,2],[2,3],[1,4],[3,5],[2,6]],
  },
  {
    name: "Corona Borealis",
    stars: [[0.00,0.75],[0.18,0.28],[0.40,0.00],[0.62,0.05],[0.80,0.28],[0.96,0.62],[1.00,0.92]],
    edges: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6]],
  },
  {
    name: "Hercules",
    stars: [[0.35,0.00],[0.65,0.00],[0.20,0.45],[0.80,0.45],[0.10,0.68],[0.90,0.68],[0.28,1.00],[0.72,1.00]],
    edges: [[0,1],[0,2],[1,3],[2,3],[2,4],[3,5],[4,6],[5,7]],
  },
  {
    name: "Cepheus",
    stars: [[0.50,0.00],[0.00,0.55],[0.18,1.00],[0.82,1.00],[1.00,0.55]],
    edges: [[0,1],[0,4],[1,2],[2,3],[3,4],[1,4]],
  },
  {
    name: "Pegasus",
    stars: [[0.00,0.00],[1.00,0.00],[1.00,0.85],[0.00,0.85],[0.00,0.40]],
    edges: [[0,1],[1,2],[2,3],[3,0],[0,4]],
  },
  {
    name: "Draco",
    stars: [[0.60,0.00],[0.82,0.18],[1.00,0.32],[0.72,0.48],[0.50,0.44],[0.30,0.60],[0.16,0.80],[0.32,1.00]],
    edges: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[3,0]],
  },
];

const NUM_CONSTELLATIONS = CONSTELLATIONS.length;  // 25

// ── Deterministic hash → [0, 1) ──────────────────────────────────────────────
function h(a: number, b: number): number {
  let x = ((a * 1664525 + 1013904223 + b * 22695477) & 0x7fffffff);
  x = (((x >> 16) ^ x) * 0x45d9f3b) & 0x7fffffff;
  x = (((x >> 16) ^ x) * 0x45d9f3b) & 0x7fffffff;
  return (x & 0x7fffffff) / 0x7fffffff;
}

// ── Organic scatter with rejection sampling ───────────────────────────────────
// Positions are seeded from audioDuration so every song gets a unique layout.
// MIN_SEP prevents overlapping constellations; 60-attempt rejection + fallback
// guarantees every constellation gets placed.
const MIN_SEP  = 155;   // ← was 195, tighter to pack constellations more densely
const PAD      = 60;    // ← was 80
const STAR_SCALE = 165; // ← was 148, slightly larger bounding boxes

function computeConPositions(n: number, seed: number): [number, number][] {
  const positions: [number, number][] = [];
  const pad = PAD;
  for (let i = 0; i < n; i++) {
    let placed = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      // Scatter across the LARGER sky canvas so constellations exist off-screen
      const cx = pad + h(i * 7919 + attempt * 997 + seed, 11) * (SKY_W - 2 * pad);
      const cy = pad + h(i * 6271 + attempt * 997 + seed, 13) * (SKY_H - 2 * pad);
      let ok = true;
      for (const [px, py] of positions) {
        if (Math.hypot(cx - px, cy - py) < MIN_SEP) { ok = false; break; }
      }
      if (ok) { positions.push([cx, cy]); placed = true; break; }
    }
    if (!placed) {
      positions.push([
        pad + h(i * 7919 + seed, 11) * (SKY_W - 2 * pad),
        pad + h(i * 6271 + seed, 13) * (SKY_H - 2 * pad),
      ]);
    }
  }
  return positions;
}

// ── Stellar magnitude (0 = dim, 1 = bright) — fixed per star ─────────────────
// Simulates the natural variation in star brightness — brighter stars are bigger
// and more opaque.  Derived from a hash of (constellation, star index) so it's
// stable across the whole video.
function starMagnitude(conIndex: number, starIndex: number): number {
  return h(conIndex * 97 + starIndex * 31, 53);
}

// ── Fisher-Yates shuffle ─────────────────────────────────────────────────────
function shuffle(n: number, seed: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(h(seed * 1000 + i, i * 7) * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}


// ── Lifecycle Constants ───────────────────────────────────────────────────────
const NUM_BARS         = 64;
const NUM_SLOTS         = 45;   // Total constellations on screen at once
const CYCLE_FRAMES      = 2200; // ~1.2 min total life per constellation
const SPAWN_FADE_FRAMES = 80;   // Fade in at birth
const INACTIVE_FRAMES   = 1800; // Very long background phase (~1 min)
const DRAW_FRAMES       = 200;  // Drawing lines
const HOLD_FRAMES       = 60;   // Brief name reveal
const DEATH_FADE_FRAMES = 30;   // Brisk fade out

// Total duration breakdown:
// [0 - 1800]: Inactive (Fade in during first 80)
// [1800 - 2000]: Drawing
// [2000 - 2060]: Holding + Name
// [2060 - 2090]: Fade Out
// [2090 - 2200]: Dead/Empty (Stagger gap)

function slotDur(): number { return CYCLE_FRAMES; }

interface ConstellationInstance {
  conIndex: number;
  pos: [number, number];
  localFrame: number;
  phase: "inactive" | "drawing" | "hold" | "fading" | "dead";
  opacity: number;
  drawProgress: number;
  showName: boolean;
}

function getSlotInstance(slotIdx: number, frame: number, seed: number): ConstellationInstance {
  // Use a pseudo-random hash for staggering so they don't birth in a linear pattern
  const stagger = Math.floor(h(slotIdx * 1234 + 567, seed) * CYCLE_FRAMES);
  const adjustedFrame = frame + stagger;
  const cycleIdx = Math.floor(adjustedFrame / CYCLE_FRAMES);
  const localFrame = adjustedFrame % CYCLE_FRAMES;

  // Deterministic choices per cycle
  const conIndex = Math.floor(h(slotIdx * 7919 + cycleIdx * 13, seed) * NUM_CONSTELLATIONS);
  
  // ── Grid-based positioning ────────────────────────────────────────────────
  const cols = 8;
  const rows = 6;
  const cellW = SKY_W / cols;
  const cellH = SKY_H / rows;
  const col = slotIdx % cols;
  const row = Math.floor(slotIdx / cols) % rows;
  const baseCx = col * cellW + cellW / 2;
  const baseCy = row * cellH + cellH / 2;
  const jitterX = (h(slotIdx * 123 + cycleIdx * 456, seed + 1) - 0.5) * (cellW * 0.6);
  const jitterY = (h(slotIdx * 789 + cycleIdx * 123, seed + 2) - 0.5) * (cellH * 0.6);
  const cx = baseCx + jitterX;
  const cy = baseCy + jitterY;

  // ── Variable Phase Timing ──────────────────────────────────────────────────
  // Randomize durations slightly per slot/cycle so they don't draw in sync
  const varInactive = INACTIVE_FRAMES + (h(slotIdx * 31 + cycleIdx * 7, seed + 3) - 0.5) * 150;
  const varDraw     = DRAW_FRAMES     + (h(slotIdx * 41 + cycleIdx * 9, seed + 4) - 0.5) * 80;

  let phase: ConstellationInstance["phase"] = "inactive";
  let opacity = 1;
  let drawProgress = 0;
  let showName = false;

  const activeStart = varInactive;
  const holdStart   = activeStart + varDraw;
  const fadeStart   = holdStart + HOLD_FRAMES;
  const deathEnd    = fadeStart + DEATH_FADE_FRAMES;

  if (localFrame < activeStart) {
    phase = "inactive";
    opacity = Math.min(1, localFrame / SPAWN_FADE_FRAMES);
  } else if (localFrame < holdStart) {
    phase = "drawing";
    drawProgress = (localFrame - activeStart) / varDraw;
  } else if (localFrame < fadeStart) {
    phase = "hold";
    drawProgress = 1;
    showName = true;
  } else if (localFrame < deathEnd) {
    phase = "fading";
    drawProgress = 1;
    showName = true;
    opacity = 1 - (localFrame - fadeStart) / DEATH_FADE_FRAMES;
  } else {
    phase = "dead";
    opacity = 0;
  }

  return { conIndex, pos: [cx, cy], localFrame, phase, opacity, drawProgress, showName };
}

// ── Component ─────────────────────────────────────────────────────────────────
export const ConstellationNet: React.FC<ConstellationNetProps> = ({
  audioSrc,
  colorA = "#FF2D9B",
  colorB = "#00B4FF",
  seed   = 0,
  showNames = true,
  spectrumType = "wide",
}) => {
  const frame     = useCurrentFrame();
  const { fps }   = useVideoConfig();
  const audioData = useAudioData(audioSrc);

  if (!audioData) return null;

  const vizRaw     = visualizeAudio({ fps, frame, audioData, numberOfSamples: 256, smoothing: true });
  const bars       = getMusicViz(vizRaw, NUM_BARS, spectrumType);
  const bassEnergy = getBassEnergy(bars);
  const glowSize   = 2.5 + bassEnergy * 11;

  // Sky drift
  const driftProgress = (frame / fps) / DRIFT_PERIOD_S;
  const tx = Math.sin(driftProgress * Math.PI * 2) * (SKY_OFFSET_X * 0.85);
  const ty = Math.sin(driftProgress * Math.PI * 2 * 0.6 + 0.9) * (SKY_OFFSET_Y * 0.55);

  const activeLines:  React.ReactNode[] = [];
  const activeDots:   React.ReactNode[] = [];
  const inactiveDots: React.ReactNode[] = [];
  const labels:       React.ReactNode[] = [];

  for (let s = 0; s < NUM_SLOTS; s++) {
    const inst = getSlotInstance(s, frame, seed);
    if (inst.phase === "dead") continue;

    const con = CONSTELLATIONS[inst.conIndex]!;
    const [cx, cy] = inst.pos;
    const { opacity, drawProgress, showName, phase } = inst;

    // Star positions
    const starPos: [number, number][] = con.stars.map(([sx, sy]) => [
      cx - STAR_SCALE / 2 + sx * STAR_SCALE,
      cy - STAR_SCALE / 2 + sy * STAR_SCALE,
    ]);

    // Draw Stars
    for (let si = 0; si < con.stars.length; si++) {
      const [sx, sy] = starPos[si]!;
      const mag = starMagnitude(inst.conIndex, si);
      
      const barIdx = (inst.conIndex * 31 + si * 13) % NUM_BARS;
      const energy = bars[barIdx] ?? 0;
      
      const twinklePhase = (inst.conIndex * 97 + si * 37) % 628;
      const twinkle = Math.sin(frame * 0.04 + twinklePhase * 0.01) * 0.07;

      const baseR  = 1.6 + mag * 3.2;
      const baseOp = 0.25 + mag * 0.55;

      // Frequency reactivity — ALWAYS pulsing
      const freqPulseR  = bassEnergy * 5.0 * (0.5 + energy * 0.8);
      const freqPulseOp = energy * 0.35;

      const r  = Math.max(0.8, baseR  + freqPulseR).toFixed(2);
      const op = (Math.min(1, baseOp + freqPulseOp + twinkle) * opacity).toFixed(3);

      const dot = (
        <circle key={`s${s}-d${si}`}
          cx={sx.toFixed(1)} cy={sy.toFixed(1)} r={r}
          fill={lerpColor(colorA, colorB, sx / SKY_W)} opacity={op}
        />
      );

      if (phase === "inactive") {
        inactiveDots.push(dot);
      } else {
        activeDots.push(dot);
      }
    }

    // Draw Edges (if in drawing/hold/fading phases)
    if (phase !== "inactive") {
      // Use drawProgress to determine how many edges and how far along the current edge
      const numEdges = con.edges.length;
      const totalDrawProgress = drawProgress * numEdges;
      
      for (let k = 0; k < numEdges; k++) {
        if (totalDrawProgress < k) continue;
        
        const [iA, iB] = con.edges[k]!;
        const [x1, y1] = starPos[iA]!;
        const [x2, y2] = starPos[iB]!;
        const len      = Math.hypot(x2 - x1, y2 - y1);
        
        // Progress of the current edge
        const edgeProg = Math.min(1, totalDrawProgress - k);
        const drawLen  = edgeProg * len;

        activeLines.push(
          <line key={`s${s}-l${k}`}
            x1={x1.toFixed(1)} y1={y1.toFixed(1)}
            x2={(x1 + (x2 - x1) * edgeProg).toFixed(1)} 
            y2={(y1 + (y2 - y1) * edgeProg).toFixed(1)}
            stroke={lerpColor(colorA, colorB, (x1 + x2) / 2 / SKY_W)}
            strokeWidth={(1.6 + bassEnergy * 2.2).toFixed(2)}
            opacity={(0.88 * opacity).toFixed(3)}
            strokeLinecap="round"
          />
        );
      }
    }

    // Draw Label
    if (showName && showNames) {
      const lx = cx;
      const ly = cy + STAR_SCALE / 2 + 25;
      labels.push(
        <text key={`s${s}-t`}
          x={lx.toFixed(1)}
          y={ly.toFixed(1)}
          textAnchor="middle"
          fontSize="13"
          fontWeight="600"
          fontFamily="sans-serif"
          letterSpacing="5"
          fill={lerpColor(colorA, colorB, cx / SKY_W)}
          opacity={(0.85 * opacity).toFixed(3)}
          style={{ textShadow: "0 0 8px rgba(255,255,255,0.3)" }}
        >
          {con.name.toUpperCase()}
        </text>
      );
    }
  }

  return (
    <svg
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
      viewBox={`0 0 ${W} ${H}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <filter id="con-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={glowSize} result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="con-glow-dim" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g transform={`translate(${tx.toFixed(2)}, ${ty.toFixed(2)})`}>
        <g transform={`translate(${-SKY_OFFSET_X}, ${-SKY_OFFSET_Y})`}>
          
          {/* Inactive stars (dimmer glow) */}
          <g filter="url(#con-glow-dim)">
            {inactiveDots}
          </g>

          {/* Active constellations (full reactive glow) */}
          <g filter="url(#con-glow)">
            {activeLines}
            {activeDots}
          </g>

          {/* Labels */}
          {labels}
        </g>
      </g>
    </svg>
  );
};
