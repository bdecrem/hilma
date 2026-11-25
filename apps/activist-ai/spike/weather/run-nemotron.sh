#!/bin/zsh
# Nemotron (the Studio model job, :8080) builds the weather page (OLA-435).
set -u
export PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin
key=$(cat ~/.ola/model-key)
curl -fsS -m 3 -H "Authorization: Bearer $key" http://127.0.0.1:8080/v1/models >/dev/null || { echo "MODEL NOT UP"; exit 1; }
run=~/hello-weather-nemo; mkdir -p $run/work $run/home; cd $run/work
sed -e "s#127.0.0.1:8081#127.0.0.1:8080#" -e "s#\"modelID\": \"inkling\"#\"modelID\": \"nemotron\"#" -e "s#\"name\": \"inkling\"#\"name\": \"nemotron\"#" ~/hello-weather/work/opencode.jsonc > opencode.jsonc
start=$(date +%s)
env -i PATH="$PATH" HOME=$run/home XDG_CONFIG_HOME=$run/home/.config XDG_DATA_HOME=$run/home/.local/share \
  XDG_STATE_HOME=$run/home/.local/state XDG_CACHE_HOME=$run/home/.cache BOX_API_KEY="$key" \
  ~/ola-staging/current/apps/activist-ai/node_modules/.bin/opencode run --standalone --auto --model box/m "$(cat ~/hello-weather/task.txt)" \
  < /dev/null > $run/out.txt 2> $run/err.txt
echo "exit $?, $(( $(date +%s) - start )) s"; ls -la $run/work; tail -5 $run/out.txt
echo RUN-FINISHED
