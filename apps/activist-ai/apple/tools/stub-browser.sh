#!/bin/bash
# A stand-in browser for checks (OLA_OPEN_BROWSER): given the sign-in page Ola opens, it does what
# the account page does after a passkey: gets a code from the stand-in server for this challenge
# and sends the "browser" back to the app's listener with it. Never a real browser.
URL="$1"
BASE="${URL%%/#/device*}"
Q="${URL#*\#/device?}"
CH=$(printf '%s' "$Q" | tr '&' '\n' | sed -n 's/^challenge=//p')
PORT=$(printf '%s' "$Q" | tr '&' '\n' | sed -n 's/^port=//p')
(
  sleep 0.5
  CODE=$(curl -s -X POST "$BASE/stub/approve" -d "{\"challenge\":\"$CH\"}" | python3 -c 'import json,sys; print(json.load(sys.stdin)["code"])')
  curl -s "http://127.0.0.1:$PORT/?code=$CODE" > "${OLA_STUB_PAGE:-/dev/null}"
) &
