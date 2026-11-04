#!/usr/bin/env bash
# Build, render every frame (3 interleaved resumable workers), then encode.
set -euo pipefail
cd "$(dirname "$0")/../.."
npx vite build >/dev/null
bash scripts/export/launch_detached.sh "${1:-1920}" "${2:-1080}" "${3:-3}"
until [ "$(ls frames/seq/*.jpg 2>/dev/null | wc -l)" -ge 4944 ]; do sleep 20; done
bash scripts/export/encode.sh
