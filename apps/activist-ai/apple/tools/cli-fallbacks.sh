#!/bin/bash
# The `ola` command's fallbacks, end to end, against tools/stub-ola.py (a stand-in for app.ola.cx whose
# gateway serves a made-up hosted open model, "Made-up Cloud"), beside the real app without touching
# it (its own settings suite, scratch Application Support, throwaway Keychain names, as cli-selftest.sh):
#   tools/cli-fallbacks.sh <Ola.app> [transcript-file]
# ola settings; ola /hosted (served, marked, the model really "hosted"); the same refused in one line
# when the account may not use it; Bart's sentence "hey can you use claude code for this next thing?"
# (the Claude card, never the everyday model), with and without a terminal; ola /claude with the real
# Claude Code when it is installed and signed in here (OLA_CLAUDE_LIVE=1; one tiny request).
set -u
APP="${1:?Ola.app}"
OUT="${2:-/dev/stdout}"
OLA="$APP/Contents/MacOS/Ola"
TOOLS="$(cd "$(dirname "$0")" && pwd)"
SCRATCH="$(mktemp -d -t ola-fb)"
WORK="$SCRATCH/work"; mkdir -p "$WORK"
export OLA_SECRET_PREFIX="cx.ola.throwaway-fb-check-$$."
export OLA_DEFAULTS_SUITE="cx.ola.fb-check.$$"
export OLA_SUPPORT_DIR="$SCRATCH/support"
FAILS=0
say() { echo "$@" | tee -a "$OUT" >/dev/null; [ "$OUT" = /dev/stdout ] || echo "$@"; }
check() { if [ "$1" = 0 ]; then say "PASS  $2"; else say "FAIL  $2${3:+  ($3)}"; FAILS=$((FAILS+1)); fi; }
lim() { perl -e "alarm $1; exec @ARGV[1..\$#ARGV]" "$@"; }
ola() { (cd "$WORK" && lim 120 "$OLA" --cli "$@"); }
start_stub() {
  OLA_STUB_HOSTED="$1" python3 "$TOOLS/stub-ola.py" 0 > "$SCRATCH/stub.out" 2>&1 &
  STUB=$!
  for _ in $(seq 1 50); do grep -q '^port' "$SCRATCH/stub.out" && break; sleep 0.1; done
  export OLA_ACCOUNT_BASE="http://127.0.0.1:$(sed -n 's/^port //p' "$SCRATCH/stub.out")"
  printf 'right password here\n' > "$SCRATCH/pw"
  { echo bart; cat "$SCRATCH/pw"; } | (cd "$WORK" && lim 60 "$OLA" --cli login) >/dev/null 2>&1
}
models() { curl -s "$OLA_ACCOUNT_BASE/stub/models"; }
cleanup() { kill "$STUB" 2>/dev/null; "$OLA" --forget-secret account >/dev/null 2>&1; defaults delete "$OLA_DEFAULTS_SUITE" >/dev/null 2>&1; rm -rf "$SCRATCH"; }
trap cleanup EXIT
show() { say "\$ $1"; echo "$2" | sed 's/^/  /' | tee -a "$OUT" >/dev/null; }

start_stub on
out=$(ola settings 2>&1); rc=$?; show "ola settings" "$out"
[ $rc = 0 ] && [[ "$out" == *"Fallback to the hosted open model:     off (at Made-up Cloud, \$0.03 of \$20.00 this month)"* ]]; check $? "ola settings: both off, the hosted model at its provider with this month"
out=$(ola /hosted "Say hello" 2>&1); rc=$?; show "ola /hosted \"Say hello\"" "$out"
[ $rc = 0 ] && [[ "$out" == *"Hello from the hosted stub model."* ]] && [[ "$out" == *"Answered by the hosted open model at Made-up Cloud, outside Ola."* ]] && [[ "$(models)" == *'"hosted"'* ]]
check $? "ola /hosted: the request went to the model hosted, the reply is marked" "$(models)"
n0=$(models | tr ',' '\n' | grep -c .)
out=$(ola "hey can you use claude code for this next thing?" < /dev/null 2>&1); rc=$?; show "ola \"hey can you use claude code for this next thing?\"   (no terminal)" "$out"
n1=$(models | tr ',' '\n' | grep -c .)
[ $rc = 2 ] && [[ "$out" == *"ola /claude"* ]] && [ "$n0" = "$n1" ]; check $? "Bart's sentence without a terminal: says how (ola /claude), nothing sent to the everyday model" "$n0 -> $n1"
out=$(cd "$WORK" && python3 "$TOOLS/pty-check.py" --wait-for "Not now" --keys 'n\r' --timeout 30 --log "$SCRATCH/card.log" -- "$OLA" --cli "hey can you use claude code for this next thing?" 2>&1); rc=$?
card=$(tr -d '\r' < "$SCRATCH/card.log" 2>/dev/null)
n2=$(models | tr ',' '\n' | grep -c .)
show "ola \"hey can you use claude code for this next thing?\"   (in a terminal, answered n)" "$card"
if [[ "$card" == *"Claude Code is not installed"* || "$card" == *"not signed in"* ]]; then
  check 0 "Bart's sentence in a terminal: Claude Code is not ready here, said in one line"
else
  [[ "$card" == *"Hand this to Claude Code?"* ]] && [[ "$card" == *"[j] Just this once  [a] Always in this folder  [n] Not now"* ]] && [ "$n1" = "$n2" ]
  check $? "Bart's sentence in a terminal: the Claude card with its three choices, nothing sent to the everyday model" "$rc $n1 -> $n2"
fi
kill "$STUB" 2>/dev/null; wait "$STUB" 2>/dev/null
start_stub off
out=$(ola /hosted "Say hello" 2>&1); rc=$?; show "ola /hosted \"Say hello\"   (the account may not use it)" "$out"
[ $rc = 1 ] && [[ "$out" == "Your Ola account can’t use the hosted open model yet."* ]] && [[ "$(models)" == "[]" ]]; check $? "an account not let in: one plain line, nothing sent" "$(models)"
if [ "${OLA_CLAUDE_LIVE:-}" = 1 ]; then
  echo "This folder is a scratch folder for a check." > "$WORK/note.txt"
  out=$(ola /claude "Read note.txt and reply with its one sentence, nothing else." < /dev/null 2>&1); rc=$?; show "ola /claude \"Read note.txt and reply with its one sentence, nothing else.\"   (the real Claude Code)" "$out"
  [ $rc = 0 ] && [[ "$out" == *"scratch folder for a check"* ]] && [[ "$out" == *"Answered by Claude, outside Ola."* ]]; check $? "ola /claude: Claude Code in this folder, its step in Ola's words, the reply, marked"
fi
say "$([ $FAILS = 0 ] && echo "all passed" || echo "$FAILS failed")"
exit $FAILS
