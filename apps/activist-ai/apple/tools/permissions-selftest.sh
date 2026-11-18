#!/bin/bash
# Permissions (Settings, General) with real requests, as Bart meets them, without a window:
#   tools/permissions-selftest.sh <Ola.app> <scratch folder> <token-file> [shots-dir] [log]
# A second, background instance through LaunchServices (open -n -g), with its own settings suite
# and scratch Application Support: "On this Mac" in the folder, Lots of permissions (a folder and
# three files, no card), Ask (the card comes back), Lots again (no restart). Mac/PermissionsSelfTest.swift.
set -uo pipefail
APP="$1"; FOLDER="$2"; TOKEN="$3"; SHOTS="${4:-}"; LOG="${5:-$(mktemp -t ola-perm)}"
: > "$LOG"
mkdir -p "$FOLDER"
args=(--permissions-selftest --folder "$FOLDER" --token-file "$TOKEN")
[ -n "$SHOTS" ] && args+=(--shots "$SHOTS")
open -n -g -W --stdout "$LOG" --stderr "$LOG" "$APP" --args "${args[@]}"
grep -E "PASS|FAIL|ALL PASSED|FAILED|shot " "$LOG"
grep -q "ALL PASSED" "$LOG"
