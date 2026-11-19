#!/bin/bash
# The open-weights column on every problem, two at a time. Logs to runs/queue-*.log.
# (The Claude column ran once, on four problems, on 2026-11-18; run.mjs now refuses it, see README.)
# usage: run-all.sh [pid-to-wait-for-a] [pid-to-wait-for-b]
cd "$(dirname "$0")"
mkdir -p runs
lane() {
  local after=$1; shift
  if [ -n "$after" ]; then while kill -0 "$after" 2>/dev/null; do sleep 10; done; fi
  for p in "$@"; do node run.mjs run "$p" ola >> runs/queue-ola.log 2>&1; done
}
if [ -n "$1" ]; then
  lane "$1" signup-sheet memory-game &
  lane "$2" unit-converter todo-due &
else
  lane "" crossword signup-sheet memory-game unit-converter &
  lane "" tip-split countdown todo-due &
fi
wait
echo done >> runs/queue-ola.log
