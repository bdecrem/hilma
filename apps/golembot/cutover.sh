#!/usr/bin/env bash
#
# One-time move of the Strays bot from the home iMac to the Mac mini.
#
#   bash apps/golembot/cutover.sh
#
# Order matters. Two gateways holding the same Discord token both answer, so the
# iMac job is stopped BEFORE the mini one starts. The iMac's code and config are
# left on disk untouched — only its launchd job is disabled, so it can be
# brought back with one command.
#
# You need the bot token. It lives in golem.yaml on the iMac, inside ~/Documents,
# which macOS hides from ssh — so read it there in person, or (easier) reset it:
#   Discord Developer Portal -> Applications -> Strays -> Bot -> Reset Token
# Resetting also guarantees the old gateway cannot answer any more.
set -euo pipefail

MINI_SSH="admin@171.66.240.175"
IMAC_SSH="bart-imac"
BOT=strays
LABEL="com.golembot.$BOT"

printf 'Paste the Strays bot token (hidden), then Return: ' >&2
read -rs TOKEN
printf '\n' >&2
[ -n "$TOKEN" ] || { echo "empty, aborting" >&2; exit 1; }

echo "==> 1/4 stopping the gateway on the home iMac (code is kept)"
ssh -o ConnectTimeout=15 "$IMAC_SSH" "
  launchctl bootout gui/\$UID/$LABEL 2>/dev/null || true
  launchctl disable gui/\$UID/$LABEL 2>/dev/null || true
  mkdir -p ~/Library/LaunchAgents/disabled
  [ -f ~/Library/LaunchAgents/$LABEL.plist ] && mv ~/Library/LaunchAgents/$LABEL.plist ~/Library/LaunchAgents/disabled/$LABEL.plist || true
  echo 'iMac: job disabled and plist parked in ~/Library/LaunchAgents/disabled/'
  pgrep -f 'golembot/dist/cli.js gateway' >/dev/null && echo 'iMac: NOTE other golembot gateways still running (bang) — expected' || true
"

echo "==> 2/4 writing the token on the mini"
printf '%s' "$TOKEN" | ssh -o ConnectTimeout=15 "$MINI_SSH" '
  set -euo pipefail
  ENVF="$HOME/.golembot.env"; V=$(cat)
  touch "$ENVF"; chmod 600 "$ENVF"
  grep -v "^DISCORD_BOT_TOKEN=" "$ENVF" > "$ENVF.tmp" 2>/dev/null || true
  printf "DISCORD_BOT_TOKEN=%s\n" "$V" >> "$ENVF.tmp"
  mv "$ENVF.tmp" "$ENVF"; chmod 600 "$ENVF"
  echo "mini: token written (${#V} chars)"
'
unset TOKEN

echo "==> 3/4 starting the gateway on the mini"
ssh -o ConnectTimeout=15 "$MINI_SSH" "
  P=\$HOME/Library/LaunchAgents/$LABEL.plist
  launchctl bootout gui/\$UID/$LABEL 2>/dev/null || true
  launchctl enable gui/\$UID/$LABEL 2>/dev/null || true
  launchctl bootstrap gui/\$UID \"\$P\"
  sleep 8
"

echo "==> 4/4 verifying"
ssh -o ConnectTimeout=15 "$MINI_SSH" '
  echo "--- launchd ---"; launchctl list | grep golembot || echo "(not listed)"
  echo "--- health ---";  curl -s --max-time 5 http://127.0.0.1:3002/health; echo
  echo "--- status ---";  curl -s --max-time 5 http://127.0.0.1:3002/api/status; echo
  echo "--- discord in the log ---"
  grep -iE "discord|invalid|error" ~/Library/Logs/golembot/strays.log 2>/dev/null | tail -5
'
echo
echo "Done. In Discord, @mention Strays in #straykids to confirm it answers."
echo "To roll back: move the plist out of ~/Library/LaunchAgents/disabled on the iMac,"
echo "launchctl enable + bootstrap it there, and stop the mini job."
