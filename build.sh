#!/usr/bin/env bash
# Assemble the study from source fragments into two outputs:
#   index.html    — fully standalone document (own doctype/head, own theme toggle)
#   artifact.html — body-only fragment for Artifact publishing, which supplies
#                   the <!doctype>/<head>/<body> wrapper and its own theme toggle
set -euo pipefail
cd "$(dirname "$0")"

pages(){ for f in src/pages/*.html; do printf '\n<!-- ===== %s ===== -->\n' "$(basename "$f")"; cat "$f"; done; }

# ---- standalone ----
{
  cat src/docmeta.html
  cat src/style.html
  printf '</head>\n<body>\n'
  cat src/chrome.html
  cat src/engine.html
  pages
  cat src/tail.html
} > index.html

# ---- artifact fragment ----
{
  cat src/style.html
  # drop the standalone-only theme button; the viewer provides one
  sed '/id="themebtn"/d' src/chrome.html
  cat src/engine.html
  pages
  sed -e 's#</body>##' -e 's#</html>##' src/tail.html
} > artifact.html

for f in index.html artifact.html; do
  printf '%-14s %8s bytes  %5s lines\n' "$f" "$(wc -c < "$f")" "$(wc -l < "$f")"
done
