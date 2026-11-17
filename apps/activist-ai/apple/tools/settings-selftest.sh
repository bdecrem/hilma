#!/bin/bash
# The Settings window's checks, in a hidden second instance of the app (no window on screen, its own
# settings, scratch folder and relay port; the app that is open is not touched):
#   tools/settings-selftest.sh <Ola.app> <work folder> <gateway token file> [log]
set -uo pipefail
APP="$1"; FOLDER="$2"; TOKEN="$3"; LOG="${4:-$(mktemp -t ola-settings)}"
: > "$LOG"
open -n -g -W --stdout "$LOG" --stderr "$LOG" "$APP" --args --settings-selftest --folder "$FOLDER" --token-file "$TOKEN"
grep -E "PASS|FAIL|usage" "$LOG"
grep -q "ALL PASSED" "$LOG"
