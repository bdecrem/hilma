#!/bin/zsh
export PATH=/opt/homebrew/bin:/usr/local/bin:$PATH
cd ~/ola-bold/apps/activist-ai/evals
log=results/4way-run.log
while [ -e ~/ola-deploy.hold ]; do sleep 20; done
until mkdir ~/ola-suite.lock 2>/dev/null; do sleep 10; done
echo "design 4-way OLA-141 $(date)" > ~/ola-suite.lock/owner
for arm in on off; do
  echo "== $arm $(date)" >> $log
  node run.mjs --config configs/nemotron-3.5-super-vl-ws-4way.json --tasks u9-block-party,u10-youth-strike,u2-results-page --seeds 1 --skills $arm --db results/4way.db \
    --concurrency 2 --time 1800 --tokens 1000000 --max-load 9 --load-patience 10 >> $log 2>&1
done
rm -rf ~/ola-suite.lock
echo "== done $(date)" >> $log
