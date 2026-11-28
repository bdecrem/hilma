#!/bin/bash
# Install (or update) Kit's local voice on the Mac Studio. Run from this iMac:
#   apps/venture/voice-local/install.sh            copy, (re)load cx.kit.voice and the tunnel
#   apps/venture/voice-local/install.sh stop       unload both (frees the voice's memory)
# The public address is https://kit-voice.tunn3l.sh (launchd sh.tunn3l.kit-voice, the tunn3l CLI
# in ~/.tunn3l/bin with the account key in ~/.tunn3l/config.json, installed once with
# `curl -sSf https://tunn3l.sh/install | sh`). The tunnel has no password page: every route but
# /health needs the signed token.
# The secret (~/.kit-voice-secret on the Studio) is made once, never printed. Vercel's copy:
#   ssh ola@100.100.60.59 'cat ~/.kit-voice-secret' | vercel env add KIT_VOICE_SECRET production
set -euo pipefail
HOST=ola@100.100.60.59
HERE="$(cd "$(dirname "$0")" && pwd)"
LABEL=cx.kit.voice
TS=/Applications/Tailscale.app/Contents/MacOS/Tailscale
TUNNEL=sh.tunn3l.kit-voice

if [ "${1:-}" = stop ]; then
  ssh "$HOST" "launchctl bootout gui/\$(id -u)/$TUNNEL 2>/dev/null || true; launchctl bootout gui/\$(id -u)/$LABEL 2>/dev/null || true; echo stopped"
  exit 0
fi

ssh "$HOST" 'mkdir -p ~/kit-voice ~/Library/Logs/kit-voice ~/Library/Logs/tunn3l'
scp -q "$HERE/server.py" "$HERE/$LABEL.plist" "$HERE/$TUNNEL.plist" "$HOST:kit-voice/"
ssh "$HOST" bash -s <<EOF
set -euo pipefail
cd ~/kit-voice
[ -f silero_vad.jit ] || curl -sSL -o silero_vad.jit https://github.com/snakers4/silero-vad/raw/master/src/silero_vad/data/silero_vad.jit
[ -s ~/.kit-voice-secret ] || (umask 077; openssl rand -hex 32 > ~/.kit-voice-secret)
chmod 600 ~/.kit-voice-secret
echo "memory: \$(memory_pressure | tail -1)"
cp $LABEL.plist ~/Library/LaunchAgents/
launchctl bootout gui/\$(id -u)/$LABEL 2>/dev/null || true; sleep 2
launchctl bootstrap gui/\$(id -u) ~/Library/LaunchAgents/$LABEL.plist
# The first version was reached over Tailscale on :8443; the tunnel replaced it.
$TS serve --https=8443 off >/dev/null 2>&1 || true
cp $TUNNEL.plist ~/Library/LaunchAgents/
launchctl bootout gui/\$(id -u)/$TUNNEL 2>/dev/null || true; sleep 2
launchctl bootstrap gui/\$(id -u) ~/Library/LaunchAgents/$TUNNEL.plist
sleep 20
curl -sS -m 10 https://kit-voice.tunn3l.sh/health
EOF
