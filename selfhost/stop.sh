#!/usr/bin/env bash
# Maverick Bot: stop your own server on macOS or Linux.
# Projects and chats are kept for the next start.
#
#   bash stop.sh
set -u

cd "$(dirname "$0")" || exit 1

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed, so the server is not running."
  exit 0
fi
if ! docker compose down; then
  echo "Could not stop the server. Is Docker running?" >&2
  exit 1
fi
echo
echo "Maverick server stopped. Your projects and chats are kept."
echo "Start it again with:  bash start.sh   It gets a new address, so sign out in the app"
echo "(Settings > Sign out this device) and pair again with the new address and the same code."
