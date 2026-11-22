#!/bin/zsh
# The ticket lane's own model connection (OLA-300): one gateway per candidate in models.json, on
# loopback port 4460 + its place in the file, caller `tickets`, the model under the gateway's name
# `code`, a weekly ceiling of 20,000,000 tokens each, and the prompt-cache hit count passed back
# (GATEWAY_REPORT_CACHED, OLA-356: one caller only, so the runs price hits at the cached rate). Kept apart
# from Ola's gateway: these models serve our own tracker's tickets only, never a person's project.
# The Together key is read into this process's environment only and never printed.
#   apps/activist-ai/tickets/gateway.sh <model> [<model>…]    (state and logs in ~/ola-trials/.gw)
set -eu
here=${0:A:h}
state=$HOME/ola-trials/.gw
mkdir -p $state && chmod 700 $state
key=""
for f in $here/../../../.env.local $HOME/.macplus-backend.env; do
  [[ -r $f ]] && key=$(grep '^TOGETHER_API_KEY=' $f | head -1 | cut -d= -f2- | tr -d '"') && [[ -n $key ]] && break
done
[[ -n $key ]] || { echo "TOGETHER_API_KEY not found"; exit 1 }
[[ -s $state/token ]] || { (umask 077; openssl rand -hex 24 > $state/token) }
for alias in "$@"; do
  line=$(node -e 'const m=require(process.argv[1]);const k=Object.keys(m).filter(k=>!k.startsWith("_"));const i=k.indexOf(process.argv[2]);if(i<0)process.exit(1);console.log((4460+i)+" "+m[process.argv[2]].id)' $here/models.json $alias) || { echo "unknown model $alias"; exit 1 }
  port=${line%% *}; id=${line#* }
  UPSTREAM_BASE_URL=https://api.together.xyz/v1 UPSTREAM_API_KEY=$key \
  GATEWAY_TOKENS=tickets:$(cat $state/token) GATEWAY_HOST=127.0.0.1 GATEWAY_PORT=$port \
  GATEWAY_MODELS=code=$id GATEWAY_DB=$state/$alias.db GATEWAY_REPORT_CACHED=1 \
  GATEWAY_WEEKLY_TOKENS=20000000 GATEWAY_MAX_INFLIGHT=6 GATEWAY_MAX_INFLIGHT_PER_CALLER=6 GATEWAY_MAX_QUEUED_PER_CALLER=24 \
    nohup node $here/../gateway/server.mjs >> $state/$alias.log 2>&1 &
  echo "$alias ($id): gateway pid $! on http://127.0.0.1:$port/v1"
done
