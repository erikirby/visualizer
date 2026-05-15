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
} from "remotion";

interface VisualBackgroundProps {
  bassScale?: number;
  backgroundSrc?: string;
  bgIsVideo?: boolean;
  bgLoopType?:              "standard" | "pingpong";
  bgReversedSrc?:           string;
  bgVideoDurationInFrames?: number;
  isExporting?:             boolean;
}

const VIDEO_EXT_RE = /\.(mp4|mov|webm|mkv)(\?.*)?$/i;

const VIDEO_FILL_STYLE: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  objectPosition: "center center",
};

// Preview: plain <video> seeking to frame time. Works in the Player, not in export.
const SeekableVideo: React.FC<{ src: string; frameTime: number }> = ({ src, frameTime }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isFinite(frameTime) && Math.abs(video.currentTime - frameTime) > 0.05) {
      try { video.currentTime = frameTime; } catch {}
    }
  }, [frameTime, src]);

  return (
    <video
      ref={videoRef}
      src={src}
      muted
      playsInline
      preload="auto"
      style={{ ...VIDEO_FILL_STYLE, position: "absolute", inset: 0 }}
    />
  );
};

// Export: draws each video frame onto a <canvas> so Remotion's canvas capture can see it.
// A plain <video> element is invisible to canvas capture (browser security rule).
// Canvas drawn from a same-origin blob URL is NOT tainted and CAN be captured.
const CanvasVideoRenderer: React.FC<{ src: string; frameTime: number }> = ({ src, frameTime }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const handleRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);

  // Create the delayRender handle synchronously during render so the renderer
  // waits before any effects run — this is the correct Remotion pattern.
  if (lastFrameRef.current !== frameTime) {
    if (handleRef.current !== null) continueRender(handleRef.current); // resolve previous
    handleRef.current = delayRender("canvas-video-frame");
    lastFrameRef.current = frameTime;
  }

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const handle = handleRef.current;
    if (!video || !canvas || handle === null) return;

    let resolved = false;
    const finish = () => {
      if (resolved) return;
      resolved = true;
      continueRender(handle);
    };

    const timeout = setTimeout(finish, 5000);

    const draw = () => {
      if (video.videoWidth > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
      }
      finish();
    };

    const doSeek = () => {
      if (Math.abs(video.currentTime - frameTime) < 0.01 && video.readyState >= 2) {
        setTimeout(draw, 20);
      } else {
        video.addEventListener("seeked", () => setTimeout(draw, 20), { once: true });
        try { video.currentTime = frameTime; } catch { draw(); }
      }
    };

    if (video.readyState >= 1) {
      doSeek();
    } else {
      video.addEventListener("loadedmetadata", doSeek, { once: true });
    }

    return () => {
      clearTimeout(timeout);
      video.removeEventListener("loadedmetadata", doSeek);
      finish();
    };
  }, [frameTime, src]);

  return (
    <>
      <video
        ref={videoRef}
        src={src}
        muted
        playsInline
        preload="auto"
        style={{ position: "absolute", opacity: 0, width: 1, height: 1, pointerEvents: "none" }}
      />
      <canvas ref={canvasRef} style={{ ...VIDEO_FILL_STYLE, position: "absolute", inset: 0 }} />
    </>
  );
};

export const VisualBackground: React.FC<VisualBackgroundProps> = ({
  bassScale = 1,
  backgroundSrc,
  bgIsVideo,
  bgLoopType,
  bgReversedSrc,
  bgVideoDurationInFrames,
  isExporting = false,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames: totalFrames } = useVideoConfig();

  const src     = backgroundSrc ?? staticFile("background.png");
  const isVideo = bgIsVideo === true || bgLoopType !== undefined || VIDEO_EXT_RE.test(src);
  const isBlob  = src.startsWith("blob:");

  const t = frame / fps;

  const ZOOM_CYCLE  = 40;
  const DRIFT_CYCLE = 55;
  const kenBurnsScale = isVideo ? 1 : 1.15 + 0.10 * Math.sin((t / ZOOM_CYCLE) * Math.PI * 2);
  const translateX    = isVideo ? 0 : 2.8  * Math.sin((t / DRIFT_CYCLE) * Math.PI * 2);
  const translateY    = isVideo ? 0 : 1.4  * Math.cos((t / DRIFT_CYCLE) * Math.PI * 2 + 1.2);
  const transform = `scale(${kenBurnsScale * bassScale}) translate(${translateX}%, ${translateY}%)`;

  const buildVideoNode = (): React.ReactNode => {
    if (!isVideo) return null;

    if (isBlob) {
      const validDuration = (bgVideoDurationInFrames && bgVideoDurationInFrames > 0 && isFinite(bgVideoDurationInFrames))
        ? bgVideoDurationInFrames
        : totalFrames;
      let frameTime = (frame % validDuration) / fps;
      if (!isFinite(frameTime)) frameTime = 0;

      return isExporting
        ? <CanvasVideoRenderer src={src} frameTime={frameTime} />
        : <SeekableVideo src={src} frameTime={frameTime} />;
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
