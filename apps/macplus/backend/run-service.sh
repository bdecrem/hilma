#!/bin/bash
#
# run-service.sh <name> — exec one MacPlus backend service. This is what every
# sh.macplus.* LaunchAgent actually runs; ALL service logic (command, port,
# socat options, per-service env) lives here, version-controlled, so a plain
# `git pull` in the deploy clone updates the fleet's behavior. The plists in
# ~/Library/LaunchAgents are thin shims that never need to change.
#
# Services (see ../BACKEND.md for the full map):
#   code     :2324  socat -> Macinclaude Code agent (interactive VT100; cooked pty)
#   paint    :2325  socat -> Atkinson image agent   (raw,echo=0 — direct TCP now)
#   surf     :2326  socat -> Surf reader-mode agent (raw,echo=0 — protocol agent!)
#   mux      :2330  node:net multiplexer (the WiFi service front door)
#   imessage :2328  node:net iMessage bridge (chat.db read + AppleScript send)
#   diag     :2331  node:net diagnostic log sink
#   quote    :2332  node:net quote of the day
#   bridge   :2333  node:net OTA app delivery (watches ~/bridge-outbox)
#   screen   :2334  node:net on-demand screenshot of the Plus (watches ~/.screen-grab)
#   netspeed :2335  node:net bulk server for the Plus NetSpeed speed test
#   rsh      :2329  node:net INSTANT shell for Plutonix (raw TCP -> pty, no SSH)
#   pixel    :2337  node:net Daily Pixel collaborative canvas (+ daily Claude strokes)
#
# Secrets come from ~/.macplus-backend.env (chmod 600, NOT in git, NOT in the
# plists). backend/update.sh re-syncs it from the dev tree's .env.local when
# that file is readable.
set -u

NAME="${1:?usage: run-service.sh <code|paint|surf|mux|imessage|diag|quote|bridge|screen|netspeed|porthole|pssh|rsh|pixel|imsghttp>}"
DEPLOY="${MACPLUS_DEPLOY:-/Users/admin/hilma-deploy}"
BASE="$DEPLOY/apps/macplus"
SOCAT=/opt/homebrew/bin/socat
# The Code agent's *workspace* (where it edits/reads for the Plus user). Its own
# program code runs from the deploy clone regardless. NOTE: ~/Documents is TCC-
# protected — launchd-spawned processes can't read it until the responsible
# binary is granted Full Disk Access (see BACKEND.md "TCC grants").
CODE_WORKDIR="${MACPLUS_CODE_WORKDIR:-/Users/admin/Documents/code/hilma}"

# Central secrets (ANTHROPIC_API_KEY, OPENAI_API_KEY, SUPABASE_*, ...).
ENVFILE="$HOME/.macplus-backend.env"
if [ -r "$ENVFILE" ]; then
  set -a; . "$ENVFILE"; set +a
else
  echo "run-service[$NAME]: WARNING: $ENVFILE missing — services needing API keys will fail" >&2
fi

tsx_for() { echo "$BASE/$1/node_modules/.bin/tsx"; }

case "$NAME" in
  code)
    exec "$SOCAT" TCP-LISTEN:2324,reuseaddr,fork \
      EXEC:"$(tsx_for agent) $BASE/agent/src/main.ts --cwd $CODE_WORKDIR --cols 80",pty,setsid,ctty
    ;;
  paint)
    export ATK_PYTHON="${ATK_PYTHON:-/usr/bin/python3}"   # only this python has Pillow
    # raw,echo=0: the Plus now connects by direct TCP (MacTCP/DaynaPORT), not
    # through the modem+telnet. A cooked pty would echo the prompt back and
    # ONLCR-mangle the hex frame (serial lesson #2). Match surf's raw mode.
    exec "$SOCAT" TCP-LISTEN:2325,reuseaddr,fork \
      EXEC:"$(tsx_for agent-atkinson) $BASE/agent-atkinson/src/main.ts",pty,raw,echo=0,setsid,ctty
    ;;
  surf)
    # raw,echo=0: line-protocol agent — a cooked pty echoes commands back and
    # re-triggers them (serial lesson #2 in apps/macplus/CLAUDE.md).
    exec "$SOCAT" TCP-LISTEN:2326,reuseaddr,fork \
      EXEC:"$(tsx_for agent-surf) $BASE/agent-surf/src/main.ts",pty,raw,echo=0,setsid,ctty
    ;;
  mux)      cd "$BASE/agent-mux";      exec ./node_modules/.bin/tsx src/main.ts --listen 2330 ;;
  imessage) cd "$BASE/agent-imessage"; exec ./node_modules/.bin/tsx src/main.ts --listen 2328 ;;
  diag)     cd "$BASE/agent-diag";     exec ./node_modules/.bin/tsx src/main.ts --listen 2331 ;;
  quote)    cd "$BASE/agent-quote";    exec ./node_modules/.bin/tsx src/main.ts --listen 2332 ;;
  bridge)
    mkdir -p "${BRIDGE_OUTBOX:-$HOME/bridge-outbox}"
    cd "$BASE/agent-bridge"; exec ./node_modules/.bin/tsx src/main.ts --listen 2333 ;;
  screen)   cd "$BASE/agent-screen";   exec ./node_modules/.bin/tsx src/main.ts --listen 2334 ;;
  netspeed) cd "$BASE/agent-netspeed"; exec /usr/bin/env node server.js ;;
  porthole)
    export PORT_PYTHON="${PORT_PYTHON:-/usr/bin/python3}"   # the python with Pillow (dither.py)
    cd "$BASE/agent-porthole"; exec ./node_modules/.bin/tsx src/main.ts --listen 2336 ;;
  pssh)
    # SSH server with NO login-grace limit, so the Plus's multi-minute handshake
    # completes (the system sshd on :22 kills it). login -f admin shell.
    export PSSH_LOGIN_USER="${PSSH_LOGIN_USER:-admin}"
    cd "$BASE/agent-pssh"; exec /usr/bin/env node src/server.js --listen 2222 ;;
  imsghttp)
    # Outbound iMessage over HTTP for F2 (daily cards, chat replies) — see
    # agent-imsghttp/server.mjs. Auth via IMSG_HTTP_SECRET from the env file.
    cd "$BASE/agent-imsghttp"; exec /usr/bin/env node server.mjs --listen 2340 ;;
  pixel)
    # Daily Pixel canvas — dependency-free node (needs ANTHROPIC_API_KEY for
    # the daily Claude strokes; runs fine without, just never draws).
    cd "$BASE/agent-pixel"; exec /usr/bin/env node server.mjs --listen 2337 ;;
  rsh)
    # INSTANT shell for Plutonix — raw TCP -> pty -> login shell. No SSH, no
    # handshake, no per-key crypto; trusted-LAN only (same model as :2323).
    export RSH_LOGIN_USER="${RSH_LOGIN_USER:-admin}"
    cd "$BASE/agent-rsh"; exec /usr/bin/env node server.mjs --listen 2329 ;;
  oracle)
    # THE ORACLE hosted on the mini: numpy fp32 inference of the same 1985 model
    # the Plus runs, plus chat memory / top-p / repetition penalty / postproc.
    # Lazily builds a venv with numpy + sentencepiece on first launch.
    D="$BASE/agent-oracle"; PY="$D/.venv/bin/python"
    if ! "$PY" -c "import numpy, sentencepiece" 2>/dev/null; then
      /usr/bin/python3 -m venv "$D/.venv"
      "$D/.venv/bin/pip" install -q --disable-pip-version-check numpy sentencepiece
    fi
    cd "$D"; exec "$PY" oracle_server.py --listen 2338 ;;
  *)
    echo "run-service: unknown service '$NAME'" >&2; exit 64 ;;
esac
