#!/bin/zsh
# serve-q4.sh [thinking effort]: 4-bit Inkling on :8081 (stops Nemotron and any other Inkling server first).
key=$(cat ~/.ola/model-key)
launchctl bootout gui/$(id -u)/cx.ola.model 2>/dev/null; pkill -f "llama-server --model /Users/ola/ola-models/Inkling"; sleep 5
extra=(); [ -n "${1:-}" ] && extra=(--reasoning-effort $1)
(nohup ~/llama-head/build/bin/llama-server --model ~/ola-models/Inkling-2-Mini-IQ4_NL.gguf --mmproj ~/ola-models/mmproj-Inkling-2-Mini-Q8_0.gguf --alias inkling --host 127.0.0.1 --port 8081 --api-key-file ~/.ola/model-key --ctx-size 131072 --parallel 1 --n-gpu-layers 999 --jinja $extra > ~/inkling-q4-server.log 2>&1 < /dev/null &)
for i in $(seq 1 60); do curl -fsS -m 3 -H "Authorization: Bearer $key" http://127.0.0.1:8081/v1/models >/dev/null 2>&1 && { echo up; exit 0; }; sleep 4; done; echo NOT UP; exit 1
