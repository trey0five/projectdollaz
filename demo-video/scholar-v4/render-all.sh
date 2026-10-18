#!/usr/bin/env bash
# Renders every scholar-v4 piece into scholar-v4/out/ (gitignored):
#   c0_rivals.mp4  c0_meet.mp4  card1..6.mp4 (+ card1..6-alpha.mov)  z1_trust.mp4  z2_end.mp4
# plus <name>.json beside each (frames, seconds, the voice timing file used, beat times, engine hash).
#
# Beat times come from demo-video/vo-v4/<scene>.json (make-vo-v4.py). After a line is
# re-voiced, re-render just that scene, e.g.:
#   bash scholar-v4/render-all.sh z2_end
# Scene lengths follow the build rule max(minSec, voice + 1.0 s); force one with
#   node scholar-v4/render.mjs --page scholar-v4/end.html --out z2_end --total <frames>
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
DEMO="$(dirname "$HERE")"
FF=/home/dream/bin/ffmpeg; command -v "$FF" >/dev/null || FF=ffmpeg
cd "$DEMO"
mkdir -p "$HERE/out"

hero_frames() {
  # c0_meet composites over the homescreen video's own frames 200-299 (1080p30).
  local src="$DEMO/assets/hero-v3-1080.mp4" vf=""
  if [[ ! -f "$src" ]]; then
    echo "!! assets/hero-v3-1080.mp4 missing - falling back to the 720p24 master, upscaled here" >&2
    src="$DEMO/assets/hero-v3-master.mp4"; vf="fps=30,scale=1920:1080:flags=lanczos,"
  fi
  rm -rf "$HERE/out/.hero"; mkdir -p "$HERE/out/.hero"
  "$FF" -v error -i "$src" -vf "${vf}select='between(n\,200\,299)'" -vsync 0 -q:v 1 -start_number 200 "$HERE/out/.hero/h%03d.jpg"
}

one() {
  case "$1" in
    c0_rivals) node "$HERE/render.mjs" --page scholar-v4/rivals.html --out c0_rivals ;;
    c0_meet)   hero_frames; node "$HERE/render.mjs" --page scholar-v4/meet.html --out c0_meet ;;
    z1_trust)  node "$HERE/render.mjs" --page scholar-v4/trust.html --out z1_trust ;;
    z2_end)    node "$HERE/render.mjs" --page scholar-v4/end.html --out z2_end ;;
    card[1-6]) n="${1#card}"
               node "$HERE/render.mjs" --page scholar-v4/card.html --q "n=$n" --out "card$n"
               node "$HERE/render.mjs" --page scholar-v4/card.html --q "n=$n" --out "card$n" --alpha ;;
    *) echo "unknown scene $1" >&2; exit 2 ;;
  esac
}

if [[ $# -gt 0 ]]; then for s in "$@"; do one "$s"; done; exit 0; fi
for s in c0_rivals c0_meet card1 card2 card3 card4 card5 card6 z1_trust z2_end; do one "$s"; done
