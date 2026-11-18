#!/bin/zsh
# The Opus arms of the four-way design comparison (OLA-141), on an iMac that holds the evals API key
# (~/.config/ops/vault.env). Run from a copy of apps/activist-ai (evals with npm ci, skills, workspace),
# not from a checkout other work commits from. --max-usd reserves the config's $25 per-run cap for each
# run in flight, so it must be above 3 x 25 for three at a time; the real spend is in the result lines.
export PATH=/opt/homebrew/bin:/usr/local/bin:$PATH
cd "$(dirname "$0")"
log=results/4way-opus-run.log
for arm in on off; do
  echo "== $arm $(date)" >> $log
  node run.mjs --config configs/opus-5.5-claude-code-4way.json --tasks u9-block-party,u10-youth-strike,u2-results-page --seeds 1 --skills $arm --db results/4way-opus.db \
    --concurrency 3 --time 1800 --tokens 1000000 --max-usd 100 --max-load 40 --load-patience 10 >> $log 2>&1
done
echo "== done $(date)" >> $log
