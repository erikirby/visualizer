import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { Video } from "@remotion/media";
import { useAudioData, visualizeAudio } from "@remotion/media-utils";
import { Particles } from "./components/Particles";
import type { ParticleDirection } from "./components/Particles";
import { getBassEnergy, softCeil } from "./utils/audioColor";

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
function buildBassPeak(audioData: ReturnType<typeof useAudioData>, fps: number): number {
  if (!audioData) return 0.08;
  const total = Math.floor(audioData.durationInSeconds * fps);
  const pcts = Array.from({ length: 15 }, (_, k) => (k + 1) / 16);
  const vals = pcts.map((pct) =>
    getBassEnergy(
      visualizeAudio({
        fps,
        frame: Math.max(0, Math.min(Math.floor(pct * total), total - 1)),
        audioData,
        numberOfSamples: 128,
        smoothing: true,
      }),
    ),
  );
  return Math.max(...vals, 0.02);
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
  pulseFlash?: boolean;         // optional luminance flash on top of the scale
  pulseFlashIntensity?: number; // 0–1
  pulseFlashColor?: string;

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
  pulseFlash = false,
  pulseFlashIntensity = 0.5,
  pulseFlashColor = "#FFFFFF",

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
  const bassPeak = React.useMemo(() => buildBassPeak(audioData, fps), [audioData, fps]);

  // ── Beat analysis ──────────────────────────────────────────────────────────
  // Same split the visualizer settled on in 5345fdc1: the 128-sample smoothed
  // read drives MOVEMENT (it averages out jitter), and the raw transient drives
  // the FLASH only. Putting the transient into the geometry makes the scale
  // spike for a single frame and snap back, which reads as a stutter, not a
  // pulse.
  const { pump, kick } = React.useMemo(() => {
    if (!audioData) return { pump: 0, kick: 0 };
    // 3-frame temporal smoothing, as the DNA Helix does in 7dfe85e3.
    const smoothed = [-1, 0, 1].map((o) =>
      getBassEnergy(
        visualizeAudio({
          fps, frame: Math.max(0, frame + o), audioData,
          numberOfSamples: 128, smoothing: true,
        }),
      ),
    );
    // Normalised against the track's own bass peak, as BarEQ does.
    const norm = (v: number) => Math.min(1.2, (v / bassPeak) * 0.8);
    const smoothBass = norm((smoothed[0] + smoothed[1] + smoothed[2]) / 3);

    const rawBass = pulseFlash
      ? norm(getBassEnergy(
          visualizeAudio({ fps, frame, audioData, numberOfSamples: 32, smoothing: false }),
        ))
      : 0;

    return {
      pump: smoothBass,
      kick: pulseFlash ? Math.min(1, Math.max(0, rawBass - smoothBass - 0.10) * 3) : 0,
    };
  }, [audioData, frame, fps, pulseFlash, bassPeak]);

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
  const pulseScale = 1 + shapedPump * 0.035 * pulseIntensity;

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
            background: pulseFlashColor,
            mixBlendMode: "screen",
            opacity: kick * pulseFlashIntensity * 0.12,
          }}
        />
      )}
    </AbsoluteFill>
  );
};
