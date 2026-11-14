#!/bin/bash
# Installs or updates the Venture runner on the Mac mini. Run it there:
#   bash ~/hilma-venture/apps/venture/runner/install.sh
# The checkout ~/hilma-venture is the runner's own (a clone of main; the dev
# tree and the bots' checkouts are left alone). Its .env.local holds only what
# the venture scripts read (SUPABASE_URL, SUPABASE_SERVICE_KEY, VENTURE_KEY,
# SENDGRID_API_KEY) and is copied from another machine, never created here.
set -euo pipefail
export PATH=/opt/homebrew/bin:$PATH
DIR=$HOME/hilma-venture
[ -d "$DIR/.git" ] || git clone --quiet https://github.com/bdecrem/hilma "$DIR"
cd "$DIR"
git pull --ff-only --quiet
[ -f .env.local ] || { echo "missing $DIR/.env.local (copy the four venture keys into it)"; exit 1; }
# The Claude login for unattended runs: CLAUDE_CODE_OAUTH_TOKEN in a file of its
# own, as the Almanac and the Token Surfers agent on this machine have theirs.
[ -f "$HOME/.venture-runner.env" ] || { echo "missing ~/.venture-runner.env (one line: CLAUDE_CODE_OAUTH_TOKEN=..., chmod 600)"; exit 1; }
if grep -q '^ANTHROPIC_API_KEY=' .env.local; then echo "remove ANTHROPIC_API_KEY from $DIR/.env.local: the runner uses the machine's Claude login"; exit 1; fi
# the scripts need @supabase/supabase-js; borrow the dev tree's packages
[ -e node_modules ] || ln -s "$HOME/Documents/code/hilma/node_modules" node_modules
mkdir -p "$HOME/Library/Logs/venture-runner" apps/venture/private
node scripts/venture/sync.mjs pull
cp apps/venture/runner/sh.venture.runner.plist "$HOME/Library/LaunchAgents/"
launchctl bootout "gui/$(id -u)/sh.venture.runner" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/sh.venture.runner.plist"
echo "installed; state:"; node scripts/venture/runner.mjs status
