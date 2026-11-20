#!/bin/bash
# The cost tests (COST-TEST.md), a list at a time: one cc/cost.mjs job per line of a plain text file, in order.
#   ./cost-run.sh cost/today.txt
# A line is cost.mjs's arguments, e.g.
#   sources costa_rica --chunk labor_c --model claude-sonnet-5-5 --effort low --to-the-limit
# Blank lines and # comments are skipped. A job already logged as ok in cost/LOG.md is skipped (cost.mjs --skip-done),
# so the list can be restarted after a limit. The list stops when a run is cut off by the plan limit (exit 3)
# or refused because the meters are above the max (exit 4); an ordinary error moves on to the next line.
cd "$(dirname "$0")" || exit 1
list="$1"
[ -f "$list" ] || { echo "usage: ./cost-run.sh <jobs.txt>"; exit 2; }
n=0
while IFS= read -r line || [ -n "$line" ]; do
  line="${line%%#*}"
  line="$(echo "$line" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  [ -z "$line" ] && continue
  n=$((n + 1))
  echo "=== $(date '+%H:%M:%S') job $n: $line"
  eval "set -- $line"
  node cc/cost.mjs "$@" --skip-done < /dev/null
  rc=$?
  case $rc in
    3) echo "=== cut off by the plan limit: stopping the list (rerun it after the reset; finished jobs are skipped)"; exit 3 ;;
    4) echo "=== refused (meters above the max): stopping the list"; exit 4 ;;
    0) ;;
    *) echo "=== job $n failed (exit $rc), going on" ;;
  esac
done < "$list"
echo "=== $(date '+%H:%M:%S') list done"
