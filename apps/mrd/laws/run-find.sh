#!/bin/zsh
# Runs the finder until no law is left pending; restarts it if it gets killed.
cd "$(dirname "$0")"
while true; do
  left=$(python3 -c "from lib import sb; print(len(sb('GET','laws?find_status=eq.pending&select=id&limit=5000')))")
  [ "$left" = "0" ] && break
  python3 find.py --workers 8 >> find.log 2>&1
  sleep 5
done
echo "all done $(date)" >> find.log
