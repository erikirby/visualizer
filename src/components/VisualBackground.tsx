import React, { useRef, useEffect } from "react";
import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  Sequence,
  Loop,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  delayRender,
  continueRender,
  getRemotionEnvironment,
} from "remotion";

interface VisualBackgroundProps {
  bassScale?: number;
  backgroundSrc?: string;
  bgIsVideo?: boolean;
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

// Used during export: seeks video to the exact frame, draws it to a canvas,
// then signals Remotion it can take the screenshot. The canvas holds a static
// image of the correct frame so the screenshot captures it accurately.
const VideoFrameCanvas: React.FC<{ src: string; durationInFrames?: number }> = ({ src, durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const loopFrames = durationInFrames ?? Infinity;
  const loopedFrame = isFinite(loopFrames) ? frame % loopFrames : frame;
  const targetTime = loopedFrame / fps;

  useEffect(() => {
    const handle = delayRender(`video-bg-frame-${frame}`);
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) { continueRender(handle); return; }
    const ctx = canvas.getContext("2d");
    if (!ctx) { continueRender(handle); return; }

    const draw = () => {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      continueRender(handle);
    };

    if (Math.abs(video.currentTime - targetTime) < 0.001) {
      draw();
    } else {
      video.addEventListener("seeked", draw, { once: true });
      video.currentTime = targetTime;
    }
  }, [frame]);

  return (
    <>
      <video ref={videoRef} src={src} muted playsInline preload="auto" style={{ display: "none" }} />
      <canvas ref={canvasRef} width={1920} height={1080} style={VIDEO_FILL_STYLE} />
    </>
  );
};

// Used in the preview Player: plain video element that seeks to the correct
// frame. No need for canvas/delayRender overhead in preview.
const PreviewVideo: React.FC<{ src: string; durationInFrames?: number }> = ({ src, durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ref = useRef<HTMLVideoElement>(null);

  const loopFrames = durationInFrames ?? Infinity;
  const loopedFrame = isFinite(loopFrames) ? frame % loopFrames : frame;
  const targetTime = loopedFrame / fps;

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (Math.abs(video.currentTime - targetTime) > 0.001) {
      video.currentTime = targetTime;
    }
  });

  return <video ref={ref} src={src} muted playsInline preload="auto" style={VIDEO_FILL_STYLE} />;
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
  const isUserUpload = src.startsWith("blob:");
  const { isRendering } = getRemotionEnvironment();

  const t = frame / fps;

  const ZOOM_CYCLE  = 40;
  const DRIFT_CYCLE = 55;
  const kenBurnsScale = isVideo ? 1 : 1.15 + 0.10 * Math.sin((t / ZOOM_CYCLE) * Math.PI * 2);
  const translateX    = isVideo ? 0 : 2.8  * Math.sin((t / DRIFT_CYCLE) * Math.PI * 2);
  const translateY    = isVideo ? 0 : 1.4  * Math.cos((t / DRIFT_CYCLE) * Math.PI * 2 + 1.2);
  const transform = `scale(${kenBurnsScale * bassScale}) translate(${translateX}%, ${translateY}%)`;

  const buildVideoNode = (): React.ReactNode => {
    if (!isVideo) return null;

    if (isUserUpload) {
      return isRendering
        ? <VideoFrameCanvas src={src} durationInFrames={bgVideoDurationInFrames} />
        : <PreviewVideo src={src} durationInFrames={bgVideoDurationInFrames} />;
    }

    if (bgLoopType === "pingpong" && bgVideoDurationInFrames && bgReversedSrc) {
      const numLoops = Math.ceil(totalFrames / bgVideoDurationInFrames) + 1;
      return (
        <>
          {Array.from({ length: numLoops }, (_, i) => {
            const isReverse = i % 2 === 1;
            return (
              <Sequence key={i} from={i * bgVideoDurationInFrames} durationInFrames={bgVideoDurationInFrames}>
                <OffthreadVideo src={isReverse ? bgReversedSrc : src} muted style={VIDEO_FILL_STYLE} />
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
