#!/bin/zsh
# Inkling 2 Mini builds the weather page (OLA-435). Run as ola on the Studio.
set -u
export PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin
key=$(cat ~/.ola/model-key)
if ! curl -fsS -m 3 -H "Authorization: Bearer $key" http://127.0.0.1:8081/v1/models >/dev/null 2>&1; then
  launchctl bootout gui/$(id -u)/cx.ola.model 2>/dev/null; sleep 5
  (nohup ~/llama-head/build/bin/llama-server --model ~/ola-models/Inkling-2-Mini-Q8_0.gguf --mmproj ~/ola-models/mmproj-Inkling-2-Mini-Q8_0.gguf --alias inkling --host 127.0.0.1 --port 8081 --api-key-file ~/.ola/model-key --ctx-size 131072 --parallel 1 --n-gpu-layers 999 --jinja > ~/inkling-server.log 2>&1 < /dev/null &)
  for i in $(seq 1 60); do curl -fsS -m 3 -H "Authorization: Bearer $key" http://127.0.0.1:8081/v1/models >/dev/null 2>&1 && break; sleep 5; done
fi
curl -fsS -m 3 -H "Authorization: Bearer $key" http://127.0.0.1:8081/v1/models >/dev/null || { echo "MODEL NOT UP"; exit 1; }
run=~/hello-weather; mkdir -p $run/work $run/home; cd $run/work
cat > opencode.jsonc <<JSON
{
  "\$schema": "https://opencode.ai/config.json",
  "providers": { "box": { "name": "The box", "env": ["BOX_API_KEY"],
      "package": "@opencode/ai/providers/openai-compatible",
      "settings": { "baseURL": "http://127.0.0.1:8081/v1" },
      "models": { "m": { "modelID": "inkling", "name": "inkling",
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
  ~/ola-staging/current/apps/activist-ai/node_modules/.bin/opencode run --standalone --auto --model box/m "$(cat ${1:-~/hello-weather/task.txt})" \
  < /dev/null > $run/out-$start.txt 2> $run/err-$start.txt
echo "exit $?, $(( $(date +%s) - start )) s"; ls -la $run/work; tail -5 $run/out-$start.txt
echo RUN-FINISHED
