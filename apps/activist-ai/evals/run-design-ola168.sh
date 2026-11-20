#!/bin/zsh
# The design model's proof (OLA-168), on the Mac mini, through this checkout's gateway on the live test
# server's Together account (start-gateway-design.sh <port> first; configs/design-ola168-ws.json):
#   1. the block party page, seeds 1 to 5 (five in a row): the design model must serve each
#   2. two more page requests (the good-morning page, a results page), for what a design request costs
#   3. a request that is not design (a1-survey, a CSV survey), seeds 1 to 5: the design model must serve none
# Each step takes the machine-wide suite lock, as the other eval runs do. Results: results/design-ola168.db
# and the gateway's own record (state/dz-gateway.db: tables usage and served; state/dz-gateway.log).
set -u
export PATH=/opt/homebrew/bin:/usr/local/bin:$PATH
cd ${0:A:h}
log=${DZ_LOG:-results/design-ola168-run.log}
mkdir -p results
step() {
  local tasks=$1 seeds=$2
  until [ ! -e ~/ola-deploy.hold ] && mkdir ~/ola-suite.lock 2>/dev/null; do sleep 2; done
  echo "pid $$ design model proof OLA-168 $tasks $(date)" > ~/ola-suite.lock/owner; export OLA_TURN_HELD=$$
  echo "== $tasks seeds $seeds $(date +%s) $(date)" >> $log
  node run.mjs --config configs/design-ola168-ws.json --tasks $tasks --seeds $seeds --skills on --db results/design-ola168.db \
    --concurrency 2 --time 1500 --tokens 1000000 --max-load ${DZ_MAX_LOAD:-9} --load-patience 10 >> $log 2>&1
  echo "== end $tasks $(date +%s) $(date)" >> $log
  rm -rf ~/ola-suite.lock
}
for s in ${=DZ_STEPS:-1 2 3}; do
  case $s in
    1) step u9-block-party 1,2,3,4,5 ;;
    2) step u12-good-morning,u2-results-page 1 ;;
    3) step a1-survey 1,2,3,4,5 ;;
  esac
done
echo "== done $(date)" >> $log
