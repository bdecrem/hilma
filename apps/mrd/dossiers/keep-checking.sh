#!/bin/bash
# Keeps check-all.sh going through usage caps and crashes: waits for a running check-all.sh to end,
# then reruns it for the countries that still have unchecked answers, every 10 minutes, up to 60 rounds.
# Finished chunks are skipped, so a round with the limit still closed costs nothing.
#   nohup ./keep-checking.sh > logs/keep-checking.log 2>&1 &
cd "$(dirname "$0")"
for round in $(seq 1 60); do
  while pgrep -f "check-all.sh" > /dev/null; do sleep 30; done
  LEFT=$(python3 - <<'PY'
import sys
sys.path.insert(0, "../laws")
from lib import sb_all
from compile import COUNTRIES
out = []
for slug in ("costa_rica", "portugal", "norway", "philippines", "qatar", "china"):
    rows = sb_all(f"dossier_checks?select=status&country_id=eq.{COUNTRIES[slug]['id']}")
    if not rows or any(r["status"] == "pending" for r in rows):
        out.append(slug)
print(" ".join(out))
PY
)
  echo "round $round $(date '+%F %T') left: ${LEFT:-none}"
  [ -z "$LEFT" ] && break
  ./check-all.sh $LEFT >> logs/check-all.log 2>&1
  sleep 600
done
echo "keep-checking finished $(date '+%F %T')"
