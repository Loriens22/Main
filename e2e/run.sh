#!/bin/bash
# Usage: e2e/run.sh <steps.mjs> <outDir> [w] [h]
# Starts a Vite dev server for this run, waits until it serves, runs e2e/multi.mjs, then stops the server.
#   SNAPSHOT=<dir>  serve a copy of src/ (taken now) from <dir>, so editing the tree cannot hot-reload a running test
#   PORT=<n>        server port (default 5173; use distinct ports for parallel runs)
#   TOUCH=1 / MEMLOG=1 / GFX=...  passed through (touch emulation, RSS log, graphics preset)
cd "$(dirname "$0")/.." || exit 1
ROOT="$PWD"
PORT="${PORT:-5173}"
mkdir -p e2e/out
SERVE="$ROOT"
if [ -n "$SNAPSHOT" ]; then
  rm -rf "$SNAPSHOT" && mkdir -p "$SNAPSHOT"
  cp -r src index.html package.json tsconfig.json "$SNAPSHOT"/
  cp vite.config.* "$SNAPSHOT"/ 2> /dev/null
  ln -s "$ROOT/public" "$SNAPSHOT/public"
  ln -s "$ROOT/node_modules" "$SNAPSHOT/node_modules"
  SERVE="$SNAPSHOT"
fi
(cd "$SERVE" && exec npx vite --port "$PORT" --strictPort) > "e2e/out/vite_$PORT.log" 2>&1 &
VP=$!
for _ in $(seq 1 120); do curl -sf "http://localhost:$PORT/" > /dev/null && break; sleep 0.5; done
if [ -n "$MEMLOG" ]; then
  ( while true; do echo "[mem] $(date +%T) total-rss-MB=$(ps -eo rss= | awk '{s+=$1} END {print int(s/1024)}') top=$(ps -eo rss=,comm= --sort=-rss | head -1 | awk '{print int($1/1024) "MB " $2}')"; sleep 10; done ) &
  ML=$!
fi
GAME_URL="http://localhost:$PORT/" node "$ROOT/e2e/multi.mjs" "$@"
RC=$?
[ -n "$ML" ] && kill "$ML" 2> /dev/null
kill "$VP" 2> /dev/null
pkill -P "$VP" 2> /dev/null
wait "$VP" 2> /dev/null
exit $RC
