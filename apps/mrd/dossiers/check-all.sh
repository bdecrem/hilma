#!/bin/bash
# The due diligence over finished dossiers (PLAN.md, Part 1): for each country the source check and
# the second reader side by side, then the redo of what failed, its own source check, the decision,
# and a rescore. Restartable: finished chunks of a phase are skipped.
#   nohup ./check-all.sh [slug ...] > logs/check-all.log 2>&1 &
cd "$(dirname "$0")"
COUNTRIES=("$@"); [ ${#COUNTRIES[@]} -eq 0 ] && COUNTRIES=(costa_rica portugal norway philippines qatar china)
for c in "${COUNTRIES[@]}"; do
  echo "=== $c $(date '+%F %T')"
  python3 audit.py "$c" --seed
  for try in 1 2; do
    node cc/check.mjs "$c" sources --workers 3 > "logs/$c-sources.log" 2>&1 &
    node cc/check.mjs "$c" verify --workers 3 > "logs/$c-verify.log" 2>&1 &
    wait
  done
  tail -1 "logs/$c-sources.log"; tail -1 "logs/$c-verify.log"
  for try in 1 2; do node cc/check.mjs "$c" redo --workers 3 >> "logs/$c-redo.log" 2>&1; done
  tail -1 "logs/$c-redo.log"
  for try in 1 2; do node cc/check.mjs "$c" sources2 --workers 3 >> "logs/$c-sources2.log" 2>&1; done
  tail -1 "logs/$c-sources2.log"
  python3 audit.py "$c" --decide > "logs/$c-decide.log" 2>&1; tail -1 "logs/$c-decide.log"
  python3 score.py "$c" > "logs/$c-rescore.log" 2>&1 || echo "rescore failed for $c"
  python3 - "$c" <<'PY'
import sys
sys.path.insert(0, "../laws")
from lib import sb
from compile import COUNTRIES
sb("PATCH", f"dossier_runs?country_id=eq.{COUNTRIES[sys.argv[1]]['id']}", {"status": "done", "note": "Published in the library, flagged experimental. Checked: every source opened, a second reader on every answer."}, prefer="return=minimal")
PY
  python3 audit.py "$c" --report
done
echo "=== all done $(date '+%F %T')"
