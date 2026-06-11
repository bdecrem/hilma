#!/bin/zsh

# DEPRECATED (2026-06-11): superseded by the deploy-clone + LaunchAgent model.
# Use backend/install-agents.sh + backend/update.sh instead. See apps/macplus/BACKEND.md.
echo "DEPRECATED: see apps/macplus/BACKEND.md (backend/install-agents.sh replaces this)" >&2
exit 1
#
# Start the Macinclaude agent listener on the Mac mini (port 2324 — the agent;
# 2323 stays the plain login shell). The Plus dials this over the RetroWiFi-SI.
#
# Loads the creds the agent needs from hilma's .env.local at launch:
#   ANTHROPIC_API_KEY     — the Agent SDK (API key, not the CLI's OAuth login)
#   SUPABASE_URL          — F2 datastore (knowledge tools)
#   SUPABASE_SERVICE_KEY  — F2 datastore, full read
# These must be in the listener's environment; socat passes them to the child.
#
# Usage (detached, survives the terminal):
#   nohup setsid ~/claude-plus/start-listener.sh > /tmp/clp-listener.log 2>&1 & disown
# Stop it:  pkill -f 'TCP-LISTEN:2324,reuseaddr,fork'
#
# Override the port/cwd/docs/model by editing the EXEC line below.
set -e

ENVFILE="${CLP_ENVFILE:-/Users/admin/Documents/code/hilma/.env.local}"
AGENT_DIR="${CLP_AGENT_DIR:-/Users/admin/claude-plus}"
PORT="${CLP_PORT:-2324}"
CWD="${CLP_CWD:-/Users/admin/Documents/code/hilma}"

for k in ANTHROPIC_API_KEY SUPABASE_URL SUPABASE_SERVICE_KEY; do
  v=$(grep -E "^$k=" "$ENVFILE" | head -1 | cut -d= -f2- | sed 's/^"//;s/"$//')
  if [[ -z "$v" ]]; then echo "start-listener: $k missing from $ENVFILE" >&2; exit 1; fi
  export "$k=$v"
done

# tsx directly (NOT npx — its spinner garbles the VT100). Child stderr stays on
# the server side (socat EXEC has no `stderr` opt), keeping Node/SDK noise off the Plus.
exec /opt/homebrew/bin/socat TCP-LISTEN:${PORT},reuseaddr,fork \
  EXEC:"${AGENT_DIR}/node_modules/.bin/tsx ${AGENT_DIR}/src/main.ts --cwd ${CWD} --cols 80",pty,setsid,ctty
