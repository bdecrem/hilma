#!/bin/zsh
# run-plain.sh <name> "<the request, as the person types it>": plain OpenCode and Ola's model, nothing of
# Ola's in between (OLA-455). No instruction file, no skills, no Ola tools, no sealed computer: OpenCode's
# own defaults in an empty folder, the model server Ola uses on this machine (127.0.0.1:8080, its key file).
# Run on the Studio as ola. Prints the time from start to finish and what was made.
set -u
export PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin
t=~/plain-test; name=${1:?name}; ask=${2:?the request}
[ -x $t/oc/node_modules/.bin/opencode ] || { mkdir -p $t/oc && (cd $t/oc && npm install --silent @opencode/cli@2.4.2 >/dev/null 2>&1) || { echo "OPENCODE NOT INSTALLED"; exit 1; }; }
key=$(cat ~/.ola/model-key)
id=$(curl -fsS -m 5 -H "Authorization: Bearer $key" http://127.0.0.1:8080/v1/models | /usr/bin/python3 -c 'import json,sys; print(json.load(sys.stdin)["data"][0]["id"])') || { echo "MODEL NOT UP"; exit 1; }
run=$t/$name; rm -rf $run; mkdir -p $run/work $run/home; cd $run/work
cat > opencode.jsonc <<JSON
{
  "\$schema": "https://opencode.ai/config.json",
  "providers": { "box": { "name": "The box", "env": ["BOX_API_KEY"],
      "package": "@opencode/ai/providers/openai-compatible",
      "settings": { "baseURL": "http://127.0.0.1:8080/v1" },
      "models": { "m": { "modelID": "$id", "name": "inkling",
          "capabilities": { "tools": true, "input": ["text"], "output": ["text"] },
          "limit": { "context": 131072, "output": 16000 } } } } },
  "model": "box/m", "update": "disable",
  "permissions": [
    { "action": "*", "resource": "*", "effect": "allow" },
    { "action": "external_directory", "resource": "*", "effect": "deny" } ]
}
JSON
start=$(date +%s)
env -i PATH="$PATH" HOME=$run/home XDG_CONFIG_HOME=$run/home/.config XDG_DATA_HOME=$run/home/.local/share \
  XDG_STATE_HOME=$run/home/.local/state XDG_CACHE_HOME=$run/home/.cache BOX_API_KEY="$key" \
  $t/oc/node_modules/.bin/opencode run --standalone --auto --model box/m "$ask" \
  < /dev/null > $run/out.txt 2> $run/err.txt
echo "exit $?, $(( $(date +%s) - start )) s"
ls -la $run/work | grep -v opencode.jsonc | tail -n +2
echo "steps: $(grep -a -c '' $run/err.txt) lines of log; last words:"; tail -c 500 $run/out.txt
echo RUN-FINISHED
