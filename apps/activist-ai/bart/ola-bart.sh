#!/bin/bash
# Bart's opencode: one `opencode serve` on the Ola machine, for Bart's own Mac and iPhone apps
# (apps/activist-ai/apple). Runs as the account that runs it (admin on the mini), listens only on
# the machine's Tailscale address, wants Basic auth, and reaches the model through Ola's gateway
# with its own caller token. See README.md beside this file.
#
#   bart/ola-bart.sh install     first time, or again after a change here (keeps the password)
#   bart/ola-bart.sh status      the job, the listener, and a 401/200 probe
#   bart/ola-bart.sh start|stop  load or unload the launchd job cx.ola.bart
#   bart/ola-bart.sh token       put the bart caller back in the gateway's tokens file (see README)
#   bart/ola-bart.sh password    print the password ONCE, for the apps' Keychain (on the machine only)
#   bart/ola-bart.sh uninstall   remove the job and the token; keeps ~/ola-bart and the password file
#
# Nothing here prints a secret, except `password`, which exists to do exactly that.
set -euo pipefail
export PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin

HERE="$(cd "$(dirname "$0")" && pwd)"
AI="$(cd "$HERE/.." && pwd)"                      # apps/activist-ai (package.json pins opencode)
LABEL=cx.ola.bart
PROJECT="$HOME/ola-bart"                          # what the agent works in
STATE="$HOME/.ola-bart"                           # opencode's own install, config, data, logs
ENVF="$HOME/.ola/bart.env"                        # OPENCODE_PASSWORD, BOX_API_KEY (600)
TOKENS="$HOME/.ola/gateway-tokens"                # the gateway reloads this by itself
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/ola/bart.log"
PORT="${OLA_BART_PORT:-4310}"
FPORT="${OLA_BART_MODEL_PORT:-4311}"              # the forwarder to the gateway, for "On this Mac"
HOST="${OLA_BART_HOST:-$(tailscale ip -4 2>/dev/null | head -1 || true)}"
[ -n "$HOST" ] || HOST="$(/Applications/Tailscale.app/Contents/MacOS/Tailscale ip -4 2>/dev/null | head -1 || true)"
UID_="$(id -u)"

die() { echo "ola-bart: $*" >&2; exit 1; }

# The bart caller in the gateway's tokens file: added beside the workspaces' entries, written
# beside and renamed into place (the way workspace/ws.mjs writes it), so the gateway never reads
# half a file. The gateway picks the change up within seconds, with no restart.
add_token() {
  node - "$TOKENS" "$ENVF" <<'JS'
const fs = require('fs')
const [file, envf] = process.argv.slice(2)
const env = Object.fromEntries(fs.readFileSync(envf, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const token = env.BOX_API_KEY
if (!token) throw new Error('no BOX_API_KEY in the env file')
const text = fs.readFileSync(file, 'utf8').trim()
if (!/^GATEWAY_TOKENS=[^\n]*$/.test(text)) throw new Error('the tokens file is not one GATEWAY_TOKENS= line; left alone')
const entries = text.slice('GATEWAY_TOKENS='.length).split(',').filter(Boolean)
const others = entries.filter((e) => !e.startsWith('bart:'))
if (others.length + 1 === entries.length && entries.includes(`bart:${token}`)) { console.log('token: already there'); process.exit(0) }
fs.writeFileSync(`${file}.bart.tmp`, `GATEWAY_TOKENS=${[...others, `bart:${token}`].join(',')}\n`, { mode: 0o600 })
fs.chmodSync(`${file}.bart.tmp`, 0o600)
fs.renameSync(`${file}.bart.tmp`, file)
console.log(`token: added (${others.length} other callers kept)`)
JS
}

remove_token() {
  node - "$TOKENS" <<'JS'
const fs = require('fs')
const [file] = process.argv.slice(2)
const text = fs.readFileSync(file, 'utf8').trim()
const entries = text.slice('GATEWAY_TOKENS='.length).split(',').filter(Boolean)
const others = entries.filter((e) => !e.startsWith('bart:'))
if (others.length === entries.length) process.exit(0)
fs.writeFileSync(`${file}.bart.tmp`, `GATEWAY_TOKENS=${others.join(',')}\n`, { mode: 0o600 })
fs.chmodSync(`${file}.bart.tmp`, 0o600)
fs.renameSync(`${file}.bart.tmp`, file)
console.log('token: removed')
JS
}

write_config() {
  # Outside the project folder on purpose: the agent edits ~/ola-bart, and must not be able to
  # rewrite its own permissions there. Later rules win.
  mkdir -p "$STATE/config/opencode"
  # The reaction rules, word for word from apps/activist-ai/README.md ("Slash commands and reactions").
  cat > "$STATE/config/opencode/ola-reactions.md" <<'MD'
Reactions. You may react to the person's message with one emoji, like a reaction in a chat app.
To react, make the very first line of your reply exactly [[ola:react NAME]], with NAME one of:
eyes (you are on it), thanks (they thanked or complimented you), ok (noted: an instruction or
preference that needs no work), done (you finished what they asked), party (they share a win),
think (you need something from them first), oops (they caught your mistake).
Use at most one reaction, only on that first line, and never explain it or mention it.
If the message is only thanks or a compliment, reply with the marker line alone and nothing else.
MD
  cat > "$STATE/config/opencode/opencode.jsonc" <<JSON
// Bart's opencode (apps/activist-ai/bart/ola-bart.sh writes this; edit the script, not this file).
// These are the agent's defaults, not a wall: Bart approves every shell command, and a command
// can reach anything the admin account can.
{
  "\$schema": "https://opencode.ai/config.json",
  "providers": {
    "ola": {
      "name": "Ola",
      "env": ["BOX_API_KEY"],
      "package": "@opencode/ai/providers/openai-compatible",
      "settings": { "baseURL": "http://127.0.0.1:4180/v1" },
      "models": {
        "general": {
          "modelID": "general",
          "name": "General",
          "capabilities": { "tools": true, "input": ["text"], "output": ["text"] },
          "limit": { "context": 131072, "output": 16000 }
        }
      }
    }
  },
  "model": "ola/general",
  "update": "disable",
  "share": "disabled",
  "instructions": ["$STATE/config/opencode/ola-reactions.md"],
  // Only Ola's gateway: opencode otherwise offers its own free hosted models (opencode.ai), which
  // would send the conversation to a third party.
  "policies": [
    { "action": "provider.use", "resource": "*", "effect": "deny" },
    { "action": "provider.use", "resource": "ola", "effect": "allow" },
    { "action": "tool.use", "resource": "shell:*GAMI*", "effect": "deny" },
    { "action": "tool.use", "resource": "shell:*hilma-*", "effect": "deny" },
    { "action": "tool.use", "resource": "shell:*ola-staging*", "effect": "deny" },
    { "action": "tool.use", "resource": "shell:*launchctl*", "effect": "deny" }
  ],
  "permissions": [
    { "action": "*", "resource": "*", "effect": "allow" },
    { "action": "shell", "resource": "*", "effect": "ask" },
    { "action": "bash", "resource": "*", "effect": "ask" },
    { "action": "edit", "resource": "*", "effect": "ask" },
    { "action": "write", "resource": "*", "effect": "ask" },
    { "action": "apply_patch", "resource": "*", "effect": "ask" },
    { "action": "webfetch", "resource": "*", "effect": "ask" },
    { "action": "websearch", "resource": "*", "effect": "ask" },
    // Nothing outside ~/ola-bart through the agent's own file tools, for now.
    { "action": "external_directory", "resource": "*", "effect": "deny" },
    // What serves real people on this machine. A command naming any of these is refused
    // before it is even asked about.
    { "action": "shell", "resource": "*GAMI*", "effect": "deny" },
    { "action": "shell", "resource": "*almanac*", "effect": "deny" },
    { "action": "shell", "resource": "*Almanac*", "effect": "deny" },
    { "action": "shell", "resource": "*hilma-*", "effect": "deny" },
    { "action": "shell", "resource": "*ola-staging*", "effect": "deny" },
    { "action": "shell", "resource": "*.ola/*", "effect": "deny" },
    { "action": "shell", "resource": "*.ola-frontdesk*", "effect": "deny" },
    { "action": "shell", "resource": "*bluebubbles*", "effect": "deny" },
    { "action": "shell", "resource": "*BlueBubbles*", "effect": "deny" },
    { "action": "shell", "resource": "*launchctl*", "effect": "deny" },
    { "action": "shell", "resource": "*container *", "effect": "deny" },
    { "action": "shell", "resource": "*tunn3l*", "effect": "deny" },
    { "action": "shell", "resource": "*sudo *", "effect": "deny" },
    { "action": "shell", "resource": "*venture*", "effect": "deny" },
    { "action": "bash", "resource": "*GAMI*", "effect": "deny" },
    { "action": "bash", "resource": "*hilma-*", "effect": "deny" },
    { "action": "bash", "resource": "*ola-staging*", "effect": "deny" },
    { "action": "bash", "resource": "*launchctl*", "effect": "deny" }
  ]
}
JSON
}

write_runner() {
  mkdir -p "$STATE/bin"
  cat > "$STATE/bin/run.sh" <<SH
#!/bin/bash
# launchd's entry for $LABEL. Secrets come from the env file, never the command line.
set -euo pipefail
export PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
[ "\$(stat -f %Lp "$ENVF")" = 600 ] || { echo "the env file must be mode 600" >&2; exit 1; }
set -a; . "$ENVF"; set +a
export XDG_CONFIG_HOME="$STATE/config" XDG_DATA_HOME="$STATE/data" XDG_STATE_HOME="$STATE/state" XDG_CACHE_HOME="$STATE/cache"
cd "$PROJECT"
# Two processes, one job: the forwarder for "On this Mac" mode (model requests from Bart's Mac to
# the gateway) and opencode. If either stops, both stop, and launchd starts the pair again.
node "$STATE/bin/forward.mjs" "$HOST" "$FPORT" 4180 &
fwd=\$!
"$STATE/opencode/node_modules/.bin/opencode" serve --hostname "$HOST" --port "$PORT" &
oc=\$!
trap 'kill \$fwd \$oc 2>/dev/null' TERM INT EXIT
# macOS's bash 3.2 has no wait -n.
while kill -0 \$fwd 2>/dev/null && kill -0 \$oc 2>/dev/null; do sleep 2; done
exit 1
SH
  cp "$HERE/forward.mjs" "$STATE/bin/forward.mjs"
  chmod 700 "$STATE/bin/run.sh"
}

write_plist() {
  mkdir -p "$(dirname "$PLIST")" "$(dirname "$LOG")"
  cat > "$PLIST" <<XML
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>$STATE/bin/run.sh</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
XML
}

probe() {
  local pw code_no code_yes
  code_no=$(curl -s -o /dev/null -m 5 -w '%{http_code}' "http://$HOST:$PORT/api/session" || true)
  pw=$(sed -n 's/^OPENCODE_PASSWORD=//p' "$ENVF")
  code_yes=$(curl -s -o /dev/null -m 5 -w '%{http_code}' -K - <<<"user = \"opencode:$pw\"
url = \"http://$HOST:$PORT/api/session\"" || true)
  echo "http://$HOST:$PORT  without the password: $code_no  with it: $code_yes"
}

case "${1:-}" in
  install)
    [ -n "$HOST" ] || die "no Tailscale address found; set OLA_BART_HOST"
    [ -f "$TOKENS" ] || die "no $TOKENS: is Ola's gateway set up on this machine?"
    mkdir -p "$PROJECT" "$STATE/opencode" "$STATE/data" "$STATE/state" "$STATE/cache"
    chmod 700 "$STATE"
    # opencode 2.3.0, exactly what apps/activist-ai pins (npm checks every package's sha512).
    cp "$AI/package.json" "$AI/package-lock.json" "$STATE/opencode/"
    (cd "$STATE/opencode" && npm ci --silent --no-audit --no-fund >/dev/null)
    echo "opencode: $("$STATE/opencode/node_modules/.bin/opencode" --version)"
    if [ ! -f "$ENVF" ]; then
      umask 077
      printf 'OPENCODE_PASSWORD=%s\nBOX_API_KEY=%s\n' "$(openssl rand -hex 24)" "$(openssl rand -hex 24)" > "$ENVF"
      chmod 600 "$ENVF"
      echo "password: made (never printed; see 'password')"
    else
      echo "password: kept"
    fi
    add_token
    write_config
    write_runner
    write_plist
    launchctl bootout "gui/$UID_/$LABEL" 2>/dev/null || true
    # bootout returns before the job is gone; bootstrap before then fails with error 5.
    for _ in $(seq 1 40); do launchctl print "gui/$UID_/$LABEL" >/dev/null 2>&1 || break; sleep 0.25; done
    launchctl bootstrap "gui/$UID_" "$PLIST"
    for _ in $(seq 1 40); do curl -s -o /dev/null -m 1 "http://$HOST:$PORT/api/info" && break; sleep 0.5; done
    probe
    ;;
  start) launchctl bootstrap "gui/$UID_" "$PLIST" && echo started ;;
  stop) launchctl bootout "gui/$UID_/$LABEL" && echo stopped ;;
  restart) launchctl kickstart -k "gui/$UID_/$LABEL" && echo restarted ;;
  token) add_token ;;
  status)
    launchctl print "gui/$UID_/$LABEL" 2>/dev/null | grep -E '^\s*(state|pid|last exit code) =' || echo "job: not loaded"
    lsof -nP -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | awk 'NR>1{print "listening:", $9}'
    grep -q 'bart:' "$TOKENS" && echo "gateway token: present" || echo "gateway token: MISSING (run: ola-bart.sh token)"
    probe
    ;;
  password)
    # For putting it into the apps' Keychain. Run it in your own terminal on the machine.
    sed -n 's/^OPENCODE_PASSWORD=//p' "$ENVF"
    ;;
  model-token)
    # The gateway token for the Mac app's "On this Mac" mode (it goes into the Mac's Keychain).
    sed -n 's/^BOX_API_KEY=//p' "$ENVF"
    ;;
  uninstall)
    launchctl bootout "gui/$UID_/$LABEL" 2>/dev/null || true
    rm -f "$PLIST"
    remove_token
    echo "removed the job and the token; kept $PROJECT, $STATE (sessions) and $ENVF"
    ;;
  *) sed -n '2,15p' "$0"; exit 1 ;;
esac
