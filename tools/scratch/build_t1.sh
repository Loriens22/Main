#!/bin/bash
# SCRATCH build (agent T1b) — same as tools/build.sh but inserts p2b-field.js
# after p2-core.js and aliases fieldHeight -> fieldHeight2. Does not touch the
# real build. Output: stellar-expanse-t1.html
set -e
cd "$(dirname "$0")/../.."
S=src; O=stellar-expanse-t1.html
PARTS="p2-core.js p2b-field.js p3-gl.js p5b-biome.js p5-world.js p6f-ship-fallback.js p7f-physics-fallback.js \
p8-ui.js p9a-shaders.js p12-map.js p13-mobile.js p10-docs.js p11-docs2.js p9b-main.js"
for f in $PARTS; do [ -f "$S/$f" ] || { echo "BUILD ERROR: missing $S/$f" >&2; exit 1; }; done
cat "$S/p1-shell.html" > "$O"
{
  echo '<script>'
  echo '"use strict";(function(){'
  for f in $PARTS; do
    echo "/* ---------- $f ---------- */"
    cat "$S/$f"
    echo ""
    # wire the replacement in immediately after it is declared
    if [ "$f" = "p2b-field.js" ]; then
      echo '/* ---- T1b scratch wiring: route the canonical field through fieldHeight2 ---- */'
      echo 'fieldHeight = fieldHeight2;'
      echo 'try{ const _r = fldSelfTest(); console.log("FLDSELFTEST " + JSON.stringify(_r)); }catch(e){ console.error("FLDSELFTEST THREW " + e); }'
    fi
  done
  echo '})();'
  echo '</script>'
} >> "$O"
echo "built $O: $(wc -c < "$O") bytes from $(echo $PARTS | wc -w) parts"
