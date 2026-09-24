#!/bin/bash
# The code-drawn videos live in apps/<name>/ (render pipeline, not served). Their web previews in
# public/<name>/ run the same scene.js — re-copy it after editing a scene:
#   scripts/opus55/sync-videos.sh
set -e
cd "$(dirname "$0")/../.."
for v in strangers peck-trailer; do mkdir -p public/$v && cp apps/$v/scene.js public/$v/scene.js; done
echo "synced strangers + peck-trailer scene.js into public/"
