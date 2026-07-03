#!/usr/bin/env bash
# Build Daily Pixel for the Mac Plus with the Retro68 toolchain.
# Outputs Pixel.bin / Pixel.APPL / Pixel.dsk into ./build/.
set -euo pipefail

TC="${RETRO68_TOOLCHAIN:-$HOME/mac-plus-apps/Retro68-build/toolchain}/m68k-apple-macos/cmake/retro68.toolchain.cmake"
if [ ! -f "$TC" ]; then
  echo "Retro68 toolchain not found at: $TC" >&2
  exit 1
fi

cd "$(dirname "$0")"
rm -rf build && mkdir build && cd build
cmake -DCMAKE_TOOLCHAIN_FILE="$TC" ..
make
echo
echo "Built:"
ls -1 Pixel.bin Pixel.APPL Pixel.dsk 2>/dev/null
