#!/bin/bash
# Render a Stage song offline and report its loudness, so a new or changed track can be heard
# and leveled without playing it by hand (BLUES.md §4). The band tracks sit at about −23 dBFS
# mean with the peak under −1 dB (Dockery −23.0 / −1.0, Friars Point −22.6 / −1.3, Maxwell
# Street −25.0 / −2.7, Blue Lantern −20.7 / −4.0); the electronic ones at −19.
#
#   scripts/takt/render-song.sh <song-name> [seconds] [part]     # e.g. song-halsted 140 melody
#
# The song must be in the app's bundle: for a new song, build the simulator app and install it
# on the booted simulator first (apps/takt/CLAUDE.md "Build and run":
#   cd apps/takt && xcodebuild -project Takt.xcodeproj -scheme Takt -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -derivedDataPath build/dd build
#   xcrun simctl install booted build/dd/Build/Products/Debug-iphonesimulator/Takt.app).
# The render runs through the booted simulator (faster than realtime, the same render code as
# the device); with no simulator booted it falls back to the installed Mac app, which renders
# into its sandbox container. Writes ~/Desktop/takt/<song>.wav and .mp3 and prints ffmpeg's
# mean and peak volume. `part` is the part your keys would take (melody by default: the record
# then plays its own horn line on the channel, so the mix is the record).
set -euo pipefail

SONG="${1:?usage: render-song.sh <song-name> [seconds] [part]}"
SECONDS_TO="${2:-150}"
PART="${3:-melody}"
OUT_DIR="$HOME/Desktop/takt"
mkdir -p "$OUT_DIR"
SCRIPT="0:song=$SONG/$PART,0:play"

if xcrun simctl list devices booted 2>/dev/null | grep -q Booted && xcrun simctl get_app_container booted com.bartdecrem.Takt >/dev/null 2>&1; then
  WAV="/tmp/takt-render-$SONG.wav"
  rm -f "$WAV"
  # --console-pty streams the app's stdout; the hook prints "TAKT rendered … to <path>" and exits.
  timeout 600 xcrun simctl launch --console-pty booted com.bartdecrem.Takt -Silent 1 -RenderTo "$WAV" -RenderSeconds "$SECONDS_TO" -RenderScript "$SCRIPT" 2>&1 | grep -E "TAKT render|fatal|error" || true
  HOW="the booted simulator"
else
  APP="${TAKT_APP:-/Applications/Takt.app}"
  CONTAINER="$HOME/Library/Containers/com.bartdecrem.Takt/Data/tmp"
  mkdir -p "$CONTAINER"
  WAV="$CONTAINER/render-$SONG.wav"
  rm -f "$WAV"
  LOG="$CONTAINER/render-$SONG.log"
  # The Mac app is sandboxed (it can only write inside its container) and must be launched with
  # `open` (from the shell directly its audio session start takes the shell down); -10810 from
  # `open` means a Takt is already running: pkill -f /Contents/MacOS/Takt first.
  open -W -g -n --stdout "$LOG" --stderr "$LOG" "$APP" --args -Silent 1 -RenderTo "$WAV" -RenderSeconds "$SECONDS_TO" -RenderScript "$SCRIPT"
  HOW="the Mac app"
fi
if [ ! -f "$WAV" ]; then
  echo "render failed through $HOW (is $SONG in that build's bundle?)" >&2
  exit 1
fi
cp "$WAV" "$OUT_DIR/$SONG.wav"
ffmpeg -loglevel error -y -i "$WAV" -codec:a libmp3lame -q:a 2 "$OUT_DIR/$SONG.mp3"
echo "rendered $SECONDS_TO s of $SONG ($SCRIPT) through $HOW → $OUT_DIR/$SONG.wav, $OUT_DIR/$SONG.mp3"
ffmpeg -hide_banner -i "$WAV" -af volumedetect -f null - 2>&1 | grep -E "mean_volume|max_volume" | sed 's/.*\] //'
echo "targets: the band tracks about −23 dBFS mean, the peak under −1 dB (no clipping); electronic tracks −19"
