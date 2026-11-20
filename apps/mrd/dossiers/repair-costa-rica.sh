#!/bin/bash
# The one repair round (README, "The checks") for Costa Rica's recodes whose own sources failed, on Opus 5.5 high.
cd "$(dirname "$0")"
REDO_MODEL=claude-opus-5-5 REDO_EFFORT=high node cc/check.mjs costa_rica redo --again --workers 3 >> logs/costa_rica-redo.log 2>&1
node cc/check.mjs costa_rica sources2 --again --workers 3 >> logs/costa_rica-sources2.log 2>&1
python3 audit.py costa_rica --decide > logs/costa_rica-decide2.log 2>&1; tail -2 logs/costa_rica-decide2.log
python3 score.py costa_rica > logs/costa_rica-rescore.log 2>&1 || echo "rescore failed"
python3 - <<'PY'
import sys; sys.path.insert(0, "../laws")
from lib import sb
sb("PATCH", "dossier_runs?country_id=eq.1004", {"status": "done", "note": "Published in the library, flagged experimental. Checked: every source opened, a second reader on every answer."}, prefer="return=minimal")
PY
python3 audit.py costa_rica --report | head -1
echo "=== finished $(date '+%F %T')"
