#!/usr/bin/env bash
# Runs the Maverick server inside a GitHub Codespace and prints the public HTTPS address and the
# access code to type into the Maverick Bot app. Safe to run again at any time:
#   bash .devcontainer/maverick-start.sh
# Outside Codespaces it still builds and starts the server, on http://127.0.0.1:8080.
set -u

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${MAVERICK_PORT:-8080}"
OPENCODE_VERSION=1.19.3
# Under /workspaces, so it survives stopping, starting and rebuilding the codespace. Git-ignored.
export DATA_DIR="${MAVERICK_DATA_DIR:-$REPO_DIR/.maverick-data}"
mkdir -p "$DATA_DIR"
LOG="$DATA_DIR/server.log"
say() { printf '\n\033[1;36m>> %s\033[0m\n' "$*"; }

# Node 22, as in production. GitHub's default codespace image ships several Node versions through nvm.
if [ -s /usr/local/share/nvm/nvm.sh ]; then
  # shellcheck disable=SC1091
  . /usr/local/share/nvm/nvm.sh
  nvm use 22 >/dev/null 2>&1 || { nvm install 22 >/dev/null && nvm use 22 >/dev/null; }
fi
say "Node $(node -v)"

# Access code and encryption key: made once, kept in DATA_DIR, never committed.
# A Codespaces secret named MAVERICK_ACCESS_CODE overrides the generated code.
SECRETS="$DATA_DIR/secrets.env"
if [ ! -s "$SECRETS" ]; then
  (
    umask 077
    node -e '
      const c = require("crypto"), a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      let s = ""; for (const b of c.randomBytes(12)) s += a[b % 32];
      console.log("ACCESS_CODE=MAV-" + s.slice(0, 4) + "-" + s.slice(4, 8) + "-" + s.slice(8));
      console.log("SERVER_SECRET=" + c.randomBytes(32).toString("hex"));' >"$SECRETS"
  ) || exit 1
fi
set -a
# shellcheck disable=SC1090
. "$SECRETS"
set +a
if [ -n "${MAVERICK_ACCESS_CODE:-}" ]; then export ACCESS_CODE="$MAVERICK_ACCESS_CODE"; fi
if [ "${GITHUB_ACTIONS:-}" = true ]; then
  # Keep the code and secret out of CI logs (the repository is public).
  echo "::add-mask::$ACCESS_CODE"
  echo "::add-mask::$SERVER_SECRET"
fi

is_up() {
  case "$(curl -fsS -m 5 "http://127.0.0.1:$PORT/health" 2>/dev/null)" in *'"ok":true'*) return 0 ;; esac
  return 1
}

if is_up; then
  say "Server already running"
else
  say "Installing and building (the first time takes 2-3 minutes)"
  cd "$REPO_DIR/server" || exit 1
  LOCK="$(sha256sum package-lock.json | cut -c1-16)-$(node -v)"
  if [ ! -d node_modules ] || [ "$(cat node_modules/.maverick-lock 2>/dev/null)" != "$LOCK" ]; then
    npm ci --no-audit --no-fund || exit 1
    echo "$LOCK" >node_modules/.maverick-lock
  fi
  npx tsc -p tsconfig.json || exit 1
  if ! npm ls -g --depth=0 "opencode-ai@$OPENCODE_VERSION" >/dev/null 2>&1; then
    npm install -g --no-audit --no-fund "opencode-ai@$OPENCODE_VERSION" || exit 1
  fi
  NPM_BIN="$(npm prefix -g)/bin"
  export OPENCODE_BIN="$NPM_BIN/opencode"
  # The coding agent's shell only gets AGENT_PATH, so it must include node and opencode.
  NODE_DIR="$(dirname "$(command -v node)")"
  export AGENT_PATH="$NPM_BIN:$NODE_DIR:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
  say "Starting the server (log: $LOG)"
  PORT="$PORT" NODE_ENV=production SELFTEST=0 setsid nohup node dist/index.js >>"$LOG" 2>&1 </dev/null &
  for _ in $(seq 1 90); do
    is_up && break
    sleep 2
  done
  is_up || {
    echo "The server did not start. Last log lines:"
    tail -n 40 "$LOG"
    exit 1
  }
fi

URL="http://127.0.0.1:$PORT"
if [ -n "${CODESPACE_NAME:-}" ]; then
  URL="https://${CODESPACE_NAME}-${PORT}.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
  say "Making port $PORT public (GitHub resets it to private on every restart)"
  ok=""
  for _ in $(seq 1 60); do
    # Fails until the editor has registered the forwarded port, so retry.
    if gh codespace ports visibility "$PORT:public" -c "$CODESPACE_NAME" >/dev/null 2>&1; then
      ok=1
      break
    fi
    sleep 3
  done
  [ -n "$ok" ] || echo "Could not make the port public. In the PORTS tab: right-click $PORT > Port Visibility > Public."
  # Check the public address the way the phone reaches it: anonymous HTTPS through GitHub.
  case "$(curl -fsS -m 20 -H 'Accept: application/json' "$URL/health" 2>/dev/null)" in
    *'"ok":true'*) echo "Public address check: OK" ;;
    *) echo "Public address check failed (it can take a minute). Try opening $URL/health in a browser." ;;
  esac
fi

printf '\n\033[1;32m==============================================================\n'
printf '  Maverick server is running.\n\n'
printf '    Server URL:   %s\n' "$URL"
printf '    Access code:  %s\n\n' "$ACCESS_CODE"
printf '  In the Maverick Bot app, on the pairing screen tap "Server: ... change",\n'
printf '  paste the Server URL, then enter the access code.\n'
printf '==============================================================\033[0m\n\n'

# GitHub stops an idle codespace. Requests from the phone do not count as activity, but terminal
# output does, so while the app is connected (an open connection to the port) print a line every
# few minutes. Once the app is closed, the codespace idles out as usual. MAVERICK_KEEPALIVE=0 skips this.
[ "${MAVERICK_KEEPALIVE:-1}" = "0" ] && exit 0
HEXPORT="$(printf '%04X' "$PORT")"
while sleep 180; do
  n="$(cat /proc/net/tcp /proc/net/tcp6 2>/dev/null | awk -v p=":$HEXPORT" '$4 == "01" && substr($2, length($2) - 4) == p' | wc -l)"
  if [ "$n" -gt 0 ]; then echo "$(date -u +%H:%M) app connected ($n), server is up"; fi
done
