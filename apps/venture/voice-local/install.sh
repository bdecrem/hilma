#!/bin/bash
# Install (or update) Kit's local voice on the Mac Studio. Run from this iMac:
#   apps/venture/voice-local/install.sh            copy, (re)load cx.kit.voice, add the https port
#   apps/venture/voice-local/install.sh stop       unload it (frees its memory)
# The secret (~/.kit-voice-secret on the Studio) is made once, never printed. Vercel's copy:
#   ssh ola@100.100.60.59 'cat ~/.kit-voice-secret' | vercel env add KIT_VOICE_SECRET production
set -euo pipefail
HOST=ola@100.100.60.59
HERE="$(cd "$(dirname "$0")" && pwd)"
LABEL=cx.kit.voice
TS=/Applications/Tailscale.app/Contents/MacOS/Tailscale
HTTPS_PORT=8443

if [ "${1:-}" = stop ]; then
  ssh "$HOST" "launchctl bootout gui/\$(id -u)/$LABEL 2>/dev/null || true; echo stopped"
  exit 0
fi

ssh "$HOST" 'mkdir -p ~/kit-voice ~/Library/Logs/kit-voice'
scp -q "$HERE/server.py" "$HERE/$LABEL.plist" "$HOST:kit-voice/"
ssh "$HOST" bash -s <<EOF
set -euo pipefail
cd ~/kit-voice
[ -f silero_vad.jit ] || curl -sSL -o silero_vad.jit https://github.com/snakers4/silero-vad/raw/master/src/silero_vad/data/silero_vad.jit
[ -s ~/.kit-voice-secret ] || (umask 077; openssl rand -hex 32 > ~/.kit-voice-secret)
chmod 600 ~/.kit-voice-secret
echo "memory: \$(memory_pressure | tail -1)"
cp $LABEL.plist ~/Library/LaunchAgents/
launchctl bootout gui/\$(id -u)/$LABEL 2>/dev/null || true
launchctl bootstrap gui/\$(id -u) ~/Library/LaunchAgents/$LABEL.plist
# Only this port; every other serve entry is left as it is.
$TS serve --bg --https=$HTTPS_PORT http://127.0.0.1:3941 >/dev/null
$TS serve status
EOF
