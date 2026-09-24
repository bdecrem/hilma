#!/bin/bash
# Record a real Token Surfers build in the iOS simulator: a screen recording plus a still
# every few seconds (for screenshots) and 1 fps contact sheets (to pick cut points).
#
#   scripts/surf/sim-record.sh <out-dir> "<prompt>" [--build] [--device "iPhone 17"] [--time 03:00]
#
# What it does: (optionally) regenerates + builds the app for the simulator, boots the device and
# WAITS for the boot to finish (simctl install/launch hang on a half-booted device), pins the status
# bar (full bars, charged, the clock), installs the app, starts `simctl io recordVideo`, launches the
# app straight into a build with TS_AUTORUN, snaps a still every STILL_EVERY seconds, and stops
# ~14 s after the mini reports no running build (enough for the finish: the cutaway, the
# confetti, the game tucking away). Then `scripts/surf/cut.sh` makes the video.
#
# Needs: apps/tokensurfers/TokenSurfers/App/Secrets.swift (gitignored; SURF_APP_KEY is in
# ~/.surf-agent.env on the mini) — and it must exist BEFORE `xcodegen generate`, or the build says
# "cannot find 'Secrets' in scope". ffmpeg on PATH or in ~/bin. The mini's agent up
# (https://surf-mini.tunn3l.sh/health). No sound: the simulator records video only.
#
# Afterwards: the test build made a Vercel project `surf-<id8>` under bart-r-decrems-projects; the
# id is in the `$ cd /Users/admin/surf-apps/surf-<id8>` subtitle of the first Bash train (see the
# stills). Delete it with the API (VERCEL_TOKEN from the mini's ~/.surf-agent.env):
#   curl -X DELETE "https://api.vercel.com/v9/projects/surf-<id8>?slug=bart-r-decrems-projects" -H "Authorization: Bearer $VERCEL_TOKEN"
set -euo pipefail

OUT=${1:?out-dir}; PROMPT=${2:?prompt}; shift 2
DEVICE="iPhone 17"; CLOCK="03:00"; BUILD=0
while [ $# -gt 0 ]; do
  case "$1" in
    --build) BUILD=1 ;;
    --device) DEVICE="$2"; shift ;;
    --time) CLOCK="$2"; shift ;;
    *) echo "unknown arg $1" >&2; exit 2 ;;
  esac
  shift
done
STILL_EVERY=${STILL_EVERY:-5}
BUNDLE=com.bartdecrem.tokensurfers
HEALTH=${SURF_AGENT_HEALTH:-https://surf-mini.tunn3l.sh/health}
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
APP_DIR="$ROOT/apps/tokensurfers"
export PATH="$HOME/bin:$PATH"
command -v ffmpeg >/dev/null || { echo "ffmpeg not found (PATH or ~/bin)" >&2; exit 1; }
[ -f "$APP_DIR/TokenSurfers/App/Secrets.swift" ] || { echo "missing $APP_DIR/TokenSurfers/App/Secrets.swift (copy Secrets.swift.example, key from the mini)" >&2; exit 1; }
mkdir -p "$OUT/stills"
DD=${DERIVED_DATA:-"$OUT/dd"}

if [ "$BUILD" = 1 ]; then
  echo "== building"
  (cd "$APP_DIR" && xcodegen generate >/dev/null)
  xcodebuild -project "$APP_DIR/TokenSurfers.xcodeproj" -scheme TokenSurfers \
    -destination "platform=iOS Simulator,name=$DEVICE" -derivedDataPath "$DD" build 2>&1 | grep -E "error:|BUILD" || true
fi
APP="$DD/Build/Products/Debug-iphonesimulator/TokenSurfers.app"
[ -x "$APP/TokenSurfers" ] || { echo "no built app at $APP (run with --build)" >&2; exit 1; }

echo "== booting $DEVICE"
xcrun simctl boot "$DEVICE" 2>/dev/null || true
xcrun simctl bootstatus "$DEVICE" -b >/dev/null      # wait for the boot to FINISH, or install/launch hang
# The clock: simctl wants an ISO string with milliseconds, and shows it 5 h ahead of the Z hour
# on this runtime (22:00Z read 3:00). So subtract 5 h.
H=${CLOCK%%:*}; M=${CLOCK##*:}; ZH=$(( (10#$H + 19) % 24 ))
xcrun simctl status_bar "$DEVICE" override --time "$(printf '2026-09-23T%02d:%02d:00.000Z' "$ZH" "$((10#$M))")" \
  --batteryLevel 100 --batteryState charged --wifiBars 3 --cellularBars 4
timeout 120 xcrun simctl install "$DEVICE" "$APP"
xcrun simctl terminate "$DEVICE" "$BUNDLE" 2>/dev/null || true
sleep 1

echo "== recording"
xcrun simctl io "$DEVICE" recordVideo --codec h264 --force "$OUT/rec.mov" > "$OUT/rec.log" 2>&1 &
RECPID=$!
for _ in $(seq 1 60); do grep -q "Recording started" "$OUT/rec.log" && break; sleep 0.5; done
grep -q "Recording started" "$OUT/rec.log" || { echo "recording did not start: $(cat "$OUT/rec.log")" >&2; kill $RECPID; exit 1; }
T0=$(date +%s)
SIMCTL_CHILD_TS_AUTORUN="$PROMPT" timeout 60 xcrun simctl launch "$DEVICE" "$BUNDLE" >/dev/null
echo "launched: $PROMPT"

# The build starts ~15 s after launch (the Studio settles first). Stop 14 s after the mini goes idle.
seen=0; n=0
while :; do
  sleep "$STILL_EVERY"
  t=$(( $(date +%s) - T0 ))
  timeout 20 xcrun simctl io "$DEVICE" screenshot "$OUT/stills/$(printf '%03d' $n)-${t}s.png" >/dev/null 2>&1 || true
  n=$((n+1))
  r=$(curl -s -m 8 "$HEALTH" | grep -o '"running":[0-9]*' | cut -d: -f2 || echo "?")
  echo "  ${t}s running=$r"
  [ "$r" = "1" ] && seen=1
  if [ "$seen" = 1 ] && [ "$r" = "0" ]; then break; fi
  if [ "$seen" = 0 ] && [ "$t" -gt 90 ]; then echo "the build never started on the mini" >&2; break; fi
  [ "$t" -gt 420 ] && { echo "giving up after 7 min" >&2; break; }
done
sleep 14
timeout 20 xcrun simctl io "$DEVICE" screenshot "$OUT/stills/final.png" >/dev/null 2>&1 || true
kill -INT $RECPID; wait $RECPID 2>/dev/null || true
echo "recorded $(( $(date +%s) - T0 ))s → $OUT/rec.mov"

echo "== contact sheets (1 fps, 42 per sheet)"
ffmpeg -v error -y -i "$OUT/rec.mov" \
  -vf "fps=1,scale=180:-1,drawtext=text='%{pts\:hms}':x=6:y=6:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.6,tile=7x6" \
  -q:v 4 "$OUT/sheet_%02d.jpg" 2>/dev/null
ls "$OUT"/sheet_*.jpg
echo "next: scripts/surf/cut.sh $OUT/rec.mov <out-base> a:b a:b …   (seconds, from the sheets)"
