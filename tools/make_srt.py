#!/usr/bin/env python3
"""
make_srt.py  —  AELOW Lyric Video Engine

Takes your plain lyrics .txt (which has the natural line breaks you wrote)
and a rough-timed .srt from Lyric Potato (which has the timestamps but
crams multiple lines together), and produces a clean .srt where each line
is exactly one lyric line with the right timestamp.

USAGE:
    python3 tools/make_srt.py <plain_lyrics.txt> <rough_timing.srt> <output.srt>

EXAMPLE:
    python3 tools/make_srt.py \
        "../against_my_better_lyrics/somethings_wrong_with_me.txt" \
        "songs/against_my_better/08_somethings_wrong_with_me/lyrics.srt" \
        "songs/against_my_better/08_somethings_wrong_with_me/lyrics_clean.srt"

Then rename lyrics_clean.srt to lyrics.srt and re-render.
"""

import sys
import re
from pathlib import Path


# ── Helpers ──────────────────────────────────────────────────────────────────

def parse_srt(path: str):
    """Parse SRT into list of (start_ms, end_ms, text) tuples."""
    blocks = []
    text = Path(path).read_text(encoding="utf-8")

    for block in re.split(r"\n\s*\n", text.strip()):
        lines = block.strip().split("\n")
        timestamp_line = None
        text_lines = []

        for i, line in enumerate(lines):
            if "-->" in line:
                timestamp_line = line
                text_lines = lines[i + 1:]
                break

        if not timestamp_line:
            continue

        m = re.match(
            r"(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})",
            timestamp_line.strip()
        )
        if not m:
            continue

        def to_ms(h, mi, s, ms):
            return int(h) * 3600000 + int(mi) * 60000 + int(s) * 1000 + int(ms)

        start_ms = to_ms(m.group(1), m.group(2), m.group(3), m.group(4))
        end_ms   = to_ms(m.group(5), m.group(6), m.group(7), m.group(8))
        combined = " ".join(t.strip() for t in text_lines if t.strip())

        # Strip HTML tags some exporters add
        combined = re.sub(r"<[^>]+>", "", combined).strip()

        if combined:
            blocks.append((start_ms, end_ms, combined))

    return blocks


def parse_plain_lyrics(path: str):
    """
    Parse a plain lyrics .txt into a flat list of lyric lines.
    Strips the song title, section markers [CHORUS] etc., and blank lines.
    """
    SECTION_RE = re.compile(r"^\[[^\]]+\]$")
    lines = []

    for raw in Path(path).read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line:
            continue
        if SECTION_RE.match(line):
            continue
        # Skip the song title (all caps, first non-empty line)
        if line.isupper() and len(lines) == 0:
            continue
        lines.append(line)

    return lines


def normalize(text: str) -> str:
    """Lowercase, strip punctuation for fuzzy comparison."""
    return re.sub(r"[^a-z0-9 ]", "", text.lower())


def count_shared_words(a: str, b: str) -> int:
    """Count how many words from b appear in a (normalized)."""
    words_a = set(normalize(a).split())
    words_b = normalize(b).split()
    return sum(1 for w in words_b if w in words_a)


def ms_to_srt_timestamp(ms: int) -> str:
    h  = ms // 3600000;  ms %= 3600000
    mi = ms // 60000;    ms %= 60000
    s  = ms // 1000;     ms %= 1000
    return f"{h:02d}:{mi:02d}:{s:02d},{ms:03d}"


def write_srt(entries: list, path: str):
    """Write list of (start_ms, end_ms, text) to an SRT file."""
    out = []
    for i, (start, end, text) in enumerate(entries, 1):
        out.append(str(i))
        out.append(f"{ms_to_srt_timestamp(start)} --> {ms_to_srt_timestamp(end)}")
        out.append(text)
        out.append("")
    Path(path).write_text("\n".join(out), encoding="utf-8")


# ── Main alignment logic ──────────────────────────────────────────────────────

def align(srt_blocks, plain_lines):
    """
    For each SRT block, figure out how many plain lyric lines it covers,
    then split the block's time evenly across those lines.

    Strategy: greedily consume plain lines until their combined word count
    roughly matches the words in the SRT block.
    """
    result = []
    plain_idx = 0
    total_plain = len(plain_lines)

    for (start_ms, end_ms, srt_text) in srt_blocks:
        srt_word_count = len(srt_text.split())
        block_duration = end_ms - start_ms

        # How many plain lines does this block correspond to?
        # Estimate by matching word counts — consume plain lines until we've
        # accounted for roughly as many words as are in the SRT block.
        matched = []
        running_words = 0

        while plain_idx < total_plain:
            candidate = plain_lines[plain_idx]
            candidate_words = len(candidate.split())

            # Shared words between the SRT block and this plain line
            shared = count_shared_words(srt_text, candidate)

            # Accept this line if:
            #   - We haven't matched anything yet (always take at least one line)
            #   - OR it shares words with the SRT block
            #   - AND we haven't already exceeded the block's word count
            if not matched or (shared > 0 and running_words < srt_word_count * 1.3):
                matched.append(candidate)
                running_words += candidate_words
                plain_idx += 1
            else:
                break

            # Stop if we've consumed enough words for this block
            if running_words >= srt_word_count * 0.7:
                break

        if not matched:
            # Fallback: just assign the raw SRT text as one line
            result.append((start_ms, end_ms, srt_text))
            continue

        # Distribute the block's time evenly across the matched plain lines
        per_line_ms = block_duration // len(matched)
        for i, line in enumerate(matched):
            line_start = start_ms + i * per_line_ms
            line_end   = line_start + per_line_ms
            result.append((line_start, line_end, line))

    # If there are leftover plain lines (e.g. a final section the SRT missed),
    # give them 3 seconds each after the last entry
    if result:
        last_end = result[-1][1]
    else:
        last_end = 0

    while plain_idx < total_plain:
        result.append((last_end, last_end + 3000, plain_lines[plain_idx]))
        last_end += 3000
        plain_idx += 1

    return result


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    if len(sys.argv) != 4:
        print(__doc__)
        sys.exit(1)

    lyrics_txt = sys.argv[1]
    input_srt  = sys.argv[2]
    output_srt = sys.argv[3]

    print(f"  Reading plain lyrics:  {lyrics_txt}")
    print(f"  Reading timed SRT:     {input_srt}")

    srt_blocks  = parse_srt(input_srt)
    plain_lines = parse_plain_lyrics(lyrics_txt)

    print(f"  SRT blocks:      {len(srt_blocks)}")
    print(f"  Plain lyric lines: {len(plain_lines)}")
    print()

    entries = align(srt_blocks, plain_lines)
    write_srt(entries, output_srt)

    print(f"  Written {len(entries)} lines → {output_srt}")
    print()
    print("  Done! Preview the file to check it looks right,")
    print("  then rename it to lyrics.srt and re-render.")
