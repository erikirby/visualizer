import React from "react";
import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  Video,
  Sequence,
  Loop,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

interface VisualBackgroundProps {
  bassScale?: number;
  backgroundSrc?: string;
  bgIsVideo?: boolean;
  // Video looping — populated by calculateMetadata when background-config.json
  // contains a loopType field.  Absent → image background (existing behaviour).
  bgLoopType?:              "standard" | "pingpong";
  bgReversedSrc?:           string;   // path to the ffmpeg-reversed clip (pingpong only)
  bgVideoDurationInFrames?: number;   // video length in composition frames
}

// Detect video file by extension (.mp4 / .mov / .webm / .mkv)
const VIDEO_EXT_RE = /\.(mp4|mov|webm|mkv)(\?.*)?$/i;

// Shared style for the video element itself — no transform here; transform is
// applied on the outer wrapper so it stays in sync with bassScale every frame.
const VIDEO_FILL_STYLE: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  objectPosition: "center center",
};

export const VisualBackground: React.FC<VisualBackgroundProps> = ({
  bassScale = 1,
  backgroundSrc,
  bgIsVideo,
  bgLoopType,
  bgReversedSrc,
  bgVideoDurationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames: totalFrames } = useVideoConfig();

  const src     = backgroundSrc ?? staticFile("background.png");
  const isVideo = bgIsVideo === true || bgLoopType !== undefined || VIDEO_EXT_RE.test(src);
  // blob: URLs (user uploads) must use <Video> — OffthreadVideo fetches via HTTP
  // and hangs indefinitely on blob: scheme URLs in the browser player.
  const isBlob  = src.startsWith("blob:");

  const t = frame / fps;

  // Ken Burns — breathing zoom + lazy orbital drift for static images only.
  // Video clips already have motion so we skip all of this.
  const ZOOM_CYCLE  = 40;
  const DRIFT_CYCLE = 55;
  const kenBurnsScale = isVideo ? 1 : 1.15 + 0.10 * Math.sin((t / ZOOM_CYCLE) * Math.PI * 2);
  const translateX    = isVideo ? 0 : 2.8  * Math.sin((t / DRIFT_CYCLE) * Math.PI * 2);
  const translateY    = isVideo ? 0 : 1.4  * Math.cos((t / DRIFT_CYCLE) * Math.PI * 2 + 1.2);

  // Applied to the inner wrapper so both images and videos get bass-reactive zoom.
  const transform = `scale(${kenBurnsScale * bassScale}) translate(${translateX}%, ${translateY}%)`;

  // ── Video: build loop sequences ──────────────────────────────────────────
  // The loop structure (how many Sequence blocks, which src) never changes
  // during a render — only the outer transform changes per-frame.
  // We compute it inline so TypeScript is happy, but it's cheap (just JSX nodes).
  const buildVideoNode = (): React.ReactNode => {
    if (!isVideo) return null;

    if (bgLoopType === "pingpong" && bgVideoDurationInFrames && bgReversedSrc) {
      // Ping-pong: alternate forward/reverse clips.
      // Even-index loops play the original; odd-index loops play the reversed copy.
      const numLoops = Math.ceil(totalFrames / bgVideoDurationInFrames) + 1;
      return (
        <>
          {Array.from({ length: numLoops }, (_, i) => {
            const isReverse = i % 2 === 1;
            return (
              <Sequence
                key={i}
                from={i * bgVideoDurationInFrames}
                durationInFrames={bgVideoDurationInFrames}
              >
                <OffthreadVideo
                  src={isReverse ? bgReversedSrc : src}
                  muted
                  style={VIDEO_FILL_STYLE}
                />
              </Sequence>
            );
          })}
        </>
      );
    }

    // Standard loop — Remotion's <Loop> repeats the child for the full composition.
    if (bgVideoDurationInFrames) {
      return (
        <Loop durationInFrames={bgVideoDurationInFrames}>
          {isBlob
            ? <Video src={src} muted style={VIDEO_FILL_STYLE} />
            : <OffthreadVideo src={src} muted style={VIDEO_FILL_STYLE} />}
        </Loop>
      );
    }

    // Fallback: no duration metadata (should not happen in normal usage).
    return isBlob
      ? <Video src={src} muted style={VIDEO_FILL_STYLE} />
      : <OffthreadVideo src={src} muted style={VIDEO_FILL_STYLE} />;
  };

  return (
    <AbsoluteFill style={{ background: "#080818" }}>
      {/* Transform wrapper — clipped to frame, applies bass-reactive zoom */}
      <AbsoluteFill style={{ overflow: "hidden" }}>
        <AbsoluteFill style={{ transform, transformOrigin: "center center" }}>
          {isVideo ? (
            buildVideoNode()
          ) : (
            <Img
              src={src}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: "center center",
              }}
            />
          )}
        </AbsoluteFill>
      </AbsoluteFill>

      {/* Vignette */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at 50% 50%, transparent 52%, rgba(8, 8, 24, 0.70) 100%)",
          pointerEvents: "none",
        }}
      />

      {/* Bottom gradient — keeps text readable */}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(to top, rgba(8,8,24,0.92) 0%, rgba(8,8,24,0.55) 22%, transparent 50%)",
          pointerEvents: "none",
        }}
      />

      {/* Slow color tint — cycles pink→blue on a 16-second loop, screen blend */}
      <AbsoluteFill
        style={{
          background: (() => {
            const tintP = (Math.sin((t / 16) * Math.PI * 2) + 1) / 2;
            const r = Math.round(255 * (1 - tintP));
            const b = Math.round(155 + 100 * tintP);
            return `rgba(${r},0,${b},0.08)`;
          })(),
          mixBlendMode: "screen",
          pointerEvents: "none",
        }}
      />

      {/* Film grain */}
      <AbsoluteFill style={{ pointerEvents: "none", opacity: 0.045 }}>
        <svg
          width="100%"
          height="100%"
          xmlns="http://www.w3.org/2000/svg"
          style={{ position: "absolute", inset: 0 }}
        >
          <filter id="grain-filter" x="0%" y="0%" width="100%" height="100%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.68"
              numOctaves="4"
              stitchTiles="stitch"
              seed="7"
            />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter="url(#grain-filter)" />
        </svg>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
