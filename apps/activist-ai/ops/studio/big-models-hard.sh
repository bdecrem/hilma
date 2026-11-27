#!/bin/zsh
# The five harder requests (OLA-484) for the models that were tested before they were added:
#   nohup caffeinate -i ~/big-test/hilma/apps/activist-ai/ops/studio/big-models-hard.sh ola nemotron > ~/big-test/hard.log 2>&1 &
# Waits for the night's test to finish, then for each name: start it, run the five, stop it. Ola's own
# model is loaded again at the end.
# TASKS, TIME (seconds a task) and TICKETS (cases of tickets/trial.mjs, TICKET_TIME each) change what is run.
set -u
export PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin
here=${0:A:h}; ola=${here:h:h}; BM=$here/big-model.sh
export GATEWAY_TOTAL_TIMEOUT_MS=2400000 GATEWAY_FIRST_BYTE_TIMEOUT_MS=1800000 GATEWAY_READ_TIMEOUT_MS=600000
say() { echo "$(date '+%b %d %H:%M:%S') $*"; }
typeset -A alias=(ola studio-inkling-2-mini nemotron studio-nemotron-3.5-super gpt-oss studio-gpt-oss-120b qwen studio-qwen3.8-flash-next inkling-small studio-inkling-small inkling-small-3 studio-inkling-small-3 deepseek studio-deepseek-v4-flash)
gw=""
finish() { trap - EXIT INT TERM; [[ -n $gw ]] && kill $gw 2>/dev/null; $BM back; say "hard finished"; exit 0; }
trap finish EXIT INT TERM
say "waiting for the night's test to finish"
while pgrep -f big-models-night.sh > /dev/null; do sleep 60; done
for name in "$@"; do
  a=${alias[$name]:-}; [[ -z $a ]] && { say "$name: unknown"; continue; }
  if [[ $name == ola ]]; then $BM back || { say "Ola's own model is not answering, skipped"; continue; }
  else $BM start $name || { say "$name: did not start, skipped"; continue; }; fi
  out=$($ola/tickets/gateway.sh $a) || { say "$name: no gateway: $out"; continue; }
  gw=$(print -r -- $out | sed -n 's/.*gateway pid \([0-9]*\).*/\1/p'); say "$out"; sleep 2
  say "$name: the five harder requests"
  node $ola/evals/bigmodels/run.mjs --model $a --tasks ${TASKS:-chess,blocks,markdown,calendar,sudoku} --time ${TIME:-900}
  [[ -n ${TICKETS:-} ]] && node $ola/tickets/trial.mjs --models $a --cases $TICKETS --lean --time ${TICKET_TIME:-1500} --max-usd 1 --concurrency 1
  kill $gw 2>/dev/null; gw=""
  say "$name: done"
done
