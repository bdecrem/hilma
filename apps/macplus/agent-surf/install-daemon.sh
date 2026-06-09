#!/bin/bash
#
# Install/refresh the Surf browser-agent LaunchDaemon (port 2326).
# RUN AS ROOT ON THE MINI:  sudo bash apps/macplus/agent-surf/install-daemon.sh
#
# Reads ANTHROPIC_API_KEY from hilma's .env.local and injects it into the plist
# (the key never lands in shell history). Idempotent — safe to re-run after a
# code change. Stops any hand-started 2326 socat first.
set -euo pipefail

ENVFILE=/Users/admin/Documents/code/hilma/.env.local
SRC=/Users/admin/Documents/code/hilma/apps/macplus/agent-surf/sh.macplus.surf.plist
DST=/Library/LaunchDaemons/sh.macplus.surf.plist
LABEL=sh.macplus.surf

[[ $EUID -eq 0 ]] || { echo "must run as root: sudo bash $0" >&2; exit 1; }

KEY=$(grep -E '^ANTHROPIC_API_KEY=' "$ENVFILE" | head -1 | cut -d= -f2- | sed 's/^"//;s/"$//')
[[ -n "$KEY" ]] || { echo "ANTHROPIC_API_KEY missing from $ENVFILE" >&2; exit 1; }

# deps must exist where the plist points
[[ -x /Users/admin/Documents/code/hilma/apps/macplus/agent-surf/node_modules/.bin/tsx ]] || {
  echo "run 'npm install' in agent-surf first (as admin)" >&2; exit 1; }

pkill -f 'socat.*2326' 2>/dev/null || true

sed "s|__ANTHROPIC_API_KEY__|$KEY|" "$SRC" > "$DST"
chown root:wheel "$DST"
chmod 644 "$DST"

launchctl bootout system "$DST" 2>/dev/null || true
launchctl bootstrap system "$DST"
launchctl print "system/$LABEL" | head -5

echo "OK — surf agent listening on :2326 (logs: ~admin/Library/Logs/macplus-surf.*.log)"
