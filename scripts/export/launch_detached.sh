#!/usr/bin/env bash
# Launch the three render workers detached from the calling shell (survive job limits).
cd "$(dirname "$0")/../.."
W=${1:-1920}; H=${2:-1080}
mkdir -p frames
for spec in "0 0 45" "1 45 129.583333" "2 129.583333 206"; do
  set -- $spec
  setsid nohup node scripts/export/render_frames.mjs --w $W --h $H --fps 24 --from $2 --to $3 --out frames/seg$1.mkv > frames/seg$1.log 2>&1 < /dev/null &
done
