export interface LrcLine {
  time: number;  // seconds from start
  text: string;
  words: string[];
}

export async function loadLyrics(src: string): Promise<LrcLine[]> {
  try {
    const res = await fetch(src);
    if (!res.ok) return [];
    return (await res.json()) as LrcLine[];
  } catch {
    return [];
  }
}
