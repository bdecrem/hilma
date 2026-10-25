#!/bin/bash
# M0 check: build Takt for the simulator and Mac Catalyst, then screenshot the lesson
# screen in both themes without touching the foreground.
#
#   apps/takt/scripts/shots.sh [out-dir]      # default: apps/takt/.shots
#   TAKT_FRAME=gate90 apps/takt/scripts/shots.sh  # another LessonState frame (-PreviewFrame)
#
# iPhone: simctl launch with -theme dark|paper, simctl io screenshot.
# Mac: `open -g` (opens behind other windows), screencapture -l <window id>, then quit.
set -euo pipefail

cd "$(dirname "$0")/.."
OUT=${1:-.shots}
DD=build/dd
SIM=${TAKT_SIM:-iPhone 17 Pro}
mkdir -p "$OUT" build
FRAME_ARGS=()
SUFFIX=""
if [ -n "${TAKT_FRAME:-}" ]; then FRAME_ARGS=(-PreviewFrame "$TAKT_FRAME"); SUFFIX="-$TAKT_FRAME"; fi

xcodebuild -project Takt.xcodeproj -scheme Takt -destination "platform=iOS Simulator,name=$SIM" \
  -derivedDataPath "$DD" build > "$DD-sim.log" 2>&1 || { tail -30 "$DD-sim.log"; exit 1; }
xcodebuild -project Takt.xcodeproj -scheme Takt -destination 'platform=macOS,variant=Mac Catalyst' \
  -derivedDataPath "$DD" CODE_SIGN_STYLE=Manual CODE_SIGN_IDENTITY="-" AD_HOC_CODE_SIGNING_ALLOWED=YES \
  PROVISIONING_PROFILE_SPECIFIER="" build > "$DD-mac.log" 2>&1 || { tail -30 "$DD-mac.log"; exit 1; }

xcrun simctl boot "$SIM" 2>/dev/null || true
xcrun simctl bootstatus "$SIM" > /dev/null
xcrun simctl install "$SIM" "$DD/Build/Products/Debug-iphonesimulator/Takt.app"
MAC_APP="$DD/Build/Products/Debug-maccatalyst/Takt.app"

for T in dark paper; do
  xcrun simctl terminate "$SIM" com.bartdecrem.Takt 2>/dev/null || true
  xcrun simctl launch "$SIM" com.bartdecrem.Takt -theme "$T" ${FRAME_ARGS[@]+"${FRAME_ARGS[@]}"} > /dev/null
  sleep 3
  xcrun simctl io "$SIM" screenshot "$OUT/iphone-$T$SUFFIX.png" > /dev/null 2>&1

  open -g -n "$MAC_APP" --args -theme "$T" ${FRAME_ARGS[@]+"${FRAME_ARGS[@]}"}
  sleep 4
  ID=$(swift scripts/winid.swift Takt | head -1 | cut -d' ' -f1)
  screencapture -x -o -l"$ID" "$OUT/mac-$T$SUFFIX.png"
  pkill -f "$MAC_APP/Contents/MacOS/Takt" || true
  sleep 1
done
ls "$OUT"
