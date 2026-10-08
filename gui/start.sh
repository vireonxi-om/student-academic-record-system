#!/bin/sh
# Build the C bridge if needed, start the web GUI and open it in the browser.
#   sh gui/start.sh            (PORT=9000 sh gui/start.sh to use another port)
cd "$(dirname "$0")/.." || exit 1

if ! make gui >/dev/null; then
    echo "Could not build the C bridge. Is gcc (and make) installed?" >&2
    exit 1
fi
if ! command -v node >/dev/null 2>&1; then
    echo "Node.js is required for the web GUI (the command-line program does not need it)." >&2
    exit 1
fi

URL="http://127.0.0.1:${PORT:-8765}"
( sleep 1
  if command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL"
  elif command -v open >/dev/null 2>&1; then open "$URL"
  fi ) >/dev/null 2>&1 &

exec node gui/server.js
