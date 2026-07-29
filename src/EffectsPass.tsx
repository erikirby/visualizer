import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { Video } from "@remotion/media";
import { useAudioData, visualizeAudio } from "@remotion/media-utils";
import { Particles } from "./components/Particles";
import type { ParticleDirection } from "./components/Particles";
import { getBassEnergy, getMusicViz, softCeil } from "./utils/audioColor";
import { getThemeAtTime } from "./utils/themes";

/**
 * EffectsPass — final-polish mode.
 *
 * Input is a single finished video with audio already baked in (e.g. a CapCut
 * 9:16 export). Nothing is composed or re-laid-out; the clip plays at its own
 * dimensions and every effect is a pass on top of it.
 *
 * Distinct from VisualizerMain, which builds a video from separate audio +
 * background and owns the visualizer layers.
 */
const VIDEO_FILL: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
};


/**
 * Peak bass energy across the track, sampled at 15 reference points.
 *
 * Same normalisation BarEQ uses via buildBandPeaks. Without it, raw
 * getBassEnergy lands around 0.02-0.06 rather than 0-1, so the visualizer's
 * 0.035 coefficient produces a ~0.5% zoom (invisible) and the reactivity
 * curve's v-squared term is negligible. Normalising first is what makes both
 * behave the way they do in the Visualizer tab.
 */
function buildBassPeak(
  audioData: ReturnType<typeof useAudioData>,
  fps: number,
  spectrumType: "bass" | "wide",
): number {
  if (!audioData) return 0.08;
  const total = Math.floor(audioData.durationInSeconds * fps);
  const pcts = Array.from({ length: 15 }, (_, k) => (k + 1) / 16);
  const vals = pcts.map((pct) =>
    getBassEnergy(
      getMusicViz(
        visualizeAudio({
          fps,
          frame: Math.max(0, Math.min(Math.floor(pct * total), total - 1)),
          audioData,
          numberOfSamples: 128,
          smoothing: true,
        }),
        128,
        spectrumType,
      ),
    ),
  );
  return Math.max(...vals, 0.02);
}

/**
 * Gate that thins the pulse down to every Nth bass hit.
 *
 * The pulse follows bass energy, so on a track with bass on the offbeats it
 * fires twice per beat and reads as double-time. This finds the hits, keeps
 * every Nth one, and returns a per-frame 0-1 multiplier that peaks on the kept
 * hits and eases to zero between them. Raised-cosine so thinning the rate
 * never reintroduces a hard edge.
 *
 * Returns null for division 1 (no thinning) so the normal path is untouched.
 */
function buildBeatGate(
  audioData: ReturnType<typeof useAudioData>,
  fps: number,
  division: number,
): Float32Array | null {
  if (!audioData || division <= 1) return null;
  const wave = audioData.channelWaveforms[0];
  const { sampleRate } = audioData;
  if (!wave?.length) return null;

  const samplesPerFrame = sampleRate / fps;
  const frameCount = Math.ceil(wave.length / samplesPerFrame);

  // Per-frame bass RMS via a one-pole lowpass (~150Hz) — the kick band.
  const rc = 1 / (2 * Math.PI * 150);
  const a = (1 / sampleRate) / (rc + 1 / sampleRate);
  const e = new Float32Array(frameCount);
  let lp = 0;
  let peak = 0;
  for (let f = 0; f < frameCount; f++) {
    const start = Math.floor(f * samplesPerFrame);
    const end = Math.min(wave.length, Math.floor((f + 1) * samplesPerFrame));
    let sum = 0;
    let n = 0;
    for (let i = start; i < end; i++) {
      lp += a * (wave[i] - lp);
      sum += lp * lp;
      n++;
    }
    e[f] = n > 0 ? Math.sqrt(sum / n) : 0;
    if (e[f] > peak) peak = e[f];
  }
  if (peak <= 0) return null;

  const hits: number[] = [];
  for (let f = 1; f < frameCount - 1; f++) {
    const v = e[f] / peak;
    if (v > 0.35 && e[f] >= e[f - 1] && e[f] >= e[f + 1] && (!hits.length || f - hits[hits.length - 1] >= 4)) {
      hits.push(f);
    }
  }
  if (hits.length < 4) return null;

  const gaps = hits.slice(1).map((h, i) => h - hits[i]).sort((x, y) => x - y);
  const medianGap = gaps[Math.floor(gaps.length / 2)] || 7;

  const kept = hits.filter((_, i) => i % division === 0);
  const halfWidth = Math.max(3, medianGap * division * 0.6);

  const gate = new Float32Array(frameCount);
  for (let f = 0; f < frameCount; f++) {
    let nearest = Infinity;
    for (const p of kept) {
      const d = Math.abs(f - p);
      if (d < nearest) nearest = d;
      if (p > f + halfWidth) break;
    }
    const x = Math.min(1, nearest / halfWidth);
    gate[f] = 0.5 * (1 + Math.cos(Math.PI * x));
  }
  return gate;
}

export interface EffectsPassProps {
  videoSrc?: string;

  /** A/B compare — renders the untouched source so you can judge subtlety. */
  bypass?: boolean;

  // ── Unifying grade — the actual fix for shots that don't match ──────────────
  gradeStrength?: number;    // 0–1   tint opacity
  gradeTint?: string;        // hex
  gradeSaturation?: number;  // 0.5–1.5
  gradeContrast?: number;    // 0.8–1.3

  // ── Beat pulse ─────────────────────────────────────────────────────────────
  pulseIntensity?: number;      // 0–3 multiplier, same scale as Zoom Intensity
  pulseReactivity?: number;     // 0–1 contrast curve, same as the Reactivity slider
  /** Frame offset for nudging the pulse when it drifts off the audio. */
  pulseLeadFrames?: number;
  /** 1 = every bass hit, 2 = every 2nd, 4 = every 4th. Fixes double-time. */
  pulseDivision?: number;
  /** Hold the pulse off until this many seconds in — e.g. start it at the chorus. */
  pulseStartSec?: number;
  spectrumType?: "bass" | "wide";
  pulseFlash?: boolean;         // optional luminance flash on top of the scale
  pulseFlashIntensity?: number; // 0–1
  pulseFlashColor?: string;
  /** Cycle the flash through a theme instead of a fixed colour. */
  pulseFlashCycle?: boolean;
  /** Which cycling theme to use — 9 Iridescent, 10 Pastel Rainbow, 13 Neon Night. */
  pulseFlashCycleTheme?: number;

  // ── Light leak ─────────────────────────────────────────────────────────────
  leakIntensity?: number; // 0–1 (0 = off)
  leakSize?: number;      // 0.15–0.7 of the smaller frame dimension
  leakColor?: string;
  /** Fade fully out between bursts instead of sitting on screen the whole time. */
  leakGaps?: boolean;

  // ── Texture ────────────────────────────────────────────────────────────────
  grainIntensity?: number;    // 0–1
  vignetteIntensity?: number; // 0–1

  // ── Particles ──────────────────────────────────────────────────────────────
  showParticles?: boolean;
  particleDirection?: ParticleDirection;
  particleSpeed?: number;
  particleCount?: number;
  particleOpacity?: number;
  particleColorA?: string;
  particleColorB?: string;
}

export const EffectsPass: React.FC<EffectsPassProps> = ({
  videoSrc = "",
  bypass = false,

  gradeStrength = 0,
  gradeTint = "#FF2D9B",
  gradeSaturation = 1,
  gradeContrast = 1,

  pulseIntensity = 1,
  pulseReactivity = 0,
  pulseLeadFrames = 0,
  pulseDivision = 1,
  pulseStartSec = 0,
  spectrumType = "bass",
  pulseFlash = false,
  pulseFlashIntensity = 0.5,
  // Brand pink rather than white: a white flash blows out pastel footage.
  pulseFlashColor = "#FF2D9B",
  pulseFlashCycle = false,
  pulseFlashCycleTheme = 10,

  leakIntensity = 0,
  leakSize = 0.32,
  leakColor = "#FF2D9B",
  leakGaps = true,

  grainIntensity = 0,
  vignetteIntensity = 0,

  showParticles = false,
  particleDirection = "up",
  particleSpeed,
  particleCount,
  particleOpacity,
  particleColorA = "#FF2D9B",
  particleColorB = "#00B4FF",
}) => {
  const frame = useCurrentFrame();
  const { width: W, height: H, fps } = useVideoConfig();
  const audioData = useAudioData(videoSrc);
  const bassPeak = React.useMemo(
    () => buildBassPeak(audioData, fps, spectrumType),
    [audioData, fps, spectrumType],
  );
  const beatGate = React.useMemo(
    () => buildBeatGate(audioData, fps, pulseDivision),
    [audioData, fps, pulseDivision],
  );

  // ── Beat analysis ──────────────────────────────────────────────────────────
  // Same split the visualizer settled on in 5345fdc1: the 128-sample smoothed
  // read drives MOVEMENT (it averages out jitter), and the raw transient drives
  // the FLASH only. Putting the transient into the geometry makes the scale
  // spike for a single frame and snap back, which reads as a stutter, not a
  // pulse.
  const { pump, kick } = React.useMemo(() => {
    if (!audioData) return { pump: 0, kick: 0 };
    // Beat Timing shifts which frame is read, so a pulse that drifts off the
    // audio can be nudged either way until it sits right.
    const readFrame = Math.max(0, frame + pulseLeadFrames);
    // 3-frame temporal smoothing, as the DNA Helix does in 7dfe85e3.
    const smoothed = [-1, 0, 1].map((o) =>
      getBassEnergy(
        getMusicViz(
          visualizeAudio({
            fps, frame: Math.max(0, readFrame + o), audioData,
            numberOfSamples: 128, smoothing: true,
          }),
          128,
          spectrumType,
        ),
      ),
    );
    // Normalised against the track's own bass peak, as BarEQ does.
    const norm = (v: number) => Math.min(1.2, (v / bassPeak) * 0.8);
    const smoothBass = norm((smoothed[0] + smoothed[1] + smoothed[2]) / 3);

    const rawBass = pulseFlash
      ? norm(getBassEnergy(
          getMusicViz(
            visualizeAudio({ fps, frame: readFrame, audioData, numberOfSamples: 128, smoothing: false }),
            128,
            spectrumType,
          ),
        ))
      : 0;

    // Thin the rate down when the music puts bass between the beats.
    const gate = beatGate ? (beatGate[Math.min(readFrame, beatGate.length - 1)] ?? 1) : 1;

    return {
      pump: smoothBass * gate,
      kick: pulseFlash ? Math.min(1, Math.max(0, rawBass - smoothBass - 0.10) * 3) * gate : 0,
    };
  }, [audioData, frame, fps, pulseFlash, bassPeak, pulseLeadFrames, spectrumType, beatGate]);

  if (bypass) {
    return (
      <AbsoluteFill style={{ background: "#000" }}>
        <Video src={videoSrc} style={VIDEO_FILL} />
      </AbsoluteFill>
    );
  }

  // Borrowed wholesale from the Visualizer tab's Fine-Tune controls.
  //
  // Reactivity is applyReactivity's contrast curve from 7bab5944 —
  // v + v² × amount × 1.8 makes peaks explode while quiet stays quiet, so the
  // pulse gets DEEPER without the floor rising. softCeil keeps the top
  // differentiable instead of flat-topping into a clamp. The snap term from
  // that helper is deliberately left out: it's built on the raw transient,
  // which is what made the geometry stutter.
  //
  // pulseIntensity is the same 0-3 multiplier as Zoom Intensity over the same
  // 0.035 base, so 1.0x here matches the visualizer exactly.
  const shapedPump = pulseReactivity > 0
    ? softCeil(pump + pump * pump * pulseReactivity * 1.8)
    : pump;

  // Hold the pulse off until the section you actually want it in. Ramped over
  // half a second rather than switched on, so it fades in instead of popping.
  const START_RAMP = 0.5;
  const startGate = pulseStartSec > 0
    ? Math.max(0, Math.min(1, (frame / fps - pulseStartSec) / START_RAMP))
    : 1;

  const pulseScale = 1 + shapedPump * startGate * 0.035 * pulseIntensity;

  const t = frame / fps;

  // ── Light leak ─────────────────────────────────────────────────────────────
  // Anchored off the top-right and drifting, with an envelope that returns to
  // zero so it reads as an intermittent leak rather than a constant tint.
  const leakEnv = leakGaps
    ? Math.pow(Math.max(0, 0.5 + 0.5 * Math.sin((2 * Math.PI * t) / 9 - 1.2)), 1.5)
    : 1;
  // Breathes with the smoothed read, not the transient — a per-frame transient
  // here would make the leak's opacity flicker.
  const leakAlpha = leakIntensity * leakEnv * (0.75 + 0.25 * pump);
  const leakR = Math.min(W, H) * leakSize;
  // Keep the hot centre near the top-right corner rather than swinging far
  // past it. Previously it spent most of the drift fully off-frame, so only
  // the dim outer tail was ever visible — the leak read as a faint haze no
  // matter how high the intensity went.
  const leakCx = W * (0.72 + 0.26 * Math.sin((2 * Math.PI * t) / 11 + 0.4));
  const leakCy = H * (0.10 + 0.13 * Math.cos((2 * Math.PI * t) / 14));
  // Oversized SVG so the gradient's hard clip sits well outside the frame.
  const PAD = Math.round(Math.max(W, H) * 0.35);

  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {/* Video + scale pulse. Grade filters ride on the same layer so they
          affect the footage only, not the overlays stacked above it. */}
      <AbsoluteFill
        style={{
          overflow: "hidden",
          filter:
            gradeSaturation !== 1 || gradeContrast !== 1
              ? `saturate(${gradeSaturation}) contrast(${gradeContrast})`
              : undefined,
        }}
      >
        <AbsoluteFill style={{ transform: `scale(${pulseScale})`, transformOrigin: "center center" }}>
          <Video src={videoSrc} style={VIDEO_FILL} />
        </AbsoluteFill>
      </AbsoluteFill>

      {/* Unifying tint — soft-light keeps highlights and shadows intact while
          pulling every shot toward one common cast. */}
      {gradeStrength > 0 && (
        <AbsoluteFill
          style={{
            background: gradeTint,
            mixBlendMode: "soft-light",
            opacity: gradeStrength,
            pointerEvents: "none",
          }}
        />
      )}

      {/* Light leak */}
      {leakAlpha > 0.002 && (
        <AbsoluteFill style={{ pointerEvents: "none", opacity: leakAlpha }}>
          <svg
            width={W + 2 * PAD}
            height={H + 2 * PAD}
            viewBox={`0 0 ${W + 2 * PAD} ${H + 2 * PAD}`}
            style={{ position: "absolute", left: -PAD, top: -PAD, mixBlendMode: "screen" }}
          >
            <defs>
              <radialGradient
                id="ep-leak"
                cx={PAD + leakCx}
                cy={PAD + leakCy}
                r={leakR}
                gradientUnits="userSpaceOnUse"
              >
                <stop offset="0%" stopColor={leakColor} stopOpacity={1} />
                <stop offset="30%" stopColor={leakColor} stopOpacity={0.62} />
                <stop offset="65%" stopColor={leakColor} stopOpacity={0.22} />
                <stop offset="100%" stopColor={leakColor} stopOpacity={0} />
              </radialGradient>
            </defs>
            <rect width={W + 2 * PAD} height={H + 2 * PAD} fill="url(#ep-leak)" />
          </svg>
        </AbsoluteFill>
      )}

      {/* Particles — the component composes in a fixed 1920x1080 space, so it's
          scaled to cover the frame. Uniform scale keeps the dots circular. */}
      {showParticles && (
        <AbsoluteFill style={{ overflow: "hidden", pointerEvents: "none" }}>
          <div
            style={{
              position: "absolute",
              width: 1920,
              height: 1080,
              left: "50%",
              top: "50%",
              transform: `translate(-50%, -50%) scale(${Math.max(W / 1920, H / 1080)})`,
            }}
          >
            <Particles
              audioSrc={videoSrc}
              direction={particleDirection}
              speedMultiplier={particleSpeed}
              countMultiplier={particleCount}
              opacityMultiplier={particleOpacity}
              colorA={particleColorA}
              colorB={particleColorB}
            />
          </div>
        </AbsoluteFill>
      )}

      {/* Film grain — animated noise. Doubles as a unifier: a shared grain floor
          hides differences in noise level between shots. */}
      {grainIntensity > 0 && (
        <AbsoluteFill style={{ pointerEvents: "none", opacity: grainIntensity * 0.5, mixBlendMode: "overlay" }}>
          <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0 }}>
            <filter id="ep-grain">
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.8"
                numOctaves={2}
                seed={frame % 100}
                stitchTiles="stitch"
              />
              <feColorMatrix type="saturate" values="0" />
            </filter>
            <rect width={W} height={H} filter="url(#ep-grain)" />
          </svg>
        </AbsoluteFill>
      )}

      {/* Vignette */}
      {vignetteIntensity > 0 && (
        <AbsoluteFill
          style={{
            pointerEvents: "none",
            background: `radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(0,0,0,${vignetteIntensity * 0.7}) 100%)`,
          }}
        />
      )}

      {/* Optional beat flash — off by default. This is the layer that reads as
          strobing when it's driven by every beat, so it's opt-in and capped. */}
      {pulseFlash && kick > 0.05 && (
        <AbsoluteFill
          style={{
            pointerEvents: "none",
            // Cycling reuses the existing themes (10 = Pastel Rainbow), so the
            // flash drifts through colour instead of strobing one hue.
            background: pulseFlashCycle
              ? getThemeAtTime(pulseFlashCycleTheme, t).colorA
              : pulseFlashColor,
            mixBlendMode: "screen",
            opacity: kick * startGate * pulseFlashIntensity * 0.12,
          }}
        />
      )}
    </AbsoluteFill>
  );
};
