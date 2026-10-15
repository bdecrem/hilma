#!/bin/bash
# On the mini, once: the launchd job for the Almanac server (port 3920) and its tunn3l tunnel
# (almanac.tunn3l.sh). Secrets live in ~/.almanac.env (chmod 600): ALMANAC_PASSCODE, ALMANAC_SECRET,
# CLAUDE_CODE_OAUTH_TOKEN (Bart's Max login, the same token Token Surfers uses).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
LOGS="$HOME/Library/Logs/almanac"
mkdir -p "$LOGS" "$HOME/Library/LaunchAgents" "$HOME/Library/Logs/tunn3l"
test -f "$HOME/.almanac.env" || { echo "missing ~/.almanac.env"; exit 1; }
export PATH=/opt/homebrew/bin:/usr/local/bin:$PATH
(cd "$HERE" && npm install --silent --no-audit --no-fund)

cat > "$HOME/Library/LaunchAgents/sh.almanac.server.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>sh.almanac.server</string>
  <key>ProgramArguments</key><array>
    <string>/bin/bash</string><string>-lc</string>
    <string>set -a; . \$HOME/.almanac.env; set +a; unset ANTHROPIC_API_KEY; exec /opt/homebrew/bin/node --no-warnings $HERE/server.mjs</string>
  </array>
  <key>WorkingDirectory</key><string>$HERE</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>$LOGS/server.out.log</string>
  <key>StandardErrorPath</key><string>$LOGS/server.err.log</string>
  <key>EnvironmentVariables</key><dict>
    <key>HOME</key><string>$HOME</string>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    <key>ALMANAC_PORT</key><string>3920</string>
  </dict>
</dict></plist>
PLIST

cat > "$HOME/Library/LaunchAgents/sh.tunn3l.almanac.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>sh.tunn3l.almanac</string>
  <key>ProgramArguments</key><array>
    <string>$HOME/.tunn3l/bin/tunn3l</string><string>http</string><string>3920</string><string>--subdomain</string><string>almanac</string>
  </array>
  <key>WorkingDirectory</key><string>$HOME</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/tunn3l/tunnel-almanac.out.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/tunn3l/tunnel-almanac.err.log</string>
  <key>EnvironmentVariables</key><dict>
    <key>HOME</key><string>$HOME</string>
    <key>PATH</key><string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
  </dict>
</dict></plist>
PLIST

for job in sh.almanac.server sh.tunn3l.almanac; do
  launchctl bootout "gui/$(id -u)/$job" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/$job.plist"
done
sleep 4
curl -s -m 5 http://localhost:3920/almanac/health; echo
