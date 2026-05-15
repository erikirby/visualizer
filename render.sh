#!/bin/bash
# =============================================================
#  AELOW Lyric Video Engine
#  Run this file to render a lyric video.
#
#  HOW TO USE:
#    1. Open Terminal
#    2. Type:  bash render.sh
#    3. Pick a song number
#    4. Wait ~5 minutes for the video to render
#    5. Your video will be in the  out/  folder
#
#  FOR EACH SONG YOU WANT TO RENDER, you need two files
#  inside its folder (audio is already wired up):
#
#    lyrics.json     — timed lyrics (run  AELOW Sync Lyrics  to generate)
#    background.png  — your 1920x1080 background image
#
#  Example folder location:
#    songs/against_my_better/01_new_damage/
# =============================================================

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MGMT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$SCRIPT_DIR"

# ── Lyric sync helpers ────────────────────────────────────────────────────────
SYNC_PYTHON="$MGMT_DIR/.venv/bin/python3"
LYRICS_ROOTS=(
  "$MGMT_DIR/against_my_better_lyrics"
  "$MGMT_DIR/aelow_sweet_damage_lyrics"
  "$MGMT_DIR/aelow_antihealthy_lyrics"
)

# Return the path of the plain-text lyrics file for a given song folder, or "".
_find_lyrics_txt() {
  local song_path="$1"
  local song_slug
  song_slug=$(basename "$song_path" | sed 's/^[0-9]*_//')
  local sslugnorm
  sslugnorm=$(echo "$song_slug" | tr '[:upper:]' '[:lower:]' | tr -d '_- ')

  for ldir in "${LYRICS_ROOTS[@]}"; do
    [ -d "$ldir" ] || continue
    while IFS= read -r f; do
      local fslugnorm
      fslugnorm=$(basename "$f" .txt | tr '[:upper:]' '[:lower:]' | tr -d '_- ')
      if [ "$fslugnorm" = "$sslugnorm" ]; then
        echo "$f"
        return
      fi
    done < <(find "$ldir" -maxdepth 1 -name "*.txt")
  done
}

# Resolve the real audio file path for a song folder.
_find_audio() {
  local song_path="$1"
  for aname in audio.wav audio.mp3 audio.flac audio.aac audio.ogg audio.m4a; do
    local candidate="$song_path/$aname"
    if [ -L "$candidate" ]; then
      readlink "$candidate"
      return
    elif [ -f "$candidate" ]; then
      echo "$candidate"
      return
    fi
  done
}

# Return the full path of a video background file (mp4/mov/webm/mkv), or "".
_find_bg_video() {
  local song_path="$1"
  for _ext in mp4 mov webm mkv; do
    [ -f "$song_path/background.$_ext" ] && echo "$song_path/background.$_ext" && return
  done
}

# Return the full path of an image background file (png/jpg/jpeg/webp), or "".
_find_bg_image() {
  local song_path="$1"
  for _ext in png jpg jpeg webp; do
    [ -f "$song_path/background.$_ext" ] && echo "$song_path/background.$_ext" && return
  done
}

# Run whisper_sync.py for a single song — called by _maybe_sync_lyrics.
_run_sync() {
  local song_path="$1" lyrics_txt="$2"
  local lyrics_json="$song_path/lyrics.json"
  local audio_file
  audio_file=$(_find_audio "$song_path")

  echo -e "  ${DIM}Audio:  $(basename "$audio_file")${RESET}"
  echo -e "  ${DIM}Lyrics: $(basename "$lyrics_txt")${RESET}"
  echo ""

  "$SYNC_PYTHON" "$SCRIPT_DIR/tools/whisper_sync.py" \
    "$audio_file" "$lyrics_txt" "$lyrics_json"

  echo ""
  echo -e "  ${GREEN}✓ Lyrics synced!${RESET}"
  echo ""
}

# Check whether lyrics need syncing for the selected song and handle it.
# Logic:
#   • No lyrics.txt found    → warn and continue (renders without lyrics)
#   • No lyrics.json yet     → auto-sync now (no prompt needed)
#   • .txt newer than .json  → ask user whether to re-sync
#   • .json is current       → skip, print ✓
_maybe_sync_lyrics() {
  local song_path="$1"
  local lyrics_json="$song_path/lyrics.json"

  # Guard: Python venv must exist
  if [ ! -f "$SYNC_PYTHON" ]; then
    echo ""
    echo -e "  ${RED}⚠ Python venv not found at $SYNC_PYTHON${RESET}"
    echo -e "  ${YELLOW}  Run setup.sh first to install dependencies.${RESET}"
    echo ""
    return
  fi

  local lyrics_txt
  lyrics_txt=$(_find_lyrics_txt "$song_path")

  if [ -z "$lyrics_txt" ]; then
    echo ""
    echo -e "  ${YELLOW}⚠ No lyrics.txt found for this song — rendering without lyrics.${RESET}"
    echo ""
    return
  fi

  if [ ! -f "$lyrics_json" ]; then
    echo ""
    echo -e "  ${CYAN}No lyrics.json yet — syncing now (2–5 min)...${RESET}"
    echo ""
    _run_sync "$song_path" "$lyrics_txt"

  elif [ "$lyrics_txt" -nt "$lyrics_json" ]; then
    echo ""
    echo -e "  ${YELLOW}Lyrics file was updated since last sync.${RESET}"
    echo -ne "  ${BOLD}Re-sync before rendering? (y/n): ${RESET}"
    read -r _resync
    if [[ "$_resync" == "y" || "$_resync" == "Y" ]]; then
      echo ""
      echo -e "  ${CYAN}Re-syncing (2–5 min)...${RESET}"
      echo ""
      _run_sync "$song_path" "$lyrics_txt"
    fi

  else
    echo ""
    echo -e "  ${GREEN}✓ Lyrics already synced.${RESET}"
    echo ""
  fi
}

# ── Colors (only if the terminal supports them) ──
if [ -t 1 ]; then
  GREEN='\033[0;32m'
  RED='\033[0;31m'
  YELLOW='\033[1;33m'
  CYAN='\033[0;36m'
  BOLD='\033[1m'
  DIM='\033[2m'
  RESET='\033[0m'
else
  GREEN='' RED='' YELLOW='' CYAN='' BOLD='' DIM='' RESET=''
fi

clear
echo ""
echo -e "${BOLD}${CYAN}  ╔══════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${CYAN}  ║      AELOW  Lyric Video Engine       ║${RESET}"
echo -e "${BOLD}${CYAN}  ╚══════════════════════════════════════╝${RESET}"
echo ""

# ── Install dependencies if this is the first run ──
if [ ! -d "node_modules" ]; then
  echo -e "  ${YELLOW}First time setup — installing dependencies...${RESET}"
  echo -e "  ${DIM}(This only happens once, takes about 30 seconds)${RESET}"
  echo ""
  npm install --silent
  echo -e "  ${GREEN}✓ Ready!${RESET}"
  echo ""
fi

# ── Scan for song folders ──
SONGS_ROOT="$SCRIPT_DIR/songs"

if [ ! -d "$SONGS_ROOT" ]; then
  echo -e "  ${RED}No songs folder found.${RESET}"
  echo -e "  Expected: $SONGS_ROOT"
  exit 1
fi

# Collect all song folders (recurse one level: album/song)
declare -a SONG_PATHS
declare -a SONG_LABELS
declare -a SONG_READY

while IFS= read -r -d '' song_dir; do
  song_dir="${song_dir%/}"
  # Get album name and song name from path
  album=$(basename "$(dirname "$song_dir")")
  song=$(basename "$song_dir")

  # Make a human-readable label (replace underscores, remove track numbers)
  label=$(echo "$song" | sed 's/^[0-9]*_//' | sed 's/_/ /g' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) tolower(substr($i,2)); print}')
  album_label=$(echo "$album" | sed 's/_/ /g' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) tolower(substr($i,2)); print}')

  SONG_PATHS+=("$song_dir")
  SONG_LABELS+=("$album_label  —  $label")

  # Check which files are present
  has_audio=false
  has_bg=false
  for _ext in wav mp3 flac aac ogg m4a; do
    if [ -f "$song_dir/audio.$_ext" ]; then has_audio=true; break; fi
  done
  for _ext in png jpg jpeg webp mp4 mov webm mkv; do
    if [ -f "$song_dir/background.$_ext" ]; then has_bg=true; break; fi
  done

  if $has_audio && $has_bg; then
    SONG_READY+=("yes")
  else
    # Build a list of what's missing
    missing=""
    $has_audio || missing="${missing}audio "
    $has_bg    || missing="${missing}background"
    SONG_READY+=("missing:$missing")
  fi
done < <(find "$SONGS_ROOT" -mindepth 2 -maxdepth 2 -type d -print0 | sort -z)

if [ ${#SONG_PATHS[@]} -eq 0 ]; then
  echo -e "  ${RED}No songs found inside the songs/ folder.${RESET}"
  exit 1
fi

# ── Print the song list ──
echo -e "  ${BOLD}Your songs:${RESET}"
echo ""
printf "  %-4s %-42s %s\n" "#" "Song" "Status"
echo -e "  ${DIM}──────────────────────────────────────────────────────────${RESET}"

for i in "${!SONG_LABELS[@]}"; do
  num=$((i + 1))
  label="${SONG_LABELS[$i]}"
  ready="${SONG_READY[$i]}"

  if [ "$ready" = "yes" ]; then
    printf "  ${GREEN}%-4s${RESET} %-42s ${GREEN}✓ Ready to render${RESET}\n" "$num" "$label"
  else
    missing="${ready#missing:}"
    printf "  ${DIM}%-4s %-42s ${RED}✗ Missing: %s${RESET}\n" "$num" "$label" "$missing"
  fi
done

echo ""
echo -e "  ${DIM}──────────────────────────────────────────────────────────${RESET}"
echo ""
echo -e "  ${BOLD}What files go in each song folder?${RESET}"
echo -e "  ${DIM}  background.png — your 1920x1080 image (required for all video types)${RESET}"
echo -e "  ${DIM}  audio is already wired up for all songs${RESET}"
echo -e "  ${DIM}  lyrics: run  AELOW Sync Lyrics  first if making a lyric video${RESET}"
echo ""

# ── Prompt for selection ──
while true; do
  echo -ne "  ${BOLD}Type a number and press Enter (or q to quit): ${RESET}"
  read -r choice

  if [ "$choice" = "q" ] || [ "$choice" = "Q" ]; then
    echo ""
    echo -e "  ${DIM}Bye!${RESET}"
    echo ""
    exit 0
  fi

  # Validate it's a number in range
  if ! [[ "$choice" =~ ^[0-9]+$ ]] || [ "$choice" -lt 1 ] || [ "$choice" -gt "${#SONG_PATHS[@]}" ]; then
    echo -e "  ${RED}  Please enter a number between 1 and ${#SONG_PATHS[@]}${RESET}"
    continue
  fi

  idx=$((choice - 1))
  ready="${SONG_READY[$idx]}"

  if [ "$ready" != "yes" ]; then
    missing="${ready#missing:}"
    song_path="${SONG_PATHS[$idx]}"
    echo ""
    echo -e "  ${RED}  Can't render yet — this song is missing files.${RESET}"
    echo -e "  ${YELLOW}  Missing: ${missing}${RESET}"
    echo -e "  ${YELLOW}  Add them to: ${song_path}${RESET}"
    echo ""
    continue
  fi

  break
done

# ── Pick video type ──
SELECTED_PATH="${SONG_PATHS[$idx]}"
SELECTED_LABEL="${SONG_LABELS[$idx]}"
SONG_FOLDER_NAME=$(basename "$SELECTED_PATH")

echo ""
echo -e "  ${BOLD}What type of video?${RESET}"
echo ""
echo -e "  ${GREEN}0${RESET}  ${BOLD}Test visualizer styles${RESET}        ${DIM}— 8-clip showcase (styles + layers + name overlay + particles)${RESET}"
echo -e "  ${GREEN}1${RESET}  ${BOLD}Test lyric style${RESET}              ${DIM}— 10-sec clip of 2 from 0:30${RESET}"
echo ""
echo -e "  ${GREEN}2${RESET}  Lyric Only               — clean lyrics + particles  ${DIM}(no visualizer)${RESET}"
echo ""
echo -e "  ${GREEN}3${RESET}  Bars                     — EQ bars at bottom"
echo -e "  ${GREEN}4${RESET}  Solid Wave               — smooth filled waveform, centered"
echo -e "  ${GREEN}5${RESET}  Frequency Rings          — 6 concentric rings"
echo -e "  ${GREEN}6${RESET}  Echo Pulse Bars          — radial EQ bars with ghost ripples"
echo -e "  ${GREEN}7${RESET}  Echo Pulse Solid         — radial filled wave with ghost ripples"
echo -e "  ${GREEN}8${RESET}  DNA Helix                — dual-strand horizontal helix"
echo -e "  ${GREEN}9${RESET}  Constellation Net        — particle network with audio-reactive connections"
echo ""
echo -e "  ${DIM}  ·  ·  ·  with particles  ·  ·  ·${RESET}"
echo ""
echo -e "  ${GREEN}10${RESET} Bars + Particles"
echo -e "  ${GREEN}11${RESET} Rings + Particles"
echo -e "  ${GREEN}12${RESET} Echo + Particles"
echo -e "  ${GREEN}13${RESET} DNA Helix + Particles"
echo -e "  ${GREEN}14${RESET} Constellation + Particles"
echo ""
echo -e "  ${GREEN}15${RESET} ${BOLD}Test everything${RESET}              ${DIM}— 10-sec clips of all styles${RESET}"
echo ""

RENDER_ALL=false
RENDER_LYRIC_TEST=false
RENDER_EVERYTHING=false
FRAMES_FLAG=""
TEST_SUFFIX=""
COMPOSITION=""
SUFFIX=""

while true; do
  echo -ne "  ${BOLD}Type 0–15: ${RESET}"
  read -r vtype
  case "$vtype" in
    0)  RENDER_ALL=true;                                                              break ;;
    1)  RENDER_LYRIC_TEST=true;                                                       break ;;
    2)  COMPOSITION="LyricOnly";                  SUFFIX="lyric-only";               break ;;
    3)  COMPOSITION="VisualizerBottom";           SUFFIX="viz-bars";                 break ;;
    4)  COMPOSITION="SolidWave";                  SUFFIX="viz-solidwave";            break ;;
    5)  COMPOSITION="FrequencyRings";             SUFFIX="viz-rings";                break ;;
    6)  COMPOSITION="EchoPulse";                  SUFFIX="viz-echo";                 break ;;
    7)  COMPOSITION="EchoPulseSolid";             SUFFIX="viz-echo-solid";           break ;;
    8)  COMPOSITION="DNAHelix";                   SUFFIX="viz-dna";                  break ;;
    9)  COMPOSITION="ConstellationNet";           SUFFIX="viz-constellation";        break ;;
    10) COMPOSITION="VisualizerBottomParticles";  SUFFIX="viz-bars-particles";       break ;;
    11) COMPOSITION="FrequencyRingsParticles";    SUFFIX="viz-rings-particles";      break ;;
    12) COMPOSITION="EchoPulseParticles";         SUFFIX="viz-echo-particles";       break ;;
    13) COMPOSITION="DNAHelixParticles";          SUFFIX="viz-dna-particles";        break ;;
    14) COMPOSITION="ConstellationNetParticles";  SUFFIX="viz-constellation-particles"; break ;;
    15) RENDER_EVERYTHING=true;                                                       break ;;
    *) echo -e "  ${RED}  Please type a number 0–15${RESET}" ;;
  esac
done

# ── Lyric sync (runs before render for any composition that uses lyrics) ──────
if [[ "$COMPOSITION" == "LyricOnly" ]] || $RENDER_LYRIC_TEST || $RENDER_EVERYTHING; then
  _maybe_sync_lyrics "$SELECTED_PATH"
fi

# ── Background source detection ───────────────────────────────────────────────
# Detect which background files are present, resolve conflicts, and (if video)
# ask the user which loop type to use.
SELECTED_BG=""
BG_LOOP_TYPE=""

_BG_VID=$(_find_bg_video "$SELECTED_PATH")
_BG_IMG=$(_find_bg_image "$SELECTED_PATH")

if [ -n "$_BG_VID" ] && [ -n "$_BG_IMG" ]; then
  echo ""
  echo -e "  ${BOLD}Background file?${RESET}  Both an image and a video were found."
  echo ""
  echo -e "  ${GREEN}1${RESET}  Image  — $(basename "$_BG_IMG")"
  echo -e "  ${GREEN}2${RESET}  Video  — $(basename "$_BG_VID")"
  echo ""
  while true; do
    echo -ne "  ${BOLD}Type 1 or 2: ${RESET}"
    read -r _bg_choice
    case "$_bg_choice" in
      1) SELECTED_BG="$_BG_IMG"; break ;;
      2) SELECTED_BG="$_BG_VID"; break ;;
      *) echo -e "  ${RED}  Please type 1 or 2${RESET}" ;;
    esac
  done
elif [ -n "$_BG_VID" ]; then
  SELECTED_BG="$_BG_VID"
elif [ -n "$_BG_IMG" ]; then
  SELECTED_BG="$_BG_IMG"
fi

# If a video background was chosen, ask for loop type
if [[ "$SELECTED_BG" =~ \.(mp4|mov|webm|mkv)$ ]]; then
  if ! command -v ffmpeg &>/dev/null; then
    BG_LOOP_TYPE="standard"
    echo ""
    echo -e "  ${YELLOW}  Note: ffmpeg not found — using standard loop (ping-pong requires ffmpeg).${RESET}"
    echo ""
  else
    echo ""
    echo -e "  ${BOLD}Video background loop type?${RESET}"
    echo ""
    echo -e "  ${GREEN}1${RESET}  Standard loop   ${DIM}— play clip forward, repeat  ${RESET}${DIM}(use when start ≈ end frame)${RESET}"
    echo -e "  ${GREEN}2${RESET}  Ping-pong loop  ${DIM}— forward → reverse → forward  ${RESET}${DIM}(seamless for most AI video clips)${RESET}"
    echo ""
    while true; do
      echo -ne "  ${BOLD}Type 1 or 2: ${RESET}"
      read -r _lc
      case "$_lc" in
        1) BG_LOOP_TYPE="standard"; break ;;
        2) BG_LOOP_TYPE="pingpong"; break ;;
        *) echo -e "  ${RED}  Please type 1 or 2${RESET}" ;;
      esac
    done
  fi
fi

# ── Color theme (asked for all single-composition renders) ────────────────────
P_THEME_ID=""

if ! $RENDER_ALL && ! $RENDER_LYRIC_TEST && ! $RENDER_EVERYTHING && [[ "$COMPOSITION" != "LyricOnly" ]]; then
  echo ""
  echo -e "  ${BOLD}Color theme?${RESET}  ${DIM}Enter to skip (default: Neon)${RESET}"
  echo ""
  echo -e "  ${GREEN}1${RESET}  Neon           — hot pink → electric blue  ${DIM}(default)${RESET}"
  echo -e "  ${GREEN}2${RESET}  Violet Storm   — deep purple → amber"
  echo -e "  ${GREEN}3${RESET}  Arctic         — cyan → cobalt"
  echo -e "  ${GREEN}4${RESET}  Solar          — orange → gold"
  echo -e "  ${GREEN}5${RESET}  Toxic          — neon green → hot pink"
  echo -e "  ${GREEN}6${RESET}  Monochrome     — white → cool grey"
  echo ""
  echo -ne "  ${BOLD}Type 1–6 (or Enter for Neon): ${RESET}"
  read -r theme_choice
  case "$theme_choice" in
    1) P_THEME_ID=1 ;;
    2) P_THEME_ID=2 ;;
    3) P_THEME_ID=3 ;;
    4) P_THEME_ID=4 ;;
    5) P_THEME_ID=5 ;;
    6) P_THEME_ID=6 ;;
    *) P_THEME_ID="" ;;  # blank → component defaults to Neon
  esac
fi

# ── Customization (bars + solidwave compositions only) ────────────────────────
# Collect flags into variables; build a single JSON props string at the end.
P_DIRECTION=""
P_REFLECTION=false
P_WAVE_DELAY=false
P_RUMBLE=false
P_LAYERS=false
P_ARTIST_NAME=""
P_TRACK_NAME=""

# Particle direction — asked for any *Particles composition
if [[ "$COMPOSITION" == *Particles* ]]; then
  echo ""
  echo -e "  ${BOLD}Particle direction?${RESET}"
  echo ""
  echo -e "  ${GREEN}1${RESET}  Up              ${DIM}(default for bars/solidwave)${RESET}"
  echo -e "  ${GREEN}2${RESET}  Down"
  echo -e "  ${GREEN}3${RESET}  Left"
  echo -e "  ${GREEN}4${RESET}  Right"
  echo -e "  ${GREEN}5${RESET}  Out from center ${DIM}(default for echo)${RESET}"
  echo -e "  ${GREEN}6${RESET}  In toward center ${DIM}(default for rings — converge from edges)${RESET}"
  echo ""
  while true; do
    echo -ne "  ${BOLD}Type 1–6: ${RESET}"
    read -r pdir
    case "$pdir" in
      1) P_DIRECTION="up";    break ;;
      2) P_DIRECTION="down";  break ;;
      3) P_DIRECTION="left";  break ;;
      4) P_DIRECTION="right"; break ;;
      5) P_DIRECTION="out";   break ;;
      6) P_DIRECTION="in";    break ;;
      *) echo -e "  ${RED}  Please type 1–6${RESET}" ;;
    esac
  done
fi

# Visualizer effects — asked for bars and solidwave (with or without particles)
if [[ "$COMPOSITION" == VisualizerBottom* || "$COMPOSITION" == SolidWave* ]]; then
  echo ""
  echo -e "  ${BOLD}Visual effects?${RESET}  ${DIM}Type numbers separated by spaces (e.g. \"1 3\"), or Enter to skip${RESET}"
  echo ""
  echo -e "  ${GREEN}1${RESET}  Reflection   — mirror bars above ${DIM}&${RESET} below center"
  echo -e "  ${GREEN}2${RESET}  Wave delay   — bars ripple outward from center"
  echo -e "  ${GREEN}3${RESET}  Dual layers  — bright white inner layer for depth"
  echo -e "  ${GREEN}4${RESET}  Rumble       — subtle per-bar energy jitter"
  echo ""
  echo -ne "  ${BOLD}Effects: ${RESET}"
  read -r effects_input
  [[ "$effects_input" == *"1"* ]] && P_REFLECTION=true
  [[ "$effects_input" == *"2"* ]] && P_WAVE_DELAY=true
  [[ "$effects_input" == *"3"* ]] && P_LAYERS=true
  [[ "$effects_input" == *"4"* ]] && P_RUMBLE=true
fi

# ── Artist / track name overlay ───────────────────────────────────────────────
# Only prompt for single-composition renders (not batch tests)
if ! $RENDER_ALL && ! $RENDER_LYRIC_TEST && ! $RENDER_EVERYTHING; then
  echo ""
  echo -ne "  ${BOLD}Show artist + track name overlay? (y/n): ${RESET}"
  read -r show_bug
  if [[ "$show_bug" == "y" || "$show_bug" == "Y" ]]; then
    echo -ne "  ${BOLD}Artist name: ${RESET}"
    read -r raw_artist
    echo -ne "  ${BOLD}Track name:  ${RESET}"
    read -r raw_track
    # Escape backslashes and double-quotes for JSON safety
    P_ARTIST_NAME="${raw_artist//\\/\\\\}"
    P_ARTIST_NAME="${P_ARTIST_NAME//\"/\\\"}"
    P_TRACK_NAME="${raw_track//\\/\\\\}"
    P_TRACK_NAME="${P_TRACK_NAME//\"/\\\"}"
  fi
fi

# ── Build final props JSON ────────────────────────────────────────────────────
build_props() {
  local parts=()
  [ -n "$P_THEME_ID" ]     && parts+=("\"themeId\":${P_THEME_ID}")
  [ -n "$P_DIRECTION" ]    && parts+=("\"particleDirection\":\"${P_DIRECTION}\"")
  $P_REFLECTION            && parts+=("\"reflection\":true")
  $P_WAVE_DELAY            && parts+=("\"waveDelay\":true")
  $P_LAYERS                && parts+=("\"layers\":true")
  $P_RUMBLE                && parts+=("\"rumble\":true")
  [ -n "$P_ARTIST_NAME" ]  && parts+=("\"artistName\":\"${P_ARTIST_NAME}\"")
  [ -n "$P_TRACK_NAME" ]   && parts+=("\"trackName\":\"${P_TRACK_NAME}\"")
  if [ ${#parts[@]} -eq 0 ]; then
    echo ""
  else
    local joined
    joined=$(printf ',%s' "${parts[@]}")
    echo "{${joined:1}}"
  fi
}
FINAL_PROPS=$(build_props)

# ── Test or full render? ──
if ! $RENDER_ALL && ! $RENDER_LYRIC_TEST && ! $RENDER_EVERYTHING; then
  echo ""
  echo -e "  ${BOLD}Test clip or full render?${RESET}"
  echo ""
  if [[ "$COMPOSITION" == LyricOnly ]]; then
    echo -e "  ${GREEN}1${RESET}  10-second test from 0:30  ${DIM}(skips intros — you'll see lyrics)${RESET}"
  else
    echo -e "  ${GREEN}1${RESET}  10-second test            ${DIM}(~30 seconds — check the look)${RESET}"
  fi
  echo -e "  ${GREEN}2${RESET}  Full render               ${DIM}(3–8 minutes, final video)${RESET}"
  echo ""
  while true; do
    echo -ne "  ${BOLD}Type 1 or 2: ${RESET}"
    read -r rtype
    case "$rtype" in
      1)
        if [[ "$COMPOSITION" == LyricOnly ]]; then
          FRAMES_FLAG="--frames 900-1199"
        else
          FRAMES_FLAG="--frames 0-299"
        fi
        TEST_SUFFIX="_test"
        break ;;
      2) FRAMES_FLAG=""; TEST_SUFFIX=""; break ;;
      *) echo -e "  ${RED}  Please type 1 or 2${RESET}" ;;
    esac
  done
fi

echo ""
if $RENDER_ALL; then
  echo -e "  ${CYAN}Rendering 8-clip showcase...${RESET}"
  echo -e "  ${DIM}~4 minutes. Files will appear in out/. Covers all styles + layers + name overlay + particles.${RESET}"
elif $RENDER_LYRIC_TEST; then
  echo -e "  ${CYAN}Rendering 10-sec lyric test from 0:30: Lyric Only...${RESET}"
  echo -e "  ${DIM}~30 seconds. One file will appear in out/.${RESET}"
elif $RENDER_EVERYTHING; then
  echo -e "  ${CYAN}Rendering 10-sec clips of all styles...${RESET}"
  echo -e "  ${DIM}~7 minutes total. Files will appear in out/.${RESET}"
elif [ -n "$TEST_SUFFIX" ]; then
  echo -e "  ${CYAN}Rendering 10-second test:${RESET} ${BOLD}${SELECTED_LABEL}${RESET}"
  echo -e "  ${DIM}Should be ready in about 30 seconds.${RESET}"
else
  echo -e "  ${CYAN}Rendering full video:${RESET} ${BOLD}${SELECTED_LABEL}${RESET}"
  echo -e "  ${DIM}This takes about 3–8 minutes depending on song length.${RESET}"
  echo -e "  ${DIM}You can keep working — the Terminal will beep when it's done.${RESET}"
fi
echo ""

mkdir -p "$SCRIPT_DIR/out"
OUTPUT_FILE="$SCRIPT_DIR/out/${SONG_FOLDER_NAME}_${SUFFIX}${TEST_SUFFIX}.mp4"

# ── Stage assets into a real folder (symlinks break inside Remotion's bundler) ──
RENDER_DIR="$SCRIPT_DIR/_render_assets"
rm -rf "$RENDER_DIR"
mkdir -p "$RENDER_DIR"

# Resolve audio symlink → get the real file path → hard-link it (instant, no data copy)
REAL_AUDIO=""
for audio_name in audio.wav audio.mp3 audio.flac audio.aac audio.ogg audio.m4a; do
  candidate="$SELECTED_PATH/$audio_name"
  if [ -L "$candidate" ]; then
    REAL_AUDIO=$(readlink "$candidate")   # absolute path the symlink points to
    AUDIO_EXT="${audio_name##*.}"
    break
  elif [ -f "$candidate" ]; then
    REAL_AUDIO="$candidate"
    AUDIO_EXT="${audio_name##*.}"
    break
  fi
done

if [ -z "$REAL_AUDIO" ]; then
  echo -e "  ${RED}ERROR: Could not find audio file.${RESET}"
  rm -rf "$RENDER_DIR"
  exit 1
fi

# Try a hard link first (instant). Fall back to a full copy if it fails.
if cp -l "$REAL_AUDIO" "$RENDER_DIR/audio.$AUDIO_EXT" 2>/dev/null; then
  echo -e "  ${DIM}  Audio ready.${RESET}"
else
  echo -e "  ${DIM}  Copying audio file... (this is a one-time thing per render)${RESET}"
  cp "$REAL_AUDIO" "$RENDER_DIR/audio.$AUDIO_EXT"
fi

# Copy lyrics (small file — instant)
[ -f "$SELECTED_PATH/lyrics.json" ] && cp "$SELECTED_PATH/lyrics.json" "$RENDER_DIR/lyrics.json"

# Stage background file (hard-link if possible, copy as fallback)
BG_STAGED_FILE=""
if [ -n "$SELECTED_BG" ]; then
  _BG_EXT="${SELECTED_BG##*.}"
  _BG_STAGED_NAME="background.$_BG_EXT"
  _REAL_BG="$SELECTED_BG"
  [ -L "$SELECTED_BG" ] && _REAL_BG=$(readlink "$SELECTED_BG")
  if cp -l "$_REAL_BG" "$RENDER_DIR/$_BG_STAGED_NAME" 2>/dev/null; then
    echo -e "  ${DIM}  Background ready.${RESET}"
  else
    echo -e "  ${DIM}  Copying background...${RESET}"
    cp "$_REAL_BG" "$RENDER_DIR/$_BG_STAGED_NAME"
  fi
  BG_STAGED_FILE="$_BG_STAGED_NAME"
fi

# Write background-config.json
if [ -n "$BG_STAGED_FILE" ]; then
  if [ -n "$BG_LOOP_TYPE" ]; then
    # Video background
    if [ "$BG_LOOP_TYPE" = "pingpong" ]; then
      _BG_REV_NAME="background_reversed.$_BG_EXT"
      echo -e "  ${DIM}  Creating reversed clip for ping-pong loop (ffmpeg)...${RESET}"
      ffmpeg -i "$RENDER_DIR/$BG_STAGED_FILE" -vf "reverse" -an \
        -c:v libx264 -preset fast -crf 18 \
        "$RENDER_DIR/$_BG_REV_NAME" -y -loglevel error
      echo "{\"file\":\"${BG_STAGED_FILE}\",\"loopType\":\"pingpong\",\"reversedFile\":\"${_BG_REV_NAME}\"}" \
        > "$RENDER_DIR/background-config.json"
      echo -e "  ${GREEN}  ✓ Ping-pong background ready.${RESET}"
    else
      echo "{\"file\":\"${BG_STAGED_FILE}\",\"loopType\":\"standard\"}" \
        > "$RENDER_DIR/background-config.json"
    fi
  else
    # Image background
    echo "{\"file\":\"${BG_STAGED_FILE}\"}" > "$RENDER_DIR/background-config.json"
  fi
else
  echo '{"file":"background.png"}' > "$RENDER_DIR/background-config.json"
fi

if [ -f "$RENDER_DIR/lyrics.json" ]; then
  echo '{"file":"lyrics.json"}' > "$RENDER_DIR/lyrics-config.json"
else
  echo '{"file":"none"}' > "$RENDER_DIR/lyrics-config.json"
fi

# ── Helper to run one render ──
# Usage: _render_one <composition> <suffix> <frames-flag> [props-json]
_render_one() {
  local comp="$1" suf="$2" frames="$3" extra_props="${4:-}"
  local out="$SCRIPT_DIR/out/${SONG_FOLDER_NAME}_${suf}_test.mp4"
  local props_flag=""
  [ -n "$extra_props" ] && props_flag="--props $extra_props"
  echo -e "  ${DIM}  Rendering ${suf}...${RESET}"
  npx remotion render src/index.ts "$comp" "$out" \
    --public-dir "$RENDER_DIR" \
    --codec h264 \
    --overwrite \
    --log error \
    $props_flag \
    $frames
  echo -e "  ${GREEN}  ✓ ${suf} done${RESET}"
}

# Run the render(s)
if $RENDER_ALL; then
  # Derive a display-friendly song name for the name-overlay test clip
  SONG_DISPLAY=$(echo "$SONG_FOLDER_NAME" | sed 's/^[0-9]*_//' | sed 's/_/ /g' | \
    awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) tolower(substr($i,2)); print}')
  SONG_DISPLAY_ESC=$(echo "$SONG_DISPLAY" | sed 's/"/\\"/g')

  # 1–4: All four base styles (shows the visual language)
  _render_one "VisualizerBottom"  "viz-bars"       "--frames 0-299"
  _render_one "SolidWave"         "viz-solidwave"  "--frames 0-299"
  _render_one "FrequencyRings"    "viz-rings"      "--frames 0-299"
  _render_one "EchoPulse"         "viz-echo-bars"  "--frames 0-299"
  # 5: Echo Solid — new variant
  _render_one "EchoPulseSolid"    "viz-echo-solid" "--frames 0-299"
  # 6: Inward particles on rings
  _render_one "FrequencyRingsParticles" "viz-rings-in-particles" "--frames 0-299" '{"particleDirection":"in"}'
  # 7: Layers — shows the dual-layer effect on bars
  _render_one "VisualizerBottom"  "viz-bars-layers" "--frames 0-299" '{"layers":true}'
  # 8: Artist/track name overlay on solid wave
  _render_one "SolidWave" "viz-solidwave-bug" "--frames 0-299" \
    "{\"artistName\":\"AELOW\",\"trackName\":\"${SONG_DISPLAY_ESC}\"}"
elif $RENDER_LYRIC_TEST; then
  _render_one "LyricOnly" "lyric-only" "--frames 900-1199"
elif $RENDER_EVERYTHING; then
  _render_one "LyricOnly"                  "lyric-only"             "--frames 900-1199"
  _render_one "VisualizerBottom"           "viz-bars"               "--frames 0-299"
  _render_one "SolidWave"                  "viz-solidwave"          "--frames 0-299"
  _render_one "FrequencyRings"             "viz-rings"              "--frames 0-299"
  _render_one "EchoPulse"                  "viz-echo-bars"          "--frames 0-299"
  _render_one "EchoPulseSolid"             "viz-echo-solid"         "--frames 0-299"
  _render_one "DNAHelix"                   "viz-dna"                "--frames 0-299"
  _render_one "ConstellationNet"           "viz-constellation"      "--frames 0-299"
  _render_one "VisualizerBottomParticles"  "viz-bars-particles"     "--frames 0-299"
  _render_one "FrequencyRingsParticles"    "viz-rings-particles"    "--frames 0-299"
  _render_one "EchoPulseParticles"         "viz-echo-particles"     "--frames 0-299"
else
  PROPS_FLAG=""
  [ -n "$FINAL_PROPS" ] && PROPS_FLAG="--props $FINAL_PROPS"
  npx remotion render src/index.ts "$COMPOSITION" "$OUTPUT_FILE" \
    --public-dir "$RENDER_DIR" \
    --codec h264 \
    --overwrite \
    --log error \
    $PROPS_FLAG \
    $FRAMES_FLAG
fi

# Clean up staged assets
rm -rf "$RENDER_DIR"

echo ""
echo -e "  ${GREEN}${BOLD}✓ Done!${RESET}"
if $RENDER_ALL || $RENDER_LYRIC_TEST || $RENDER_EVERYTHING; then
  echo -e "  ${GREEN}  Test clips are in the out/ folder — compare and pick your favourite!${RESET}"
else
  echo -e "  ${GREEN}  Your video is at: out/${SONG_FOLDER_NAME}_${SUFFIX}${TEST_SUFFIX}.mp4${RESET}"
fi
echo ""

# Open the output folder in Finder automatically
open "$SCRIPT_DIR/out/"
