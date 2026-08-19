#!/bin/sh
# Double-click this file on a Mac to open the dashboard.
#
# The dashboard is built from JavaScript modules. A browser blocks those on a
# file:// page, so the page needs a web address. This starts a small server in
# this folder and opens the browser. Close the Terminal window to stop it.

cd "$(dirname "$0")" || exit 1
PORT=8000
while /usr/bin/nc -z 127.0.0.1 "$PORT" 2>/dev/null; do
  PORT=$((PORT + 1))
done

echo "Serving $(pwd) at http://localhost:$PORT"
echo "Close this window to stop."
( sleep 1; open "http://localhost:$PORT" ) &
exec python3 -m http.server "$PORT"
