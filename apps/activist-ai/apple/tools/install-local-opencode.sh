#!/bin/bash
# opencode 2.3.0 for the Mac app's "On this Mac" mode: the same pinned package the machine runs
# (apps/activist-ai/package-lock.json, every package checked against its sha512), user-level, no sudo.
# The app looks for it at ~/Library/Application Support/Ola/opencode/node_modules/.bin/opencode.
set -euo pipefail
export PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin
AI="$(cd "$(dirname "$0")/../.." && pwd)"
DEST="$HOME/Library/Application Support/Ola/opencode"
mkdir -p "$DEST"
cp "$AI/package.json" "$AI/package-lock.json" "$DEST/"
(cd "$DEST" && npm ci --silent --no-audit --no-fund >/dev/null)
"$DEST/node_modules/.bin/opencode" --version
