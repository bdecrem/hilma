#!/usr/bin/env bash
# Build Dodo for Macintosh for the Mac Plus with the Retro68 toolchain.
# Outputs Dodo.bin / Dodo.APPL / Dodo.dsk into ./build/.  `./build.sh test` = DODO_TEST
# offline variant (canned transcript + list) for Mini vMac screenshots.
set -euo pipefail

TC="${RETRO68_TOOLCHAIN:-$HOME/mac-plus-apps/Retro68-build/toolchain}/m68k-apple-macos/cmake/retro68.toolchain.cmake"
if [ ! -f "$TC" ]; then
  echo "Retro68 toolchain not found at: $TC" >&2
  exit 1
fi

cd "$(dirname "$0")"
rm -rf build && mkdir build && cd build
EXTRA=""
if [ "${1:-}" = "test" ]; then EXTRA="-DCMAKE_C_FLAGS=-DDODO_TEST"; echo "(DODO_TEST offline build)"; fi
if [ "${1:-}" = "serial" ]; then EXTRA="-DCMAKE_C_FLAGS=-DDODO_SERIAL"; echo "(DODO_SERIAL modem-port build for the Mini vMac harness)"; fi
cmake -DCMAKE_TOOLCHAIN_FILE="$TC" $EXTRA ..
make
echo
echo "Built:"
ls -1 Dodo.bin Dodo.APPL Dodo.dsk 2>/dev/null
