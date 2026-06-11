#!/bin/bash
#
# retire-system-daemons.sh — the ONE-TIME sudo step of the 2026-06-11 backend
# migration (see ../BACKEND.md). Everything after this is sudo-free.
#
#   sudo bash ~/hilma-deploy/apps/macplus/backend/retire-system-daemons.sh
#
# What it does:
#   1. Harvests OPENAI_API_KEY out of the old root-only Atkinson daemon plist
#      into ~/.macplus-backend.env (the central secrets file) before deleting it.
#   2. Boots out + removes the two legacy SYSTEM daemons:
#        sh.claude-plus.terminal (:2324, ran from the retired ~/claude-plus rsync copy)
#        sh.macplus.atkinson     (:2325, ran from the Documents dev tree)
#      (sh.macplus.terminal :2323 — the login shell — is NOT touched.)
#   3. Bootstraps the replacement LaunchAgents sh.macplus.code / sh.macplus.paint
#      (their plists must already exist — run install-agents.sh first).
set -euo pipefail

[ "$EUID" -eq 0 ] || { echo "must run as root: sudo bash $0" >&2; exit 1; }

ADMIN_HOME=/Users/admin
ENVFILE="$ADMIN_HOME/.macplus-backend.env"
LA="$ADMIN_HOME/Library/LaunchAgents"
OLD_ATK=/Library/LaunchDaemons/sh.macplus.atkinson.plist
OLD_CLP=/Library/LaunchDaemons/sh.claude-plus.terminal.plist

echo "== 1. harvest OPENAI_API_KEY from the old Atkinson plist =="
if ! grep -q '^OPENAI_API_KEY=..' "$ENVFILE" 2>/dev/null; then
  KEY="$(plutil -extract EnvironmentVariables.OPENAI_API_KEY raw "$OLD_ATK" 2>/dev/null || true)"
  if [ -n "$KEY" ] && [ "$KEY" != "__OPENAI_API_KEY__" ]; then
    echo "OPENAI_API_KEY=$KEY" >> "$ENVFILE"
    chown admin:staff "$ENVFILE"; chmod 600 "$ENVFILE"
    echo "   harvested -> $ENVFILE"
  else
    echo "   WARNING: no key found in $OLD_ATK — Paint will fail until OPENAI_API_KEY is added to $ENVFILE"
  fi
else
  echo "   already present in $ENVFILE"
fi

echo "== 2. retire legacy system daemons (2324, 2325) =="
for lbl in sh.claude-plus.terminal sh.macplus.atkinson; do
  launchctl bootout "system/$lbl" 2>/dev/null && echo "   booted out $lbl" || echo "   $lbl not loaded"
done
rm -f "$OLD_CLP" "$OLD_ATK" /usr/local/bin/claude-plus-listener.sh
echo "   removed old plists + /usr/local/bin/claude-plus-listener.sh"
sleep 2

echo "== 3. bootstrap the replacement LaunchAgents (gui/501) =="
for n in code paint; do
  [ -f "$LA/sh.macplus.$n.plist" ] || { echo "   MISSING $LA/sh.macplus.$n.plist — run install-agents.sh first" >&2; exit 1; }
  launchctl bootout "gui/501/sh.macplus.$n" 2>/dev/null || true
  launchctl bootstrap gui/501 "$LA/sh.macplus.$n.plist"
  echo "   bootstrapped sh.macplus.$n"
done

echo "== 4. retire the old rsync copy =="
if [ -d "$ADMIN_HOME/claude-plus" ]; then
  mv "$ADMIN_HOME/claude-plus" "$ADMIN_HOME/retired-macplus-20260611/claude-plus" 2>/dev/null \
    || mv "$ADMIN_HOME/claude-plus" "$ADMIN_HOME/claude-plus.retired-20260611"
  echo "   moved ~/claude-plus aside"
fi

sleep 2
echo "== verify =="
for spec in code:2324 paint:2325; do
  p="${spec##*:}"
  /usr/sbin/netstat -an -p tcp | grep -q "\.$p .*LISTEN" \
    && echo "   ${spec%%:*} :$p LISTEN" \
    || echo "   ${spec%%:*} :$p NOT LISTENING (check $ADMIN_HOME/Library/Logs/macplus-${spec%%:*}.err.log)"
done
echo "done — the system is now fully LaunchAgent-managed; no future sudo needed."
