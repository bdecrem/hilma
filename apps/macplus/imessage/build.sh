#!/usr/bin/env bash
# Build Macinclaude iMessage for the Mac Plus with the Retro68 toolchain.
# Outputs IMessage.bin / IMessage.APPL / IMessage.dsk into ./build/.
#
# Usage:
#   ./build.sh         normal build (real Plus; talks to the mux over serial)
#   ./build.sh test    OFFLINE TEST build for Mini vMac (-DIM_TEST): no serial,
#                      starts "connected" and renders the embedded sample
#                      thread. Do NOT ship this one to the Plus.
set -euo pipefail

TC="${RETRO68_TOOLCHAIN:-$HOME/mac-plus-apps/Retro68-build/toolchain}/m68k-apple-macos/cmake/retro68.toolchain.cmake"
if [ ! -f "$TC" ]; then
  echo "Retro68 toolchain not found at: $TC" >&2
  exit 1
fi

EXTRA=()
if [ "${1:-}" = "test" ]; then
  EXTRA=(-DIM_TEST=ON)
  echo "*** TEST BUILD (IM_TEST): offline Mini vMac build - renders the embedded"
  echo "*** sample thread, no serial. Do NOT inject this onto the Plus. ***"
fi

cd "$(dirname "$0")"
rm -rf build && mkdir build && cd build
cmake -DCMAKE_TOOLCHAIN_FILE="$TC" ${EXTRA[@]+"${EXTRA[@]}"} ..
make
echo
echo "Built:"
ls -1 IMessage.bin IMessage.APPL IMessage.dsk 2>/dev/null
