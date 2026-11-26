#!/bin/zsh
# The whole test of OLA-482, unattended, on the Studio as ola:
#   nohup caffeinate -i ~/big-test/hilma/apps/activist-ai/ops/studio/big-models-night.sh > ~/big-test/night.log 2>&1 &
# Ola's own model first (the reference, nothing is unloaded for it), then each bigger model as soon as
# its download is complete: start it, run the five requests a person would make (evals/bigmodels) and
# three of our own tickets (tickets/trial.mjs: small, medium, hard), stop it. Whatever happens, Ola's
# own model is loaded again at the end. Results: ~/ola-trials/big/results.jsonl and
# ~/ola-trials/results.jsonl; `--only a,b` runs just those names.
set -u
export PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin
here=${0:A:h}; ola=${here:h:h}
BM=$here/big-model.sh
# Slow local models: one answer may take far longer than a hosted model's.
export GATEWAY_TOTAL_TIMEOUT_MS=2400000 GATEWAY_FIRST_BYTE_TIMEOUT_MS=1800000 GATEWAY_READ_TIMEOUT_MS=600000
say() { echo "$(date '+%b %d %H:%M:%S') $*"; }
only=""; [[ ${1:-} == --only ]] && only=",$2,"
gw=""
finish() { trap - EXIT INT TERM; [[ -n $gw ]] && kill $gw 2>/dev/null; $BM back; say "night finished"; exit 0; }
trap finish EXIT INT TERM
# name for big-model.sh | name in tickets/models.json | folder under ~/ola-models/big whose .complete to wait for ("" = on disk already)
for line in "ola|studio-inkling-2-mini|" "nemotron|studio-nemotron-3.5-super|" "gpt-oss|studio-gpt-oss-120b|gpt-oss-120b" \
            "qwen|studio-qwen3.8-flash-next|Qwen3.8-Flash-Next-MTPLX-Optimized-Speed" "inkling-small|studio-inkling-small|Inkling-Small" "deepseek|studio-deepseek-v4-flash|DeepSeek-V4-Flash"; do
  parts=("${(@s:|:)line}"); name=$parts[1]; alias=$parts[2]; dl=${parts[3]:-}
  [[ -n $only && $only != *,$name,* ]] && continue
  if [[ -n $dl ]]; then
    say "$name: waiting for its download"
    for i in {1..1440}; do [[ -e $HOME/ola-models/big/$dl/.complete ]] && break; grep -q "queue finished" $HOME/ola-models/big/q.log 2>/dev/null && break; sleep 30; done
    [[ -e $HOME/ola-models/big/$dl/.complete ]] || { say "$name: its download did not complete, skipped"; continue; }
  fi
  if [[ $name == ola ]]; then $BM back || { say "Ola's own model is not answering, reference skipped"; continue; }
  else $BM start $name || { say "$name: did not start, skipped"; continue; }; fi
  out=$($ola/tickets/gateway.sh $alias) || { say "$name: no gateway: $out"; continue; }
  gw=$(print -r -- $out | sed -n 's/.*gateway pid \([0-9]*\).*/\1/p'); say "$out"; sleep 2
  say "$name: the five requests"
  node $ola/evals/bigmodels/run.mjs --model $alias --time 900
  say "$name: three tickets"
  node $ola/tickets/trial.mjs --models $alias --cases ola-351-ready,ola-337-deepseek,ola-283-select --lean --time 1500 --max-usd 1 --concurrency 1
  kill $gw 2>/dev/null; gw=""
  say "$name: done"
done
