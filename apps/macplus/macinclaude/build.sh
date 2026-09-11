#!/usr/bin/env bash
# Build Macinclaude for the Mac Plus with the Retro68 toolchain.
# Outputs Macinclaude.bin / Macinclaude.APPL / Macinclaude.dsk into ./build/.
set -euo pipefail

TC="${RETRO68_TOOLCHAIN:-$HOME/mac-plus-apps/Retro68-build/toolchain}/m68k-apple-macos/cmake/retro68.toolchain.cmake"
if [ ! -f "$TC" ]; then
  echo "Retro68 toolchain not found at: $TC" >&2
  echo "Build it first (see ../CLAUDE.md) or set RETRO68_TOOLCHAIN." >&2
  exit 1
fi

cd "$(dirname "$0")"
EXTRA=""
if [ "${1:-}" = "serial" ]; then EXTRA="-DCMAKE_C_FLAGS=-DMACINCLAUDE_SERIAL"; echo "(MACINCLAUDE_SERIAL modem-port build for the Mini vMac harness)"; fi
rm -rf build && mkdir build && cd build
cmake -DCMAKE_TOOLCHAIN_FILE="$TC" $EXTRA ..
make
echo
echo "Built:"
ls -1 Macinclaude.bin Macinclaude.APPL Macinclaude.dsk 2>/dev/null
