#!/bin/zsh
# Round two: the evals' own gateway for runs inside sealed workspace VMs (on the Mac mini).
#
#   evals/start-gateway-ws.sh <name> <port> <upstream model id> <weekly tokens per slot> [specialists]
#   e.g. evals/start-gateway-ws.sh glm  4395 zai-org/GLM-5.3-Flash      15000000
#        evals/start-gateway-ws.sh qwen 4396 Qwen/Qwen3-Coder-Next-FP8  7500000
#
# Each configuration gets its own OLA_HOME (~/ola-evals/home-<name>): its workspaces, their tokens
# (gateway-tokens, written by workspace/ws.mjs) and their door sockets (gw/). Workspaces are reused
# slots (ev-<x>1, ev-<x>2), created and destroyed for every run, so the gateway's per-caller weekly
# quota times two is the configuration's whole weekly ceiling. The workspace image asks for the
# model `general`; this gateway maps `general` to the upstream id given here. A caller `evals`
# (token in state/<name>-probe-token) exists only for the probe on the TCP port, and a usage token
# (state/<name>-usage-token) reads per-caller usage. The Together key is read from the mini's
# hilma .env.local into this process only and never printed. Loopback only; no sudo.
set -eu
name=$1 port=$2 model=$3 weekly=$4 extra=${5:-}   # e.g. see=meta-models/Muse-Glimmer-30B (the design evals: ola-see and the judge)
root=${OLA_EVALS_ROOT:-$HOME/ola-evals}
home=$root/home-$name state=$root/state
mkdir -p $home/gw $state && chmod 700 $home $home/gw $state
key=$(grep '^TOGETHER_API_KEY=' ${TOGETHER_ENV:-$HOME/Documents/code/hilma/.env.local} | head -1 | cut -d= -f2- | tr -d '"')
[[ -n $key ]] || { echo "TOGETHER_API_KEY not found"; exit 1 }
for f in probe usage; do [[ -s $state/$name-$f-token ]] || { (umask 077; openssl rand -hex 24 > $state/$name-$f-token) }; done
[[ -s $home/gateway-tokens ]] || { (umask 077; print "GATEWAY_TOKENS=" > $home/gateway-tokens) }
here=${0:A:h}
UPSTREAM_BASE_URL=https://api.together.xyz/v1 UPSTREAM_API_KEY=$key \
GATEWAY_TOKENS=evals:$(cat $state/$name-probe-token) GATEWAY_TOKENS_FILE=$home/gateway-tokens GATEWAY_DOOR_DIR=$home/gw \
GATEWAY_USAGE_TOKEN=$(cat $state/$name-usage-token) GATEWAY_HOST=127.0.0.1 GATEWAY_PORT=$port \
GATEWAY_MODELS=general=$model${extra:+,$extra} GATEWAY_DB=$state/$name-gateway.db GATEWAY_WEEKLY_TOKENS=$weekly \
GATEWAY_MAX_INFLIGHT=4 GATEWAY_MAX_INFLIGHT_PER_CALLER=2 GATEWAY_MAX_QUEUED_PER_CALLER=8 \
  nohup /opt/homebrew/bin/node $here/../gateway/server.mjs >> $state/$name-gateway.log 2>&1 &
print $! > $state/$name-gateway.pid
echo "gateway $name pid $! on 127.0.0.1:$port ($model, $weekly tokens a week per slot)"
