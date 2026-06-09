#!/usr/bin/env bash
#
# Build a patched Mini vMac (Macintosh Plus, Cocoa, Apple Silicon) whose modem
# serial port is bridged to a host TCP socket - so the Macinclaude apps can be
# tested end-to-end in the emulator (talking to the Mac mini agents through the
# companion vmodem.py). See README.md.
#
# Output: $WORK/minivmac-src/minivmac.app  (also copied to $WORK/mctest/)
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="${MNVM_WORK:-$HOME/mac-plus-apps}"
SRC="$WORK/minivmac-src"
REPO="https://github.com/minivmac/minivmac.git"

mkdir -p "$WORK"

# 1. fresh clone (so the patch applies cleanly)
if [ ! -d "$SRC/.git" ]; then
  echo ">> cloning Mini vMac source"
  git clone --depth 1 "$REPO" "$SRC"
fi

# 2. apply our raw-serial patch (idempotent: reset tracked files first)
echo ">> applying raw-serial patch"
( cd "$SRC" && git checkout -- src/SCCEMDEV.c src/SCCEMDEV.h src/PROGMAIN.c 2>/dev/null || true )
git -C "$SRC" apply "$HERE/minivmac-rawserial.patch"

# 3. generate the Plus / Cocoa / Apple-Silicon Xcode project
echo ">> generating project (Mac Plus, Cocoa)"
cd "$SRC"
[ -x ./setup_t ] || gcc -o setup_t setup/tool.c
./setup_t -n "minivmac-mc" -e xcd -t mcar -m Plus -api cco -magnify 1 -mf 2 -sound 1 > setup.sh
. ./setup.sh

# 4. build + codesign
echo ">> xcodebuild"
xcodebuild -project minivmac.xcodeproj | tail -2
xattr -cr minivmac.app 2>/dev/null || true
codesign --force --deep -s - minivmac.app

# 5. stage a test dir with the ROM, a System 6 boot floppy and the app disks
T="$WORK/mctest"
mkdir -p "$T"
cp -R "$SRC/minivmac.app" "$T/"
cp "$WORK/vmac/vMac.ROM"   "$T/" 2>/dev/null || echo "  (copy your Plus vMac.ROM into $T)"
cp "$WORK/vmac/Disk605.dsk" "$T/" 2>/dev/null || echo "  (copy a System 6 boot .dsk into $T)"
xattr -cr "$T/minivmac.app" 2>/dev/null || true
codesign --force --deep -s - "$T/minivmac.app"
echo ">> built: $T/minivmac.app"
