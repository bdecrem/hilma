#!/bin/bash
# Weekly Mac-mini service health check with a self-healing loop. Run by
# launchd on the iMac M4 (~/Library/LaunchAgents/sh.hilma.mini-healthcheck.plist,
# Mondays 9:00).
#
# Pass 1 checks the services F2/Dodo depend on:
#   - the mini's launchd agents (youtube proxy, iMessage bridge, tunnel)
#   - the YouTube-transcript proxy, on the mini AND from outside through the
#     tunnel with the live secret (secret drift broke this silently once)
#   - BlueBubbles (the iMessage sender) process + port
#   - feynd.cc production
#
# If anything fails, a headless Claude Code session is launched to diagnose
# and repair (it can ssh to the mini, restart launchd agents, etc.), then the
# checks re-run. The final report goes to Bart as an iMessage through the
# mini's BlueBubbles — deliberately no SendGrid.

set -u
# 2026-09-01: mini moved to CASBS — Stanford IP, reachable from on-campus
# machines (e.g. the iMac M1 there). Off-campus SSH likely blocked at the
# Stanford border; if this check runs from home it needs a tunnel or a move
# to an on-campus machine.
MINI="admin@171.66.240.175"
REPO="/Users/bartdecrem/Documents/coding2025/hilma"
CLAUDE_BIN="/Users/bartdecrem/.local/bin/claude"
TESTVID="dQw4w9WgXcQ"

PASS="✅"; FAIL="❌"
LINES=()
ok=0; bad=0

note() { # $1 = pass|fail, $2 = label, $3 = detail
  if [ "$1" = pass ]; then LINES+=("$PASS $2 — $3"); ok=$((ok+1))
  else LINES+=("$FAIL $2 — $3"); bad=$((bad+1)); fi
}

run_checks() {
  LINES=(); ok=0; bad=0

  # 1. mini reachable + services loaded
  local SVC
  SVC=$(ssh -o ConnectTimeout=10 -o BatchMode=yes "$MINI" 'launchctl list' 2>/dev/null)
  if [ -z "$SVC" ]; then
    note fail "Mac mini ssh" "unreachable"
  else
    note pass "Mac mini ssh" "reachable"
    for svc in sh.f2.youtube-proxy sh.f2.bridge sh.tunn3l.f2-mini; do
      if echo "$SVC" | grep -q "$svc"; then note pass "$svc" "loaded"
      else note fail "$svc" "NOT loaded"; fi
    done
  fi

  # 2. transcript proxy: on the mini + through the tunnel. The mini's own
  #    .env.local holds the authoritative secret.
  local SECRET LOCAL TUN
  SECRET=$(ssh -o ConnectTimeout=10 -o BatchMode=yes "$MINI" \
    'grep "^F2_YOUTUBE_FETCH_SECRET=" ~/Documents/code/hilma/.env.local | cut -d= -f2' 2>/dev/null)
  if [ -n "${SECRET:-}" ]; then
    LOCAL=$(ssh -o ConnectTimeout=10 -o BatchMode=yes "$MINI" \
      "curl -s -m 25 -H 'x-f2-secret: $SECRET' 'http://localhost:3000/api/f2/youtube-transcript?v=$TESTVID'" 2>/dev/null)
    if echo "$LOCAL" | grep -q '"text"'; then note pass "YouTube proxy (mini-local)" "returned a transcript"
    else note fail "YouTube proxy (mini-local)" "no transcript: ${LOCAL:0:80}"; fi

    TUN=$(curl -s -m 30 -H "x-f2-secret: $SECRET" \
      "https://f2-mini.tunn3l.sh/api/f2/youtube-transcript?v=$TESTVID" 2>/dev/null)
    if echo "$TUN" | grep -q '"text"'; then note pass "YouTube proxy (via tunnel)" "returned a transcript"
    else note fail "YouTube proxy (via tunnel)" "no transcript: ${TUN:0:80}"; fi
  else
    note fail "proxy secret" "couldn't read F2_YOUTUBE_FETCH_SECRET from the mini"
  fi

  # 3. BlueBubbles (iMessage)
  local BB
  BB=$(ssh -o ConnectTimeout=10 -o BatchMode=yes "$MINI" \
    'pgrep -fl -i bluebubbles >/dev/null && echo proc-ok; lsof -iTCP:1234 -sTCP:LISTEN >/dev/null 2>&1 && echo port-ok' 2>/dev/null)
  case "$BB" in
    *proc-ok*port-ok*) note pass "BlueBubbles" "process running, port 1234 listening" ;;
    *proc-ok*)         note fail "BlueBubbles" "process running but port 1234 not listening" ;;
    *)                 note fail "BlueBubbles" "process not running" ;;
  esac

  # 4. production up
  local PRODCODE
  PRODCODE=$(curl -s -m 20 -o /dev/null -w '%{http_code}' https://feynd.cc/api/f2/auth/me)
  if [ "$PRODCODE" = "401" ] || [ "$PRODCODE" = "200" ]; then
    note pass "feynd.cc" "responding ($PRODCODE)"
  else
    note fail "feynd.cc" "unexpected status $PRODCODE"
  fi
}

send_imessage() { # $1 = text
  printf '%s' "$1" | \
  ssh -o ConnectTimeout=10 -o BatchMode=yes "$MINI" '
    TEXT=$(cat)
    BBPASS=$(sqlite3 "$HOME/Library/Application Support/bluebubbles-server/config.db" \
      "select value from config where name='"'"'password'"'"'" 2>/dev/null | head -1)
    TEXT="$TEXT" BBPASS="$BBPASS" python3 -c '"'"'
import json, os, time, urllib.request
req = urllib.request.Request(
    "http://localhost:1234/api/v1/message/text?password=" + os.environ["BBPASS"],
    data=json.dumps({
        "chatGuid": "any;-;+16508989508",
        "message": os.environ["TEXT"],
        "method": "apple-script",
        "tempGuid": "healthcheck-" + str(int(time.time())),
    }).encode(),
    headers={"Content-Type": "application/json"},
)
print("imessage:", urllib.request.urlopen(req, timeout=30).status)
'"'"''
}

# --- pass 1 --------------------------------------------------------------
run_checks
FIRST_REPORT=$(printf '%s\n' "${LINES[@]}")
FIRST_BAD=$bad

if [ "$FIRST_BAD" -eq 0 ]; then
  send_imessage "$(printf 'Dodo infra weekly check: all good (%s checks).\n%s' "$ok" "$FIRST_REPORT")"
  printf '%s\n' "$FIRST_REPORT"
  exit 0
fi

# --- self-heal -----------------------------------------------------------
# Hand the failures to a headless Claude Code session with full tools. It
# runs from the hilma repo (project CLAUDE.md carries the mini playbooks)
# and can ssh to the mini, kickstart launchd agents, restart tunnels, etc.
FIX_PROMPT="The weekly Mac-mini health check (scripts/mini-healthcheck.sh) found failures:

$FIRST_REPORT

Diagnose and FIX each failed item. Context: the mini is admin@192.168.7.50 (ssh key auth works). Its services are launchd agents (sh.f2.youtube-proxy on port 3000, sh.f2.bridge, sh.tunn3l.f2-mini exposing f2-mini.tunn3l.sh); restart with launchctl kickstart -k gui/501/<label>. BlueBubbles is a login app on port 1234. The proxy secret lives in the mini's ~/Documents/code/hilma/.env.local. Deploy path for mini code: ssh in and run bash ~/hilma-deploy/apps/macplus/backend/update.sh — never rsync or hand-start. Do not reboot the mini. When done, summarize in 3 lines or fewer what you fixed and what (if anything) you could not fix."

FIX_LOG=$(cd "$REPO" && /opt/homebrew/bin/timeout 1500 "$CLAUDE_BIN" -p "$FIX_PROMPT" \
  --dangerously-skip-permissions 2>&1 | tail -c 1500)

# --- pass 2 --------------------------------------------------------------
run_checks
SECOND_REPORT=$(printf '%s\n' "${LINES[@]}")

if [ "$bad" -eq 0 ]; then
  HEAD="Dodo infra weekly check: $FIRST_BAD problem(s) found and FIXED. All $ok checks now pass."
else
  HEAD="Dodo infra weekly check: $FIRST_BAD problem(s) found, $bad STILL FAILING after a repair attempt."
fi
send_imessage "$(printf '%s\n\nAfter repair:\n%s\n\nRepair agent notes:\n%s' "$HEAD" "$SECOND_REPORT" "$FIX_LOG")"
printf 'PASS1:\n%s\nFIX:\n%s\nPASS2:\n%s\n' "$FIRST_REPORT" "$FIX_LOG" "$SECOND_REPORT"
exit 0
