#!/usr/bin/env bash
# Runs the full quiz-me pipeline: fetch → classify → generate.
# Safe to re-run: caching means only new conversations are classified and only
# new explainers are turned into quizzes.
#
# Requires an authenticated Playwright profile at scripts/quiz-me/.playwright-profile/
# — create it by running `node scripts/quiz-me/fetch-conversations.mjs` once
# interactively and signing into claude.ai in the Chromium window.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
LOGFILE="$HERE/data/pipeline.log"

mkdir -p "$HERE/data"

{
  echo "=== $(date '+%Y-%m-%d %H:%M:%S') starting pipeline ==="

  cd "$REPO"

  # Find node via the user's login shell so launchd inherits PATH/nvm/etc.
  NODE_BIN="$(/bin/zsh -l -c 'command -v node' 2>/dev/null || command -v node || true)"
  if [[ -z "${NODE_BIN:-}" ]]; then
    echo "✗ node not found in PATH"
    exit 1
  fi
  echo "using node: $NODE_BIN"

  HEADLESS=1 "$NODE_BIN" "$HERE/fetch-conversations.mjs"
  "$NODE_BIN" "$HERE/classify-explainers.mjs"
  "$NODE_BIN" "$HERE/generate-quizzes.mjs"

  echo "=== $(date '+%Y-%m-%d %H:%M:%S') pipeline done ==="
} 2>&1 | tee -a "$LOGFILE"
