#!/bin/zsh
# The skills' with-and-without numbers, on the Mac mini: every skill's tasks, both arms, 3 seeds, in
# chunks of one skill and one arm, each chunk under the machine-wide suite lock (taken and released per
# chunk, so other suites can run between them). Resumable: a chunk already in the database is skipped.
#
#   evals/run-skills.sh [skills...]        (default: chart workbook report design-pass)
#
# Needs the evals' own gateway first (its weekly quota per slot is the spending ceiling):
#   OLA_EVALS_ROOT=~/ola-sk/evals evals/start-gateway-ws.sh glmsk 4397 zai-org/GLM-5.3-Flash 4500000
set -u
export PATH=/opt/homebrew/bin:/usr/local/bin:$PATH
cd ${0:A:h}
skills=("$@")
(( $# )) || skills=(chart workbook report design-pass)
log=${SKILLS_LOG:-results/skills-run.log}
for s in $skills; do
  while [ -e ~/ola-deploy.hold ]; do sleep 20; done
  until mkdir ~/ola-suite.lock 2>/dev/null; do sleep 5; done
  echo "skills evals $s $(date)" > ~/ola-suite.lock/owner
  for arm in on off; do   # both arms in one take of the lock: one skill is 12 runs, about 5 to 15 minutes
    echo "== $s $arm $(date)" >> $log
    node run.mjs --config configs/glm-5.3-flash-ws-sk.json --tasks skill:$s --seeds 1,2,3 --skills $arm --db results/skills.db \
      --concurrency 2 --time 600 --tokens 400000 --max-load 9 --load-patience 10 >> $log 2>&1
  done
  rm -rf ~/ola-suite.lock
  sleep 30   # room for a waiting suite to take the lock
done
echo "== done $(date)" >> $log
