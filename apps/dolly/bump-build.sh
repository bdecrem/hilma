#!/bin/bash
# Bump Dolly's build number, then regenerate the Xcode project.
#
#   ./apps/dolly/bump-build.sh          # 0.2 (33) -> 0.2 (34)
#   ./apps/dolly/bump-build.sh 0.3      # 0.2 (33) -> 0.3 (34)
#
# Run this BEFORE every build that lands on a device (phone, TestFlight).
# The number shows in Settings, which is how Bart tells whether the build he
# just installed is actually the one running.
set -euo pipefail
cd "$(dirname "$0")"
YML=project.yml
current=$(grep -E '^\s*CURRENT_PROJECT_VERSION:' "$YML" | sed -E 's/.*"([0-9]+)".*/\1/')
[ -n "$current" ] || { echo "error: couldn't read CURRENT_PROJECT_VERSION from $YML" >&2; exit 1; }
next=$((current + 1))
sed -i '' -E "s/^([[:space:]]*CURRENT_PROJECT_VERSION:).*/\1 \"$next\"/" "$YML"
if [ $# -ge 1 ]; then
  sed -i '' -E "s/^([[:space:]]*MARKETING_VERSION:).*/\1 \"$1\"/" "$YML"
fi
version=$(grep -E '^\s*MARKETING_VERSION:' "$YML" | sed -E 's/.*"([^"]+)".*/\1/')
xcodegen generate >/dev/null
echo "Dolly is now $version ($next) — project regenerated."
