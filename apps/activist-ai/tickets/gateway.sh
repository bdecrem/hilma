#!/bin/zsh
# The ticket lane's own model connection (OLA-300): one gateway per candidate in models.json, on
# loopback port 4460 + its place in the file, caller `tickets`, the model under the gateway's name
# `code`, a weekly ceiling of 20,000,000 tokens each, and the prompt-cache hit count passed back
# (GATEWAY_REPORT_CACHED, OLA-356: one caller only, so the runs price hits at the cached rate). Kept apart
# from Ola's gateway: these models serve our own tracker's tickets only, never a person's project.
# The upstream is Together, or OpenRouter for a model whose models.json entry says `provider:
# "openrouter"` (OLA-370, lib.mjs PROVIDERS). The Together key (from .env.local) and the OpenRouter key
# (the file ~/.ola/openrouter.key, mode 600) are read into that gateway's environment only, never printed.
#   apps/activist-ai/tickets/gateway.sh <model> [<model>…]    (state and logs in ~/ola-trials/.gw)
set -eu
here=${0:A:h}
state=$HOME/ola-trials/.gw
mkdir -p $state && chmod 700 $state
together_key() {
  local f k
  for f in $here/../../../.env.local $HOME/.macplus-backend.env; do
    [[ -r $f ]] && k=$(grep '^TOGETHER_API_KEY=' $f | head -1 | cut -d= -f2- | tr -d '"') && [[ -n $k ]] && { print -r -- $k; return }
  done
  return 1
}
[[ -s $state/token ]] || { (umask 077; openssl rand -hex 24 > $state/token) }
for alias in "$@"; do
  line=$(node --input-type=module -e 'const l = await import(process.argv[1]); const u = l.upstreamOf(process.argv[2]); console.log(l.portOf(process.argv[2]) + " " + l.MODELS[process.argv[2]].id + " " + u.provider + " " + u.base + " " + (u.keyFile || ""))' $here/lib.mjs $alias 2>/dev/null) || { echo "unknown model $alias"; exit 1 }
  parts=(${=line}); port=$parts[1]; id=$parts[2]; provider=$parts[3]; base=$parts[4]; keyfile=${parts[5]:-}
  if [[ -n $keyfile ]]; then
    f=$HOME/$keyfile
    [[ -r $f ]] || { echo "$alias: $f not found"; exit 1 }
    [[ $(stat -f %Lp $f) == 600 ]] || { echo "$alias: $f must be mode 600"; exit 1 }
    key=$(tr -d '[:space:]' < $f)
  else
    key=$(together_key) || { echo "TOGETHER_API_KEY not found"; exit 1 }
  fi
  [[ -n $key ]] || { echo "$alias: empty key"; exit 1 }
  UPSTREAM_BASE_URL=$base UPSTREAM_API_KEY=$key \
  GATEWAY_TOKENS=tickets:$(cat $state/token) GATEWAY_HOST=127.0.0.1 GATEWAY_PORT=$port \
  GATEWAY_MODELS=code=$id GATEWAY_DB=$state/$alias.db GATEWAY_REPORT_CACHED=1 \
  GATEWAY_WEEKLY_TOKENS=20000000 GATEWAY_MAX_INFLIGHT=6 GATEWAY_MAX_INFLIGHT_PER_CALLER=6 GATEWAY_MAX_QUEUED_PER_CALLER=24 \
    nohup node $here/../gateway/server.mjs >> $state/$alias.log 2>&1 &
  echo "$alias ($id at $provider): gateway pid $! on http://127.0.0.1:$port/v1"
done
