#!/usr/bin/env bash
# Build Atkinson for the Mac Plus with the Retro68 toolchain.
# Outputs Atkinson.bin / Atkinson.APPL / Atkinson.dsk into ./build/.
# Regenerate the embedded test image first with:
#   python3 dither.py SOME.png --size 480x300 --fit cover --header test_image.h
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
ls -1 Atkinson.bin Atkinson.APPL Atkinson.dsk 2>/dev/null
