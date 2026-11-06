#!/bin/zsh
# The second pass over everything the first pass could not store. Restarts where it left off if it dies.
cd "$(dirname "$0")"
START=$(date -u +%Y-%m-%dT%H:%M:%SZ)
for i in 1 2 3 4 5 6; do
  python3 find.py --rescue --workers 8 --before "$START" >> rescue.log 2>&1 && break
  echo "restart $i $(date)" >> rescue.log; sleep 10
done
echo "rescue done $(date)" >> rescue.log
