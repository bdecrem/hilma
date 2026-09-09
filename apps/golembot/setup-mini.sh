#!/usr/bin/env bash
#
# Install (or re-install) a GolemBot gateway on the Mac mini.
#
#   bash apps/golembot/setup-mini.sh strays          # from the iMac, over ssh
#   bash apps/golembot/setup-mini.sh strays --local  # already on the mini
#
# Idempotent: safe to re-run after editing bots/<name>/golem.yaml. It reinstalls
# the config, refreshes the launchd job, and restarts the gateway. Runtime state
# (.golem/, sessions, per-channel history) is never touched.
#
# It will NOT start a gateway whose token is missing — see set-token.sh.
set -euo pipefail

BOT="${1:-}"
MODE="${2:-}"
[ -n "$BOT" ] || { echo "usage: $0 <bot-name> [--local]" >&2; exit 1; }

HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$HERE/bots/$BOT/golem.yaml"
[ -f "$SRC" ] || { echo "no config at $SRC" >&2; exit 1; }

MINI_SSH="admin@171.66.240.175"          # pc-casbs-175.stanford.edu
LABEL="com.golembot.$BOT"

# The remote half. Reads the config on stdin so this works over a plain ssh pipe.
remote_script() {
cat <<'REMOTE'
set -euo pipefail
BOT="$1"
LABEL="com.golembot.$BOT"
BREW=/opt/homebrew/bin
# A non-interactive ssh shell has a minimal PATH, and npm's shebang is
# `#!/usr/bin/env node` — without this it dies with "env: node: not found".
export PATH="$BREW:$PATH"
DIR="$HOME/golembot/$BOT"
ENVF="$HOME/.golembot.env"
LOGD="$HOME/Library/Logs/golembot"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

command -v "$BREW/node" >/dev/null || { echo "node missing on the mini" >&2; exit 1; }
# golembot itself, plus discord.js — the Discord adapter is a peer dependency and
# the gateway starts happily WITHOUT it, just with Discord silently disconnected.
for pkg in golembot discord.js; do
  "$BREW/npm" ls -g --depth=0 2>/dev/null | grep -q "$pkg" || "$BREW/npm" install -g "$pkg" >/dev/null
done

mkdir -p "$DIR" "$LOGD" "$HOME/Library/LaunchAgents"
cat > "$DIR/golem.yaml"                     # config arrives on stdin

# Secrets file: create it empty rather than inventing a token.
if [ ! -f "$ENVF" ]; then
  printf '# GolemBot secrets. One KEY=value per line. Never commit this file.\n' > "$ENVF"
  chmod 600 "$ENVF"
fi

cat > "$PLIST" <<PLI
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>-lc</string>
    <!-- No "&&" here: this is XML, and a bare ampersand makes the plist unparseable. -->
    <string>set -e; set -a; . "\$HOME/.golembot.env"; set +a; cd "\$HOME/golembot/$BOT"; exec $BREW/node $BREW/../lib/node_modules/golembot/dist/cli.js gateway -d . --verbose</string>
  </array>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>StandardOutPath</key><string>$LOGD/$BOT.log</string>
  <key>StandardErrorPath</key><string>$LOGD/$BOT.log</string>
</dict>
</plist>
PLI

echo "config  -> $DIR/golem.yaml"
echo "launchd -> $PLIST"

# Refuse to start without a token; a tokenless gateway just crash-loops.
if ! grep -q '^DISCORD_BOT_TOKEN=.' "$ENVF" 2>/dev/null; then
  echo
  echo "NOT STARTED: DISCORD_BOT_TOKEN is not set in $ENVF"
  echo "Run  apps/golembot/set-token.sh $BOT  then re-run this script."
  exit 0
fi

launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$UID" "$PLIST"
launchctl enable "gui/$UID/$LABEL"
sleep 4
echo "--- status ---"
launchctl list | grep "$LABEL" || echo "(not listed)"
curl -s --max-time 5 http://127.0.0.1:3002/health && echo || echo "(health not answering yet; see $LOGD/$BOT.log)"
REMOTE
}

if [ "$MODE" = "--local" ]; then
  remote_script > /tmp/golembot-setup.sh
  bash /tmp/golembot-setup.sh "$BOT" < "$SRC"
else
  remote_script | ssh -o ConnectTimeout=15 "$MINI_SSH" "cat > /tmp/golembot-setup.sh"
  ssh -o ConnectTimeout=15 "$MINI_SSH" "bash /tmp/golembot-setup.sh '$BOT'" < "$SRC"
fi
