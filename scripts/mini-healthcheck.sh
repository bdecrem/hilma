#!/bin/bash
# Weekly Mac-mini service health check, run by launchd on the iMac M4
# (~/Library/LaunchAgents/sh.hilma.mini-healthcheck.plist, Mondays 9:00).
#
# Checks the services that F2/Dodo depend on:
#   1. The mini's launchd agents are loaded (youtube proxy, iMessage bridge,
#      tunnel).
#   2. The YouTube-transcript proxy answers with a real transcript, both on
#      the mini and from outside through the tunnel (auth included — catches
#      secret drift, which has silently broken this before).
#   3. BlueBubbles (the iMessage sender) is running and its HTTP port is up.
#   4. feynd.cc production is reachable.
#
# Reports to Bart by email (SendGrid); if that fails (credits ran out once),
# falls back to an iMessage through the mini's own BlueBubbles.

set -u
MINI="admin@192.168.7.50"
REPO="/Users/bartdecrem/Documents/coding2025/hilma"
SENDGRID_KEY=$(grep '^SENDGRID_API_KEY=' "$REPO/.env.local" | cut -d= -f2)

PASS="✅"; FAIL="❌"
LINES=()
ok=0; bad=0

note() { # $1 = pass|fail, $2 = label, $3 = detail
  if [ "$1" = pass ]; then LINES+=("$PASS $2 — $3"); ok=$((ok+1))
  else LINES+=("$FAIL $2 — $3"); bad=$((bad+1)); fi
}

# --- 1. mini reachable + services loaded --------------------------------
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

# --- 2. transcript proxy: local + through the tunnel --------------------
# The mini's own .env.local holds the authoritative secret.
SECRET=$(ssh -o ConnectTimeout=10 -o BatchMode=yes "$MINI" \
  'grep "^F2_YOUTUBE_FETCH_SECRET=" ~/Documents/code/hilma/.env.local | cut -d= -f2' 2>/dev/null)
TESTVID="dQw4w9WgXcQ"
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

# --- 3. BlueBubbles (iMessage) ------------------------------------------
BB=$(ssh -o ConnectTimeout=10 -o BatchMode=yes "$MINI" \
  'pgrep -fl -i bluebubbles >/dev/null && echo proc-ok; lsof -iTCP:1234 -sTCP:LISTEN >/dev/null 2>&1 && echo port-ok' 2>/dev/null)
case "$BB" in
  *proc-ok*port-ok*) note pass "BlueBubbles" "process running, port 1234 listening" ;;
  *proc-ok*)         note fail "BlueBubbles" "process running but port 1234 not listening" ;;
  *)                 note fail "BlueBubbles" "process not running" ;;
esac

# --- 4. production up ----------------------------------------------------
PRODCODE=$(curl -s -m 20 -o /dev/null -w '%{http_code}' https://feynd.cc/api/f2/auth/me)
if [ "$PRODCODE" = "401" ] || [ "$PRODCODE" = "200" ]; then
  note pass "feynd.cc" "responding ($PRODCODE)"
else
  note fail "feynd.cc" "unexpected status $PRODCODE"
fi

# --- report --------------------------------------------------------------
STATUS=$([ "$bad" -eq 0 ] && echo "all good" || echo "$bad PROBLEM(S)")
SUBJECT="Mini health check: $STATUS ($ok ok)"
REPORT=$(printf '%s\n' "${LINES[@]}")

PAYLOAD=$(SUBJECT="$SUBJECT" REPORT="$REPORT" python3 -c '
import json, os
body = os.environ["REPORT"].replace("\n", "<br>\n")
print(json.dumps({
    "personalizations": [{"to": [{"email": "bdecrem@gmail.com"}]}],
    "from": {"email": "amber@intheamber.com", "name": "Dodo infra"},
    "subject": os.environ["SUBJECT"],
    "content": [{"type": "text/html", "value": body}],
}))')
SENT=$(curl -s -X POST "https://api.sendgrid.com/v3/mail/send" \
  -o /dev/null -w '%{http_code}' \
  -H "Authorization: Bearer ${SENDGRID_KEY}" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

if [ "$SENT" != "202" ]; then
  # SendGrid failed (it has run out of credits before) — send an iMessage
  # through the mini's BlueBubbles instead, same rig as the daily card.
  printf '%s\n%s' "$SUBJECT" "$REPORT" | \
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
fi

printf '%s\n' "${LINES[@]}"
echo "email: $SENT"
exit 0
