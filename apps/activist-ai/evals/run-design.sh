#!/bin/zsh
# The design skills' with-and-without numbers, on the Mac mini: each design task, both arms, 3 seeds,
# one task per take of the machine-wide suite lock (both arms in one take, about 10 to 20 minutes), so
# other suites can run between tasks. Resumable: a run already in the database is skipped.
#
#   evals/run-design.sh [tasks...]   (default: u1 to u7; s7 and s8 can be added)
#
# Needs the evals' own gateway with `see` first (the weekly quota per slot is the spending ceiling):
#   OLA_EVALS_ROOT=~/ola-ds/evals evals/start-gateway-ws.sh nemods 4399 nvidia/NVIDIA-Nemotron-3.5-Super-VL 9500000 see=meta-models/Muse-Glimmer-30B
# Then the judged comparison and the sheets: node evals/design-judge.mjs (see its header).
set -u
export PATH=/opt/homebrew/bin:/usr/local/bin:$PATH
cd ${0:A:h}
tasks=("$@")
(( $# )) || tasks=(u1-tenants-event u2-results-page u3-dashboard u4-report-site u5-signup-flow u6-phone-screens u7-app-unfinished)
log=${DESIGN_LOG:-results/design-run.log}
for t in $tasks; do
  while [ -e ~/ola-deploy.hold ]; do sleep 20; done
  until mkdir ~/ola-suite.lock 2>/dev/null; do sleep 10; done
  echo "design evals $t $(date)" > ~/ola-suite.lock/owner
  for arm in on off; do
    echo "== $t $arm $(date)" >> $log
    node run.mjs --config ${DESIGN_CONFIG:-configs/nemotron-3.5-super-vl-ws-ds.json} --tasks $t --seeds ${DESIGN_SEEDS:-1,2,3} --skills $arm --db ${DESIGN_DB:-results/design.db} \
      --concurrency 2 --time ${DESIGN_TIME:-900} --tokens 500000 --max-load 9 --load-patience 10 >> $log 2>&1
  done
  rm -rf ~/ola-suite.lock
  sleep 30
done
echo "== done $(date)" >> $log
