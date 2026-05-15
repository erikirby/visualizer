#!/bin/bash
# =============================================================
#  AELOW Lyric Sync Tool
#  Listens to your audio and creates perfectly timed lyrics.
#
#  HOW TO USE:
#    1. Double-click "AELOW Sync Lyrics" on your Desktop
#    2. Pick a song number
#    3. Wait 1–3 minutes while it listens to the audio
#    4. When done, run the render script to make the video
#
#  REQUIREMENTS:
#    The song folder needs:
#      audio.wav      — already wired up for all songs
#      lyrics.txt     — your plain lyrics (in against_my_better_lyrics/)
#
#  It will CREATE lyrics.json automatically.
# =============================================================

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MGMT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$SCRIPT_DIR"

PYTHON="$MGMT_DIR/.venv/bin/python3"

# ── Colors ──
if [ -t 1 ]; then
  GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'
  CYAN='\033[0;36m'; BOLD='\033[1m'; DIM='\033[2m'; RESET='\033[0m'
else
  GREEN=''; RED=''; YELLOW=''; CYAN=''; BOLD=''; DIM=''; RESET=''
fi

clear
echo ""
echo -e "${BOLD}${CYAN}  ╔══════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${CYAN}  ║       AELOW  Lyric Sync Tool         ║${RESET}"
echo -e "${BOLD}${CYAN}  ╚══════════════════════════════════════╝${RESET}"
echo ""
echo -e "  ${DIM}Listens to each song and auto-generates timed lyrics.${RESET}"
echo -e "  ${DIM}First run downloads a small AI model (~145MB). Cached after that.${RESET}"
echo ""

SONGS_ROOT="$SCRIPT_DIR/songs"
LYRICS_ROOTS=(
  "$MGMT_DIR/against_my_better_lyrics"
  "$MGMT_DIR/aelow_sweet_damage_lyrics"
  "$MGMT_DIR/aelow_antihealthy_lyrics"
)

# ── Scan song folders ──
declare -a SONG_PATHS
declare -a SONG_LABELS
declare -a SONG_STATUS
declare -a SONG_AUDIO
declare -a SONG_LYRICS_TXT

while IFS= read -r -d '' song_dir; do
  song_dir="${song_dir%/}"
  album=$(basename "$(dirname "$song_dir")")
  song=$(basename "$song_dir")

  label=$(echo "$song" | sed 's/^[0-9]*_//' | sed 's/_/ /g' | \
    awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) tolower(substr($i,2)); print}')
  album_label=$(echo "$album" | sed 's/_/ /g' | \
    awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) tolower(substr($i,2)); print}')

  SONG_PATHS+=("$song_dir")
  SONG_LABELS+=("$album_label  —  $label")

  # Find audio
  audio_file=""
  for aname in audio.wav audio.mp3; do
    candidate="$song_dir/$aname"
    if [ -L "$candidate" ]; then
      audio_file=$(readlink "$candidate")
      break
    elif [ -f "$candidate" ]; then
      audio_file="$candidate"
      break
    fi
  done
  SONG_AUDIO+=("$audio_file")

  # Find matching plain lyrics .txt by looking for a file whose name
  # fuzzy-matches the song folder name (strip track number, try each lyrics dir)
  song_slug=$(echo "$song" | sed 's/^[0-9]*_//')
  lyrics_txt=""
  for ldir in "${LYRICS_ROOTS[@]}"; do
    if [ -d "$ldir" ]; then
      match=$(find "$ldir" -maxdepth 1 -name "*.txt" | while read -r f; do
        fname=$(basename "$f" .txt)
        # Check if slugs overlap (remove underscores/spaces, compare lowercase)
        fslugnorm=$(echo "$fname" | tr '[:upper:]' '[:lower:]' | tr -d '_- ')
        sslugnorm=$(echo "$song_slug" | tr '[:upper:]' '[:lower:]' | tr -d '_- ')
        if [ "$fslugnorm" = "$sslugnorm" ]; then
          echo "$f"
        fi
      done | head -1)
      if [ -n "$match" ]; then
        lyrics_txt="$match"
        break
      fi
    fi
  done
  SONG_LYRICS_TXT+=("$lyrics_txt")

  # Status
  has_json=false
  has_audio=false
  has_txt=false
  [ -f "$song_dir/lyrics.json" ] && has_json=true
  [ -n "$audio_file" ] && has_audio=true
  [ -n "$lyrics_txt" ] && has_txt=true

  if ! $has_audio; then
    SONG_STATUS+=("missing:audio")
  elif ! $has_txt; then
    SONG_STATUS+=("missing:lyrics.txt not found")
  elif $has_json; then
    SONG_STATUS+=("resync")
  else
    SONG_STATUS+=("ready")
  fi

done < <(find "$SONGS_ROOT" -mindepth 2 -maxdepth 2 -type d -print0 | sort -z)

# ── Print song list ──
echo -e "  ${BOLD}Your songs:${RESET}"
echo ""
printf "  %-4s %-42s %s\n" "#" "Song" "Status"
echo -e "  ${DIM}──────────────────────────────────────────────────────────${RESET}"

for i in "${!SONG_LABELS[@]}"; do
  num=$((i + 1))
  label="${SONG_LABELS[$i]}"
  status="${SONG_STATUS[$i]}"

  case "$status" in
    ready)
      printf "  ${GREEN}%-4s${RESET} %-42s ${GREEN}✓ Ready to sync${RESET}\n" "$num" "$label" ;;
    resync)
      printf "  ${YELLOW}%-4s${RESET} %-42s ${YELLOW}↺ Already synced (will re-sync)${RESET}\n" "$num" "$label" ;;
    missing:*)
      missing="${status#missing:}"
      printf "  ${DIM}%-4s %-42s ${RED}✗ Missing: %s${RESET}\n" "$num" "$label" "$missing" ;;
  esac
done

echo ""
echo -e "  ${DIM}──────────────────────────────────────────────────────────${RESET}"
echo ""

# ── Pick song ──
while true; do
  echo -ne "  ${BOLD}Type a number and press Enter (or q to quit): ${RESET}"
  read -r choice

  [ "$choice" = "q" ] || [ "$choice" = "Q" ] && echo "" && exit 0

  if ! [[ "$choice" =~ ^[0-9]+$ ]] || [ "$choice" -lt 1 ] || [ "$choice" -gt "${#SONG_PATHS[@]}" ]; then
    echo -e "  ${RED}  Please enter a number between 1 and ${#SONG_PATHS[@]}${RESET}"
    continue
  fi

  idx=$((choice - 1))
  status="${SONG_STATUS[$idx]}"

  if [[ "$status" == missing:* ]]; then
    missing="${status#missing:}"
    echo -e "\n  ${RED}  Can't sync — ${missing}${RESET}\n"
    continue
  fi

  break
done

# ── Sync ──
SELECTED_PATH="${SONG_PATHS[$idx]}"
SELECTED_LABEL="${SONG_LABELS[$idx]}"
AUDIO_FILE="${SONG_AUDIO[$idx]}"
LYRICS_TXT="${SONG_LYRICS_TXT[$idx]}"
OUTPUT_JSON="$SELECTED_PATH/lyrics.json"

echo ""
echo -e "  ${CYAN}Syncing:${RESET} ${BOLD}${SELECTED_LABEL}${RESET}"
echo -e "  ${DIM}Using lyrics from: $(basename "$LYRICS_TXT")${RESET}"
echo ""

"$PYTHON" "$SCRIPT_DIR/tools/whisper_sync.py" \
  "$AUDIO_FILE" \
  "$LYRICS_TXT" \
  "$OUTPUT_JSON"

echo ""
echo -e "  ${GREEN}${BOLD}✓ Lyrics synced!${RESET}"
echo -e "  ${GREEN}  Now run the render script to make the video.${RESET}"
echo ""
