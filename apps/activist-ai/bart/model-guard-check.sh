#!/bin/bash
# Only Ola's models on Bart's opencode (OLA-249): runs the real run.sh that `ola-bart.sh files`
# writes, with opencode 2.3.0, in a scratch HOME and state, under sandbox-exec with every outbound
# connection but loopback refused (DNS too), on ports of its own. No launchd, nothing of the real
# install is touched. A stand-in model (apple/tools/planted-model.py) counts what reaches it.
#
#   bash bart/model-guard-check.sh
#
# Cases: (1) at start only ola/* is offered; (2) the settings file deleted while it runs: still only
# ola/*; (3) damaged while it runs: same; (4) rewritten with another provider made the default: the
# guard stops it (the sentence in the log) or only ola/* stays offered, and the stand-in gets 0
# requests; (5) started again: the settings are restored from the sealed copy, only ola/*; (6) the
# sealed copy changed: the start refuses.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
AI="$(cd "$HERE/.." && pwd)"
T="$(mktemp -d /tmp/ola-mg.XXXXXX)"
P=14310; F=14311; D=14312
export HOME="$T/home" OLA_BART_STATE="$T/state" OLA_BART_PROJECT="$T/project" OLA_BART_HOST=127.0.0.1 \
       OLA_BART_PORT=$P OLA_BART_MODEL_PORT=$F OLA_BART_PHONE_PORT=$D
mkdir -p "$HOME/.ola" "$OLA_BART_STATE/opencode/node_modules/.bin" "$T/log"
umask 077
printf 'OPENCODE_PASSWORD=%s\nBOX_API_KEY=%s\n' "$(openssl rand -hex 16)" "$(openssl rand -hex 16)" > "$HOME/.ola/bart.env"
chmod 600 "$HOME/.ola/bart.env"
ln -s "$AI/node_modules/.bin/opencode" "$OLA_BART_STATE/opencode/node_modules/.bin/opencode"
PW=$(sed -n 's/^OPENCODE_PASSWORD=//p' "$HOME/.ola/bart.env")
fails=0; ok() { echo "PASS  $*"; }; bad() { echo "FAIL  $*"; fails=$((fails+1)); }
LIVE="$OLA_BART_STATE/config/opencode/opencode.jsonc"
PROFILE='(version 1)
(allow default)
(deny network-outbound)
(allow network-outbound (remote ip "localhost:*"))'

python3 "$AI/apple/tools/planted-model.py" > "$T/planted.out" 2>&1 &
pm=$!
for _ in $(seq 1 40); do grep -q '^port ' "$T/planted.out" && break; sleep 0.25; done
PMPORT=$(sed -n 's/^port //p' "$T/planted.out" | head -1)
rs=""
cleanup() { [ -n "$rs" ] && kill "$rs" 2>/dev/null; pkill -P "$rs" 2>/dev/null; kill "$pm" 2>/dev/null; wait 2>/dev/null; }
trap cleanup EXIT

bash "$HERE/ola-bart.sh" files > "$T/log/files.log" 2>&1 || { cat "$T/log/files.log"; echo "FAIL  ola-bart.sh files"; exit 1; }

start() { /usr/bin/sandbox-exec -p "$PROFILE" "$OLA_BART_STATE/bin/run.sh" >> "$T/log/run.log" 2>&1 & rs=$!; }
models() { curl -s -m 5 -u "opencode:$PW" "http://127.0.0.1:$P/api/model" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).data.map(m=>m.providerID+"/"+m.id).sort().join(" "))}catch{console.log("NO-ANSWER")}})'; }
dflt() { curl -s -m 5 -u "opencode:$PW" "http://127.0.0.1:$P/api/model/default" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const m=JSON.parse(s).data;console.log(m?m.providerID+"/"+m.id:"none")}catch{console.log("NO-ANSWER")}})'; }
only_ola() { local m x; m=$(models); [ "$m" != NO-ANSWER ] && [ -n "$m" ] || return 1; for x in $m; do [[ $x == ola/* ]] || return 1; done; [[ $(dflt) == ola/* ]]; }
wait_up() { for _ in $(seq 1 120); do grep -q "only Ola's models" "$T/log/run.log" 2>/dev/null && return 0; kill -0 "$rs" 2>/dev/null || return 1; sleep 0.5; done; return 1; }

# (1)
start
if wait_up && only_ola; then ok "1 at start only Ola's models: $(models) (default $(dflt))"; else bad "1 at start: $(models) / $(dflt)"; tail -20 "$T/log/run.log"; fi

# (2)
rm -f "$LIVE"; sleep 5
if kill -0 "$rs" 2>/dev/null && only_ola; then ok "2 settings deleted while running: $(models)"; else bad "2 deleted: $(models) / $(dflt)"; fi

# (3)
printf '{ this is not json' > "$LIVE"; sleep 5
if kill -0 "$rs" 2>/dev/null && only_ola; then ok "3 settings damaged while running: $(models)"; else bad "3 damaged: $(models) / $(dflt)"; fi

# (4)
cat > "$LIVE" <<JSON
{ "providers": { "other": { "name": "Other", "env": [], "package": "@opencode/ai/providers/openai-compatible",
    "settings": { "baseURL": "http://127.0.0.1:$PMPORT/v1", "apiKey": "x" },
    "models": { "x": { "modelID": "x", "name": "X", "capabilities": { "tools": true, "input": ["text"], "output": ["text"] }, "limit": { "context": 8000, "output": 1000 } } } } },
  "model": "other/x",
  "policies": [ { "action": "provider.use", "resource": "*", "effect": "allow" } ] }
JSON
sleep 6
count=$(curl -s -m 3 "http://127.0.0.1:$PMPORT/count" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).chat))')
if ! kill -0 "$rs" 2>/dev/null; then
  if grep -q "Ola stopped because its settings on the Ola machine are missing or damaged" "$T/log/run.log" && [ "$count" = 0 ]; then
    ok "4 another provider planted as the default: the guard stopped it (\"$(grep -o 'offered: [^)]*' "$T/log/run.log" | tail -1)\"), stand-in got $count requests"
  else bad "4 stopped without the sentence, or stand-in got $count"; tail -5 "$T/log/run.log"; fi
elif only_ola && [ "$count" = 0 ]; then ok "4 another provider planted: still only Ola's models ($(models)), stand-in got $count requests"
else bad "4 planted: $(models) / $(dflt), stand-in $count"; fi
kill "$rs" 2>/dev/null; pkill -P "$rs" 2>/dev/null; wait "$rs" 2>/dev/null; rs=""
for _ in $(seq 1 20); do lsof -nP -iTCP:$P -sTCP:LISTEN >/dev/null 2>&1 || break; sleep 0.5; done

# (5)
: > "$T/log/run.log"; start
if wait_up && only_ola && cmp -s "$LIVE" "$OLA_BART_STATE/bin/opencode.jsonc.sealed"; then ok "5 started again: settings restored from the sealed copy, $(models)"; else bad "5 restart: $(models)"; tail -10 "$T/log/run.log"; fi
kill "$rs" 2>/dev/null; pkill -P "$rs" 2>/dev/null; wait "$rs" 2>/dev/null; rs=""
for _ in $(seq 1 20); do lsof -nP -iTCP:$P -sTCP:LISTEN >/dev/null 2>&1 || break; sleep 0.5; done

# (6)
chmod 600 "$OLA_BART_STATE/bin/opencode.jsonc.sealed"; echo '// changed' >> "$OLA_BART_STATE/bin/opencode.jsonc.sealed"
: > "$T/log/run.log"
/usr/bin/sandbox-exec -p "$PROFILE" "$OLA_BART_STATE/bin/run.sh" >> "$T/log/run.log" 2>&1
if grep -q "sealed settings were changed" "$T/log/run.log" && ! lsof -nP -iTCP:$P -sTCP:LISTEN >/dev/null 2>&1; then ok "6 sealed copy changed: the start refused"; else bad "6 sealed copy changed: $(tail -3 "$T/log/run.log")"; fi

echo "stand-in model requests in all: $(curl -s -m 3 "http://127.0.0.1:$PMPORT/count")"
echo "logs: $T/log"
[ $fails = 0 ] && echo "all passed" || { echo "$fails failed"; exit 1; }
