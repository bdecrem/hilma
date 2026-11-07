#!/bin/bash
# The six, in sequence, through Claude Code on the Max login: compile (map + 18 chunks), score +
# overview, then yesterday's crawl over the new citations (extract the instruments, find their
# texts). Restartable: each step skips what is done.
#   nohup ./run-all.sh > logs/run-all.log 2>&1 &
cd "$(dirname "$0")"
set -a; . ../.env 2>/dev/null; . ../../../.env.local 2>/dev/null; set +a
mark() { curl -s -X PATCH "$MRD_SUPABASE_URL/rest/v1/dossier_runs?country_id=eq.$1" -H "apikey: $MRD_SUPABASE_SERVICE_KEY" \
  -H "Authorization: Bearer $MRD_SUPABASE_SERVICE_KEY" -H "Content-Type: application/json" -H "Prefer: return=minimal" -d "$2" >/dev/null; }
ids=(portugal:1001 norway:1002 philippines:1003 costa_rica:1004 qatar:1005 china:1006)
for pair in "${ids[@]}"; do
  slug=${pair%%:*}; id=${pair##*:}
  echo "=== $slug $(date)"
  for attempt in 1 2 3; do
    node cc/run.mjs "$slug" --workers 3 >> "logs/$slug.log" 2>&1 && break
    echo "compile $slug failed (attempt $attempt), retrying the failed chunks"; sleep 30
  done
  python3 score.py "$slug" >> "logs/$slug.log" 2>&1 || { echo "score $slug failed"; mark "$id" '{"status":"error","note":"scoring failed; see logs"}'; continue; }
  ( cd ../laws && python3 extract.py --country "$slug" --workers 6 >> "../dossiers/logs/$slug-laws.log" 2>&1 \
    && python3 find.py --country "$slug" --workers 4 >> "../dossiers/logs/$slug-laws.log" 2>&1 ) \
    || echo "laws $slug: see logs/$slug-laws.log"
  mark "$id" '{"status":"done","finished_at":"now()","note":"Published in the library, flagged experimental."}'
  echo "=== $slug done $(date)"
done
