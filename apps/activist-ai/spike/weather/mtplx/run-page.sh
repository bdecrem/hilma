#!/bin/zsh
# run-page.sh <name> [task file]: OpenCode builds the weather page on the MTPLX server at :8000 (OLA-440).
# Run on the Studio as admin, after serve.sh. The same OpenCode version, settings and brief as
# ../run-inkling.sh; only the server's address and the model's name differ.
set -u
export PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin
t=~/mtplx-test; name=${1:?name}; task=${2:-$t/task.txt}
key=$(cat $t/api-key)
id=$(curl -fsS -m 5 -H "Authorization: Bearer $key" http://127.0.0.1:8000/v1/models | /usr/bin/python3 -c 'import json,sys; print(json.load(sys.stdin)["data"][0]["id"])') || { echo "MODEL NOT UP"; exit 1; }
run=$t/page-$name; mkdir -p $run/work $run/home; cd $run/work
cat > opencode.jsonc <<JSON
{
  "\$schema": "https://opencode.ai/config.json",
  "providers": { "box": { "name": "The box", "env": ["BOX_API_KEY"],
      "package": "@opencode/ai/providers/openai-compatible",
      "settings": { "baseURL": "http://127.0.0.1:8000/v1" },
      "models": { "m": { "modelID": "$id", "name": "inkling",
          "capabilities": { "tools": true, "input": ["text"], "output": ["text"] },
          "limit": { "context": 131072, "output": 16000 } } } } },
  "model": "box/m", "update": "disable",
  "permissions": [
    { "action": "*", "resource": "*", "effect": "allow" },
    { "action": "webfetch", "resource": "*", "effect": "deny" },
    { "action": "websearch", "resource": "*", "effect": "deny" },
    { "action": "external_directory", "resource": "*", "effect": "deny" } ]
}
JSON
start=$(date +%s)
env -i PATH="$PATH" HOME=$run/home XDG_CONFIG_HOME=$run/home/.config XDG_DATA_HOME=$run/home/.local/share \
  XDG_STATE_HOME=$run/home/.local/state XDG_CACHE_HOME=$run/home/.cache BOX_API_KEY="$key" \
  $t/oc/node_modules/.bin/opencode run --standalone --auto --model box/m "$(cat $task)" \
  < /dev/null > $run/out-$start.txt 2> $run/err-$start.txt
echo "exit $?, $(( $(date +%s) - start )) s"; ls -la $run/work; tail -5 $run/out-$start.txt
echo RUN-FINISHED
