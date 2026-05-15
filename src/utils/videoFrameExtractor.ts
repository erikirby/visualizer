// Extracted JPEG frames for user-uploaded video backgrounds.
// Populated before renderMediaOnWeb; read during render via getVideoFrame().
// Keyed by blob URL so multiple videos could coexist (though in practice there's one).
const store = new Map<string, string[]>();

export async function extractVideoFrames(
  src: string,
  fps: number,
  durationSeconds: number,
  onProgress?: (pct: number) => void,
): Promise<void> {
  if (store.has(src)) return; // already extracted

  const video = document.createElement("video");
  video.src = src;
  video.muted = true;
  video.preload = "auto";

  await new Promise<void>((resolve, reject) => {
    video.addEventListener("loadedmetadata", () => resolve(), { once: true });
    video.addEventListener("error", () => reject(new Error("Video failed to load")), { once: true });
    video.load();
  });

  const totalSeconds = Math.min(durationSeconds, video.duration);
  const frameCount = Math.ceil(totalSeconds * fps);
  const frames: string[] = [];

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d")!;

  for (let i = 0; i < frameCount; i++) {
    video.currentTime = i / fps;

    await new Promise<void>((resolve) => {
      const done = () => resolve();
      const timer = setTimeout(done, 2000); // safety: don't hang if seek stalls
      const finish = () => { clearTimeout(timer); done(); };
      if ("requestVideoFrameCallback" in (video as HTMLVideoElement)) {
        (video as any).requestVideoFrameCallback(finish);
      } else {
        (video as HTMLVideoElement).addEventListener("seeked", finish, { once: true });
      }
    });

    ctx.drawImage(video, 0, 0);
    frames.push(canvas.toDataURL("image/jpeg", 0.85));
    onProgress?.((i + 1) / frameCount);
  }

  video.remove();
  store.set(src, frames);
}

export function getVideoFrame(src: string, frameIndex: number): string | null {
  const frames = store.get(src);
  if (!frames || frames.length === 0) return null;
  return frames[Math.min(frameIndex, frames.length - 1)] ?? null;
}

export function clearVideoFrames(src?: string): void {
  if (src) store.delete(src);
  else store.clear();
}
