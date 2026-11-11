#!/bin/bash
# Usage: e2e/run.sh <steps.mjs> <outDir> [w] [h]
# Starts a Vite dev server for this run, waits until it serves, runs e2e/multi.mjs, then stops the server.
#   SNAPSHOT=<dir>  serve a copy of src/ (taken now) from <dir>, so editing the tree cannot hot-reload a running test
#   SNAPSHOT_KEEP=1 reuse <dir> if it already holds a copy (one frozen tree for a whole batch)
#   PORT=<n>        server port (default 5173; use distinct ports for parallel runs)
#   TOUCH=1 / MEMLOG=1 / GFX=...  passed through (touch emulation, RSS log, graphics preset)
cd "$(dirname "$0")/.." || exit 1
ROOT="$PWD"
PORT="${PORT:-5173}"
mkdir -p e2e/out
SERVE="$ROOT"
if [ -n "$SNAPSHOT" ] && [ -n "$SNAPSHOT_KEEP" ] && [ -d "$SNAPSHOT/src" ]; then
  SERVE="$SNAPSHOT" # SNAPSHOT_KEEP=1: reuse the copy taken by an earlier run of the same batch
elif [ -n "$SNAPSHOT" ]; then
  rm -rf "$SNAPSHOT" && mkdir -p "$SNAPSHOT"
  cp -r src index.html package.json tsconfig.json "$SNAPSHOT"/
  cp vite.config.* "$SNAPSHOT"/ 2> /dev/null
  ln -s "$ROOT/public" "$SNAPSHOT/public"
  ln -s "$ROOT/node_modules" "$SNAPSHOT/node_modules"
  SERVE="$SNAPSHOT"
fi
if curl -sf "http://localhost:$PORT/" > /dev/null 2>&1; then
  echo "port $PORT is already serving (a leftover server?) — refusing to test against it" >&2
  exit 3
fi
# run Vite's own node process (not the npx wrapper) so that killing $VP really stops the server
(cd "$SERVE" && E2E_FS_ALLOW="$ROOT" exec node "$ROOT/node_modules/vite/bin/vite.js" --port "$PORT" --strictPort) > "e2e/out/vite_$PORT.log" 2>&1 &
VP=$!
trap 'kill "$VP" 2> /dev/null; [ -n "$ML" ] && kill "$ML" 2> /dev/null' EXIT
for _ in $(seq 1 120); do curl -sf "http://localhost:$PORT/" > /dev/null && break; sleep 0.5; done
if [ -n "$MEMLOG" ]; then
  # top three processes by RSS, with Chrome's process type (renderer / gpu-process / utility …)
  ( while true; do echo "[mem] $(date +%T) total-rss-MB=$(ps -eo rss= | awk '{s+=$1} END {print int(s/1024)}') top: $(ps -eo rss=,args= --sort=-rss | head -3 | awk '{t="main"; for (i=2;i<=NF;i++) if ($i ~ /^--type=/) {t=substr($i,8)} if ($2 ~ /node/) t="node"; printf "%dMB:%s ", $1/1024, t}')"; sleep 10; done ) &
  ML=$!
fi
GAME_URL="http://localhost:$PORT/" node "$ROOT/e2e/multi.mjs" "$@"
RC=$?
[ -n "$ML" ] && kill "$ML" 2> /dev/null
kill "$VP" 2> /dev/null
pkill -P "$VP" 2> /dev/null
wait "$VP" 2> /dev/null
exit $RC
