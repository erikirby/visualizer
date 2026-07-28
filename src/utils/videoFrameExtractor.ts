const store = new Map<string, string[]>();

// Max canvas dimensions for frame extraction.
// Full-res (1080p/4K) is wasteful — 1280×720 is plenty for a background
// that gets scaled to fill and compressed anyway. Cuts memory ~60-75%.
const MAX_EXTRACT_W = 1920;
const MAX_EXTRACT_H = 1080;

// Yield to the event loop so React can keep rendering during extraction.
const yieldFrame = () => new Promise<void>((r) => setTimeout(r, 0));

export async function extractVideoFrames(
  src: string,
  fps: number,
  durationSeconds: number,
  onProgress?: (pct: number) => void,
  // Effects Pass renders the clip at its own size, so it passes the source
  // dimensions here — the defaults would downscale a 1080x1916 clip to
  // 609x1080 and then upscale it again on export.
  maxW: number = MAX_EXTRACT_W,
  maxH: number = MAX_EXTRACT_H,
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
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Video failed to load — please re-upload your background video.")), 10000);
      video.addEventListener("loadedmetadata", () => { clearTimeout(timer); resolve(); }, { once: true });
      video.addEventListener("error", () => { clearTimeout(timer); reject(new Error("Video failed to load — please re-upload your background video.")); }, { once: true });
      video.load();
    });

    const totalSeconds = Math.min(durationSeconds, video.duration);
    const frameCount = Math.ceil(totalSeconds * fps);
    const frames: string[] = [];

    // Scale down canvas to MAX_EXTRACT_W×MAX_EXTRACT_H, preserving aspect ratio
    const aspect = video.videoWidth / video.videoHeight;
    let canvasW = Math.min(video.videoWidth, maxW);
    let canvasH = Math.round(canvasW / aspect);
    if (canvasH > maxH) {
      canvasH = maxH;
      canvasW = Math.round(canvasH * aspect);
    }

    const canvas = document.createElement("canvas");
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext("2d")!;

    for (let i = 0; i < frameCount; i++) {
      video.currentTime = i / fps;

      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 3000);
        video.addEventListener("seeked", () => { clearTimeout(timer); resolve(); }, { once: true });
      });

      ctx.drawImage(video, 0, 0, canvasW, canvasH);
      // Object URLs over data URLs: base64 costs ~33% more memory and decodes
      // far slower. At full 9:16 resolution the data-URL path overran
      // Remotion's delayRender timeout mid-export.
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.92),
      );
      if (!blob) throw new Error("Frame extraction failed — browser ran out of memory.");
      frames.push(URL.createObjectURL(blob));
      onProgress?.((i + 1) / frameCount);

      // Yield every 4 frames so the browser can handle React renders,
      // audio playback, and other events without completely locking up.
      if (i % 4 === 3) await yieldFrame();
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
  // Object URLs hold their blob in memory until explicitly revoked.
  const revoke = (urls: string[]) => urls.forEach((u) => URL.revokeObjectURL(u));
  if (src) {
    const frames = store.get(src);
    if (frames) revoke(frames);
    store.delete(src);
  } else {
    store.forEach(revoke);
    store.clear();
  }
}
