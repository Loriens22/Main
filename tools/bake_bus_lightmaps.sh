#!/usr/bin/env bash
# Blender light bake of every bus (see tools/blender/bake_bus_light.py and src/vehicle/BusLightmap.js).
#   BLENDER_PY=/path/to/python-with-bpy bash tools/bake_bus_lightmaps.sh [bus ...]
# Builds a dev bundle, exports each bus's bake scene from headless Chromium and bakes it in Cycles.
# Run it again whenever a bus model changes: a lightmap whose geometry signature no longer matches is ignored.
set -euo pipefail
cd "$(dirname "$0")/.."
PY=${BLENDER_PY:-python3}
TMP=${TMPDIR:-/tmp}/buslm
mkdir -p "$TMP"
BUSES=${*:-man conecto procity yutong schindler t6m}
OUT="$TMP/game.html" node build.mjs --dev
for bus in $BUSES; do
  # the trams have the same geometry in every preset: one map at 2048 (src/vehicle/BusLightmap.js)
  variants="full balanced"
  case "$bus" in schindler|t6m) variants=full ;; esac
  for variant in $variants; do
    size=2048; samples=128
    if [ "$variant" = balanced ]; then size=1024; samples=96; fi
    node tools/bus_lightmap_export.cjs "$TMP/game.html" "$bus" "$variant" "$TMP/${bus}_${variant}.json" "$size"
    "$PY" tools/blender/bake_bus_light.py "$TMP/${bus}_${variant}.json" --samples "$samples" 2>&1 | grep -E "^${bus}_" || true
  done
done
