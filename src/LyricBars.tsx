import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { Audio } from "@remotion/media";
import { useAudioData, visualizeAudio } from "@remotion/media-utils";
import { VisualBackground } from "./components/VisualBackground";
import { LyricEngine } from "./components/LyricEngine";
import { BarEQ } from "./components/BarEQ";
import { getBassEnergy } from "./utils/audioColor";
import type { LrcLine } from "./utils/parseLrc";

export type LyricBarsProps = {
  lines: LrcLine[];
  audioDuration: number;
  audioSrc: string;
  backgroundSrc: string;
} & Record<string, unknown>;

// Compact BarEQ: CENTER_Y=930, bars reach up 140px to y≈790.
// Push lyrics to bottom=300 so they sit centered in the frame above the bars.
const LYRIC_BOTTOM = 300;

export const LyricBars: React.FC<LyricBarsProps> = ({
  lines,
  audioDuration,
  audioSrc,
  backgroundSrc,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const audioData = useAudioData(audioSrc as string);

  const bassScale = React.useMemo(() => {
    if (!audioData) return 1;
    const viz = visualizeAudio({ fps, frame, audioData, numberOfSamples: 32, smoothing: true });
    return 1 + getBassEnergy(viz) * 0.012;
  }, [audioData, frame, fps]);

  return (
    <AbsoluteFill style={{ background: "#080818" }}>
      <Audio src={audioSrc as string} />
      <VisualBackground bassScale={bassScale} backgroundSrc={backgroundSrc as string} />
      <BarEQ audioSrc={audioSrc as string} compact />
      <LyricEngine
        lines={lines as LrcLine[]}
        audioDuration={audioDuration as number}
        bottomOffset={LYRIC_BOTTOM}
      />
    </AbsoluteFill>
  );
};
