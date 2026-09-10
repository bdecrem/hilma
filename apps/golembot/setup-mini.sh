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

# Role-mention patch. Discord's picker turns "@Strays" into the bot's managed ROLE
# token (<@&roleId>), which the stock adapter does not count as a mention, so
# mention-only bots stay silent. Re-applied here because a golembot upgrade
# overwrites dist/. Idempotent; a missing patch file is not fatal.
for pf in discord-role-mention smart-stream; do
  PATCHF="$HOME/golembot/$pf.mjs"
  [ -f "$PATCHF" ] && "$BREW/node" "$PATCHF" || echo "(no $pf patch on disk)"
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

# bootout is asynchronous: it returns before launchd has finished tearing the job
# down, and bootstrapping into that window fails with "Bootstrap failed: 5: Input/
# output error" — leaving the bot stopped. Wait for the label to actually go.
launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || true
for _ in $(seq 1 25); do
  launchctl print "gui/$UID/$LABEL" >/dev/null 2>&1 || break
  sleep 0.2
done
launchctl bootstrap "gui/$UID" "$PLIST"
launchctl enable "gui/$UID/$LABEL"
sleep 4
echo "--- status ---"
launchctl list | grep "$LABEL" || echo "(not listed)"
curl -s --max-time 5 http://127.0.0.1:3002/health && echo || echo "(health not answering yet; see $LOGD/$BOT.log)"
REMOTE
}

if [ "$MODE" = "--local" ]; then
  mkdir -p ~/golembot
  cp "$HERE/patches/"*.mjs ~/golembot/
  remote_script > /tmp/golembot-setup.sh
  bash /tmp/golembot-setup.sh "$BOT" < "$SRC"
else
  ssh -o ConnectTimeout=15 "$MINI_SSH" 'mkdir -p ~/golembot'
  scp -q "$HERE/patches/"*.mjs "$MINI_SSH:~/golembot/"
  remote_script | ssh -o ConnectTimeout=15 "$MINI_SSH" "cat > /tmp/golembot-setup.sh"
  ssh -o ConnectTimeout=15 "$MINI_SSH" "bash /tmp/golembot-setup.sh '$BOT'" < "$SRC"
fi
