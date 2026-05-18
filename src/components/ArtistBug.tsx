import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadOswald } from "@remotion/google-fonts/Oswald";
import { loadFont as loadPlayfair } from "@remotion/google-fonts/PlayfairDisplay";
import { loadFont as loadSpace } from "@remotion/google-fonts/SpaceGrotesk";
import { loadFont as loadRoboto } from "@remotion/google-fonts/Roboto";

function getFontFamily(fontId: string) {
  switch (fontId) {
    case "Oswald": return loadOswald("normal", { weights: ["700", "400"] }).fontFamily;
    case "Playfair Display": return loadPlayfair("normal", { weights: ["700", "400"] }).fontFamily;
    case "Space Grotesk": return loadSpace("normal", { weights: ["700", "400"] }).fontFamily;
    case "Roboto": return loadRoboto("normal", { weights: ["700", "400"] }).fontFamily;
    default: return loadInter("normal", { weights: ["700", "400"] }).fontFamily;
  }
}

export type ArtistBugSize = "full" | "small";

interface ArtistBugProps {
  artistName: string;
  trackName: string;
  // "full" = visualizer styles (no competing content)
  // "small" = lyric style (lyrics are the star, this is secondary)
  size?: ArtistBugSize;
  reverseTitles?: boolean;
  fontFamily?: string;
  colorA?: string;
  colorB?: string;
}

export const ArtistBug: React.FC<ArtistBugProps> = ({
  artistName,
  trackName,
  size = "full",
  reverseTitles = false,
  fontFamily = "Inter",
  colorA = "#FF2D9B",
  colorB = "#00B4FF",
}) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();

  // Fade in over the first second
  const opacity = interpolate(frame, [0, fps * 1.0], [0, 1], {
    extrapolateLeft:  "clamp",
    extrapolateRight: "clamp",
  });

  // Scale all pixel values proportionally to the composition width
  const scale        = width / 1920;
  const isSmall      = size === "small";
  const primarySize  = (isSmall ? 28 : 40) * scale;
  const secondarySize= (isSmall ? 18 : 26) * scale;
  const baseOpacity  = isSmall ? 0.70 : 1.0;
  const left         = 72  * scale;
  const top          = 64  * scale;

  const topText = reverseTitles ? trackName : artistName;
  const bottomText = reverseTitles ? artistName : trackName;
  
  const resolvedFont = getFontFamily(fontFamily);

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          top,
          left,
          opacity: opacity * baseOpacity,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 7 * scale,
        }}
      >
        {/* Top text (Primary) */}
        <div
          style={{
            fontFamily: resolvedFont,
            fontWeight: 700,
            fontSize: primarySize,
            color: "#FFFFFF",
            letterSpacing: "0.02em",
            lineHeight: 1,
            textShadow: [
              `0 0 ${16 * scale}px ${colorA}CC`,
              `0 0 ${36 * scale}px ${colorA}59`,
              `0 ${2 * scale}px ${4 * scale}px rgba(0,0,0,0.6)`,
            ].join(", "),
          }}
        >
          {topText}
        </div>

        {/* Accent line */}
        <div
          style={{
            width: (isSmall ? 120 : 180) * scale,
            height: (isSmall ? 1.5 : 2) * scale,
            background:
              `linear-gradient(90deg, ${colorA}D9 0%, ${colorB}66 100%)`,
            borderRadius: 1,
          }}
        />

        {/* Bottom text (Secondary) */}
        <div
          style={{
            fontFamily: resolvedFont,
            fontWeight: 400,
            fontSize: secondarySize,
            color: "rgba(255,255,255,0.75)",
            letterSpacing: "0.10em",
            textTransform: "uppercase",
            lineHeight: 1,
            textShadow: "0 2px 6px rgba(0,0,0,0.5)",
          }}
        >
          {bottomText}
        </div>
      </div>
    </AbsoluteFill>
  );
};
