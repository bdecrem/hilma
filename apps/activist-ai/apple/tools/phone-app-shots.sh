#!/bin/bash
# Every phone screen with made-up data, light and dark, headless (no Simulator window):
#   tools/phone-app-shots.sh <out-dir>
set -euo pipefail
OUT="$1"; mkdir -p "$OUT"
APP="${OLA_DERIVED:-$HOME/Library/Developer/Xcode/DerivedData/ola-apple}/Build/Products/Debug-iphonesimulator/Ola.app"
UDID=$(xcrun simctl list devices available -j | python3 -c "import json,sys; d=json.load(sys.stdin)['devices']; print(next(x['udid'] for r in sorted(d, reverse=True) for x in d[r] if x['name']=='iPhone 17 Pro'))")
xcrun simctl boot "$UDID" 2>/dev/null || true
xcrun simctl bootstatus "$UDID" -b >/dev/null
sleep "${OLA_SETTLE:-25}"
xcrun simctl status_bar "$UDID" override --time "9:41" --batteryState charged --batteryLevel 100 --wifiBars 3 >/dev/null 2>&1 || true
xcrun simctl install "$UDID" "$APP"
shot() { local name=$1 look=$2; shift 2
  xcrun simctl ui "$UDID" appearance "$look"
  xcrun simctl terminate "$UDID" cx.ola.phone 2>/dev/null || true
  xcrun simctl launch "$UDID" cx.ola.phone "$@" >/dev/null
  sleep "${OLA_WAIT:-8}"
  xcrun simctl io "$UDID" screenshot "$OUT/$name.png" >/dev/null 2>&1; echo "$OUT/$name.png"; }
for look in light dark; do
  shot tabs-sessions-$look $look -OlaFixture main -OlaAdminFixture
  shot tabs-settings-$look $look -OlaFixture main -OlaAdminFixture -OlaTab settings
  shot tabs-kit-$look $look -OlaFixture main -OlaAdminFixture -OlaTab kit
  shot conversation-$look $look -OlaFixture main -OlaOpen
  shot empty-$look $look -OlaFixture empty-list
  shot unreachable-$look $look -OlaFixture unreachable
  shot pair-$look $look -OlaFixture notset
done
shot gear-sessions-light light -OlaFixture main -OlaLayout gear
xcrun simctl shutdown "$UDID"
