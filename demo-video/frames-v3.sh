#!/usr/bin/env bash
# Extract one mid-scene frame per capture → captures-v3/frames/<id>.png and print durations.
cd "$(dirname "$0")/captures-v3" || exit 1
mkdir -p frames
for id in "$@"; do
  f="$id.webm"; [ -f "$f" ] || { echo "missing $f"; continue; }
  dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f")
  settled=$(python3 -c "import json;print(json.load(open('$id.json')).get('settledAt',2))" 2>/dev/null || echo 2)
  mid=$(python3 -c "print(round($settled + ($dur - $settled) * 0.55, 2))")
  ffmpeg -v error -y -ss "$mid" -i "$f" -frames:v 1 "frames/$id.png"
  echo "$id dur=${dur}s frame@${mid}s"
done
