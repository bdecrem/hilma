#!/bin/zsh
# The open models of the open-model design comparison (OLA-168), on the Mac mini: five page requests,
# seed 1, the designer skill on, the same image, AGENTS.md and limits for every model. Each model has
# its own gateway (configs/*-ws-od.json name the port and the start command), so only the gateway's
# `general` differs between arms. One model per take of the machine-wide suite lock. Resumable: a run
# already in the database is skipped.
#
#   evals/run-open-design.sh [models...]   (default: nemotron-3.5-super-vl inkling inkling-2-small muse-spark-open)
#
# The Opus arm runs on an iMac with the Claude login: run-open-design-opus.sh. Sheets: four-way-sheets.mjs --numbers.
set -u
export PATH=/opt/homebrew/bin:/usr/local/bin:$PATH
cd ${0:A:h}
models=("$@")
(( $# )) || models=(nemotron-3.5-super-vl inkling inkling-2-small muse-spark-open)
tasks=u12-good-morning,u9-block-party,u10-youth-strike,u2-results-page,u5-signup-flow
log=${OD_LOG:-results/open-design-run.log}
for m in $models; do
  # every 2 s: the other users of the lock retry fast, and at 10 s this lost the race for an hour
  until [ ! -e ~/ola-deploy.hold ] && mkdir ~/ola-suite.lock 2>/dev/null; do sleep 2; done
  echo "pid $$ open-model design OLA-168 $m $(date)" > ~/ola-suite.lock/owner; export OLA_TURN_HELD=$$
  echo "== $m $(date)" >> $log
  node run.mjs --config configs/$m-ws-od.json --tasks $tasks --seeds 1 --skills on --db results/open-design.db \
    --concurrency 2 --time 1800 --tokens 1000000 --max-load 9 --load-patience 10 >> $log 2>&1
  rm -rf ~/ola-suite.lock
  sleep 20
done
echo "== done $(date)" >> $log
