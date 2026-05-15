import React from "react";
import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  Sequence,
  Loop,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
// <Video> from @remotion/media is the only video component supported in
// renderMediaOnWeb (client-side rendering). Neither <OffthreadVideo> nor
// <Video> from "remotion" (Html5Video) work in the web renderer.
import { Video } from "@remotion/media";

interface VisualBackgroundProps {
  bassScale?: number;
  backgroundSrc?: string;
  bgIsVideo?: boolean;
  // Video looping — populated by calculateMetadata when background-config.json
  // contains a loopType field.  Absent → image background (existing behaviour).
  bgLoopType?:              "standard" | "pingpong";
  bgReversedSrc?:           string;
  bgVideoDurationInFrames?: number;
}

const VIDEO_EXT_RE = /\.(mp4|mov|webm|mkv)(\?.*)?$/i;

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
  // User-uploaded videos arrive as data: URLs (FileReader.readAsDataURL).
  // Data URLs are self-contained — no network fetch, no buffering-detector issue,
  // works identically in the Player preview and renderMediaOnWeb export.
  const isDataUrl = src.startsWith("data:");

  const t = frame / fps;

  const ZOOM_CYCLE  = 40;
  const DRIFT_CYCLE = 55;
  const kenBurnsScale = isVideo ? 1 : 1.15 + 0.10 * Math.sin((t / ZOOM_CYCLE) * Math.PI * 2);
  const translateX    = isVideo ? 0 : 2.8  * Math.sin((t / DRIFT_CYCLE) * Math.PI * 2);
  const translateY    = isVideo ? 0 : 1.4  * Math.cos((t / DRIFT_CYCLE) * Math.PI * 2 + 1.2);
  const transform = `scale(${kenBurnsScale * bassScale}) translate(${translateX}%, ${translateY}%)`;

  const buildVideoNode = (): React.ReactNode => {
    if (!isVideo) return null;

    if (isDataUrl) {
      // @remotion/media <Video> works in both Player preview and renderMediaOnWeb export.
      if (bgVideoDurationInFrames) {
        return (
          <Loop durationInFrames={bgVideoDurationInFrames}>
            <Video src={src} muted style={VIDEO_FILL_STYLE} />
          </Loop>
        );
      }
      return <Video src={src} muted style={VIDEO_FILL_STYLE} />;
    }

    if (bgLoopType === "pingpong" && bgVideoDurationInFrames && bgReversedSrc) {
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

    if (bgVideoDurationInFrames) {
      return (
        <Loop durationInFrames={bgVideoDurationInFrames}>
          <OffthreadVideo src={src} muted style={VIDEO_FILL_STYLE} />
        </Loop>
      );
    }

    return <OffthreadVideo src={src} muted style={VIDEO_FILL_STYLE} />;
  };

  return (
    <AbsoluteFill style={{ background: "#080818" }}>
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

    </AbsoluteFill>
  );
};
