#!/bin/bash
# Kit's voice replies written on THIS Mac for a while, when the Mac mini's Claude login has hit its
# plan limit and this Mac's has not (Nov 26, 2026: "You've hit your weekly limit · resets 2am" on
# the mini; Bart wanted to talk at 11 am). A stopgap that removes itself.
#
#   nohup scripts/venture/voice-borrow.sh "02:05" > ~/Library/Logs/voice-borrow.log 2>&1 &
#
# What it does: stops the mini's voice job (launchd sh.venture.voice), runs the same voice-server.ts
# here on 127.0.0.1:3931, and holds an SSH tunnel so the mini's 127.0.0.1:3931 (where its public
# Funnel address points) reaches this Mac. Vercel, the phone and the web page change nothing.
# At the given time (today or, if already past, tomorrow), or when it is stopped (kill <pid>), it
# closes the tunnel and starts the mini's own job again. The voice secret is read from the mini
# into this process only: never printed, never written to a file.
set -u
UNTIL="${1:?give an end time, HH:MM}"
MINI="${VENTURE_MINI:-admin@100.95.51.98}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SSH=(ssh -o BatchMode=yes -o ConnectTimeout=10)
say() { echo "$(date '+%b %d %H:%M:%S') $*"; }

end=$(date -j -f '%Y-%m-%d %H:%M' "$(date +%Y-%m-%d) $UNTIL" +%s) || exit 1
[ "$end" -le "$(date +%s)" ] && end=$((end + 86400))

SECRET="$("${SSH[@]}" "$MINI" "grep -E '^(export )?VENTURE_VOICE_SECRET=' ~/.venture-runner.env | head -1 | sed -E 's/^(export )?VENTURE_VOICE_SECRET=//; s/^[\"'\'']//; s/[\"'\'']\$//'")"
[ "${#SECRET}" -ge 32 ] || { say "could not read the voice secret from the mini"; exit 1; }

server=""; tunnel=""
restore() {
  trap - EXIT INT TERM
  [ -n "$tunnel" ] && kill "$tunnel" 2>/dev/null
  [ -n "$server" ] && kill "$server" 2>/dev/null
  "${SSH[@]}" "$MINI" 'launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/sh.venture.voice.plist' \
    && say "the mini's own voice job is running again" || say "COULD NOT restart the mini's voice job: run launchctl bootstrap gui/501 ~/Library/LaunchAgents/sh.venture.voice.plist there"
  exit 0
}
trap restore EXIT INT TERM

"${SSH[@]}" "$MINI" 'launchctl bootout gui/$(id -u)/sh.venture.voice' ; say "the mini's voice job is stopped"
sleep 2
while [ "$(date +%s)" -lt "$end" ]; do
  # The server ends by itself when this checkout moves to a new commit: start it again.
  if [ -z "$server" ] || ! kill -0 "$server" 2>/dev/null; then
    (cd "$ROOT" && env -u ANTHROPIC_API_KEY -u ANTHROPIC_AUTH_TOKEN VENTURE_VOICE_SECRET="$SECRET" node node_modules/tsx/dist/cli.mjs scripts/venture/voice-server.ts) &
    server=$!; say "voice server started here (pid $server)"
  fi
  if [ -z "$tunnel" ] || ! kill -0 "$tunnel" 2>/dev/null; then
    "${SSH[@]}" -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -R 127.0.0.1:3931:127.0.0.1:3931 "$MINI" &
    tunnel=$!; say "tunnel from the mini opened (pid $tunnel)"
  fi
  sleep 5
done
say "end time reached"
