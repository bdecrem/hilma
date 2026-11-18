#!/bin/bash
# iPhone screenshots in the simulator, headless (no Simulator window):
#   tools/sim-shots.sh <out-dir> [device name]
# Installs the built app, launches it with each fixture, screenshots, and shuts the simulator down.
set -euo pipefail
OUT="$1"; NAME="${2:-iPhone 17 Pro}"
APP="${OLA_DERIVED:-$HOME/Library/Developer/Xcode/DerivedData/ola-apple}/Build/Products/Debug-iphonesimulator/Ola.app"
UDID=$(xcrun simctl list devices available -j | python3 -c "import json,sys; d=json.load(sys.stdin)['devices']; print(next(x['udid'] for r in sorted(d, reverse=True) for x in d[r] if x['name']==sys.argv[1]))" "$NAME")
mkdir -p "$OUT"
xcrun simctl boot "$UDID" 2>/dev/null || true
xcrun simctl bootstatus "$UDID" -b >/dev/null
# bootstatus returns before SpringBoard draws on a busy Mac; a first launch then stays white.
sleep "${OLA_SETTLE:-25}"
xcrun simctl ui "$UDID" appearance light
xcrun simctl status_bar "$UDID" override --time "9:41" --batteryState charged --batteryLevel 100 --wifiBars 3 >/dev/null 2>&1 || true
xcrun simctl install "$UDID" "$APP"
shot() { # name, appearance, args...
  local name=$1 look=$2; shift 2
  xcrun simctl ui "$UDID" appearance "$look"
  xcrun simctl terminate "$UDID" cx.ola.mac 2>/dev/null || true
  xcrun simctl launch "$UDID" cx.ola.mac "$@" >/dev/null
  sleep "${OLA_WAIT:-4}"
  xcrun simctl io "$UDID" screenshot "$OUT/$name.png" >/dev/null 2>&1
  echo "$OUT/$name.png"
}
if [ -n "${OLA_LIVE:-}" ]; then
  # Paired with a Mac relay: OLA_LIVE=<file holding the pairing code> (olakit-relay writes one).
  # It reaches the app as an environment variable, never on a command line.
  SIMCTL_CHILD_OLA_PAIR="$(cat "$OLA_LIVE")"
  export SIMCTL_CHILD_OLA_PAIR
  OLA_WAIT=15 shot phone-live-sessions light
  unset SIMCTL_CHILD_OLA_PAIR
  OLA_WAIT=12 shot phone-live-open light -OlaOpenFirst
else
  shot phone-sessions light -OlaFixture main
  shot phone-conversation light -OlaFixture main -OlaOpen
  shot phone-approval light -OlaFixture approval -OlaOpen
  shot phone-approval-dark dark -OlaFixture approval -OlaOpen
  shot phone-connect light -OlaFixture notset
  shot phone-reactions light -OlaFixture reactions -OlaOpen
  shot phone-view-items light -OlaFixture results -OlaOpen
fi
if [ -z "${OLA_KEEP:-}" ]; then xcrun simctl shutdown "$UDID"; fi
