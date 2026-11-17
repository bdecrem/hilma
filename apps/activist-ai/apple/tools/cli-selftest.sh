#!/bin/bash
# The `ola` command end to end, beside the real app without touching it (its own settings suite,
# scratch Application Support, throwaway Keychain names; never a window):
#
#   tools/cli-selftest.sh <Ola.app>                 against tools/stub-ola.py (a stand-in for app.ola.cx with
#                                                   a fake model) and tools/stub-browser.sh (a stand-in browser)
#   tools/cli-selftest.sh <Ola.app> https://app.ola.cx   live, once the server is deployed: your real browser opens
#                                                   once and you approve with your passkey; the checks that need
#                                                   the stand-in (fake model, tool call) are skipped
#
# One PASS or FAIL line per check; exits 0 only if all passed.
set -uo pipefail
APP="${1:?usage: tools/cli-selftest.sh <Ola.app> [base]}"
BASE="${2:-}"
TOOLS="$(cd "$(dirname "$0")" && pwd)"
OLA="$APP/Contents/MacOS/Ola"
SCRATCH="$(mktemp -d -t ola-cli-check)"
WORK="$SCRATCH/work"; mkdir -p "$WORK"
export OLA_SECRET_PREFIX="cx.ola.throwaway-cli-check-$$."
export OLA_DEFAULTS_SUITE="cx.ola.cli-check.$$"
export OLA_SUPPORT_DIR="$SCRATCH/support"
FAILS=0
check() { if [ "$1" = 0 ]; then echo "PASS  $2"; else echo "FAIL  $2${3:+  ($3)}"; FAILS=$((FAILS+1)); fi; }
lim() { perl -e "alarm $1; exec @ARGV[1..\$#ARGV]" "$@"; }
ola() { (cd "$WORK" && lim 90 "$OLA" --cli "$@"); }

STUB=""
if [ -z "$BASE" ]; then
  python3 "$TOOLS/stub-ola.py" 0 > "$SCRATCH/stub.out" 2>&1 &
  STUB=$!
  for _ in $(seq 1 50); do grep -q '^port' "$SCRATCH/stub.out" && break; sleep 0.1; done
  BASE="http://127.0.0.1:$(sed -n 's/^port //p' "$SCRATCH/stub.out")"
  export OLA_OPEN_BROWSER="$TOOLS/stub-browser.sh"
  echo "against a stand-in at $BASE"
else
  echo "live against $BASE: approve this Mac in the browser when it opens"
fi
export OLA_ACCOUNT_BASE="$BASE"
cleanup() {
  [ -n "$STUB" ] && kill "$STUB" 2>/dev/null
  "$OLA" --forget-secret account >/dev/null 2>&1
  defaults delete "$OLA_DEFAULTS_SUITE" >/dev/null 2>&1
  rm -rf "$SCRATCH"
}
trap cleanup EXIT

out=$(ola whoami 2>&1); rc=$?
[ $rc = 1 ] && [[ "$out" == *"ola login"* ]]; check $? "before sign-in, ola whoami says so and offers ola login" "$out"
out=$(ola "Say hello" 2>&1); rc=$?
[ $rc = 1 ] && [[ "$out" == *"not signed in"* ]]; check $? "before sign-in, a request is refused plainly" "$out"
if [ -n "$STUB" ]; then
  out=$(OLA_STUB_CANCEL=1 ola login 2>&1); rc=$?
  [ $rc = 1 ] && [ "$(echo "$out" | tail -1)" = "Sign-in was cancelled." ]; check $? "Cancel in the browser: one plain line, exit 1" "$(echo "$out" | tail -1)"
fi
out=$(ola login 2>&1); rc=$?
check $rc "ola login (kind cli) signs in through the browser step" "$(echo "$out" | tail -1)"
out=$(ola whoami 2>&1); rc=$?
[ $rc = 0 ] && [[ "$out" == *"signed in on this Mac"* ]]; check $? "ola whoami" "$out"
out=$(ola status 2>&1); rc=$?
[ $rc = 0 ] && [[ "$out" == *"Model:    answers"* ]]; check $? "ola status: signed in, the folder, the model answers" "$(echo "$out" | tr '\n' '|')"
reply=$(ola "Say hello in five words" 2>/dev/null); rc=$?
if [ -n "$STUB" ]; then
  [ $rc = 0 ] && [[ "$reply" == *"Hello from the stub model."* ]]; check $? "ola \"…\" prints the model's reply and exits 0" "$reply"
  seen=$(curl -s "$BASE/stub/seen")
  python3 -c 'import json,sys; s=json.loads(sys.argv[1]); sys.exit(0 if s and all(v for _,v in s) else 1)' "$seen"
  check $? "every model request reached the server with the account token (never the door's key)" "$seen"
  rm -f "$WORK/made-by-ola.txt"
  out=$(ola run "RUN-A-COMMAND please" 2>&1 < /dev/null)
  [ ! -e "$WORK/made-by-ola.txt" ] && [[ "$out" == *"rejected"* ]]; check $? "a one-shot run cannot ask, so a shell command is refused, not run" "$(echo "$out" | grep -i reject | head -1)"
else
  [ $rc = 0 ] && [ -n "$reply" ]; check $? "ola \"…\" prints a reply and exits 0" "$reply"
fi
[ ! -e "$OLA_SUPPORT_DIR/local/opencode.pid" ]; check $? "the command keeps no pid file, so the app never takes its server for its own"
# The app's "On this Mac" store: what the app's server reads, from the same folder.
OC="$HOME/Library/Application Support/Ola/opencode/bin/opencode"; [ -x "$OC" ] || OC="$HOME/Library/Application Support/Ola/opencode/node_modules/.bin/opencode"
L="$OLA_SUPPORT_DIR/local"
n=$(cd "$WORK" && XDG_CONFIG_HOME="$SCRATCH/cfg" XDG_DATA_HOME="$L/data" XDG_STATE_HOME="$L/state" XDG_CACHE_HOME="$L/cache" OPENCODE_DISABLE_CLAUDE_CODE=1 OPENCODE_DISABLE_PROJECT_CONFIG=1 lim 60 "$OC" session list --standalone 2>/dev/null | grep -c '^ses_')
[ "${n:-0}" -ge 1 ]; check $? "the conversation is in the app's On this Mac store (sessions there: ${n:-0})"
leftover() { pgrep -f "Ola --cli|--server http://127.0.0.1|$OLA_SUPPORT_DIR" | grep -v "^$$\$" | wc -l | tr -d ' '; }
out=$(cd "$WORK" && python3 "$TOOLS/pty-check.py" --wait-for "Build" --resize --keys '\x03' --timeout 15 -- "$OLA" --cli); rc=$?
sleep 1
[ $rc = 0 ] && [[ "$out" == *"resized=yes"* ]] && [[ "$out" == *"exited 0"* ]] && [ "$(leftover)" = 0 ]; check $? "ola in a terminal: draws, redraws on resize, Ctrl-C ends it, nothing left running" "$out"
if [ -n "$STUB" ]; then
  out=$(cd "$WORK" && python3 "$TOOLS/pty-check.py" --wait-for "Build" --keys 'RUN-A-COMMAND\r' --timeout 10 --log "$SCRATCH/tui.log" -- "$OLA" --cli)
  sleep 3
  grep -q "Allow once" "$SCRATCH/tui.log" && [ ! -e "$WORK/made-by-ola.txt" ]; check $? "in a terminal, a shell command asks (Allow once / Always allow / Reject) and waits"
  [ "$(leftover)" = 0 ]; check $? "killed while it waits: the interface, the agent and the door are gone" "$(leftover) left"
fi
out=$(cd "$WORK" && python3 "$TOOLS/pty-check.py" --wait-for "Build" --kill-parent --timeout 5 -- "$OLA" --cli)
sleep 3
[ "$(leftover)" = 0 ]; check $? "ola killed outright (SIGKILL): nothing it started is left" "$(leftover) left"
out=$(ola logout 2>&1); rc=$?
check $rc "ola logout" "$out"
out=$(ola whoami 2>&1); rc=$?
[ $rc = 1 ]; check $? "after logout, not signed in" "$out"
if [ -n "$STUB" ]; then
  # Signed out by the server (every computer revoked): never a retry loop. Ten refused passes in
  # 15 minutes block the person's whole address at the real door.
  ola login >/dev/null 2>&1
  curl -s "$BASE/stub/revoke-all" >/dev/null
  n0=$(curl -s "$BASE/stub/count" | python3 -c 'import json,sys; print(json.load(sys.stdin)["requests"])')
  out=$(ola "Say hello" 2>&1 < /dev/null); rc=$?
  n1=$(curl -s "$BASE/stub/count" | python3 -c 'import json,sys; print(json.load(sys.stdin)["requests"])')
  [ $rc != 0 ] && [ $((n1 - n0)) -le 1 ]; check $? "signed out by the server, a request ends with an error after at most one request there" "exit $rc, $((n1 - n0)) request(s)"
  out=$(ola whoami 2>&1); rc=$?
  n2=$(curl -s "$BASE/stub/count" | python3 -c 'import json,sys; print(json.load(sys.stdin)["requests"])')
  [ $rc = 1 ] && [[ "$out" == *"ola login"* ]] && [ $((n2 - n1)) = 0 ]; check $? "the Mac forgot the sign-in at once: whoami offers ola login and asks nothing" "$out; $((n2 - n1)) request(s)"
fi
echo; [ $FAILS = 0 ] && echo "ALL PASSED" || echo "$FAILS FAILED"
exit $FAILS
