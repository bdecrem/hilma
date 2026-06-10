#!/usr/bin/env bash
set -euo pipefail
TC="${RETRO68_TOOLCHAIN:-$HOME/mac-plus-apps/Retro68-build/toolchain}/m68k-apple-macos/cmake/retro68.toolchain.cmake"
cd "$(dirname "$0")"; rm -rf build && mkdir build && cd build
cmake -DCMAKE_TOOLCHAIN_FILE="$TC" .. >/dev/null && make
echo; ls -1 MuxDemo.bin MuxDemo.dsk 2>/dev/null
