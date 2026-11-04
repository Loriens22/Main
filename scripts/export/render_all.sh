#!/usr/bin/env bash
# Frame-exact 1080p24 render of the whole film in 3 parallel headless-Chromium workers,
# then concat + mux with the soundtrack.  Usage: bash scripts/export/render_all.sh [W H]
set -euo pipefail
cd "$(dirname "$0")/../.."
W=${1:-1920}; H=${2:-1080}
mkdir -p frames
npx vite build >/dev/null
node scripts/export/render_frames.mjs --w $W --h $H --fps 24 --from 0 --to 45 --out frames/seg0.mkv > frames/seg0.log 2>&1 &
node scripts/export/render_frames.mjs --w $W --h $H --fps 24 --from 45 --to 129.583333 --out frames/seg1.mkv > frames/seg1.log 2>&1 &
node scripts/export/render_frames.mjs --w $W --h $H --fps 24 --from 129.583333 --to 206 --out frames/seg2.mkv > frames/seg2.log 2>&1 &
wait
bash scripts/export/encode.sh
