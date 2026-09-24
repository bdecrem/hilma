#!/usr/bin/env bash
# Assemble Token Surfers as its own repo, out of hilma.
#
#   apps/tokensurfers/mirror/sync.sh <out-dir>              # build the tree, scan it
#   apps/tokensurfers/mirror/sync.sh <out-dir> --push <url> # …then commit + push to the mirror
#
# Layout of the mirror:
#   ios/     the iPhone + Mac app (apps/tokensurfers, minus the hilma-internal CLAUDE.md)
#   web/     a minimal Next.js app around the /surf pages and /api/surf routes
#   schema/  the Supabase SQL
#   art/     Splat's source SVGs
#
# hilma stays the source of truth; the mirror is overwritten on every sync
# (its history is kept: one commit per sync, naming the hilma commit).
# The tree comes from hilma's committed HEAD (git archive), never from the
# working tree, so half-done edits can't leak into a release. The secret scan
# at the end fails the sync if anything that looks like a key made it in.
set -euo pipefail

OUT="${1:?usage: sync.sh <out-dir> [--push <git-url>]}"
PUSH_URL=""
if [[ "${2:-}" == "--push" ]]; then PUSH_URL="${3:?--push needs a git url}"; fi

HILMA="$(cd "$(dirname "$0")/../../.." && pwd)"
SHA="$(git -C "$HILMA" rev-parse --short HEAD)"
if ! git -C "$HILMA" diff --quiet HEAD -- apps/tokensurfers src/app/surf src/app/api/surf src/lib/surf public/surf; then
  echo "note: uncommitted changes in the Token Surfers paths are NOT in this snapshot (it is hilma@$SHA)"
fi
SRC="$(mktemp -d "${TMPDIR:-/tmp}/tokensurfers-src.XXXXXX")"
trap 'rm -rf "$SRC"' EXIT
git -C "$HILMA" archive HEAD apps/tokensurfers src/app/api/surf src/app/surf src/lib/surf public/surf misc/splat.svg misc/splat-back.svg misc/splat-back-smooth.svg misc/splat-back-rig.svg | tar -x -C "$SRC"
APP="$SRC/apps/tokensurfers"
MIRROR="$APP/mirror"

if [[ -n "$PUSH_URL" ]]; then
  rm -rf "$OUT"
  git clone --quiet "$PUSH_URL" "$OUT"
  # replace everything but the mirror's own history
  find "$OUT" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
else
  rm -rf "$OUT"
  mkdir -p "$OUT"
fi

rsync -a \
  --exclude CLAUDE.md --exclude mirror/ --exclude schema/ \
  --exclude 'build/' --exclude 'build-*/' --exclude '.shots/' \
  --exclude 'Secrets.swift' --exclude '.DS_Store' --exclude xcuserdata/ \
  "$APP/" "$OUT/ios/"
rsync -a "$APP/schema/" "$OUT/schema/"
mkdir -p "$OUT/art"
cp "$SRC"/misc/splat*.svg "$OUT/art/"

rsync -a --exclude node_modules --exclude .next "$MIRROR/web/" "$OUT/web/"
mkdir -p "$OUT/web/src/app/api" "$OUT/web/src/lib" "$OUT/web/public"
rsync -a "$SRC/src/app/api/surf/" "$OUT/web/src/app/api/surf/"
rsync -a "$SRC/src/app/surf/" "$OUT/web/src/app/surf/"
rsync -a "$SRC/src/lib/surf/" "$OUT/web/src/lib/surf/"
rsync -a "$SRC/public/surf/" "$OUT/web/public/surf/"

cp "$MIRROR/README.md" "$OUT/README.md"
cp "$MIRROR/LICENSE" "$OUT/LICENSE"
cp "$MIRROR/gitignore" "$OUT/.gitignore"

# --- secret scan -------------------------------------------------------------
fail=0
if [[ -e "$OUT/ios/TokenSurfers/App/Secrets.swift" ]]; then
  echo "secret scan: Secrets.swift is in the tree"; fail=1
fi
patterns=(
  'sk-ant-[A-Za-z0-9_-]{10,}'                 # Anthropic keys
  'sk-(proj-)?[A-Za-z0-9]{32,}'               # OpenAI-style keys
  'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}' # JWTs (Supabase service/anon keys)
  'BEGIN (EC |RSA )?PRIVATE KEY'              # .p8 / pem
  'SG\.[A-Za-z0-9_-]{20,}\.'                  # SendGrid
  'ghp_[A-Za-z0-9]{30,}'                      # GitHub tokens
)
for p in "${patterns[@]}"; do
  if hits=$(grep -rIlE "$p" "$OUT" --exclude-dir=.git 2>/dev/null); then
    echo "secret scan: /$p/ in:"; echo "$hits" | sed 's/^/  /'; fail=1
  fi
done
# exact values, when the caller passes them (CI passes the real app key)
for v in ${SCAN_VALUES:-}; do
  if [[ ${#v} -ge 12 ]] && grep -rIlF -- "$v" "$OUT" --exclude-dir=.git >/dev/null 2>&1; then
    echo "secret scan: a value from SCAN_VALUES is in the tree"; fail=1
  fi
done
if [[ $fail -ne 0 ]]; then echo "secret scan FAILED — nothing pushed"; exit 1; fi
echo "secret scan: clean"
# the web side must build on its own: every import is @/lib/surf/*, @/app/surf/* or a package
if bad=$(grep -rhoE "from '@/(lib|app)/[a-z0-9-]+" "$OUT/web/src" | grep -vE "@/(lib|app)/surf" | sort -u); [[ -n "$bad" ]]; then
  echo "import scan: the web code reaches outside surf/ — the mirror would not build:"; echo "$bad" | sed 's/^/  /'; exit 1
fi
echo "import scan: clean"

if [[ -n "$PUSH_URL" ]]; then
  cd "$OUT"
  git add -A
  if git diff --cached --quiet; then echo "mirror already up to date"; exit 0; fi
  git -c user.name="${GIT_AUTHOR_NAME:-Bart Decrem}" -c user.email="${GIT_AUTHOR_EMAIL:-bdecrem@gmail.com}" \
    commit --quiet -m "Sync from hilma@$SHA"
  git push --quiet origin HEAD
  echo "pushed hilma@$SHA"
else
  echo "tree ready in $OUT (hilma@$SHA)"
fi
