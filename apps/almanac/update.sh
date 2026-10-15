#!/bin/bash
# On the mini: pull hilma, install deps, restart Almanac. From anywhere:
#   ssh admin@171.66.240.175 'bash ~/hilma-deploy/apps/almanac/update.sh'
set -euo pipefail
export PATH=/opt/homebrew/bin:/usr/local/bin:$PATH
cd "$(dirname "$0")"
git -C "$(git rev-parse --show-toplevel)" pull -q --ff-only
npm install --silent --no-audit --no-fund
launchctl kickstart -k "gui/$(id -u)/sh.almanac.server" 2>/dev/null || echo "not installed yet: run install.sh"
sleep 3
curl -s -m 5 http://localhost:3920/almanac/health || echo "(no answer on 3920 yet)"
echo
