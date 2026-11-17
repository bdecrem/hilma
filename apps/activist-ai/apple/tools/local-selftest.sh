#!/bin/bash
# "On this Mac" started by the real app, as the responsible process, without a window:
#   tools/local-selftest.sh <Ola.app> <folder> [token-file] [log]
# Launches a second, background instance through LaunchServices (open -n -g), so macOS treats it
# exactly as when Bart starts the app (privacy checks included), and prints its trace.
set -uo pipefail
APP="$1"; FOLDER="$2"; TOKEN="${3:-}"; LOG="${4:-$(mktemp -t ola-local)}"
: > "$LOG"
args=(--local-selftest "$FOLDER")
[ -n "$TOKEN" ] && args+=(--token-file "$TOKEN")
open -n -g -W --stdout "$LOG" --stderr "$LOG" "$APP" --args "${args[@]}"
cat "$LOG"
grep -q "^ *[0-9.]*  PASS" "$LOG"
