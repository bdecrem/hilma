#!/bin/bash
# Captures the overview video's live frames from the simulator, signed in as
# bart. Rerun after UI changes, then rebuild with build.sh. Screens without
# launch hooks reuse the tour stills (see storyboard.mjs).
#
# Flow: one warmup launch performs the login and primes the screen caches;
# every shot after that reuses the warm session (cookies persist), so the
# deep-link hooks fire reliably.
set -euo pipefail
SIM="${SIM:-9DD8A053-6458-4A7D-924B-D44AD765EC11}"   # iPhone Air (1260x2736)
APP=$(ls -d ~/Library/Developer/Xcode/DerivedData/Feynd-*/Build/Products/Debug-iphonesimulator/Feynd.app | head -1)
DIR="$(cd "$(dirname "$0")" && pwd)"
EINSTEIN_TOPIC="cb8dab3f-2839-4368-aba0-d89404c4727b"

xcrun simctl bootstatus "$SIM" -b >/dev/null
xcrun simctl install "$SIM" "$APP"
xcrun simctl spawn "$SIM" defaults write com.bartdecrem.Feynd streakCelebrated -int 9999 >/dev/null
xcrun simctl status_bar "$SIM" override --time "9:41" --batteryState discharging --batteryLevel 100 --cellularBars 4 --wifiBars 3

launch() {
  xcrun simctl terminate "$SIM" com.bartdecrem.Feynd 2>/dev/null || true
  xcrun simctl launch "$SIM" com.bartdecrem.Feynd -SkipNotifPrompt 1 "$@" >/dev/null
}
snap() { xcrun simctl io "$SIM" screenshot "$DIR/frames/$1.png" >/dev/null; echo "captured $1"; }

# Warmup: sign in and prime the topics + peck caches.
launch -TestLoginUser bart -TestLoginPass 1102 -StartTab topics; sleep 12
launch -StartTab peck; sleep 12

# Splash (every launch shows it briefly).
launch -StartTab topics; sleep 1.0; snap 01-splash
sleep 8; snap 02-topics

launch -StartTab topics -OpenTopic "$EINSTEIN_TOPIC"; sleep 12; snap 03-chat
launch -StartTab topics -OpenTopic "$EINSTEIN_TOPIC" -OpenFlashCards 1; sleep 14; snap 04-flashhub
launch -StartTab peck; sleep 12; snap 06-peck
launch -StartTab peck -OpenPebbles 1; sleep 12; snap 07-pebbles
launch -StartTab topics -OpenCommunity 1; sleep 12; snap 08-community

xcrun simctl terminate "$SIM" com.bartdecrem.Feynd 2>/dev/null || true
echo "done -> $DIR/frames/"
