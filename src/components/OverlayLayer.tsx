import React from "react";
import { AbsoluteFill, Loop, OffthreadVideo } from "remotion";

interface OverlayLayerProps {
  overlaySrc: string;
  overlayBlendMode?: "screen" | "overlay" | "soft-light" | "multiply";
  overlayOpacity?: number;
  overlayDurationInFrames?: number;
}

const VIDEO_FILL_STYLE: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  objectPosition: "center center",
};

export const OverlayLayer: React.FC<OverlayLayerProps> = ({
  overlaySrc,
  overlayBlendMode = "screen",
  overlayOpacity = 0.45,
  overlayDurationInFrames,
}) => {
  return (
    <AbsoluteFill
      style={{
        mixBlendMode: overlayBlendMode,
        opacity: overlayOpacity,
        pointerEvents: "none",
      }}
    >
      {overlayDurationInFrames ? (
        <Loop durationInFrames={overlayDurationInFrames}>
          <OffthreadVideo src={overlaySrc} muted style={VIDEO_FILL_STYLE} />
        </Loop>
      ) : (
        <OffthreadVideo src={overlaySrc} muted style={VIDEO_FILL_STYLE} />
      )}
    </AbsoluteFill>
  );
};
