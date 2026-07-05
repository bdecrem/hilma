#!/usr/bin/env bash
# Lossless-verification gate for engine changes (fixed-point).
# Compares a CANDIDATE engine build against a saved FLOAT REFERENCE build on
# greedy generation across a prompt battery. Both are gpttest binaries with the
# identical output format (continuation only), so the comparison is clean.
#
# Greedy (temp 0) is deterministic and maximally sensitive: one flipped argmax
# makes the sequences diverge from that point. "Identical for N/M chars" is a
# strict measure of how close the candidate stays to float.
#
#   ./quality_gate.sh save     -> build the current gpt.c as the float reference
#   ./quality_gate.sh          -> build current gpt.c as candidate, compare to ref
set -euo pipefail
cd "$(dirname "$0")"
MODEL=./model_q.bin; TOK=./tok2048.bin; N=60
REF=./gpttest_ref

if [ "${1:-}" = "save" ]; then
  clang -O2 -o "$REF" gpttest.c gpt.c -lm 2>/dev/null
  echo "saved float reference: $REF (from current gpt.c)"; exit 0
fi
[ -x "$REF" ] || { echo "no reference — run './quality_gate.sh save' on the float build first"; exit 1; }
clang -O2 -o gpttest gpttest.c gpt.c -lm 2>/dev/null

PROMPTS=( "" "the macintosh plus" "artificial intelligence" "unix is" "i think that"
          "hey buddy" "in article you write" "the best computer" )
pass=0; fail=0
for p in "${PROMPTS[@]}"; do
  ref=$( "$REF"    "$MODEL" "$TOK" "$p" "$N" 0 2>/dev/null)
  cand=$(./gpttest "$MODEL" "$TOK" "$p" "$N" 0 2>/dev/null)
  if [ "$cand" = "$ref" ]; then
    echo "  MATCH   \"$p\""; pass=$((pass+1))
  else
    common=$(printf '%s\n%s\n' "$cand" "$ref" | python3 -c "import sys
a=sys.stdin.readline().rstrip(chr(10));b=sys.stdin.readline().rstrip(chr(10));i=0
while i<len(a) and i<len(b) and a[i]==b[i]:i+=1
print(i)")
    echo "  DIVERGE \"$p\"  (identical for $common/${#ref} chars)"; fail=$((fail+1))
  fi
done
echo "----"
echo "GATE: $pass/${#PROMPTS[@]} prompts identical to the float reference"
[ "$fail" -eq 0 ] && echo "RESULT: LOSSLESS ✓" || echo "RESULT: $fail diverged — raise precision or revert before shipping"
