#!/usr/bin/env bash
# publish.sh — generate the open-source ../macinclaude repo from apps/macplus.
#
# We work day to day in hilma/apps/macplus (with real IPs, ops runbook, session
# notes). This script produces a CLEAN public copy: it copies the reusable code,
# swaps machine-specific values for placeholders, drops the private ops/session
# docs, drops build artifacts, adds the community docs, and then LEAK-CHECKS the
# result — if any private marker survives, it aborts and writes nothing you'd
# want to push. Re-run any time to re-publish; it's deterministic.
set -euo pipefail

SRC="$(cd "$(dirname "$0")/.." && pwd)"          # apps/macplus
DEST="${1:-$SRC/../../../macinclaude}"           # default: ../macinclaude (sibling of hilma)
FILES="$SRC/publish/repo-files"                  # community docs to drop in

echo "SRC:  $SRC"
echo "DEST: $DEST"

# --- 1. sync the reusable tree (exclude private + artifacts) --------------------
# Clear the previous content but KEEP the repo's own .git (history/remote), so
# re-publishes are clean and stale / now-excluded files never linger.
mkdir -p "$DEST"
find "$DEST" -mindepth 1 -maxdepth 1 -not -name '.git' -exec rm -rf {} +
rsync -a \
  --exclude='.git' --exclude='.DS_Store' \
  --exclude='node_modules/' --exclude='build/' \
  --exclude='*.bin' --exclude='*.dsk' --exclude='*.APPL' --exclude='*.rsrc' \
  --exclude='*.o' --exclude='*.obj' --exclude='package-lock.json' \
  --exclude='publish/' \
  `# private ops / session / planning docs — replaced by community docs:` \
  --exclude='CLAUDE.md' --exclude='BACKEND.md' --exclude='SHUTTLE-TEST.md' \
  --exclude='AGENT-PLAN.md' --exclude='wifi/RESUME-ALWAYSON.md' \
  --exclude='design/' \
  `# retired / orphaned apps (MacinTalk freezes the Plus; jukebox has no Plus app):` \
  --exclude='talkingplus/' --exclude='agent-moose/' --exclude='agent-jukebox/' \
  `# experimental + bundles third-party code (llama2.c) — hold from the public release:` \
  --exclude='drunk85/' \
  "$SRC/" "$DEST/"

# --- 2. sanitize machine-specific values ---------------------------------------
# All private LAN IPs 192.168.7.x -> 192.168.1.x placeholders; deploy path,
# hostname, MAC -> generic. (Author name "Bart" and "admin@" username are kept —
# authorship + a generic default account, not private.)
find "$DEST" -type f \( -name '*.c' -o -name '*.h' -o -name '*.inc' -o -name '*.r' \
     -o -name '*.ts' -o -name '*.js' -o -name '*.mjs' -o -name '*.md' -o -name '*.sh' \
     -o -name '*.py' -o -name '*.json' \) -print0 | while IFS= read -r -d '' f; do
  sed -i '' \
    -e 's/192\.168\.7\./192.168.1./g' \
    -e 's#hilma-deploy/apps/macplus#macinclaude#g' \
    -e 's#hilma-deploy#macinclaude#g' \
    -e 's/admins-Mac-mini/your-mac/g' \
    -e 's/1c:f6:4c:5d:a6:4a/xx:xx:xx:xx:xx:xx/g' \
    "$f"
done

# --- 3. drop in the community docs + license + config example ------------------
cp -R "$FILES/." "$DEST/"

# --- 4. leak-check: abort if any private marker survives -----------------------
echo "== leak-check =="
LEAKS=$(grep -rIlE '192\.168\.7\.|hilma-deploy|admins-Mac-mini|1c:f6:4c:5d:a6:4a' "$DEST" 2>/dev/null || true)
if [ -n "$LEAKS" ]; then
  echo "ABORT — private markers survived in:"; echo "$LEAKS"
  exit 1
fi
echo "clean — no private markers in the published tree."

# --- 5. commit + push the public repo (github.com/bdecrem/Macinclaude) ----------
cd "$DEST"
if [ ! -d .git ]; then
  git init -q
  git remote add origin https://github.com/bdecrem/Macinclaude.git
  git branch -M main
fi
echo "== published =="
echo "apps: $(find "$DEST" -maxdepth 1 -type d -not -name '.*' | wc -l | tr -d ' ') dirs  C: $(find "$DEST" -name '*.c' | wc -l | tr -d ' ')  docs: $(find "$DEST" -name '*.md' | wc -l | tr -d ' ')"
if [ -n "$(git status --porcelain)" ]; then
  git add -A
  git -c user.name="Bart Decrem" -c user.email="bdecrem@gmail.com" \
      commit -q -m "Re-publish from hilma ($(date +%Y-%m-%d))"
  git push -q -u origin main && echo "pushed -> https://github.com/bdecrem/Macinclaude"
else
  echo "no changes since last publish."
fi
