#!/bin/bash
#
# install-agents.sh [service ...] — install the MacPlus backend fleet as user
# LaunchAgents (gui/501). NO sudo needed: LaunchAgents live in
# ~/Library/LaunchAgents and are managed by the logged-in admin user. They are
# the right unit here (NOT root LaunchDaemons) because iMessage needs admin's
# GUI session for AppleScript Automation + Full Disk Access, and auto-login is
# on so they still start at boot.
#
# Always (re)writes the plists for ALL services; bootstraps only the ones named
# on the command line (default: every service whose port isn't owned by a
# legacy system daemon — i.e. everything except code & paint until
# retire-system-daemons.sh has run).
#
#   bash install-agents.sh                 # bootstrap surf mux imessage diag quote bridge
#   bash install-agents.sh code paint      # bootstrap the last two (after the sudo retire)
#   bash install-agents.sh surf            # re-bootstrap just one
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
RUNNER="$HERE/run-service.sh"
LA="$HOME/Library/LaunchAgents"
UID_N="$(id -u)"
ALL="code paint surf mux imessage diag quote bridge screen netspeed porthole pssh rsh pixel oracle imsghttp"
DEFAULT_BOOT="surf mux imessage diag quote bridge screen netspeed porthole pssh rsh pixel oracle imsghttp"
BOOT="${*:-$DEFAULT_BOOT}"

mkdir -p "$LA" "$HOME/Library/Logs"

for n in $ALL; do
  cat > "$LA/sh.macplus.$n.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>sh.macplus.$n</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$RUNNER</string>
    <string>$n</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>LimitLoadToSessionType</key><string>Aqua</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>HOME</key><string>$HOME</string>
  </dict>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/macplus-$n.out.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/macplus-$n.err.log</string>
</dict>
</plist>
EOF
done
echo "wrote $(echo $ALL | wc -w | tr -d ' ') plists to $LA"

for n in $BOOT; do
  launchctl bootout "gui/$UID_N/sh.macplus.$n" 2>/dev/null || true
  launchctl bootstrap "gui/$UID_N" "$LA/sh.macplus.$n.plist"
  echo "bootstrapped sh.macplus.$n"
done

sleep 2
echo "--- port status ---"
for n in $BOOT; do
  case "$n" in
    code) p=2324;; paint) p=2325;; surf) p=2326;; imessage) p=2328;; rsh) p=2329;;
    mux) p=2330;; diag) p=2331;; quote) p=2332;; bridge) p=2333;; screen) p=2334;; netspeed) p=2335;; pixel) p=2337;; oracle) p=2338;;
  esac
  if /usr/sbin/netstat -an -p tcp | grep -q "\.$p .*LISTEN"; then
    echo "  $n :$p LISTEN"
  else
    echo "  $n :$p NOT LISTENING (check ~/Library/Logs/macplus-$n.err.log)"
  fi
done
