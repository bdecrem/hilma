# Building the apps

The Plus apps are C written against the classic Mac Toolbox and cross-compiled
for the 68000 with **Retro68**. You build them on a modern Mac; the output is a
MacBinary `.bin` you install (see [INSTALL-APPS.md](INSTALL-APPS.md)).

## 1. Get the Retro68 toolchain

[Retro68](https://github.com/autc04/Retro68) is a GCC-based cross-compiler for
`m68k-apple-macos` that ships the open-source *Multiversal Interfaces* (the
classic `<Quickdraw.h>`, `<Windows.h>`, `<Menus.h>`, … headers).

Follow Retro68's build instructions to produce a toolchain. You'll end up with a
CMake toolchain file at:

```
<retro68>/toolchain/m68k-apple-macos/cmake/retro68.toolchain.cmake
```

Set an env var to point at it (the per-app `build.sh` scripts read it):

```bash
export RETRO68_TOOLCHAIN=<retro68>/toolchain
```

## 2. Build an app

Most apps have a one-command `build.sh`:

```bash
cd macinclaude
./build.sh
# -> build/Macinclaude.bin  (MacBinary, ready to install)
#    build/Macinclaude.APPL (native macOS file with resource fork)
#    build/Macinclaude.dsk  (800K HFS floppy image with the app on it, for Mini vMac)
```

Apps without a `build.sh` use CMake directly:

```bash
cd sudoku
mkdir build && cd build
cmake -DCMAKE_TOOLCHAIN_FILE="$RETRO68_TOOLCHAIN/m68k-apple-macos/cmake/retro68.toolchain.cmake" ..
make
```

A successful build ends in `Built target <App>_APPL`. Keep apps small (the Plus
has 1–4 MB of RAM), black-and-white, and free of Control-key shortcuts (the Plus
keyboard has no Control key).

> **Editor lint noise is expected.** A normal desktop `clang` can't find the
> Toolbox headers, so your editor will flag `Quickdraw.h not found`, `unknown
> type Boolean`, etc. Ignore those — trust the Retro68 build.

## 3. Verify — compiling is necessary, not sufficient

1. **It builds.** `Built target …_APPL`. Confirm the resource profile with
   `python3 tools/lsrsrc.py build/App.APPL` — a real app shows `CODE` (×N
   segments), `SIZE`, `DATA`.
2. **Host-logic test.** Where the logic is pure, port it into a host `clang`
   test and assert against known data — fast, no emulator. `sudoku/logic_test.c`
   does this for all 36 puzzles; `*/rxtest.c` files test the wire parsers.
3. **Run it in Mini vMac** (the visual gold standard). [Mini vMac](https://www.gryphel.com/c/minivmac/)
   emulates a Mac Plus. Boot a System 6 floppy image + a real Plus ROM, then
   **File ▸ Open Disk Image** to insert the app's `.dsk`, double-click the disk,
   double-click the app, and exercise it. Mini vMac boots **raw HFS** floppy
   images (not partitioned `.hda` SCSI images), and drive it with the **`key`**
   tool for keystrokes (synthesized text is ignored) and mouse-down-drag for
   the sticky System 6 menus.

   *Mini vMac has no SCSI-network emulation*, so a networked app opens its window
   but can't reach an agent there — verify those on real hardware, or offline
   with each app's embedded test data (e.g. Paint's **Draw Test Image**).

## Worked example

`sudoku/` is a complete, self-contained reference: `generate_puzzles.py` creates
and verifies unique-solution puzzles into `puzzles.h`; `sudoku.c` is idiomatic
Toolbox C (a `WaitNextEvent` loop, a QuickDraw grid, code-built menus);
`logic_test.c` checks the logic on the host; `CMakeLists.txt` is three lines.
Read it before writing your own.
