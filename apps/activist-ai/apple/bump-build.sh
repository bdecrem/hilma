#!/bin/bash
# Bump Ola's build number (both apps share it), then regenerate the Xcode project.
#
#   apps/activist-ai/apple/bump-build.sh          # 0.1 (1) -> 0.1 (2)
#   apps/activist-ai/apple/bump-build.sh 0.2      # 0.1 (1) -> 0.2 (2)
#
# Run this BEFORE every build that leaves this Mac (TestFlight, the signed download, a phone) and
# commit it. The number shows in the phone's Settings, About and in the Mac's Ola menu, About Ola,
# which is how Bart tells whether the build he installed is the one running. Build only, never the
# marketing version, unless Bart says so.
set -euo pipefail
cd "$(dirname "$0")"
YML=project.yml
current=$(grep -E '^[[:space:]]*CURRENT_PROJECT_VERSION:' "$YML" | head -1 | sed -E 's/.*"([0-9]+)".*/\1/')
[ -n "$current" ] || { echo "error: couldn't read CURRENT_PROJECT_VERSION from $YML" >&2; exit 1; }
next=$((current + 1))
sed -i '' -E "s/^([[:space:]]*CURRENT_PROJECT_VERSION:).*/\1 \"$next\"/" "$YML"
[ $# -ge 1 ] && sed -i '' -E "s/^([[:space:]]*MARKETING_VERSION:).*/\1 \"$1\"/" "$YML"
version=$(grep -E '^[[:space:]]*MARKETING_VERSION:' "$YML" | head -1 | sed -E 's/.*"([^"]+)".*/\1/')
node tools/skills.mjs stage build/OlaSkills >/dev/null   # the Mac target bundles them (README)
xcodegen generate >/dev/null
echo "Ola is now $version ($next), project regenerated. Commit project.yml."
