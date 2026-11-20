#!/bin/zsh
# The Opus arm of the open-model design comparison (OLA-168), on an iMac with the Claude login
# (~/.config/ops/claude-login.env): the same five requests, seed 1, the designer skill on, the same
# limits as the open models (1800 s, 1,000,000 tokens). Run from a copy of apps/activist-ai (evals with
# npm ci, skills, workspace), not from a checkout other work commits from.
export PATH=/opt/homebrew/bin:/usr/local/bin:$PATH
cd "$(dirname "$0")"
log=results/open-design-opus-run.log
echo "== opus $(date)" >> $log
node run.mjs --config configs/opus-5.5-claude-code-od.json --tasks u12-good-morning,u9-block-party,u10-youth-strike,u2-results-page,u5-signup-flow \
  --seeds 1 --skills on --db results/open-design-opus.db --concurrency ${OD_CONCURRENCY:-2} --time 1800 --tokens 1000000 --max-usd 100 \
  --max-load 40 --load-patience 10 >> $log 2>&1
echo "== done $(date)" >> $log
