#!/bin/bash
# The daily question: has opencode shipped a release newer than the one Ola is built from, and would Ola's
# changes still apply to it? Prints one line and exits:
#   0  up to date
#   1  a new release, and rebrand.mjs applies to it cleanly (follow "Moving to a new release" in README.md)
#   2  a new release, and rebrand.mjs no longer applies (the line says which sentence; fix rebrand.mjs first)
#   3  could not check (no network, npm or GitHub down)
# Light on purpose: it reads the version from npm and, only when there is a new one, fetches that tag's source
# (about 250 MB under the cache, replaced each time) and dry-runs the rebrand. It builds nothing.
set -uo pipefail
export PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH
HERE="$(cd "$(dirname "$0")" && pwd)"
CACHE="${OLA_OPENCODE_CACHE:-$HOME/Library/Caches/ola-opencode-fork}"
val() { grep "^$1=" "$HERE/UPSTREAM" | cut -d= -f2-; }
PINNED="$(val tag)"; PINNED="${PINNED#v}"
LATEST="${OLA_OPENCODE_LATEST:-$(npm view "$(val npm)" version 2>/dev/null)}"
[ -n "$LATEST" ] || { echo "opencode: could not read the latest version from npm"; exit 3; }
if [ "$LATEST" = "$PINNED" ]; then echo "opencode: up to date ($PINNED)"; exit 0; fi
NEWEST="$(printf '%s\n%s\n' "$PINNED" "$LATEST" | sort -V | tail -1)"
if [ "$NEWEST" = "$PINNED" ]; then echo "opencode: up to date ($PINNED; npm says $LATEST)"; exit 0; fi
TRY="$CACHE/try"; rm -rf "$TRY"; mkdir -p "$CACHE"
git clone -q --depth 1 --branch "v$LATEST" "$(val repo)" "$TRY" 2>/dev/null || { echo "opencode: $LATEST is out (Ola is on $PINNED) but its source tag v$LATEST could not be fetched"; exit 3; }
OUT="$(node "$HERE/rebrand.mjs" "$TRY" --check 2>&1)"; RC=$?
COMMIT="$(git -C "$TRY" rev-parse HEAD)"; rm -rf "$TRY"
if [ $RC -ne 0 ]; then echo "opencode: $LATEST is out (Ola is on $PINNED) and Ola's changes do not apply: ${OUT#patches no longer apply: }"; exit 2; fi
echo "opencode: $LATEST is out (Ola is on $PINNED); Ola's changes apply cleanly (commit $COMMIT)"; exit 1
