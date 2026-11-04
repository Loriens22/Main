#!/usr/bin/env bash
# Launch N interleaved, resumable render workers detached from the calling shell.
# Frames land in frames/seq/NNNNN.jpg; re-running resumes where it stopped.
cd "$(dirname "$0")/../.."
W=${1:-1920}; H=${2:-1080}; N=${3:-3}
mkdir -p frames/seq
rm -f frames/seq/*.tmp
for k in $(seq 0 $((N - 1))); do
  setsid nohup node scripts/export/render_frames.mjs --w $W --h $H --fps 24 --from 0 --to 206 --seq frames/seq --stride $N --offset $k --port $((8800 + k)) > frames/worker$k.log 2>&1 < /dev/null &
done
