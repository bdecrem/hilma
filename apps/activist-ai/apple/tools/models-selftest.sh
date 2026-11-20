#!/bin/bash
# The Models pane's fallback switches on a Mac set up like Bart's on build 0.1 (18) (OLA-220), in a
# hidden second instance of the app (no window, its own settings suite and scratch folder; the app
# that is open and its settings are not touched), against the stand-in gateway tools/stub-ola.py:
#   tools/models-selftest.sh <Ola.app> [log]
set -uo pipefail
cd "$(dirname "$0")/.."
APP="$1"; LOG="${2:-$(mktemp -t ola-models)}"
WORK="$(mktemp -d -t ola-models-work)"
: > "$LOG"
python3 tools/stub-ola.py 0 > "$WORK/stub.out" 2>&1 &
STUB=$!
trap 'kill $STUB 2>/dev/null; rm -rf "$WORK"' EXIT
for _ in $(seq 50); do grep -q '^port ' "$WORK/stub.out" && break; sleep 0.1; done
PORT="$(sed -n 's/^port //p' "$WORK/stub.out" | head -1)"
[ -n "$PORT" ] || { echo "FAIL: the stub gateway did not start"; exit 1; }
# A sign-in at the stub gives a token it accepts at its model door (made up, loopback only).
curl -s -X POST "http://127.0.0.1:$PORT/api/device/login" -H 'content-type: application/json' \
  -d '{"handle":"bart","password":"right password here"}' | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])' > "$WORK/token"
mkdir -p "$WORK/folder"
open -n -g -W --stdout "$LOG" --stderr "$LOG" "$APP" --args --models-selftest --folder "$WORK/folder" \
  --token-file "$WORK/token" --model-url "http://127.0.0.1:$PORT/api/device/gw/v1"
grep -E "PASS|FAIL|usage" "$LOG"
grep -q "ALL PASSED" "$LOG"
