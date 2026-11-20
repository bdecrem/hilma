#!/bin/bash
# The phone's Cloud / Local headers hide and show their sessions, and the choice is kept across
# launches (OLA-222). In the simulator, headless; run it on the Mac mini, never on Bart's iMac:
#   tools/sim-sections-check.sh <Ola.app built for the simulator> <out-dir> [device name]
# The simulator cannot tap, so `-OlaToggleRuntime local` calls the same toggle a tap calls, once at
# launch. Four shots: shown, hidden, hidden after a relaunch, shown again. Shuts the simulator down.
set -euo pipefail
APP="$1"; OUT="$2"; NAME="${3:-iPhone 17 Pro}"
UDID=$(xcrun simctl list devices available -j | python3 -c "import json,sys; d=json.load(sys.stdin)['devices']; print(next(x['udid'] for r in sorted(d, reverse=True) for x in d[r] if x['name']==sys.argv[1]))" "$NAME")
mkdir -p "$OUT"
trap 'xcrun simctl shutdown "$UDID" 2>/dev/null || true' EXIT
xcrun simctl boot "$UDID" 2>/dev/null || true
xcrun simctl bootstatus "$UDID" -b >/dev/null
sleep "${OLA_SETTLE:-25}"
xcrun simctl status_bar "$UDID" override --time "9:41" --batteryState charged --batteryLevel 100 --wifiBars 3 >/dev/null 2>&1 || true
xcrun simctl uninstall "$UDID" cx.ola.mac 2>/dev/null || true   # a fresh start: both shown
xcrun simctl install "$UDID" "$APP"
shot() { # name, args...
  local name=$1; shift
  xcrun simctl terminate "$UDID" cx.ola.mac 2>/dev/null || true
  xcrun simctl launch "$UDID" cx.ola.mac -ola.appearance light -OlaFixture main "$@" >/dev/null
  sleep "${OLA_WAIT:-5}"
  xcrun simctl io "$UDID" screenshot "$OUT/$name.png" >/dev/null 2>&1
  echo "$OUT/$name.png"
}
shot sections-1-shown
shot sections-2-local-hidden -OlaToggleRuntime local
shot sections-3-hidden-after-relaunch
shot sections-4-shown-again -OlaToggleRuntime local
