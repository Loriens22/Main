#!/usr/bin/env bash
# Assemble the single-file HTML study from source fragments.
set -euo pipefail
cd "$(dirname "$0")"
OUT=index.html
{
  cat src/head.html
  cat src/engine.html
  for f in src/pages/*.html; do
    printf '\n<!-- ===== %s ===== -->\n' "$(basename "$f")"
    cat "$f"
  done
  cat src/tail.html
} > "$OUT"
printf 'built %s — %s bytes, %s lines\n' "$OUT" "$(wc -c < $OUT)" "$(wc -l < $OUT)"
