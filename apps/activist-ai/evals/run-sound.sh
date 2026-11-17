#!/bin/zsh
# The sound skill's with-and-without numbers, on the Mac mini: each sound task, both arms, 3 seeds,
# one task per take of the machine-wide suite lock (both arms in one take), so other suites can run
# between tasks. Resumable: a run already in the database is skipped.
#
#   evals/run-sound.sh [tasks...]   (default: v1 to v6)
#
# Needs the evals' own gateway with `see` first (the weekly quota per slot is the spending ceiling):
#   OLA_EVALS_ROOT=~/ola-snd/apps/activist-ai/evals evals/start-gateway-ws.sh nemosnd 4398 nvidia/NVIDIA-Nemotron-3.5-Super-VL 4500000 see=meta-models/Muse-Glimmer-30B
# Then the judged comparison and the sheets: node evals/sound-judge.mjs (see its header).
set -u
export PATH=/opt/homebrew/bin:/usr/local/bin:$PATH
cd ${0:A:h}
tasks=("$@")
(( $# )) || tasks=(v1-app-chimes v2-signature-tune v3-calm-loop v4-signup-sounds v5-petition-win v6-fix-harsh)
log=${SOUND_LOG:-results/sound-run.log}
for t in $tasks; do
  while [ -e ~/ola-deploy.hold ]; do sleep 20; done
  until mkdir ~/ola-suite.lock 2>/dev/null; do sleep 10; done
  echo "sound evals $t $(date)" > ~/ola-suite.lock/owner
  for arm in on off; do
    echo "== $t $arm $(date)" >> $log
    node run.mjs --config ${SOUND_CONFIG:-configs/nemotron-3.5-super-vl-ws-snd.json} --tasks $t --seeds ${SOUND_SEEDS:-1,2,3} --skills $arm --db ${SOUND_DB:-results/sound.db} \
      --concurrency 2 --time ${SOUND_TIME:-900} --tokens 500000 --max-load 9 --load-patience 10 >> $log 2>&1
  done
  rm -rf ~/ola-suite.lock
  sleep 30
done
echo "== done $(date)" >> $log
