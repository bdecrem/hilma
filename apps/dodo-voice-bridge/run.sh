#!/bin/bash
# Run the Dodo voice bridge and make it reachable: the bridge, a Cloudflare
# quick tunnel in front of it, and the two Speech Engines pointed at the
# tunnel's hostname (a quick tunnel gets a new one on every start).
#
#   bash apps/dodo-voice-bridge/run.sh            # foreground; Ctrl-C stops all
#
# Env comes from ~/.dodo-voice-bridge.env when it exists (the mini, launchd),
# else from the repo's .env.local (a dev machine):
#   ELEVENLABS_API_KEY, DODO_BRIDGE_SECRET        required
#   DODO_BRIDGE_BACKENDS                          default: prod → feynd.cc, dev → localhost:3100
set -euo pipefail
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

if [ -f "$HOME/.dodo-voice-bridge.env" ]; then
  set -a; . "$HOME/.dodo-voice-bridge.env"; set +a
else
  set -a; eval "$(grep -E '^(ELEVENLABS_API_KEY|DODO_BRIDGE_SECRET)=' ../../.env.local)"; set +a
fi
export PORT="${PORT:-3901}"
export DODO_BRIDGE_BACKENDS="${DODO_BRIDGE_BACKENDS:-{\"prod\":\"https://feynd.cc\",\"dev\":\"http://localhost:3100\"}}"

[ -d node_modules ] || npm install --no-audit --no-fund
command -v cloudflared >/dev/null || { echo "cloudflared is not installed (brew install cloudflared)"; exit 1; }

TUNNEL_LOG="$(mktemp -t dodo-voice-tunnel)"
cleanup() { kill "${BRIDGE_PID:-}" "${TUNNEL_PID:-}" 2>/dev/null || true; rm -f "$TUNNEL_LOG"; }
trap cleanup EXIT

node server.mjs &
BRIDGE_PID=$!

cloudflared tunnel --url "http://localhost:$PORT" --no-autoupdate >"$TUNNEL_LOG" 2>&1 &
TUNNEL_PID=$!

ORIGIN=""
for _ in $(seq 1 30); do
  ORIGIN="$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$TUNNEL_LOG" | head -1 || true)"
  [ -n "$ORIGIN" ] && break
  sleep 1
done
[ -n "$ORIGIN" ] || { echo "no tunnel hostname after 30 s:"; cat "$TUNNEL_LOG"; exit 1; }

# The hostname resolves a few seconds after it is announced. Ask Cloudflare's
# resolver directly (DNS over HTTPS): macOS caches the first "no such host"
# for a while, which would fail this check on a perfectly good tunnel.
healthy() { curl -fsS -m 6 --doh-url https://cloudflare-dns.com/dns-query "$ORIGIN/health" >/dev/null 2>&1; }
for _ in $(seq 1 30); do healthy && break; sleep 2; done
healthy || { echo "tunnel $ORIGIN never answered /health"; exit 1; }

node engines.mjs "$ORIGIN"
echo "$(date -u +%FT%TZ) bridge up at $ORIGIN"

# If either process dies, exit so launchd (KeepAlive) starts the pair again.
while kill -0 "$BRIDGE_PID" 2>/dev/null && kill -0 "$TUNNEL_PID" 2>/dev/null; do sleep 5; done
echo "$(date -u +%FT%TZ) bridge or tunnel exited — stopping"
exit 1
