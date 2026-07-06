#!/bin/bash
#
# update.sh — THE update verb for the MacPlus backend on the Mac mini.
#
#   bash ~/hilma-deploy/apps/macplus/backend/update.sh
#
# Pulls the deploy clone to origin/main, refreshes each agent's node_modules,
# re-syncs secrets when the dev tree is readable, and restarts the long-running
# node servers. The socat-based services (code/paint/surf) are NOT restarted —
# socat forks a fresh tsx per connection, so the next dial-in runs the new code
# and live sessions are never dropped.
#
# No sudo. Safe to run any time; does nothing when already current.
set -euo pipefail

DEPLOY="${MACPLUS_DEPLOY:-/Users/admin/hilma-deploy}"
DEVTREE="${MACPLUS_DEVTREE:-/Users/admin/Documents/code/hilma}"
ENVFILE="$HOME/.macplus-backend.env"
UID_N="$(id -u)"
AGENT_DIRS="agent agent-atkinson agent-surf agent-mux agent-imessage agent-diag agent-quote agent-bridge agent-screen agent-porthole agent-pssh"
LONG_RUNNERS="mux imessage diag quote bridge screen porthole pssh rsh pixel oracle"

echo "== pull =="
BEFORE="$(git -C "$DEPLOY" rev-parse --short HEAD)"
git -C "$DEPLOY" pull --ff-only
AFTER="$(git -C "$DEPLOY" rev-parse --short HEAD)"
echo "   $BEFORE -> $AFTER"

echo "== deps =="
for d in $AGENT_DIRS; do
  dir="$DEPLOY/apps/macplus/$d"
  [ -f "$dir/package.json" ] || continue
  (cd "$dir" && /opt/homebrew/bin/npm install --no-audit --no-fund --silent)
  echo "   $d ok"
done

echo "== secrets =="
if [ -r "$DEVTREE/.env.local" ]; then
  umask 077
  {
    echo "# MacPlus backend secrets — synced from $DEVTREE/.env.local by backend/update.sh ($(date +%F))."
    grep -E '^(ANTHROPIC_API_KEY|OPENAI_API_KEY|TOGETHER_API_KEY|SUPABASE_URL|SUPABASE_SERVICE_KEY)=' "$DEVTREE/.env.local"
  } > "$ENVFILE.tmp" && mv "$ENVFILE.tmp" "$ENVFILE"
  echo "   re-synced $(grep -c '=' "$ENVFILE") keys -> $ENVFILE"
else
  echo "   WARNING: $DEVTREE/.env.local not readable (TCC?) — keeping existing $ENVFILE as-is"
fi

echo "== restart long-runners (code/paint/surf pick up new code on next connection) =="
for n in $LONG_RUNNERS; do
  if launchctl print "gui/$UID_N/sh.macplus.$n" >/dev/null 2>&1; then
    launchctl kickstart -k "gui/$UID_N/sh.macplus.$n" && echo "   kickstarted sh.macplus.$n"
  else
    echo "   sh.macplus.$n not loaded (run install-agents.sh)"
  fi
done

sleep 2
echo "== fleet status =="
for spec in code:2324 paint:2325 surf:2326 imessage:2328 rsh:2329 mux:2330 diag:2331 quote:2332 bridge:2333 screen:2334 porthole:2336 pssh:2222 oracle:2338; do
  n="${spec%%:*}"; p="${spec##*:}"
  if /usr/sbin/netstat -an -p tcp | grep -q "\.$p .*LISTEN"; then
    echo "   $n :$p LISTEN"
  else
    echo "   $n :$p DOWN"
  fi
done
echo "done. (plist/wrapper changes need: bash install-agents.sh <name>)"
