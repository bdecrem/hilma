#!/bin/bash
# Install the bridge as a launchd job on THIS machine (the Mac mini, or a dev
# Mac standing in for it).
#
#   bash apps/dodo-voice-bridge/install.sh            # install / refresh + start
#   bash apps/dodo-voice-bridge/install.sh uninstall
#
# launchd jobs cannot read ~/Documents (macOS privacy protection), so the
# bridge is COPIED to ~/Library/Application Support/dodo-voice-bridge and its
# two secrets to ~/.dodo-voice-bridge.env (chmod 600; taken from the repo's
# .env.local unless the file already exists). Re-run after changing the code.
set -euo pipefail
SRC="$(cd "$(dirname "$0")" && pwd)"
DEST="$HOME/Library/Application Support/dodo-voice-bridge"
ENVFILE="$HOME/.dodo-voice-bridge.env"
PLIST="$HOME/Library/LaunchAgents/com.dodo.voicebridge.plist"

launchctl bootout "gui/$(id -u)/com.dodo.voicebridge" 2>/dev/null || true
if [ "${1:-}" = "uninstall" ]; then rm -f "$PLIST"; echo "removed (left $DEST and $ENVFILE)"; exit 0; fi

mkdir -p "$DEST" "$HOME/Library/LaunchAgents"
cp "$SRC"/server.mjs "$SRC"/engines.mjs "$SRC"/run.sh "$SRC"/package.json "$SRC"/package-lock.json "$DEST"/
(cd "$DEST" && PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" npm install --no-audit --no-fund >/dev/null)

if [ ! -f "$ENVFILE" ]; then
  grep -E '^(ELEVENLABS_API_KEY|DODO_BRIDGE_SECRET)=' "$SRC/../../.env.local" > "$ENVFILE"
  chmod 600 "$ENVFILE"
fi
[ "$(grep -cE '^(ELEVENLABS_API_KEY|DODO_BRIDGE_SECRET)=' "$ENVFILE")" = "2" ] || { echo "$ENVFILE needs ELEVENLABS_API_KEY and DODO_BRIDGE_SECRET"; exit 1; }

sed -e "s|__DIR__|$DEST|g" -e "s|__HOME__|$HOME|g" "$SRC/com.dodo.voicebridge.plist" > "$PLIST"
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "started — tail -f ~/Library/Logs/dodo-voice-bridge.log"
