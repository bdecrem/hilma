#!/bin/bash
# Build Ola's opencode: the release named in UPSTREAM, from source, with rebrand.mjs applied and nothing else.
#   ./build.sh                  this Mac's architecture
#   ./build.sh darwin-arm64 darwin-x64     the named targets (opencode's own names)
# Output: dist/<target>/opencode, with LICENSE (opencode is MIT; the notice ships with the binary) and BUILD
# (tag, commit, the hash of rebrand.mjs). Nothing is taken from this machine's bun or node_modules: the source is
# a fresh checkout of the pinned commit and bun is the version opencode's package.json names, both under
# $OLA_OPENCODE_CACHE (default ~/Library/Caches/ola-opencode-fork), so the same tag gives the same program.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
CACHE="${OLA_OPENCODE_CACHE:-$HOME/Library/Caches/ola-opencode-fork}"
val() { grep "^$1=" "$HERE/UPSTREAM" | cut -d= -f2-; }
REPO="$(val repo)"; TAG="${OLA_OPENCODE_TAG:-$(val tag)}"; COMMIT="${OLA_OPENCODE_COMMIT-$(val commit)}"
SRC="$CACHE/src"; mkdir -p "$CACHE"
say() { echo "ola-opencode: $*" >&2; }

[ -d "$SRC/.git" ] || git clone -q --depth 1 --branch "$TAG" "$REPO" "$SRC"
cd "$SRC"
git fetch -q --depth 1 origin "refs/tags/$TAG:refs/tags/$TAG" 2>/dev/null || true
git checkout -q -f "$TAG" && git reset -q --hard "$TAG" && git clean -q -fd packages
HEAD="$(git rev-parse HEAD)"
if [ -n "$COMMIT" ] && [ "$HEAD" != "$COMMIT" ]; then say "tag $TAG is commit $HEAD, UPSTREAM says $COMMIT: refusing to build"; exit 1; fi

BUNV="$(node -e 'console.log(require("./package.json").packageManager.split("@")[1])')"
BUN="$CACHE/bun-$BUNV/bin/bun"
if [ ! -x "$BUN" ]; then say "getting bun $BUNV"; curl -fsSL https://bun.sh/install | BUN_INSTALL="$CACHE/bun-$BUNV" bash -s "bun-v$BUNV" >/dev/null 2>&1; fi
[ "$("$BUN" --version)" = "$BUNV" ] || { say "bun $BUNV did not install"; exit 1; }
export PATH="$(dirname "$BUN"):$PATH"

node "$HERE/rebrand.mjs" "$SRC" >&2
if [ "${1:-}" = "--rebrand-only" ]; then exit 0; fi
say "installing packages"; bun install --frozen-lockfile >/dev/null 2>&1 || bun install >/dev/null 2>&1
TARGETS=("$@"); [ ${#TARGETS[@]} -gt 0 ] || TARGETS=("darwin-$( [ "$(uname -m)" = arm64 ] && echo arm64 || echo x64 )")
mkdir -p "$HERE/dist"
for T in "${TARGETS[@]}"; do
  say "building $T (about three minutes)"
  (cd packages/cli && OPENCODE_VERSION="${TAG#v}" OPENCODE_CHANNEL=latest OPENCODE_TARGET="$T" bun run script/build.ts --outdir="$CACHE/out-$T" >"$CACHE/build-$T.log" 2>&1) || { say "build failed: $(tail -1 "$CACHE/build-$T.log")"; exit 1; }
  BIN="$CACHE/out-$T/cli-$T/bin/opencode"; [ -f "$BIN" ] || { say "build made no binary for $T (see $CACHE/build-$T.log)"; exit 1; }
  grep -q -a "Tell Ola what to do differently" "$BIN" || { say "the built binary does not carry Ola's words"; exit 1; }
  rm -rf "$HERE/dist/$T"; mkdir -p "$HERE/dist/$T"
  cp "$BIN" "$HERE/dist/$T/opencode"; cp LICENSE "$HERE/dist/$T/LICENSE"
  printf 'tag=%s\ncommit=%s\nrebrand=%s\n' "$TAG" "$HEAD" "$(shasum -a 256 "$HERE/rebrand.mjs" | cut -c1-16)" > "$HERE/dist/$T/BUILD"
  say "built dist/$T/opencode ($(du -h "$HERE/dist/$T/opencode" | cut -f1))"
done
