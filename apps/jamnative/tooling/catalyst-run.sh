#!/bin/bash
# Headless Mac Catalyst run: tooling/catalyst-run.sh <tag> <launch args...>
# Launches the last Catalyst build with the given args, services the
# `shot:<name>` handshake with `screencapture -l <window id>` (needs Screen
# Recording permission for the terminal; falls back to a full-screen grab),
# prints the script log. Kills the app at the end.
set -u
TAG="$1"; shift
HERE="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$HERE/.shots/$TAG"; mkdir -p "$OUT/export"
APP="$(xcodebuild -project "$HERE/Jambot.xcodeproj" -scheme Jambot -showBuildSettings -destination 'platform=macOS,variant=Mac Catalyst' 2>/dev/null | grep -m1 BUILT_PRODUCTS_DIR | awk '{print $3}')/Jambot.app"
LOG="$OUT/script.log"; : > "$LOG"
pkill -x Jambot 2>/dev/null; sleep 1
"$APP/Contents/MacOS/Jambot" "$@" -studioScriptLog "$LOG" -studioShotDir "$OUT" -studioExportDir "$OUT/export" > "$OUT/stdout.log" 2>&1 &
APP_PID=$!
START=$(date +%s); LIMIT=${SIM_RUN_LIMIT:-240}
winid() {
  swift - <<'SW' 2>/dev/null
import CoreGraphics
let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
for w in list where (w[kCGWindowOwnerName as String] as? String) == "Jambot" {
    if let id = w[kCGWindowNumber as String] as? Int { print(id); break }
}
SW
}
while true; do
  for f in "$OUT"/*.want; do
    [ -e "$f" ] || continue
    n=$(basename "$f" .want); sleep 0.4
    WID=$(winid | head -1)
    if [ -n "$WID" ]; then screencapture -x -l "$WID" "$OUT/$n.png" 2>>"$OUT/stdout.log"; else screencapture -x "$OUT/$n.png" 2>>"$OUT/stdout.log"; fi
    rm -f "$f"; echo "[shot] $n wid=${WID:-none}"
  done
  grep -q "script done" "$LOG" 2>/dev/null && break
  if [ $(( $(date +%s) - START )) -gt "$LIMIT" ]; then echo "[catalyst-run] timeout"; break; fi
  sleep 0.3
done
sleep 1
cat "$LOG"
kill "$APP_PID" 2>/dev/null; pkill -x Jambot 2>/dev/null
exit 0
