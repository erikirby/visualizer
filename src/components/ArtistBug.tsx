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
}

export const ArtistBug: React.FC<ArtistBugProps> = ({
  artistName,
  trackName,
  size = "full",
  reverseTitles = false,
  fontFamily = "Inter",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Fade in over the first second
  const opacity = interpolate(frame, [0, fps * 1.0], [0, 1], {
    extrapolateLeft:  "clamp",
    extrapolateRight: "clamp",
  });

  const isSmall      = size === "small";
  const primarySize  = isSmall ? 28 : 40;
  const secondarySize= isSmall ? 18 : 26;
  const baseOpacity  = isSmall ? 0.70 : 1.0;
  const left         = 72;
  const top          = 64;

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
          gap: 7,
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
              "0 0 16px rgba(255,45,155,0.80)",
              "0 0 36px rgba(255,45,155,0.35)",
              "0 2px 4px rgba(0,0,0,0.6)",
            ].join(", "),
          }}
        >
          {topText}
        </div>

        {/* Accent line */}
        <div
          style={{
            width: isSmall ? 120 : 180,
            height: isSmall ? 1.5 : 2,
            background:
              "linear-gradient(90deg, rgba(255,45,155,0.85) 0%, rgba(0,180,255,0.4) 100%)",
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
