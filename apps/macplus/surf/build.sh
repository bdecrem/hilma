#!/usr/bin/env bash
# Build Macinclaude Surf for the Mac Plus with the Retro68 toolchain.
# Outputs Surf.bin / Surf.APPL / Surf.dsk into ./build/.
#
# Usage:
#   ./build.sh         normal build (real Plus; talks to the agent over serial)
#   ./build.sh test    OFFLINE TEST build for Mini vMac (-DSURF_TEST): no
#                      serial, starts "connected", commands load the embedded
#                      test page. Do NOT ship this one to the Plus.
set -euo pipefail

TC="${RETRO68_TOOLCHAIN:-$HOME/mac-plus-apps/Retro68-build/toolchain}/m68k-apple-macos/cmake/retro68.toolchain.cmake"
if [ ! -f "$TC" ]; then
  echo "Retro68 toolchain not found at: $TC" >&2
  exit 1
fi

EXTRA=()
if [ "${1:-}" = "test" ]; then
  EXTRA=(-DSURF_TEST=ON)
  echo "*** TEST BUILD (SURF_TEST): offline Mini vMac build - commands load the"
  echo "*** embedded test page, no serial. Do NOT inject this onto the Plus. ***"
fi

cd "$(dirname "$0")"
rm -rf build && mkdir build && cd build
cmake -DCMAKE_TOOLCHAIN_FILE="$TC" ${EXTRA[@]+"${EXTRA[@]}"} ..
make
echo
echo "Built:"
ls -1 Surf.bin Surf.APPL Surf.dsk 2>/dev/null
