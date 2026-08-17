#!/bin/bash
# Publish a snapshot of Dodo (iOS app + F2 backend/web + schema) to the
# public MIT repo at github.com/bdecrem/dodo.
#
#   ./scripts/dodo-snapshot/publish.sh            # sync, leak-check, commit, push
#   ./scripts/dodo-snapshot/publish.sh --no-push  # everything but the push
#
# Design: ../dodo is a generated mirror — never hand-edit it. All content
# comes from git-TRACKED files in hilma (so gitignored secrets can never
# ride along) plus the scaffold/ overlay (README, LICENSE, web config).
# A leak check greps the output for every value in hilma/.env.local and for
# common credential patterns, and aborts the publish on any hit.
set -euo pipefail

HILMA="$(cd "$(dirname "$0")/../.." && pwd)"
DEST="$(cd "$HILMA/.." && pwd)/dodo"
SCAFFOLD="$HILMA/scripts/dodo-snapshot/scaffold"
REMOTE="https://github.com/bdecrem/dodo.git"
PUSH=1
[ "${1:-}" = "--no-push" ] && PUSH=0

echo "hilma:  $HILMA"
echo "mirror: $DEST"

# ── Fresh tree (keep .git and the committed lockfile) ───────────────────────
mkdir -p "$DEST"
LOCK_TMP=""
if [ -f "$DEST/web/pnpm-lock.yaml" ]; then
  LOCK_TMP="$(mktemp)"
  cp "$DEST/web/pnpm-lock.yaml" "$LOCK_TMP"
fi
find "$DEST" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +

# Copy git-tracked files under $1 into $DEST/$2, stripping the $1 prefix.
copy_tracked() {
  local prefix="$1" dest_sub="$2" f rel
  git -C "$HILMA" ls-files -z -- "$prefix" | while IFS= read -r -d '' f; do
    rel="${f#"$prefix"/}"
    case "$rel" in
      CLAUDE.md|*.xcuserstate|*/xcuserdata/*) continue ;;
    esac
    mkdir -p "$DEST/$dest_sub/$(dirname "$rel")"
    cp "$HILMA/$f" "$DEST/$dest_sub/$rel"
  done
}

copy_tracked apps/feynd            ios
copy_tracked apps/f2/schema        schema
copy_tracked src/lib/f2            web/src/lib/f2
copy_tracked src/app/f2            web/src/app/f2
copy_tracked src/app/api/f2        web/src/app/api/f2

# Scaffold overlay: README, LICENSE, .gitignore, web app shell, screenshots.
cp -R "$SCAFFOLD"/. "$DEST/"
if [ -n "$LOCK_TMP" ]; then
  cp "$LOCK_TMP" "$DEST/web/pnpm-lock.yaml"
  rm -f "$LOCK_TMP"
fi

# ── Leak check ──────────────────────────────────────────────────────────────
echo "leak check…"
FAIL=0

# 1) Every secret VALUE from .env.local (8+ chars, not a bare URL/word).
while IFS= read -r line; do
  case "$line" in \#*|'') continue ;; esac
  val="${line#*=}"
  # strip quotes
  val="${val%\"}"; val="${val#\"}"; val="${val%\'}"; val="${val#\'}"
  [ "${#val}" -lt 8 ] && continue
  case "$val" in
    http://localhost*|https://*.supabase.co|https://feynd.cc*) continue ;;
  esac
  if grep -rqF --exclude-dir=.git -- "$val" "$DEST" 2>/dev/null; then
    echo "  LEAK: value of ${line%%=*} found in snapshot"
    FAIL=1
  fi
done < "$HILMA/.env.local"

# 2) Credential-shaped patterns.
for pat in 'sk-ant-' 'sk-proj-' 'sk_live' 'eyJhbGciOi' 'SG\.[A-Za-z0-9_-]{16}' 'xox[bap]-' 'ghp_[A-Za-z0-9]' 'AKIA[0-9A-Z]{16}' 'BEGIN [A-Z ]*PRIVATE KEY'; do
  if grep -rEq --exclude-dir=.git -- "$pat" "$DEST" 2>/dev/null; then
    echo "  LEAK: pattern '$pat' found:"
    grep -rEl --exclude-dir=.git -- "$pat" "$DEST" | head -5 | sed 's/^/    /'
    FAIL=1
  fi
done

# 3) Personal identifiers that have no business in a public repo.
for pat in 'kurona' '6508989508' 'bdecrem@gmail' 'bdecrem@icloud' 'newx-test'; do
  if grep -riq --exclude-dir=.git -- "$pat" "$DEST" 2>/dev/null; then
    echo "  LEAK: personal identifier '$pat' found:"
    grep -ril --exclude-dir=.git -- "$pat" "$DEST" | head -5 | sed 's/^/    /'
    FAIL=1
  fi
done

if [ "$FAIL" = 1 ]; then
  echo "ABORTED — fix the leaks above (in hilma, not in the mirror) and re-run."
  exit 1
fi
echo "  clean."

# ── Commit + push ───────────────────────────────────────────────────────────
if [ ! -d "$DEST/.git" ]; then
  git -C "$DEST" init -b main >/dev/null
  git -C "$DEST" remote add origin "$REMOTE"
fi
SHA=$(git -C "$HILMA" rev-parse --short HEAD)
git -C "$DEST" add -A
if git -C "$DEST" diff --cached --quiet; then
  echo "no changes since last snapshot."
  exit 0
fi
git -C "$DEST" commit -q -m "snapshot $(date +%Y-%m-%d) (hilma $SHA)"
if [ "$PUSH" = 1 ]; then
  git -C "$DEST" push -u origin main
  echo "pushed: $REMOTE"
else
  echo "committed (not pushed)."
fi
