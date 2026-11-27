#!/bin/zsh
# A bigger model on the Mac Studio in place of Ola's own, one at a time (OLA-482; Bart, voice call
# Nov 26: download every bigger model that fits, test them, "leave them on the system ... so I can
# also play with them"). The Studio has about 100 GB for a model once Inkling 2 Mini is unloaded
# (OLA-481), so the two never run together: starting a big model unloads Ola's, `back` loads it again.
#
#   big-model.sh list                 the models and whether each is on disk
#   big-model.sh start <name>         for the tests: Ola's model unloaded, <name> served on 127.0.0.1:8090
#                                     (key ~/.ola/bigmodel.key, model id "big")
#   big-model.sh use <name>           for trying it in Ola: <name> served where Ola's model was
#                                     (127.0.0.1:8080, Ola's key, id "inkling"), so Ola on this machine
#                                     answers with it. Ola's settings are tuned for Inkling 2 Mini.
#   big-model.sh back                 stop the big model, load Ola's own again (also after `start`)
#   big-model.sh status
# Run on the Studio as ola. Log: ~/Library/Logs/ola/bigmodel-<name>.log
set -u
export PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin
M=$HOME/ola-models; B=$M/big; LOGS=$HOME/Library/Logs/ola; PIDF=$HOME/.ola/bigmodel.pid
# The first-generation Inkling Small GGUF loads in no llama.cpp (it knows 'inkling2', not 'inkling'): MLX only.
LLAMA=$HOME/llama-head/build/bin/llama-server
D=gui/$(id -u)
# name | kind | path (a file, or for a split GGUF its first part; a folder for mtplx) | context | what it is
MODELS=(
  "nemotron|llama|$M/NVIDIA-Nemotron-3.5-Super-VL-120B-A12B-Q4_0.gguf|131072|Nemotron 3.5 Super VL 120B, 4-bit, 72 GB"
  "gpt-oss|llama|$B/gpt-oss-120b/gpt-oss-120b-MXFP4.gguf|131072|gpt-oss-120b, 4-bit, 63 GB"
  "qwen|mtplx|$B/Qwen3.8-Flash-Next-MTPLX-Optimized-Speed|131072|Qwen3.8-Flash-Next, 4-bit, 115 GB on disk, about 83 GB in memory"
  "inkling-small|llama|$B/Inkling-Small/UD-IQ2_M/*00001-of-*.gguf|65536|Inkling Small (first generation), 2-bit, 82 GB"
  "deepseek|llama|$B/DeepSeek-V4-Flash/UD-IQ2_M/*00001-of-*.gguf|65536|DeepSeek V4 Flash, 2-bit, 91 GB"
  "deepseek-3|llama|$B/DeepSeek-V4-Flash-3bit/UD-IQ3_XXS/*00001-of-*.gguf|65536|DeepSeek V4 Flash, 3-bit, 104 GB: a stretch, a little more than the Studio has free (Bart's yes, Nov 26, for this test)"
)
say() { echo "$(date '+%b %d %H:%M:%S') $*"; }
row() { for r in $MODELS; do [[ ${r%%|*} == $1 ]] && { print -r -- $r; return 0 }; done; return 1; }
pathof() { local p=(${~1}(N)); print -r -- ${p[1]:-}; }   # the glob of a split GGUF, expanded
ondisk() { local kind=$1 p=$(pathof $2); [[ -n $p ]] || return 1
  case $p in $B/*) local d=$B/${${p#$B/}%%/*}; [[ -e $d/.complete ]] || return 1;; esac
  [[ -e $p ]]; }

stop_big() {
  [[ -s $PIDF ]] || return 0
  local pid=$(cat $PIDF)
  if kill -0 $pid 2>/dev/null; then kill $pid; for i in {1..40}; do kill -0 $pid 2>/dev/null || break; sleep 0.5; done; kill -9 $pid 2>/dev/null; say "the big model is stopped"; fi
  rm -f $PIDF
}
ola_down() { launchctl print $D/cx.ola.model >/dev/null 2>&1 && { launchctl bootout $D/cx.ola.model; say "Ola's own model is unloaded"; sleep 3; }; return 0; }
ola_up() {
  launchctl print $D/cx.ola.model >/dev/null 2>&1 || launchctl bootstrap $D $HOME/Library/LaunchAgents/cx.ola.model.plist
  for i in {1..120}; do [[ $(curl -s -o /dev/null -m 2 -w '%{http_code}' -H "Authorization: Bearer $(cat $HOME/.ola/model-key)" http://127.0.0.1:8080/v1/models) == 200 ]] && { say "Ola's own model is answering again"; return 0; }; sleep 1; done
  say "Ola's own model did NOT come back: launchctl print $D/cx.ola.model"; return 1
}
serve() {  # name port keyfile id
  local name=$1 port=$2 keyf=$3 id=$4 r; r=$(row $name) || { echo "unknown model $name (list)"; exit 2; }
  local parts=("${(@s:|:)r}"); local kind=$parts[2] p=$(pathof $parts[3]) ctx=$parts[4]
  ondisk $kind $parts[3] || { echo "$name is not on disk yet (or its download is not complete)"; exit 3; }
  [[ -s $HOME/.ola/bigmodel.key ]] || (umask 077; openssl rand -hex 24 > $HOME/.ola/bigmodel.key)
  stop_big; ola_down
  local log=$LOGS/bigmodel-$name.log
  if [[ $kind == mtplx ]]; then
    nohup mtplx serve --model $p --model-id $id --host 127.0.0.1 --port $port --api-key-file $keyf --context-window $ctx --no-stats-footer --yes > $log 2>&1 &
  else
    nohup $LLAMA -m $p --alias $id --host 127.0.0.1 --port $port --api-key-file $keyf --jinja -c $ctx -ngl 999 -np 1 > $log 2>&1 &
  fi
  echo $! > $PIDF; say "$name starting (pid $(cat $PIDF)), log $log"
  local t0=$(date +%s) key=$(cat $keyf)
  for i in {1..900}; do
    kill -0 $(cat $PIDF) 2>/dev/null || { say "$name stopped while loading; last lines:"; tail -5 $log; rm -f $PIDF; return 1; }
    [[ $(curl -s -o /dev/null -m 3 -w '%{http_code}' -H "Authorization: Bearer $key" http://127.0.0.1:$port/v1/models) == 200 ]] && break; sleep 2
  done
  # One real answer before it is called ready: a server can list a model it has not finished loading.
  local a=$(curl -s -m 900 -H "Authorization: Bearer $key" -H 'content-type: application/json' http://127.0.0.1:$port/v1/chat/completions \
    -d "{\"model\":\"$id\",\"messages\":[{\"role\":\"user\",\"content\":\"Reply with the one word: ready\"}],\"max_tokens\":400}" | /usr/bin/python3 -c 'import json,sys
try:
    m=json.load(sys.stdin)["choices"][0]["message"]; print("answer" if (m.get("content") or m.get("reasoning_content") or m.get("reasoning")) else "empty")
except Exception as e: print("none")')
  [[ $a == answer ]] || { say "$name loaded but gave no answer ($a); last lines:"; tail -5 $log; return 1; }
  say "$name is answering on 127.0.0.1:$port after $(( $(date +%s) - t0 )) s; memory: $(top -l 1 -n 0 | grep PhysMem | cut -c10-)"
}

case ${1:-status} in
  list) for r in $MODELS; do parts=("${(@s:|:)r}"); ondisk $parts[2] $parts[3] && s="on disk" || s="not on disk"; printf '%-14s %-12s %s\n' $parts[1] "$s" $parts[5]; done ;;
  start) serve ${2:?name} 8090 $HOME/.ola/bigmodel.key big ;;
  use) serve ${2:?name} 8080 $HOME/.ola/model-key inkling && say "Ola on this machine now answers with $2. To go back: big-model.sh back" ;;
  back|stop) stop_big; ola_up ;;
  status) if [[ -s $PIDF ]] && kill -0 $(cat $PIDF) 2>/dev/null; then ps -o pid=,etime=,command= -p $(cat $PIDF) | cut -c1-160; else echo "no big model is running"; fi
          launchctl print $D/cx.ola.model >/dev/null 2>&1 && echo "Ola's own model: loaded" || echo "Ola's own model: unloaded" ;;
  *) sed -n 2,16p $0 ;;
esac
