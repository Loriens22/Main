#!/bin/bash
set -e
S=src; O=stellar-expanse.html
cat "$S/p1-shell.html" > "$O"
echo '<script>' >> "$O"
echo '"use strict";(function(){' >> "$O"
for f in p2-core.js p3-gl.js p5-world.js p6f-ship-fallback.js p7f-physics-fallback.js \
         p8-ui.js p9a-shaders.js p10-docs.js p9b-main.js; do
  echo "/* ---------- $f ---------- */" >> "$O"
  cat "$S/$f" >> "$O"
  echo "" >> "$O"
done
echo '})();' >> "$O"
echo '</script>' >> "$O"
echo "built $O: $(wc -c < "$O") bytes"
