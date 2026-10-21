#!/usr/bin/env bash
# Maverick Bot: stop your own server on macOS or Linux.
# Projects, chats and paired phones are kept for the next start.
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
echo "Maverick server stopped. Your projects, chats and paired phones are kept."
echo "Start it again with:  bash start.sh   (it will get a new address)"
