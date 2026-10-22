#!/bin/bash
# Loads the built game in driver, passenger and bus-studio modes; fails on any page error.
#   tools/smoke.sh [game.html]
cd "$(dirname "$0")/.."
HTML=${1:-index.html}
OUTDIR=${TMPDIR:-/tmp}/smoke.$$
mkdir -p "$OUTDIR"
fail=0
run() {
  local out
  out=$(timeout 400 node tools/shot.cjs "$HTML" "$OUTDIR" "$1" "$2" 2>&1)
  if echo "$out" | grep -aqE "pageerror|eval error|TIMEOUT"; then
    echo "FAIL [$1]"; echo "$out" | grep -aE "pageerror|eval error|TIMEOUT" | head -5; fail=1
  else echo "ok   [$1] $(echo "$out" | grep -a '^eval:' | tail -1 | cut -c1-120)"; fi
}
run "noloop&q=balanced&autostart=driver&h=12" '[{"eval":"__game.sim(1, {press:[\"KeyI\"]})"}]'
run "noloop&q=balanced&autostart=passenger&stop=3&h=12" '[{"eval":"__game.sim(1)"}]'
run "noloop&q=balanced&scene=bus" '[{"eval":"(__game.look(6,1.6,-14,0,1.4,-6), 1)"}]'
rm -rf "$OUTDIR"
exit $fail
