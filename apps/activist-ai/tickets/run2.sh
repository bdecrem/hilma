#!/bin/zsh
# OLA-520 run two on the Mac Studio, in two phases so a reading of the tests sits between them:
#   nohup caffeinate -i ~/big-test/hilma/apps/activist-ai/tickets/run2.sh qwen >> ~/big-test/run2.log 2>&1 &
#     Qwen reads the ten bugs (ten-bugs-2.txt, ask-2.txt) and writes tests (45 min at most), Ola's model is
#     loaded again (steps 300: the lean cap of 60 stopped it at 10.7 min with nothing written), then did-it-fail.mjs runs each test on the untouched code.
#   nohup caffeinate -i ~/big-test/hilma/apps/activist-ai/tickets/run2.sh inkmini given/a.json given/b.json … >> ~/big-test/run2.log 2>&1 &
#     three.mjs on each case, one after another (Inkling 2 Mini, Ola's own model).
# Each phase waits for the Studio to be free and appends to ~/big-test/run2-summary.txt.
set -u
export PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin
export GATEWAY_TOTAL_TIMEOUT_MS=2400000 GATEWAY_FIRST_BYTE_TIMEOUT_MS=1800000 GATEWAY_READ_TIMEOUT_MS=600000
# The Studio's own models cost nothing: the ticket gateway's weekly 20M-token ceiling (meant for paid models) stopped Qwen after 4 min on Nov 27.
export TICKETS_WEEKLY_TOKENS=200000000
h=~/big-test/hilma; t=$h/apps/activist-ai/tickets; BM=$h/apps/activist-ai/ops/studio/big-model.sh; S=~/big-test/run2-summary.txt
say() { echo "$(date '+%b %d %H:%M:%S') $*"; }
while pgrep -f "before-after.mjs" >/dev/null || pgrep -f "runner.mjs|ola.mjs deploy|three.mjs|write-tests.mjs" >/dev/null; do say "waiting for the Studio"; sleep 60; done
cd $h && git pull -q; say "at $(git log --oneline -1 | cut -c1-9)"
gw=""
finish() { trap - EXIT INT TERM; [[ -n $gw ]] && kill $gw 2>/dev/null; $BM status | grep -q "own model: loaded" || $BM back; $BM status; say "phase $1 finished"; }
phase=$1; shift
if [[ $phase == qwen ]]; then
  trap "finish qwen" EXIT INT TERM
  $BM start qwen || { say "qwen did not start"; exit 1; }
  out=$($t/gateway.sh studio-qwen3.8-flash-next); say "$out"
  gw=$(print -r -- $out | sed -n 's/.*gateway pid \([0-9]*\).*/\1/p'); sleep 2
  node $t/write-tests.mjs --model studio-qwen3.8-flash-next --bugs $t/ten-bugs-2.txt --ask $t/ask-2.txt --time 2700 --steps 300 | tee /tmp/run2-qwen.txt
  kill $gw 2>/dev/null; gw=""; $BM back
  d=$(sed -n 's/^dir //p' /tmp/run2-qwen.txt)
  { echo "== OLA-520 run two, $(date)"; echo "Qwen: $(grep '^write-tests: [a-z]' /tmp/run2-qwen.txt | tail -1)"; echo "run folder $d"
    echo "did-it-fail on the untouched code:"; node $t/did-it-fail.mjs $d; echo; } | tee -a $S
elif [[ $phase == inkmini ]]; then
  trap "finish inkmini" EXIT INT TERM
  $BM status | grep -q "own model: loaded" || $BM back
  out=$($t/gateway.sh studio-inkling-2-mini); say "$out"
  gw=$(print -r -- $out | sed -n 's/.*gateway pid \([0-9]*\).*/\1/p'); sleep 2
  for f in "$@"; do
    say "three tries on $f"
    node $t/three.mjs --model studio-inkling-2-mini --case-file $t/$f --time 1500 | tee /tmp/run2-three.txt
    d=$(ls -td ~/ola-trials/three/*/ | head -1)
    { echo "== $f ($d)"; grep -E "untouched|round|fixed|not fixed" /tmp/run2-three.txt
      echo "peak memory used: $(sed -n 's/.*PhysMem: \([0-9]*\)G used.*/\1/p' $d/memory.txt | sort -n | tail -1) GB of 128"; echo; } | tee -a $S
  done
fi
