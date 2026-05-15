const store = new Map<string, string[]>();

export async function extractVideoFrames(
  src: string,
  fps: number,
  durationSeconds: number,
  onProgress?: (pct: number) => void,
): Promise<void> {
  if (store.has(src)) return;

  const video = document.createElement("video");
  video.src = src;
  video.muted = true;
  video.preload = "auto";
  // Must be in the DOM for Chrome to decode frames — off-screen but not hidden
  video.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;";
  document.body.appendChild(video);

  try {
    // Verify the blob URL is still alive before starting
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Video failed to load — please re-upload your background video.")), 10000);
      video.addEventListener("loadedmetadata", () => { clearTimeout(timer); resolve(); }, { once: true });
      video.addEventListener("error", () => { clearTimeout(timer); reject(new Error("Video failed to load — please re-upload your background video.")); }, { once: true });
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

      // Use seeked event — reliable regardless of tab focus
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 3000);
        video.addEventListener("seeked", () => { clearTimeout(timer); resolve(); }, { once: true });
      });

      ctx.drawImage(video, 0, 0);
      frames.push(canvas.toDataURL("image/jpeg", 0.85));
      onProgress?.((i + 1) / frameCount);
    }

    store.set(src, frames);
  } finally {
    document.body.removeChild(video);
  }
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
