#!/usr/bin/env python3
"""
whisper_sync.py  —  AELOW Lyric Video Engine

Listens to your audio file, timestamps every word it hears,
then aligns those timestamps to your plain lyrics file.
Outputs a perfectly timed lyrics.json in the song folder.

USAGE (called by sync.sh — you don't need to run this directly):
    python3 tools/whisper_sync.py <audio_file> <plain_lyrics.txt> <output.json> [model_size]

    model_size: small (default, best balance) | base (faster, less accurate) | medium (slower, most accurate)
"""

import sys
import re
import os
from pathlib import Path


def normalize(text: str) -> str:
    """Lowercase, strip punctuation and extra spaces."""
    text = text.lower()
    text = re.sub(r"[^a-z0-9 '']", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def parse_plain_lyrics(path: str) -> list[str]:
    """
    Read plain lyrics .txt → flat list of lyric lines.
    Strips title, section markers [CHORUS] etc., blank lines.
    """
    SECTION_RE = re.compile(r"^\[[^\]]+\]$")
    lines = []
    seen_first = False

    for raw in Path(path).read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line:
            continue
        if SECTION_RE.match(line):
            continue
        # Skip the song title (all-caps first line)
        if not seen_first and line.upper() == line and len(line.split()) <= 8:
            seen_first = True
            continue
        seen_first = True
        lines.append(line)

    return lines


def write_json(entries: list, path: str):
    import json
    lines = []
    for (start_ms, _end_ms, text) in entries:
        lines.append({
            "time": round(start_ms / 1000, 3),
            "text": text,
            "words": text.split(),
        })
    Path(path).write_text(json.dumps(lines, ensure_ascii=False, indent=2), encoding="utf-8")


def score_match(lyric_words: list[str], trans_words: list[str], pos: int) -> float:
    """
    Score how well lyric_words match a window in trans_words starting at pos.
    Returns 0.0–1.0 based on how many lyric words appear in the window.
    """
    window = trans_words[pos : pos + len(lyric_words) + 3]
    window_set = set(window)
    if not lyric_words:
        return 0.0
    matches = sum(1 for w in lyric_words if w in window_set)
    return matches / len(lyric_words)


def align(lyric_lines: list[str], trans_words: list[dict]) -> list[tuple]:
    """
    Sequentially align lyric lines to transcription words.
    Returns list of (start_ms, end_ms, lyric_text).
    """
    results = []
    trans_norm = [normalize(w["word"]) for w in trans_words]
    trans_len = len(trans_words)

    ptr = 0  # current position in transcription

    for line in lyric_lines:
        lyric_norm = normalize(line).split()
        if not lyric_norm:
            continue

        # Clamp ptr to valid range
        ptr = min(ptr, trans_len - 1)

        # Search window: up to SEARCH_WINDOW words ahead
        SEARCH_WINDOW = max(60, len(lyric_norm) * 8)
        search_end = min(ptr + SEARCH_WINDOW, trans_len)

        best_score = -1.0
        best_pos = ptr

        for pos in range(ptr, max(ptr + 1, search_end)):
            s = score_match(lyric_norm, trans_norm, pos)
            if s > best_score:
                best_score = s
                best_pos = pos

        # Clamp best_pos to valid range
        best_pos = min(best_pos, trans_len - 1)

        start_ms = int(trans_words[best_pos]["start"] * 1000)

        end_idx = min(best_pos + len(lyric_norm), trans_len - 1)
        end_ms  = int(trans_words[end_idx]["end"] * 1000)
        end_ms  = max(start_ms + 500, min(end_ms, start_ms + 6000))

        results.append((start_ms, end_ms, line))

        # Advance pointer past the words we just matched
        ptr = best_pos + max(1, len(lyric_norm))

    # Fix end times: each line ends where the next one begins
    for i in range(len(results) - 1):
        start_next = results[i + 1][0]
        results[i] = (results[i][0], max(results[i][0] + 300, start_next - 50), results[i][2])

    return results


def main():
    if len(sys.argv) < 4:
        print(__doc__)
        sys.exit(1)

    audio_path   = sys.argv[1]
    lyrics_path  = sys.argv[2]
    output_path  = sys.argv[3]
    model_size   = sys.argv[4] if len(sys.argv) > 4 else "small"

    # Resolve symlinks (song folders use symlinks for audio)
    audio_path = str(Path(audio_path).resolve())

    model_dl = {"base": "~145MB", "small": "~460MB", "medium": "~1.5GB"}.get(model_size, "varies")
    print(f"\n  Audio:   {os.path.basename(audio_path)}")
    print(f"  Lyrics:  {os.path.basename(lyrics_path)}")
    print(f"  Model:   {model_size}  (first run downloads {model_dl}, cached after)")
    print()
    print("  Listening to audio... this takes 2–5 minutes.")
    print()

    from faster_whisper import WhisperModel

    model = WhisperModel(model_size, device="cpu", compute_type="int8")

    # Parse lyrics first so we can pass them as initial_prompt.
    # Giving Whisper the actual lyrics text as context dramatically improves
    # word-level timestamp accuracy on sung vocals — it knows what words to
    # expect instead of guessing from the audio alone.
    lyric_lines = parse_plain_lyrics(lyrics_path)
    lyrics_hint = " ".join(lyric_lines)

    segments, _ = model.transcribe(
        audio_path,
        word_timestamps=True,
        language="en",
        beam_size=5,
        initial_prompt=lyrics_hint,
        condition_on_previous_text=False,  # prevents hallucination loops in music
        # vad_filter off — music in the background fools the voice detector
    )

    # Flatten all words from all segments
    trans_words = []
    for segment in segments:
        if segment.words:
            for w in segment.words:
                word = w.word.strip()
                if word:
                    trans_words.append({"word": word, "start": w.start, "end": w.end})

    if not trans_words:
        print("  ERROR: Whisper found no words in the audio.")
        print("  Make sure the audio file has vocals and isn't an instrumental.")
        sys.exit(1)

    print(f"  Whisper found {len(trans_words)} words.")
    print(f"  Lyric lines to sync: {len(lyric_lines)}")
    print()
    print("  Aligning...")

    entries = align(lyric_lines, trans_words)
    write_json(entries, output_path)

    print(f"  Done! Written {len(entries)} timed lines → {output_path}")
    print()
    print("  The render script will use this automatically next time you render.")


if __name__ == "__main__":
    main()
