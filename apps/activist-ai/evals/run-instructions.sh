#!/bin/zsh
# The standing instructions, measured (2026-11-17): one arm of the before-and-after on the Mac mini,
# inside sealed workspace VMs, with the everyday model through the evals' own gateway.
#
#   evals/run-instructions.sh <image tag> <tasks> <seeds> [extra run.mjs args]
#   e.g. evals/run-instructions.sh ola-workspace:2.3.0-19 f2-duplicate-gifts,f11-pantry-duplicate 1,2,3   # before
#        evals/run-instructions.sh ola-workspace:2.3.0-22 ...same...                                     # after (built here if missing)
#
# The image named is the only difference between the arms (its AGENTS.md); ws.mjs is pointed at it
# for this run and put back after. Takes the machine-wide suite lock (and respects the deploy hold),
# starts the gateway (the Together key goes from the env file into the gateway process only), runs,
# stops the gateway and the slots, releases the lock. State in ~/.ola-fu2-evals; results in
# evals/results/fu2-nemo.db.
set -eu
image=$1 tasks=$2 seeds=$3; shift 3
here=${0:A:h}; ai=${here:h}
export PATH=/opt/homebrew/bin:/usr/local/bin:$PATH
export OLA_EVALS_ROOT=$HOME/.ola-fu2-evals OLA_GATEWAY_PORT=4397
while [[ -e ~/ola-deploy.hold ]] || ! mkdir ~/ola-suite.lock 2>/dev/null; do sleep 20; done
echo "pid $$ fu2 $(date)" > ~/ola-suite.lock/owner; export OLA_TURN_HELD=$$
ws=$ai/workspace/ws.mjs
cp $ws $ws.orig
cleanup() {
  [[ -f $ws.orig ]] && mv $ws.orig $ws
  [[ -s $OLA_EVALS_ROOT/state/nemo-gateway.pid ]] && kill $(cat $OLA_EVALS_ROOT/state/nemo-gateway.pid) 2>/dev/null || true
  rm -rf ~/ola-suite.lock
}
trap cleanup EXIT INT TERM
free=$(df -g /System/Volumes/Data | awk 'NR==2 {print $4}')
(( free >= 10 )) || { echo "only ${free} GB free: not running"; exit 1 }
sed -i '' "s|^export const IMAGE = '.*'|export const IMAGE = '$image'|" $ws
node $ws image --missing
$here/start-gateway-ws.sh nemo 4397 nvidia/NVIDIA-Nemotron-3.5-Super-VL 15000000
sleep 3
# The configuration names the AGENTS.md it ran with (a rewrite is a new configuration, not a rerun).
agents=$(shasum -a 256 $ai/workspace/AGENTS.md | cut -c1-12)
cfg=$here/configs/.nemotron-agents-$agents.json
python3 -c "import json,sys; c=json.load(open('$here/configs/nemotron-3.5-super-vl-ws.json')); c['agents_md']='$agents'; json.dump(c, open('$cfg','w'), indent=2)"
node $here/run.mjs --config $cfg --tasks $tasks --seeds $seeds --concurrency 2 \
  --db results/fu2-nemo.db --time 900 --tokens 500000 --max-load 9 --load-patience 20 "$@"
