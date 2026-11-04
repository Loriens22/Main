#!/usr/bin/env bash
# Encode the rendered image sequence + original soundtrack into the final MP4
# (H.264 High, yuv420p, faststart) and split it into <=14 MB parts for the web page.
set -euo pipefail
cd "$(dirname "$0")/../.."
n=$(ls frames/seq/*.jpg | wc -l)
echo "frames: $n"
ffmpeg -y -loglevel error -framerate 24 -i frames/seq/%05d.jpg -i public/assets/audio/soundtrack.wav \
  -map 0:v:0 -map 1:a:0 -c:v libx264 -preset slow -crf 19 -pix_fmt yuv420p -profile:v high -level 4.1 \
  -g 48 -c:a aac -b:a 192k -ar 48000 -movflags +faststart -shortest \
  -metadata title="Happy birthday Matex" -metadata artist="Neural systems L3WR5NCE" frames/Happy_birthday_Matex_1080p.mp4
python3 scripts/export/split_parts.py frames/Happy_birthday_Matex_1080p.mp4 public/assets/film
ls -la frames/Happy_birthday_Matex_1080p.mp4
