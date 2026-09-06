#!/bin/bash
# Headless probe for sheet presentation on Mac Catalyst (works with the screen
# locked): launches the last Catalyst build with a -studioScript and prints the
# app's on-screen windows every 4 s — a presented sheet shows up as an extra
# 'Untitled' window (478x524 form sheet). Usage:
#   tooling/catalyst-sheet-probe.sh "wait:3;controls;wait:5;closeControls;wait:6" [seconds]
set -u
STEPS="$1"; LIMIT="${2:-24}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
APP="$(xcodebuild -project "$HERE/Jambot.xcodeproj" -scheme Jambot -showBuildSettings -destination 'platform=macOS,variant=Mac Catalyst' 2>/dev/null | grep -m1 BUILT_PRODUCTS_DIR | awk '{print $3}')/Jambot.app"
LOG="$HERE/.shots/sheet-probe.log"; mkdir -p "$HERE/.shots"; : > "$LOG"
pkill -x Jambot 2>/dev/null; sleep 1
"$APP/Contents/MacOS/Jambot" -autoLogin jamtest jamtest1 -openTrack "SEQ TEST techno copy" -studioScript "$STEPS" -studioScriptLog "$LOG" >/dev/null 2>&1 &
wins() { swift - <<'SW' 2>/dev/null
import CoreGraphics
let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
var out: [String] = []
for w in list where (w[kCGWindowOwnerName as String] as? String) == "Jambot" { let b = w[kCGWindowBounds as String] as? [String: Any] ?? [:]; out.append("#\(w[kCGWindowNumber as String] ?? 0) \(w[kCGWindowName as String] ?? "?")[\(b["Width"] ?? 0)x\(b["Height"] ?? 0)]") }
print(out.joined(separator: " | "))
SW
}
t=0; while [ $t -lt "$LIMIT" ]; do sleep 4; t=$((t+4)); echo "t=${t}s  $(wins)"; done
grep -E "step [0-9]+/" "$LOG" | sed 's/^/  /'
pkill -x Jambot 2>/dev/null
