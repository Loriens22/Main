#!/bin/bash
# Concatenates src/ part-files into the single-file deliverable.
# NOTE: PARTS is the authoritative build order. Agents must not edit this file;
# add a new part here (in the lead's integration step) once it is wired up.
set -e
S=src; O=stellar-expanse.html

PARTS="p2-core.js p3-gl.js p5-world.js p6f-ship-fallback.js p7f-physics-fallback.js \
p8-ui.js p9a-shaders.js p10-docs.js p11-docs2.js p9b-main.js"

# Guard against a part silently disappearing from the build.
for f in $PARTS; do
  [ -f "$S/$f" ] || { echo "BUILD ERROR: missing $S/$f" >&2; exit 1; }
done

cat "$S/p1-shell.html" > "$O"
{
  echo '<script>'
  echo '"use strict";(function(){'
  for f in $PARTS; do
    echo "/* ---------- $f ---------- */"
    cat "$S/$f"
    echo ""
  done
  echo '})();'
  echo '</script>'
} >> "$O"

echo "built $O: $(wc -c < "$O") bytes from $(echo $PARTS | wc -w) parts"
