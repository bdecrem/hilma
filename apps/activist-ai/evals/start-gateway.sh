#!/bin/zsh
# Starts a gateway of the evals' own on a loopback port, pointed at Together.ai, with one caller
# (`evals`), a fresh token in .state/gw-token (mode 600) and a weekly ceiling of 6,000,000 tokens,
# so a runaway eval cannot spend more. The Together key is read from the repo's .env.local into
# this process's environment only; it is never printed.
#   evals/start-gateway.sh [port]        (default 4391; logs to .state/gateway.log)
set -eu
here=${0:A:h}
port=${1:-4391}
state=$here/.state
mkdir -p $state && chmod 700 $state
key=$(grep '^TOGETHER_API_KEY=' $here/../../../.env.local | head -1 | cut -d= -f2- | tr -d '"')
[[ -n $key ]] || { echo "TOGETHER_API_KEY not found in .env.local"; exit 1 }
[[ -s $state/gw-token ]] || { (umask 077; openssl rand -hex 24 > $state/gw-token) }
UPSTREAM_BASE_URL=https://api.together.xyz/v1 UPSTREAM_API_KEY=$key \
GATEWAY_TOKENS=evals:$(cat $state/gw-token) GATEWAY_HOST=127.0.0.1 GATEWAY_PORT=$port \
GATEWAY_MODELS=general=zai-org/GLM-5.3-Flash GATEWAY_DB=$state/gateway.db \
GATEWAY_WEEKLY_TOKENS=6000000 GATEWAY_MAX_INFLIGHT=4 GATEWAY_MAX_INFLIGHT_PER_CALLER=4 GATEWAY_MAX_QUEUED_PER_CALLER=16 \
  nohup node $here/../gateway/server.mjs >> $state/gateway.log 2>&1 &
echo "gateway pid $! on http://127.0.0.1:$port/v1 (token in $state/gw-token)"
