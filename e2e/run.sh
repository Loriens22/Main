#!/bin/bash
# Usage: e2e/run.sh <steps.mjs> <outDir> [w] [h]
# Starts the Vite dev server for this run, waits until it serves, runs e2e/multi.mjs, then stops the server.
cd "$(dirname "$0")/.." || exit 1
mkdir -p e2e/out
npx vite --port 5173 --strictPort > e2e/out/vite.log 2>&1 &
VP=$!
for _ in $(seq 1 120); do curl -sf http://localhost:5173/ > /dev/null && break; sleep 0.5; done
if [ -n "$MEMLOG" ]; then
  ( while true; do echo "[mem] $(date +%T) total-rss-MB=$(ps -eo rss= | awk '{s+=$1} END {print int(s/1024)}') top=$(ps -eo rss=,comm= --sort=-rss | head -1 | awk '{print int($1/1024) "MB " $2}')"; sleep 10; done ) &
  ML=$!
fi
node e2e/multi.mjs "$@"
RC=$?
[ -n "$ML" ] && kill "$ML" 2> /dev/null
kill "$VP" 2> /dev/null
wait "$VP" 2> /dev/null
exit $RC
