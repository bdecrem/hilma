#!/bin/bash
# Screenshot every screen headlessly in one appearance mode (no screen control).
#   tooling/shoot-screens.sh dark|light [tag]        → .shots/<tag>/ (default final-<mode>)
# Needs the last simulator build; uses sim-run.sh (jamtest account, production backend).
# SIM_DEV picks the device ("iPhone 16" default, "iPhone SE 3" for the 375 pt check).
set -u
MODE="$1"; TAG="${2:-final-$MODE}"
DEV="${SIM_DEV:-iPhone 16}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$HERE/.shots/$TAG"; mkdir -p "$OUT"
BID=com.bartdecrem.Jambot
export SIM_DEV="$DEV"
xcrun simctl boot "$DEV" 2>/dev/null
xcrun simctl ui "$DEV" appearance "$MODE"
run() { # run <subtag> <launch args…> — sim-run into .shots/<subtag>, then move pngs into $OUT
  local sub="$1"; shift
  SIM_RUN_LIMIT="${SIM_RUN_LIMIT:-400}" "$HERE/tooling/sim-run.sh" "$sub" "$@" > "$OUT/$sub.log" 2>&1
  for f in "$HERE/.shots/$sub"/*.png; do [ -e "$f" ] && mv "$f" "$OUT/$(basename "$f")"; done
  grep -E "unknown|FAILED|nobody took|timeout|error=[^-n]" "$OUT/$sub.log" | grep -v "error=-" | grep -v "error= " | head -5
  echo "[$sub] done"
}
# 1. Signed-out: login (top) and the catalog below it
APP="$(xcodebuild -project "$HERE/Jambot.xcodeproj" -scheme Jambot -showBuildSettings -destination "generic/platform=iOS Simulator" 2>/dev/null | grep -m1 BUILT_PRODUCTS_DIR | awk '{print $3}')/Jambot.app"
xcrun simctl terminate "$DEV" $BID 2>/dev/null; xcrun simctl install "$DEV" "$APP" >/dev/null || exit 1
xcrun simctl launch "$DEV" $BID -forceSignedOut >/dev/null; sleep 4
xcrun simctl io "$DEV" screenshot "$OUT/01-login.png" >/dev/null
xcrun simctl terminate "$DEV" $BID 2>/dev/null
xcrun simctl launch "$DEV" $BID -forceSignedOut -loginScroll catalog >/dev/null; sleep 5
xcrun simctl io "$DEV" screenshot "$OUT/02-login-catalog.png" >/dev/null
xcrun simctl terminate "$DEV" $BID 2>/dev/null
echo "[login] done"
# 2. Library, catalog, About, public player, then a fresh empty track (studio empty state) — deleted after
run "$TAG-lib" -autoLogin jamtest jamtest1 \
  -libraryScript "list;shot:03-library;scroll:catalog;shot:04-catalog;about;shot:05-about;closeAbout;openCatalog:Exp1;wait:1;shot:06-player;player:play;wait:2.5;shot:07-player-playing;player:stop;closePlayer;new;deleteLast;list" \
  -studioScript "wait:1;shot:08-studio-empty;back"
# 3. Song-mode track: studio idle/playing, faders, panels (collapsed, JT-90, JB202, JT-10, effect), seq (drums, mono editor, armed clear), bounce, publish
run "$TAG-song" -autoLogin jamtest jamtest1 -openTrack "SEQ TEST techno copy" \
  -studioScript "shot:10-studio;play;wait:2.5;shot:11-studio-playing;controls;tab:faders;shot:12-faders;tab:panels;panels:open:none;shot:13-panels-collapsed;panels:open:jt90;shot:14-panels-jt90;panels:open:jb202;shot:15-panels-jb202;panels:open:jt10;shot:16-panels-jt10;panels:open:fx.jt10.delay1;shot:17-panels-fx;tab:seq;seq:inst:jt90;seq:section:1;shot:18-seq-drums;seq:inst:jb202;seq:sel:1;shot:19-seq-mono;seq:clear;shot:20-seq-armed;tab:faders;closeControls;stop;openBounce;shot:21-bounce;closeBounce;publish;wait:1;shot:22-published;unpublish;back"
# 4. Loop-mode track: the Track card with the length keys, JT-30 panel
run "$TAG-loop" -autoLogin jamtest jamtest1 -openTrack "PANELS TEST acid" \
  -studioScript "controls;tab:faders;shot:23-faders-loop;tab:panels;panels:open:jt30;shot:24-panels-jt30;tab:seq;shot:25-seq-loop;tab:faders;closeControls;back"
ls "$OUT"/*.png | wc -l
