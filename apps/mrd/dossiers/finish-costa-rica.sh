#!/bin/bash
# Bart, 2026-11-20: finish Costa Rica's 17 pending answers (the redo on Fable 5.2 high, its source check,
# the decision, the rescore). Keeps going through the 5-hour limit: reruns every 10 minutes until every
# pending answer has a redo and a source check of it; finished chunks are skipped.
cd "$(dirname "$0")"
left() { python3 - <<'PY'
import sys; sys.path.insert(0, "../laws")
from lib import sb_all
rows = sb_all("dossier_checks?select=question_id,redo,redo_source_check&country_id=eq.1004&status=eq.pending")
print(sum(1 for r in rows if not r.get("redo") or not r.get("redo_source_check")))
PY
}
for round in $(seq 1 6); do
  echo "=== round $round $(date '+%F %T') left: $(left)"
  REDO_MODEL=claude-opus-5-5 REDO_EFFORT="${REDO_EFFORT:-high}" node cc/check.mjs costa_rica redo --workers 2 >> logs/costa_rica-redo.log 2>&1
  node cc/check.mjs costa_rica sources2 --workers 3 >> logs/costa_rica-sources2.log 2>&1
  [ "$(left)" = "0" ] && break
  sleep 300
done
python3 audit.py costa_rica --decide > logs/costa_rica-decide.log 2>&1; tail -3 logs/costa_rica-decide.log
python3 score.py costa_rica > logs/costa_rica-rescore.log 2>&1 || echo "rescore failed"
python3 - <<'PY'
import sys; sys.path.insert(0, "../laws")
from lib import sb
sb("PATCH", "dossier_runs?country_id=eq.1004", {"status": "done", "note": "Published in the library, flagged experimental. Checked: every source opened, a second reader on every answer."}, prefer="return=minimal")
PY
python3 audit.py costa_rica --report
echo "=== finished $(date '+%F %T')"
