#!/usr/bin/env bash
#
# Put a secret into the Mac mini's ~/.golembot.env without it appearing on a
# terminal, in shell history, or in a Claude transcript.
#
#   bash apps/golembot/set-token.sh strays
#   bash apps/golembot/set-token.sh strays DISCORD_BOT_TOKEN
#
# It prompts with the input hidden, writes the value over ssh via stdin, and
# restarts that bot's gateway. Nothing is echoed back.
set -euo pipefail

BOT="${1:-strays}"
KEY="${2:-DISCORD_BOT_TOKEN}"
MINI_SSH="admin@171.66.240.175"

printf 'Paste the value for %s (input hidden), then press Return: ' "$KEY" >&2
read -rs VALUE
printf '\n' >&2
[ -n "$VALUE" ] || { echo "empty, nothing written" >&2; exit 1; }

printf '%s' "$VALUE" | ssh -o ConnectTimeout=15 "$MINI_SSH" "
set -euo pipefail
ENVF=\"\$HOME/.golembot.env\"
VALUE=\$(cat)
touch \"\$ENVF\"; chmod 600 \"\$ENVF\"
# Drop any existing line for this key, then append the new one.
grep -v '^$KEY=' \"\$ENVF\" > \"\$ENVF.tmp\" 2>/dev/null || true
printf '%s=%s\n' '$KEY' \"\$VALUE\" >> \"\$ENVF.tmp\"
mv \"\$ENVF.tmp\" \"\$ENVF\"; chmod 600 \"\$ENVF\"
echo \"wrote $KEY (\${#VALUE} chars) to \$ENVF\"

LABEL=com.golembot.$BOT
PLIST=\"\$HOME/Library/LaunchAgents/\$LABEL.plist\"
# Only restart a job that is ALREADY loaded. First start is cutover.sh's job,
# which stops the old machine first so two gateways never share one token.
if launchctl list | grep -q \"\$LABEL\"; then
  launchctl bootout \"gui/\$UID/\$LABEL\" 2>/dev/null || true
  launchctl bootstrap \"gui/\$UID\" \"\$PLIST\"
  sleep 4
  launchctl list | grep \"\$LABEL\" || echo '(not listed)'
  curl -s --max-time 5 http://127.0.0.1:3002/health && echo || echo '(health not answering yet)'
else
  echo \"$BOT is not running here; start it with cutover.sh (first move) or setup-mini.sh\"
fi
"
unset VALUE
