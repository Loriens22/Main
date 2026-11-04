#!/usr/bin/env bash
# Encode the rendered image sequence + original soundtrack into the final MP4
# (H.264 High, yuv420p, faststart; two-pass ~4.5 Mb/s with a light temporal denoise so the
# film grain does not swallow the bitrate) and split it into <=14 MB parts for the web page.
set -euo pipefail
cd "$(dirname "$0")/../.."
n=$(ls frames/seq/*.jpg | wc -l)
echo "frames: $n"
VF="hqdn3d=2:1.5:6:6"
X264="-c:v libx264 -preset slow -tune film -b:v 4500k -maxrate 9000k -bufsize 18000k -pix_fmt yuv420p -profile:v high -level 4.1 -g 48"
ffmpeg -y -loglevel error -framerate 24 -i frames/seq/%05d.jpg -vf "$VF" $X264 -pass 1 -passlogfile frames/x264 -an -f mp4 /dev/null
ffmpeg -y -loglevel error -framerate 24 -i frames/seq/%05d.jpg -i public/assets/audio/soundtrack.wav \
  -map 0:v:0 -map 1:a:0 -vf "$VF" $X264 -pass 2 -passlogfile frames/x264 \
  -c:a aac -b:a 192k -ar 48000 -movflags +faststart -shortest \
  -metadata title="Happy birthday Matex" -metadata artist="Neural systems L3WR5NCE" frames/Happy_birthday_Matex_1080p.mp4
python3 scripts/export/split_parts.py frames/Happy_birthday_Matex_1080p.mp4 public/assets/film
ls -la frames/Happy_birthday_Matex_1080p.mp4
