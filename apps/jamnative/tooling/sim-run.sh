#!/bin/bash
# Headless simulator run for Jambot native (no screen control).
#   tooling/sim-run.sh <tag> <launch args...>
# Installs the last simulator build on "iPhone 16", launches it with the given
# launch args plus -studioScriptLog / -studioShotDir / -studioExportDir under
# .shots/<tag>/, and services the `shot:<name>` handshake (the app writes
# <name>.want; this takes the screenshot and removes it) until "script done".
set -u
TAG="$1"; shift
DEV="${SIM_DEV:-iPhone 16}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$HERE/.shots/$TAG"; mkdir -p "$OUT/export"
APP="$(xcodebuild -project "$HERE/Jambot.xcodeproj" -scheme Jambot -showBuildSettings -destination "generic/platform=iOS Simulator" 2>/dev/null | grep -m1 BUILT_PRODUCTS_DIR | awk '{print $3}')/Jambot.app"
LOG="$OUT/script.log"; : > "$LOG"
xcrun simctl boot "$DEV" 2>/dev/null
xcrun simctl terminate "$DEV" com.bartdecrem.Jambot 2>/dev/null
xcrun simctl install "$DEV" "$APP" || exit 1
xcrun simctl launch "$DEV" com.bartdecrem.Jambot "$@" -studioScriptLog "$LOG" -studioShotDir "$OUT" -studioExportDir "$OUT/export" -exportSmokeDir "$OUT/export" >/dev/null || exit 1
START=$(date +%s); LIMIT=${SIM_RUN_LIMIT:-420}
while true; do
  for f in "$OUT"/*.want; do
    [ -e "$f" ] || continue
    n=$(basename "$f" .want)
    sleep 0.35
    xcrun simctl io "$DEV" screenshot "$OUT/$n.png" >/dev/null 2>&1
    rm -f "$f"
    echo "[shot] $n"
  done
  if grep -q "script done" "$LOG" 2>/dev/null; then break; fi
  if [ $(( $(date +%s) - START )) -gt "$LIMIT" ]; then echo "[sim-run] timeout"; break; fi
  sleep 0.2
done
sleep 0.5
cat "$LOG"
