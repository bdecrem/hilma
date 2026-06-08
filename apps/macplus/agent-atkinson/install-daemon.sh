#!/bin/bash
#
# Install/refresh the Atkinson image-agent LaunchDaemon (port 2325).
# RUN AS ROOT:  sudo bash apps/macplus/agent-atkinson/install-daemon.sh
#
# Reads OPENAI_API_KEY from hilma's .env.local and injects it into the plist
# (so the key never lands in shell history). Idempotent — safe to re-run after a
# code change (it bootouts then bootstraps). Stops any hand-started 2325 socat first.
#
# Notes baked into the plist: runs as user `admin` (Pillow lives in admin's
# Python; root can't import PIL), ATK_PYTHON=/usr/bin/python3 (only that python has
# Pillow), PATH includes /opt/homebrew/bin so tsx's `#!/usr/bin/env node` finds node.
set -euo pipefail

ENVFILE=/Users/admin/Documents/code/hilma/.env.local
SRC=/Users/admin/Documents/code/hilma/apps/macplus/agent-atkinson/sh.macplus.atkinson.plist
DST=/Library/LaunchDaemons/sh.macplus.atkinson.plist
LABEL=sh.macplus.atkinson

[[ $EUID -eq 0 ]] || { echo "must run as root: sudo bash $0" >&2; exit 1; }

KEY=$(grep -E '^OPENAI_API_KEY=' "$ENVFILE" | head -1 | cut -d= -f2- | sed 's/^"//;s/"$//')
[[ -n "$KEY" ]] || { echo "OPENAI_API_KEY missing from $ENVFILE" >&2; exit 1; }

# Free the port: stop any hand-started listener so the daemon's socat can bind.
pkill -f 'socat.*2325' 2>/dev/null || true
sleep 1

# Install the plist with the key injected (chmod 600 — it holds a secret; launchd
# reads it as root regardless of mode, so world-read is unnecessary).
umask 077
sed "s|__OPENAI_API_KEY__|$KEY|" "$SRC" > "$DST"
chown root:wheel "$DST"
chmod 600 "$DST"

# (Re)load.
launchctl bootout   system "$DST" 2>/dev/null || true
launchctl bootstrap system "$DST"

echo "=== status ==="
launchctl print "system/$LABEL" 2>/dev/null | grep -E 'state =|pid =|program =' | head
echo "=== port 2325 ==="
sleep 1
/usr/sbin/netstat -an -p tcp | grep '\.2325 ' | grep -i listen || echo "NOT LISTENING (check /var/log/macplus-atkinson.err.log)"
echo "=== done ==="
