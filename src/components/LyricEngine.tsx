import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadOswald } from "@remotion/google-fonts/Oswald";
import { loadFont as loadPlayfair } from "@remotion/google-fonts/PlayfairDisplay";
import { loadFont as loadSpace } from "@remotion/google-fonts/SpaceGrotesk";
import { loadFont as loadRoboto } from "@remotion/google-fonts/Roboto";
import type { LrcLine } from "../utils/parseLrc";

function getFontFamily(fontId: string) {
  switch (fontId) {
    case "Oswald": return loadOswald("normal", { weights: ["700"] }).fontFamily;
    case "Playfair Display": return loadPlayfair("normal", { weights: ["700"] }).fontFamily;
    case "Space Grotesk": return loadSpace("normal", { weights: ["700"] }).fontFamily;
    case "Roboto": return loadRoboto("normal", { weights: ["700"] }).fontFamily;
    default: return loadInter("normal", { weights: ["700"] }).fontFamily;
  }
}

const TEXT_WHITE = "#FFFFFF";

// Safe zone padding — nothing gets clipped on any platform
const SAFE_H = 80;
const SAFE_V = 100;

const FONT_SIZE = 72;
const LINE_GAP = 24;

interface LineDisplayProps {
  line: LrcLine;
  lineEnterFrame: number;
  fps: number;
  opacity: number;
  isCurrentLine: boolean;
  fontFamilyStr: string;
  colorA: string;
}

const LineDisplay: React.FC<LineDisplayProps> = ({
  line,
  lineEnterFrame,
  fps,
  opacity,
  isCurrentLine,
  fontFamilyStr,
  colorA,
}) => {
  const textStyle: React.CSSProperties = isCurrentLine
    ? {
        color: TEXT_WHITE,
        textShadow: [
          `0 0 18px ${colorA}D9`,
          `0 0 40px ${colorA}73`,
          `0 0 70px ${colorA}33`,
        ].join(", "),
      }
    : {
        color: TEXT_WHITE,
        textShadow: "none",
      };

  return (
    <div
      style={{
        textAlign: "center",
        opacity,
        pointerEvents: "none",
      }}
    >
      <span
        style={{
          fontFamily: fontFamilyStr,
          fontWeight: 700,
          fontSize: FONT_SIZE,
          lineHeight: 1.15,
          letterSpacing: "-0.01em",
          ...textStyle,
        }}
      >
        {line.text}
      </span>
    </div>
  );
};

export interface LyricEngineProps {
  lines: LrcLine[];
  audioDuration: number;
  bottomOffset?: number;
  fontFamily?: string;
  colorA?: string;
}

// Show each line this many seconds before its timestamp.
// Whisper measures word onset; a small pre-roll makes lyrics feel on-the-beat
// rather than reacting a beat late.
const LEAD_SECS = 0.35;

export const LyricEngine: React.FC<LyricEngineProps> = ({ lines, audioDuration, bottomOffset, fontFamily = "Inter", colorA = "#FF2D9B" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;

  if (lines.length === 0) return null;

  // Find the active line index — last line whose start time is <= currentTime + LEAD_SECS
  let currentLineIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time - LEAD_SECS <= currentTime) {
      currentLineIdx = i;
    } else {
      break;
    }
  }

  if (currentLineIdx < 0) return null;

  const currentLine = lines[currentLineIdx];
  const prevLine = currentLineIdx > 0 ? lines[currentLineIdx - 1] : null;

  const prevLineStartTime = prevLine ? prevLine.time : 0;

  // Previous line fades from 0.25 → 0 over the first 1.2s of the current line being shown
  const currentLineStartFrame = Math.round(currentLine.time * fps);
  const prevOpacity = prevLine
    ? interpolate(
        frame,
        [currentLineStartFrame, currentLineStartFrame + fps * 1.2],
        [0.28, 0],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
      )
    : 0;

  // Fade entire lyric block in at video start, out at end
  const blockOpacity = interpolate(
    frame,
    [0, fps * 0.4],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          bottom: bottomOffset ?? SAFE_V,
          left: SAFE_H,
          right: SAFE_H,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: LINE_GAP,
          opacity: blockOpacity,
        }}
      >
        {/* Previous ghost line */}
        {prevLine && prevOpacity > 0.01 && (
          <LineDisplay
            line={prevLine}
            lineEnterFrame={Math.round(prevLineStartTime * fps)}
            fps={fps}
            opacity={prevOpacity}
            isCurrentLine={false}
            fontFamilyStr={getFontFamily(fontFamily)}
            colorA={colorA}
          />
        )}

        {/* Current active line */}
        <LineDisplay
          line={currentLine}
          lineEnterFrame={currentLineStartFrame}
          fps={fps}
          opacity={1}
          isCurrentLine={true}
          fontFamilyStr={getFontFamily(fontFamily)}
          colorA={colorA}
        />
      </div>
    </AbsoluteFill>
  );
};
