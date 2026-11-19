#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
PORT="${1:-8000}"
(
  sleep 1
  if command -v open >/dev/null 2>&1; then open "http://127.0.0.1:${PORT}/"
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "http://127.0.0.1:${PORT}/"
  fi
) >/dev/null 2>&1 &
if command -v python3 >/dev/null 2>&1; then
  exec python3 serve.py "$PORT"
elif command -v python >/dev/null 2>&1; then
  exec python serve.py "$PORT"
elif command -v node >/dev/null 2>&1; then
  exec node server.mjs "$PORT"
else
  echo "Python 3 or Node.js is required." >&2
  exit 1
fi
