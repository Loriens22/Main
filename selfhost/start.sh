#!/usr/bin/env bash
# Maverick Bot: start your own server on macOS or Linux. No account is needed.
#
#   bash start.sh
#
# The first run takes 5-15 minutes because it builds the server. Run it again at any time:
# it keeps your access code and prints the current address. Stop the server with: bash stop.sh
set -u

cd "$(dirname "$0")" || exit 1

LINE='======================================================================'
say() { printf '\n>> %s\n' "$*"; }
fail() {
  printf '\nERROR: %s\n\n' "$*" >&2
  exit 1
}

# ---------- 1. Docker ----------
if ! command -v docker >/dev/null 2>&1; then
  cat >&2 <<'EOF'

Docker is not installed. It is free and needs no account.
  macOS:  download Docker Desktop from https://www.docker.com/products/docker-desktop/
          then open it once and click Accept (you can skip signing in).
  Linux:  curl -fsSL https://get.docker.com | sudo sh
Then run this script again.

EOF
  exit 1
fi

docker_ok() { docker info >/dev/null 2>&1; }
if ! docker_ok && [ "$(uname -s)" = Darwin ] && open -ga Docker >/dev/null 2>&1; then
  say "Starting Docker Desktop (this can take a minute) ..."
  i=0
  while [ "$i" -lt 60 ] && ! docker_ok; do
    sleep 3
    i=$((i + 1))
  done
fi
if ! docker_ok; then
  err="$(docker info 2>&1 | tail -n 3)"
  case "$err" in
    *"permission denied"*) fail "Docker is running, but this user is not allowed to use it. Run:  sudo bash start.sh" ;;
  esac
  if [ "$(uname -s)" = Darwin ]; then
    fail "Docker is not running. Open Docker Desktop, wait until it says it is running, then run this script again."
  fi
  fail "Docker is not running. Start it (for example: sudo systemctl start docker, or open Docker Desktop), then run this script again.
Docker said: $err"
fi
if ! docker compose version >/dev/null 2>&1; then
  fail "Docker Compose v2 is missing. Update Docker Desktop, or on Linux install the docker-compose-plugin package."
fi

# ---------- 2. Access code and secrets (.env), created once and never overwritten ----------
random_text() { LC_ALL=C tr -dc "$2" </dev/urandom 2>/dev/null | head -c "$1"; }
if [ ! -s .env ]; then
  say "Creating your access code and secrets (selfhost/.env)"
  letters='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  (
    umask 077
    {
      echo '# Maverick server settings, created by the start script. Keep this file private:'
      echo '# anyone with the access code can connect a phone to your server.'
      echo "ACCESS_CODE=MAV-$(random_text 4 "$letters")-$(random_text 4 "$letters")-$(random_text 4 "$letters")"
      echo "SERVER_SECRET=$(random_text 64 0-9a-f)"
      echo "VOICE_SECRET=$(random_text 48 0-9a-f)"
    } >.env
  ) || fail "Could not write selfhost/.env"
fi
env_value() {
  sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*//p" .env | tail -n 1 | tr -d '\r"'"'" | sed 's/[[:space:]]*$//'
}
ACCESS_CODE="$(env_value ACCESS_CODE)"
[ -n "$ACCESS_CODE" ] || fail "selfhost/.env has no ACCESS_CODE. Delete selfhost/.env and run this script again to make a new one."
if [ "${GITHUB_ACTIONS:-}" = true ]; then
  # Keep the code and secrets out of CI logs (the repository is public).
  for k in ACCESS_CODE SERVER_SECRET VOICE_SECRET; do
    v="$(env_value "$k")"
    if [ -n "$v" ]; then echo "::add-mask::$v"; fi
  done
fi

# ---------- 3. Build and start, unless it is already running ----------
# Re-running "up --build" can recreate running containers, which would cut off agent runs and
# calls, so when the server is up this script only reads its current address.
running() { docker compose ps --status running -q "$@" 2>/dev/null | grep -c .; }
voice_note=""
if [ "$(running core tunnel)" -ge 2 ]; then
  say "The server is already running, so nothing is rebuilt or restarted. (To apply new files or a changed .env, run stop.sh first.)"
  if [ "$(running voice)" -lt 1 ]; then voice_note="Voice calls are off: the voice engine is not running (chat works)."; fi
else
  say "Building and starting the server. The first time takes 5-15 minutes; later runs take seconds."
  if ! docker compose up -d --build; then
    say "Starting everything failed. Trying again without the voice engine (chat does not need it) ..."
    if ! docker compose up -d --build core tunnel; then
      docker compose ps -a
      docker compose logs --tail 40 core tunnel
      fail "The server could not be started. See the messages above."
    fi
    voice_note="Voice calls are off: the voice engine could not be built or started (chat works)."
  fi
fi

# Runs curl inside the core container, so nothing extra is needed on this computer.
in_core() { docker compose exec -T core curl -fsS -m "${2:-10}" "$1" </dev/null 2>/dev/null; }

# ---------- 4. Wait for the server ----------
say "Waiting for the server to be ready ..."
ready=""
i=0
while [ "$i" -lt 100 ]; do
  case "$(in_core http://127.0.0.1:8080/health 5)" in *'"ready":true'*)
    ready=1
    break
    ;;
  esac
  sleep 3
  i=$((i + 1))
done
if [ -z "$ready" ]; then
  docker compose logs --tail 60 core
  fail "The server did not become ready. See the log above."
fi

# ---------- 5. Public https address of the Cloudflare Quick Tunnel ----------
say "Getting the public https address from Cloudflare ..."
host=""
i=0
while [ "$i" -lt 60 ]; do
  host="$(in_core http://tunnel:20241/quicktunnel 5 | sed -n 's/.*"hostname":"\([a-z0-9.-]*\)".*/\1/p')"
  [ -n "$host" ] && break
  sleep 3
  i=$((i + 1))
done
# No fallback to the tunnel's log: after a restart it still holds the old, dead address.
if [ -z "$host" ]; then
  docker compose logs --tail 40 tunnel
  fail "Could not get an address from Cloudflare. Check the internet connection, then run stop.sh and this script again."
fi
URL="https://$host"

# ---------- 6. Check the address from the internet, the way the phone will reach it ----------
say "Checking $URL from the internet ..."
reachable=""
i=0
while [ "$i" -lt 40 ]; do
  case "$(in_core "$URL/health" 15)" in *'"ok":true'*)
    reachable=1
    break
    ;;
  esac
  sleep 3
  i=$((i + 1))
done

copied=""
if command -v pbcopy >/dev/null 2>&1 && printf '%s' "$URL" | pbcopy 2>/dev/null; then copied=1; fi

# ---------- 7. What to type into the app ----------
printf '\n%s\n' "$LINE"
printf '  Your Maverick server is running.\n\n'
printf '    Server URL:   %s\n' "$URL"
printf '    Access code:  %s\n\n' "$ACCESS_CODE"
printf '  In the Maverick Bot app, on the pairing screen tap "Server: ... change",\n'
printf '  paste the Server URL, then enter the access code.\n'
printf '  Already paired (to Railway or to an old address)? First open Settings >\n'
printf '  "Sign out this device" to get back to the pairing screen.\n'
printf '%s\n' "$LINE"
if [ -n "$copied" ]; then printf '  The Server URL is copied: paste it into a message to your phone.\n'; fi
if [ -n "$voice_note" ]; then printf '  %s\n' "$voice_note"; fi
printf '  Keep this computer on and awake, with Docker running.\n'
printf '  The address changes when the server or computer restarts: run this script again to see it,\n'
printf '  then sign out in the app and pair again with the new address and the same code.\n'
printf '  Stop the server:  bash stop.sh\n\n'

if [ -z "$reachable" ]; then
  printf 'WARNING: %s did not answer from the internet yet. Wait a minute, then open\n' "$URL" >&2
  printf '%s/health in a browser: it should show {"ok":true,...}. If not, run this script again.\n' "$URL" >&2
  printf 'Some school, office and hotel networks block the tunnel (it needs outbound TCP port 7844):\n' >&2
  printf 'then try another network, such as a phone hotspot.\n\n' >&2
  exit 3
fi
exit 0
