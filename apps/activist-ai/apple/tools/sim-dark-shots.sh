#!/bin/bash
# The iPhone app in Light and in each dark style (OLA-221, OLA-222), in the simulator, headless (no Simulator window):
#   tools/sim-dark-shots.sh <Ola.app built for the simulator> <out-dir> [device name]
# Run it on the Mac mini, never on Bart's iMac (it boots a simulator). The style and the appearance
# reach the app as launch arguments (-ola.darkStyle, -ola.appearance: the argument domain of its
# settings), so nothing is kept. Shuts the simulator down at the end.
set -euo pipefail
APP="$1"; OUT="$2"; NAME="${3:-iPhone 17 Pro}"
UDID=$(xcrun simctl list devices available -j | python3 -c "import json,sys; d=json.load(sys.stdin)['devices']; print(next(x['udid'] for r in sorted(d, reverse=True) for x in d[r] if x['name']==sys.argv[1]))" "$NAME")
mkdir -p "$OUT"
trap 'xcrun simctl shutdown "$UDID" 2>/dev/null || true' EXIT
xcrun simctl boot "$UDID" 2>/dev/null || true
xcrun simctl bootstatus "$UDID" -b >/dev/null
sleep "${OLA_SETTLE:-25}"
xcrun simctl status_bar "$UDID" override --time "9:41" --batteryState charged --batteryLevel 100 --wifiBars 3 >/dev/null 2>&1 || true
xcrun simctl install "$UDID" "$APP"
shot() { # name, args...
  local name=$1; shift
  xcrun simctl terminate "$UDID" cx.ola.mac 2>/dev/null || true
  xcrun simctl launch "$UDID" cx.ola.mac "$@" >/dev/null
  sleep "${OLA_WAIT:-5}"
  xcrun simctl io "$UDID" screenshot "$OUT/$name.png" >/dev/null 2>&1
  echo "$OUT/$name.png"
}
for look in light standard graphite ink; do
  if [ "$look" = light ]; then s=(-ola.appearance light); name=light; else s=(-ola.appearance dark -ola.darkStyle "$look"); name="dark-$look"; fi
  shot "$name-phone-sessions" "${s[@]}" -OlaFixture main
  shot "$name-phone-conversation" "${s[@]}" -OlaFixture main -OlaOpen
  shot "$name-phone-approval" "${s[@]}" -OlaFixture approval -OlaOpen
  shot "$name-phone-results" "${s[@]}" -OlaFixture results -OlaOpen
  shot "$name-phone-settings" "${s[@]}" -OlaFixture main -OlaTab settings
done
