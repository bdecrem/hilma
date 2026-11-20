#!/bin/bash
# Ola's opencode plugins in a built Mac app are workspace/plugins as committed at HEAD (OLA-228):
#   tools/plugins-verify.sh <Ola.app>/Contents/Resources/plugins
# The app carries the folder itself (project.yml), so the only way to differ from the sealed image's
# is an uncommitted change in the working tree; that build is refused. Exit 1, and say why, if not.
set -uo pipefail
DIR="${1:?usage: tools/plugins-verify.sh <Resources/plugins>}"
DIR="$(cd "$DIR" 2>/dev/null && pwd)" || { echo "plugins: no folder $1 (the app carries none)" >&2; exit 1; }
cd "$(dirname "$0")/../.."   # apps/activist-ai
for f in ola-planted/index.js ola-planted/package.json; do
  if ! git show "HEAD:./workspace/plugins/$f" 2>/dev/null | cmp -s - "$DIR/$f"; then
    echo "plugins: $DIR/$f is not workspace/plugins/$f at HEAD (commit it, then build again)" >&2
    exit 1
  fi
done
echo "plugins: ola-planted as committed at $(git rev-parse --short HEAD)"
