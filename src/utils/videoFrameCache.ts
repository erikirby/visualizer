// Module-level cache: src → (frameIndex → ImageBitmap)
// Populated before renderMediaOnWeb; read during render for frame-exact results.
export const videoFrameCache = new Map<string, Map<number, ImageBitmap>>();

export async function buildVideoFrameCache(
  src: string,
  fps: number,
  videoDurationSeconds: number,
  onProgress?: (pct: number) => void,
): Promise<void> {
  const existing = videoFrameCache.get(src);
  if (existing && existing.size > 0) return;

  const video = document.createElement("video");
  video.src = src;
  video.muted = true;
  video.preload = "auto";
  video.crossOrigin = "anonymous";

  await new Promise<void>((resolve, reject) => {
    video.addEventListener("loadedmetadata", () => resolve(), { once: true });
    video.addEventListener("error", () => reject(new Error("Video load failed")), { once: true });
    video.load();
  });

  const frameCount = Math.ceil(Math.min(videoDurationSeconds, video.duration) * fps);
  const frameMap = new Map<number, ImageBitmap>();

  for (let i = 0; i < frameCount; i++) {
    const t = i / fps;
    video.currentTime = t;

    await new Promise<void>((resolve) => {
      const onFrame = () => resolve();
      if ("requestVideoFrameCallback" in (video as HTMLVideoElement)) {
        (video as any).requestVideoFrameCallback(onFrame);
      } else {
        (video as HTMLVideoElement).addEventListener("seeked", onFrame, { once: true });
      }
    });

    const bitmap = await createImageBitmap(video, {
      resizeWidth: Math.floor(video.videoWidth / 2),
      resizeHeight: Math.floor(video.videoHeight / 2),
      resizeQuality: "high",
    });
    frameMap.set(i, bitmap);
    onProgress?.((i + 1) / frameCount);
  }

  video.remove();
  videoFrameCache.set(src, frameMap);
}

export function clearVideoFrameCache(src?: string): void {
  if (src) {
    const map = videoFrameCache.get(src);
    if (map) {
      map.forEach((b) => b.close());
      videoFrameCache.delete(src);
    }
  } else {
    videoFrameCache.forEach((map) => map.forEach((b) => b.close()));
    videoFrameCache.clear();
  }
}
