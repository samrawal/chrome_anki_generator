#!/bin/sh
set -eu

BRIDGE_PID=""
CODEX_PID=""

cleanup() {
  trap - INT TERM EXIT

  if [ -n "$BRIDGE_PID" ] && kill -0 "$BRIDGE_PID" 2>/dev/null; then
    kill "$BRIDGE_PID" 2>/dev/null || true
  fi

  if [ -n "$CODEX_PID" ] && kill -0 "$CODEX_PID" 2>/dev/null; then
    kill "$CODEX_PID" 2>/dev/null || true
  fi

  wait 2>/dev/null || true
}

trap cleanup INT TERM EXIT

codex app-server --listen ws://127.0.0.1:4500 &
CODEX_PID=$!

node scripts/bridge.js &
BRIDGE_PID=$!

echo "MKSAP Anki local stack started."
echo "Bridge: http://127.0.0.1:4555"
echo "Codex app-server: ws://127.0.0.1:4500"
echo "Press Ctrl-C to stop both."

while kill -0 "$BRIDGE_PID" 2>/dev/null && kill -0 "$CODEX_PID" 2>/dev/null; do
  sleep 1
done

cleanup
exit 1
