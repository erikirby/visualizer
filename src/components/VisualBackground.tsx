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
  objectPosition: "center center",
};

// --- PREVIEW RENDERER ---
// Fast, simple HTML video playback synced to the frame. Works perfectly in the 
// browser Player but fails in renderMediaOnWeb because of canvas taint/capture issues.
const SeekableVideo: React.FC<{ src: string; frameTime: number }> = ({ src, frameTime }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    // Only seek if we are meaningfully out of sync to avoid stuttering
    if (Math.abs(video.currentTime - frameTime) > 0.05) {
      video.currentTime = frameTime;
    }
  }, [frameTime]);

  return (
    <video
      ref={videoRef}
      src={src}
      muted
      playsInline
      style={{ ...VIDEO_FILL_STYLE, position: "absolute", inset: 0 }}
    />
  );
};

// --- EXPORT RENDERER ---
// Bulletproof DOM-to-Canvas renderer for export. It draws the video onto a <canvas>.
// This bypasses html2canvas's inability to capture local <video> tags.
// Creates a delayRender lock *during the render phase* to fix the timing bug.
const CanvasVideoRenderer: React.FC<{ src: string, frameTime: number }> = ({ src, frameTime }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Keep an off-screen video element in memory
  const [video] = React.useState(() => {
    const v = document.createElement('video');
    v.src = src;
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    return v;
  });

  // Create a new handle for every distinct frameTime during the render phase
  const handleRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number | null>(null);

  if (lastFrameTimeRef.current !== frameTime) {
    handleRef.current = delayRender("canvas-video-" + frameTime);
    lastFrameTimeRef.current = frameTime;
  }

  useEffect(() => {
    const v = video;
    const handle = handleRef.current;
    if (handle === null) return;

    let isCancelled = false;

    const drawFrame = () => {
      if (isCancelled) return;
      const canvas = canvasRef.current;
      if (canvas && v.videoWidth) {
        canvas.width = v.videoWidth;
        canvas.height = v.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(v, 0, 0, canvas.width, canvas.height);
      }
      continueRender(handle);
    };

    const onSeeked = () => {
      // requestVideoFrameCallback is the most reliable way to know a frame has been painted internally
      if ('requestVideoFrameCallback' in v) {
        (v as any).requestVideoFrameCallback(drawFrame);
      } else {
        requestAnimationFrame(drawFrame);
      }
    };

    v.addEventListener('seeked', onSeeked);
    v.currentTime = frameTime;

    return () => {
      isCancelled = true;
      v.removeEventListener('seeked', onSeeked);
    };
  }, [frameTime, video]);

  return <canvas ref={canvasRef} style={{ ...VIDEO_FILL_STYLE, position: "absolute", inset: 0 }} />;
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
  const isBlob = src.startsWith("blob:");

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
      const loopFrames = bgVideoDurationInFrames ?? totalFrames;
      const frameTime  = (frame % loopFrames) / fps;
      
      return isExporting ? (
        <CanvasVideoRenderer src={src} frameTime={frameTime} />
      ) : (
        <SeekableVideo src={src} frameTime={frameTime} />
      );
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
