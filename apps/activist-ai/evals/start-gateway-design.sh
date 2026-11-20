#!/bin/zsh
# The design model's proof (OLA-168), on the Mac mini: a gateway of this checkout with the live test
# server's own Together account and its own everyday model, plus the design model (its default on
# Together), for runs inside sealed workspace VMs (configs/design-ola168-ws.json).
#
#   evals/start-gateway-design.sh <port> [everyday-local 0|1]
#
# The key and the everyday model's id are read from the live gateway's env file (~/.ola/gateway.env)
# into this process only, never printed; the live gateway, its settings and its services are not
# touched. Its own OLA_HOME, tokens, door sockets and usage database under evals/home-dz and state/.
# With everyday-local 1 (the rule for after the Studio), design work leaves only for the callers in
# state/dz-gateway-design (written by hand for the proof). Stop it with: kill $(cat state/dz-gateway.pid)
set -eu
port=$1 local=${2:-0}
here=${0:A:h}
home=$here/home-dz state=$here/state
mkdir -p $home/gw $state && chmod 700 $home $home/gw $state
envf=$HOME/.ola/gateway.env
key=$(grep '^UPSTREAM_API_KEY=' $envf | head -1 | cut -d= -f2- | tr -d '"')
base=$(grep '^UPSTREAM_BASE_URL=' $envf | head -1 | cut -d= -f2- | tr -d '"')
general=$(grep '^GATEWAY_MODELS=' $envf | head -1 | cut -d= -f2- | tr -d '"' | tr ',' '\n' | grep '^general=' | head -1 | cut -d= -f2-)
[[ -n $key && -n $base && -n $general ]] || { echo "the live gateway's key, server or everyday model was not found"; exit 1 }
[[ $base == https://api.together.xyz/v1 ]] || { echo "the live gateway does not use Together; this proof is for Together"; exit 1 }
for f in probe usage; do [[ -s $state/dz-$f-token ]] || { (umask 077; openssl rand -hex 24 > $state/dz-$f-token) }; done
[[ -s $home/gateway-tokens ]] || { (umask 077; print "GATEWAY_TOKENS=" > $home/gateway-tokens) }
[[ -e $state/dz-gateway-design ]] || { (umask 077; print '{}' > $state/dz-gateway-design) }
UPSTREAM_BASE_URL=$base UPSTREAM_API_KEY=$key \
GATEWAY_TOKENS=evals:$(cat $state/dz-probe-token) GATEWAY_TOKENS_FILE=$home/gateway-tokens GATEWAY_DOOR_DIR=$home/gw \
GATEWAY_USAGE_TOKEN=$(cat $state/dz-usage-token) GATEWAY_HOST=127.0.0.1 GATEWAY_PORT=$port \
GATEWAY_MODELS=general=$general GATEWAY_DB=$state/dz-gateway.db GATEWAY_WEEKLY_TOKENS=8000000 \
GATEWAY_EVERYDAY_LOCAL=$local GATEWAY_DESIGN_FILE=$state/dz-gateway-design \
GATEWAY_MAX_INFLIGHT=4 GATEWAY_MAX_INFLIGHT_PER_CALLER=2 GATEWAY_MAX_QUEUED_PER_CALLER=8 \
  nohup /opt/homebrew/bin/node $here/../gateway/server.mjs >> $state/dz-gateway.log 2>&1 &
print $! > $state/dz-gateway.pid
echo "gateway dz pid $! on 127.0.0.1:$port (general from the live gateway, design = its Together default, everyday-local $local)"
