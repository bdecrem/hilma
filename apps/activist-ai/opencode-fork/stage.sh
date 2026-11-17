#!/bin/bash
# Puts Ola's opencode where the Mac app's build picks it up, building it first if dist/ is missing or was made
# from another tag or another rebrand.mjs.
#   ./stage.sh stage <dir>     <dir>/ola-opencode-arm64, <dir>/ola-opencode-x86_64, opencode-LICENSE.txt, opencode-source.txt
#   ./stage.sh verify <dir|Ola.app>   exit 1 unless it holds exactly this tag, this rebrand, with Ola's words in both
#   ./stage.sh expect          print the BUILD text a current build carries
# The first stage on a machine builds both (about four minutes each); after that it is a copy.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
val() { grep "^$1=" "$HERE/UPSTREAM" | cut -d= -f2-; }
expect() { printf 'tag=%s\ncommit=%s\nrebrand=%s\n' "$(val tag)" "$(val commit)" "$(shasum -a 256 "$HERE/rebrand.mjs" | cut -c1-16)"; }
NAMES=("darwin-arm64:arm64" "darwin-x64:x86_64")
case "${1:-}" in
  expect) expect ;;
  stage)
    DEST="${2:?stage.sh stage <dir>}"; WANT="$(expect)"; NEED=()
    for n in "${NAMES[@]}"; do t="${n%%:*}"
      [ -x "$HERE/dist/$t/opencode" ] && [ "$(cat "$HERE/dist/$t/BUILD" 2>/dev/null)" = "$WANT" ] || NEED+=("$t")
    done
    [ ${#NEED[@]} -eq 0 ] || "$HERE/build.sh" "${NEED[@]}"
    rm -rf "$DEST"; mkdir -p "$DEST"
    for n in "${NAMES[@]}"; do cp "$HERE/dist/${n%%:*}/opencode" "$DEST/ola-opencode-${n##*:}"; done
    cp "$HERE/dist/darwin-arm64/LICENSE" "$DEST/opencode-LICENSE.txt"; printf '%s\n' "$WANT" > "$DEST/opencode-source.txt"
    echo "opencode: staged $(val tag) with Ola's words ($(du -sh "$DEST" | cut -f1))"
    ;;
  verify)
    # <dir> is a staged folder, or a built Ola.app (programs in Contents/Helpers, the two notes in Resources).
    DIR="${2:?stage.sh verify <dir or Ola.app>}"; BINS="$DIR"; NOTES="$DIR"
    if [ -d "$DIR/Contents" ]; then BINS="$DIR/Contents/Helpers"; NOTES="$DIR/Contents/Resources"; fi
    [ "$(cat "$NOTES/opencode-source.txt" 2>/dev/null)" = "$(expect)" ] || { echo "opencode: $DIR does not carry $(val tag) with the current rebrand.mjs" >&2; exit 1; }
    [ -s "$NOTES/opencode-LICENSE.txt" ] || { echo "opencode: $DIR lacks opencode's license notice" >&2; exit 1; }
    for n in "${NAMES[@]}"; do f="$BINS/ola-opencode-${n##*:}"
      [ -x "$f" ] && grep -q -a "Tell Ola what to do differently" "$f" || { echo "opencode: $f is missing or is not Ola's build" >&2; exit 1; }
    done
    echo "opencode: the build carries $(val tag) with Ola's words, both processors"
    ;;
  *) sed -n '2,8p' "$0"; exit 1 ;;
esac
