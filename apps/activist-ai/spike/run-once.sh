#!/bin/zsh
# One agent run on the made-up survey, in a throwaway folder with its own empty home.
#   spike/run-once.sh <label> <model id at the endpoint> [base url]
# Needs BOX_API_KEY in the environment: the key for that endpoint. Through the gateway
# (base url http://127.0.0.1:4180/v1) that is the workspace's gateway token and the model
# id is the gateway's name for the model; straight at Together.ai it is the Together key.
# Prints the time taken, the check results and where the run's files are.
set -u
here=${0:A:h}
label=$1; model=$2; base=${3:-https://api.together.xyz/v1}
run=${SPIKE_DIR:-${TMPDIR:-/tmp}/activist-ai-spike}/$label-$(date +%H%M%S)
mkdir -p $run/work $run/home
python3 $here/make-survey.py $run/work > $run/truth.json
cat > $run/work/opencode.jsonc <<JSON
{
  "\$schema": "https://opencode.ai/config.json",
  "providers": {
    "box": {
      "name": "The box",
      "env": ["BOX_API_KEY"],
      "package": "@opencode/ai/providers/openai-compatible",
      "settings": { "baseURL": "$base" },
      "models": {
        "m": {
          "modelID": "$model",
          "name": "$label",
          "capabilities": { "tools": true, "input": ["text"], "output": ["text"] },
          "limit": { "context": ${SPIKE_CONTEXT:-131072}, "output": 16000 }
        }
      }
    }
  },
  "model": "box/m",
  "update": "disable",
  "permissions": [
    { "action": "*", "resource": "*", "effect": "allow" },
    { "action": "webfetch", "resource": "*", "effect": "deny" },
    { "action": "websearch", "resource": "*", "effect": "deny" },
    { "action": "external_directory", "resource": "*", "effect": "deny" }
  ]
}
JSON
cd $run/work
start=$(date +%s)
env -i PATH="$PATH" HOME=$run/home XDG_CONFIG_HOME=$run/home/.config XDG_DATA_HOME=$run/home/.local/share \
  XDG_STATE_HOME=$run/home/.local/state XDG_CACHE_HOME=$run/home/.cache BOX_API_KEY="$BOX_API_KEY" \
  $here/../node_modules/.bin/opencode run --standalone --auto --model box/m "$(cat $here/task-survey.txt)" \
  < /dev/null > $run/out.txt 2> $run/err.txt
code=$?
echo "== $label ($model): exit $code, $(( $(date +%s) - start )) s, $(grep -c 'Error' $run/err.txt) error lines"
python3 $here/check-survey.py $run/work $run/truth.json | tail -${SPIKE_TAIL:-1}
echo "   files: $run"
