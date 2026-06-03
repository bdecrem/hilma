# MacPlus — building native apps for a real Macintosh Plus

This project builds and ships **native classic-Mac applications** (System 6 / 7-era, 68000 CPU)
that run on Bart's **real Macintosh Plus**, with storage provided by a **BlueSCSI** (microSD-based
SCSI disk emulator). Apps are also verified in the **Mini vMac** emulator before they touch hardware.

The first app built from scratch here is **Sudoku** (`sudoku/`). Three period apps —
MacPaint 2.0, MacWrite 4.5, ZTerm 1.0.1 — were also sourced and injected onto the Plus.

> **What lives in this repo vs. on disk.** This folder holds *source + tooling + docs* only.
> The Retro68 toolchain (~GB), disk images (~GB), and the Mac ROM are **not** committed — they
> live outside the repo under `~/mac-plus-apps/` and are referenced below. Don't commit ROMs
> (copyright) or build artifacts.

---

## WHERE WE LEFT OFF (2026-06-03) — read this first when resuming

The agent ("**Macinclaude Plus**" — the name Bart picked) is **built and working**; the only blocker is
the **Plus↔modem serial cable**.

- **Code locations:** repo **source of truth** = `apps/macplus/agent/` (this repo: `src/main.ts`,
  `src/teletype.ts`, `README.md`). **Deployed copy on the mini** = `~/claude-plus/` on
  `admin@192.168.7.50`, put there by rsync from the repo, then `npm install` on the mini. Re-deploy with:
  `rsync -az --exclude node_modules ~/Documents/coding2025/hilma/apps/macplus/agent/ admin@192.168.7.50:claude-plus/`
  then `ssh admin@192.168.7.50 'cd claude-plus && /opt/homebrew/bin/npm install'`.
- **Agent status:** running on the mini's `~/claude-plus/` copy via a **temporary listener on port
  2324** (NOT the production 2323 login shell). Verified end-to-end from the iMac with
  `nc 192.168.7.50 2324` — held a conversation, it created a file with the `[y/N/a]` gate. Caveats:
  the `ANTHROPIC_API_KEY` was set only in that listener's environment (not persistent — if the mini
  rebooted, re-launch per `agent/README.md`). The banner on the mini says "Macinclaude Plus" but the
  **repo source/docs still say the old name** — renaming to "Macinclaude Plus" is a pending TODO.
- **The blocker — the cable:** Bart's original DIN-8→DB-9 cable is **dead** — physically missing DB-9
  **pins 2 & 3 (RXD/TXD)**, so it has no data path (confirmed why nothing ever reached the modem).
- **Confirmed facts:** the WiFi modem is a **Simulant RetroWiFi SI**, **DB-9 female**, a Hayes modem
  (**DCE**) → it needs a **STRAIGHT-THROUGH** cable, NOT null-modem. (Confirmed via Simulant/community.)
- **On order (arrives ~6/4; Bart resumes next week):**
  1. **C2G 25041 / 70810** cable — mini-DIN-8 **male** → DB-9 **female**, ~4 ft.
  2. **Warmstor** DB-9 male-to-male **straight gender changer** (6-pack).
  3. **LNHCAW** DB-9 male-to-male **null-modem adapter**.
  Both adapters are male-male (they bridge the cable's female DB-9 to the SI's female). We bought both
  because the C2G 25041's internal wiring (straight vs null-modem) is undocumented and field reports conflict.

- **NEXT STEPS when the parts arrive:**
  1. Assemble: Plus **modem port** → C2G cable → **straight gender changer** → SI. ZTerm: Modem Port,
     **9600**, 8-N-1, flow control **off**, **Local Echo ON** (for the AT test only).
  2. Type `AT` → expect `OK`. **If silent, swap the straight coupler for the null-modem adapter** in the
     same spot and retry. One of the two is the correct wiring.
  3. Once `OK`: set ZTerm **Local Echo OFF**, join WiFi `ATW"SSID,PASSWORD"`, save `AT&W`.
  4. **Dial the agent:** `ATDT"192.168.7.50:2324"` → lands in Macinclaude Plus. (If 2324 is dead, re-launch
     the listener — `agent/README.md`.)

(Full WiFi/connection detail and the bring-up table are in the "Connecting the Plus to WiFi" section below.)

---

## The hardware/storage setup

- **Machine:** Macintosh Plus (Motorola 68000, 1–4 MB RAM, 512×342 1-bit B&W screen, no Control key, no fan).
- **Storage:** BlueSCSI reads disk images (`.hda`) off a **FAT32 microSD card**. The Plus mounts those images as SCSI disks.
- **Boot image on the card:** `HD20_512-1GB-MacPlus-6+7.hda` — a 1 GB image with an **Apple Partition Map**,
  one HFS volume named **"BlueSCSI Mac Plus"**, holding System 6.0.8 + System 7.0.1 boot folders and an
  **`Apps`** folder. This is where built apps land.
- **Rule:** never reformat or alter the card's FAT32 or its other files (`bluescsi.ini`, `HD30_512 MacPack.hda`).
  We only overwrite the one `.hda` file.

---

## Current state of the Macintosh Plus

- **Boots fine** off the BlueSCSI card into System 6.0.8 (volume "BlueSCSI Mac Plus"); a System 7.0.1
  folder is also present, plus Apple HD SC Setup, Silver Lining, System Picker.
- **`Apps/` folder on the card holds four working apps**, all with resource forks verified intact:
  **MacPaint 2.0** (`APPL/MPNT`), **MacWrite 4.5** (`APPL/MACA`), **ZTerm 1.0.1** (`APPL/zTRM`), and
  **Sudoku** (`APPL/????`, built here). MacPaint/MacWrite/ZTerm were sourced from Macintosh Garden;
  Sudoku was built from scratch (see the worked example below).
- **Simulator we use: Mini vMac** (the Mac Plus emulator) on the iMac — boots a *pre-made* System 6.0.5
  floppy image (`Disk605.dsk`) with the real Plus ROM (`boot0.rom`/`vMac.ROM`). We do **not** compile an
  OS. Mini vMac boots **raw HFS** images only, not the APM `.hda`/`.vhd` SCSI images (those work on the
  real Plus). It's the only emulator in the loop; everything visual is verified there before the card.
- **Networking / WiFi: not yet working** — blocked on the serial cable. See "WHERE WE LEFT OFF" at the top.

---

## Hardware inventory — extra parts Bart has

| Item | What it is | Interface | Use |
|------|-----------|-----------|-----|
| **Simulant RetroWiFi SI** | WiFi-to-serial modem (Hayes/Zimodem-compatible) — bridges a serial port to modern WiFi | **DE-9 (DB-9) male RS-232**; **5V micro-USB** power; 300–115200 baud; AT command set; RTS/CTS + XON/XOFF | **This is how the Plus gets online over WiFi.** Simulant also sells a DB-9→DB-25 adapter. |
| **Practical Peripherals PM2400SA** | 2400-baud external dial-up modem | **DB-25 RS-232**; analog phone line (RJ-11) | Legacy *real* dial-up only — **not used for WiFi**. |
| Cable: **Apple Mac modem cable** | Mac serial → external RS-232 modem | mini-DIN-8 ↔ **DB-25** | Connects the Plus serial port to a DB-25 modem (e.g. the PM2400SA). Modem end = DB-25. |
| Cable: **Mac serial cable** | Mac-to-Mac / printer / LocalTalk-style | mini-DIN-8 ↔ **mini-DIN-8** (both ends round) | Not directly usable with the DB-9 RetroWiFi SI. |
| Coiled cords | Mac Plus **keyboard** coiled cable and/or an **RJ-11** phone cord | RJ-style 4P4C / RJ-11 | Keyboard; phone cord is for the PM2400SA, not WiFi. |

Plus the BlueSCSI + SD card and the Macintosh Plus itself (see top).

## Connecting the Plus to WiFi

**Chain:** Mac Plus **modem port** (mini-DIN-8, **RS-422**) → Mac serial cable → **RetroWiFi SI** (RS-232, **DB-9**) → USB power → WiFi → network.

**The trap is wiring, not physical fit.** The Plus port is RS-422 on a mini-DIN-8; the WiFi SI is
RS-232 on a DB-9. They interoperate for basic TX/RX/GND *only if the cable is a genuine Mac-serial-to-modem
cable with the data lines on the right pins.* A DIN-8 that merely *fits* the socket can have data on the
wrong pins and you get nothing — the same failure mode as the synth DIN-8 cable. So the question is never
"does it fit," it's "is this wired as a Mac modem cable," and if a D-sub adapter is in the chain its pinout
matters just as much.

**What we have vs. what we need:**
- The WiFi SI is **DB-9**; Bart's Mac modem cable is mini-DIN-8 ↔ **DB-25** → gender/pin gap. Close it one of two ways:
  1. **A purpose-made mini-DIN-8 → DB-9 Mac modem cable** (cleanest — no adapter pinout to second-guess). *Recommended.*
  2. **The existing DIN-8↔DB-25 Apple modem cable + a DB-25↔DB-9 adapter** (Simulant sells one). Works *only* if
     that cable is wired as a real Apple modem cable AND the adapter follows standard RS-232 pinout. Verify, don't assume.
- The DIN-8↔DIN-8 cable doesn't help here (no D-sub end).

**Mac Plus DIN-8 modem pinout** (for wiring/verifying a cable): pin1 HSKo (DTR/RTS-out), pin2 HSKi (CTS-in),
pin3 TxD−, pin4 GND, pin5 RxD−, pin6 TxD+, pin7 (GPi/n.c.), pin8 RxD+ (tie to GND). For RS-232 single-ended:
TxD− → modem RxD, RxD− → modem TxD, GND↔GND, tie TxD+/RxD+ to GND, wire HSKo→CTS and DCD→HSKi for hardware flow control.

**The RetroWiFi SI firmware is Zimodem** (Allen Huffman's fork of Bo Zimmerman's Zimodem; ESP8266 +
MAX3232). It **auto-detects baud** the moment you type `AT`, so the exact ZTerm rate isn't critical.

**Bring-up procedure (go/no-go before trusting anything):**
1. Power the WiFi SI over USB (LED on). Plug it into the Plus **modem port** (phone icon, *not* the printer port).
2. Launch **ZTerm** on the Plus. Modem Port, **9600** baud, 8-N-1, flow control **None** to start
   (the 68000 struggles much higher; the DIN-8→DB-9 cable may not carry RTS/CTS).
3. Type **`AT`** ⏎ → reply **`OK`** means the cable + wiring are correct. **This is the gate.** No `OK` /
   garbage = wiring/port/baud wrong — stop and fix (the "fits but mis-wired" trap).
4. Join WiFi (exact Zimodem commands):
   - Scan: **`ATW5`** ⏎ — lists up to 5 networks (`*` = encrypted).
   - Connect: **`ATW"SSID,PASSWORD"`** ⏎ — SSID + password in one pair of quotes, comma-separated.
   - Save: **`AT&W`** ⏎ — reconnects on next power-up.
   - Friendlier alternative: **`AT+CONFIG`** ⏎ → interactive menu (pick network, set baud/flow control).
5. "Dial" the target by telnet — the WiFi SI speaks telnet itself: **`ATDT"<host>:<port>"`**.

### The endgame: a Unix shell on the Plus, via the Mac mini (RECEIVING END ALREADY CONFIGURED)

The Plus has no TCP/IP — the RetroWiFi SI does the networking and opens a raw TCP socket to the mini,
which spawns a login shell on a PTY. The Plus gets a real interactive zsh session over what looks (to it)
like a phone call.

```
Mac Plus ──RS-422 serial──> RetroWiFi SI ──WiFi/TCP──> Mac mini :2323 ── socat(root) ── login -f admin ── zsh
```

**Mac mini — configured & verified reachable from the LAN (2026-06-02):**
- Host `admins-Mac-mini` (macOS 26.3.1, arm64), wired LAN IP **`192.168.7.50`**, en0 MAC `1c:f6:4c:5d:a6:4a`.
- Listener: `/opt/homebrew/bin/socat TCP-LISTEN:2323,reuseaddr,fork EXEC:'login -f admin',pty,setsid,ctty,stderr`
  — one PTY login shell per connection, passwordless (`-f`), **user `admin`** (no `bart` user; LAN-only, intentional).
- LaunchDaemon `/Library/LaunchDaemons/sh.macplus.terminal.plist` (label `sh.macplus.terminal`, root, KeepAlive,
  RunAtLoad). Logs: `/var/log/macplus-terminal.{out,err}.log`. Mini never sleeps on AC; app firewall off.
- **Dial it from ZTerm:** `ATDT"192.168.7.50:2323"` → expect `CONNECT`, then `Last login: … admin@admins-Mac-mini ~ %`.
- Mini ops (run on the mini): status `sudo launchctl print system/sh.macplus.terminal | head`; listening?
  `netstat -an -p tcp | grep 2323`; stop/start `sudo launchctl bootout|bootstrap system <plist>`; LAN smoke test
  from any host `nc 192.168.7.50 2323`.
- **TODO (Bart, router):** set a DHCP reservation `1c:f6:4c:5d:a6:4a → 192.168.7.50` so the IP can't drift.

**ZTerm settings for the shell session:** Modem Port; baud = modem's (start 9600); **8-N-1**; **local echo OFF**
(remote echoes); auto line-wrap ON; emulation **VT100**; flow control hardware (CTS/RTS) if the cable wires it,
else XON/XOFF, else cap at 9600. After login run `export TERM=vt100; stty cols 80 rows 24` for sane full-screen apps.

**Common gotchas:** garbled/staircase text → CR↔LF mapping (toggle "Auto LF after CR"); dropped chars at high baud →
flow control not wired, drop to 9600; `vi`/`clear` broken → `export TERM=vt100`; hung after `exit` → `+++` then `ATH`
to force the modem back to command mode (`NO CARRIER`). zsh emits bracketed-paste escapes (`^[[?2004h`) — harmless on
VT100; if they show as garbage, `unset zle_bracketed_paste` in the session.

---

## Where the resources live (`~/mac-plus-apps/`, outside this repo)

| What | Path | Notes |
|------|------|-------|
| **Retro68 toolchain** | `~/mac-plus-apps/Retro68-build/toolchain/` | GCC 12.2 cross-compiler for `m68k-apple-macos` |
| → CMake toolchain file | `…/toolchain/m68k-apple-macos/cmake/retro68.toolchain.cmake` | pass to `cmake -DCMAKE_TOOLCHAIN_FILE=` |
| → Retro68 source | `~/mac-plus-apps/Retro68/` | `git clone --recurse-submodules https://github.com/autc04/Retro68` |
| **Mini vMac.app** | `~/mac-plus-apps/vmac/Mini vMac.app` | de-quarantined copy (see gotchas); `brew install --cask mini-vmac` |
| **Mac Plus ROM** | `~/Downloads/MacPack-20240421/boot0.rom` | 128 KB, v3 "Loud Harmonicas", md5 `8a41e0754ffd1bb00d8183875c55164c`. Bart owns it. Copy to `vMac.ROM`. |
| **System 6.0.5 boot floppy** | `~/Downloads/MacPack-20240421/Disk605.dsk` | 800 K raw HFS — boots Mini vMac (the `.vhd` HD images do **not**, see gotchas) |
| **Local copy of the card image** | `~/mac-plus-apps/work/HD20.hda` | inject here, verify, then copy back to the card |
| **vmac working dir** | `~/mac-plus-apps/vmac/` | Mini vMac.app + vMac.ROM + Disk605.dsk + the app's `.dsk` |

Homebrew packages used: `hfsutils unar megatools cmake gmp mpfr libmpc boost@1.85 bison flex texinfo coreutils`.

---

## Building an app — the workflow

1. **Write C against the Mac Toolbox.** Retro68 ships the open-source *Multiversal Interfaces*
   (`<Quickdraw.h>`, `<Windows.h>`, `<Menus.h>`, `<Events.h>`, …). A classic app = `InitToolbox()`
   (InitGraf/InitFonts/InitWindows/InitMenus/TEInit/InitDialogs/InitCursor) → build menus in code →
   `NewWindow` → a `WaitNextEvent` loop dispatching mouseDown/keyDown/updateEvt. See `sudoku/sudoku.c`
   for a complete, idiomatic example (grid drawing in QuickDraw, hit-testing, `MenuSelect`/`MenuKey`,
   selection highlight, B&W styling for given-vs-user-vs-conflict cells).
2. **CMake project.** A 3-line `CMakeLists.txt` with `add_application(Name src.c)` (see `sudoku/CMakeLists.txt`).
3. **Build:**
   ```bash
   TC=~/mac-plus-apps/Retro68-build/toolchain/m68k-apple-macos/cmake/retro68.toolchain.cmake
   mkdir build && cd build
   cmake -DCMAKE_TOOLCHAIN_FILE="$TC" .. && make
   ```
   Outputs: `Name.bin` (MacBinary — code + resource fork, ready to inject), `Name.APPL` (native macOS
   file w/ resource fork), `Name.dsk` (800 K HFS disk image with the app on it — handy for Mini vMac).
4. **Target the Plus specifically:** Retro68's gcc already defaults to `-mcpu=m68000`. Keep apps small
   (1 MB RAM), B&W, no Control-key dependence (the Plus keyboard has none).

---

## Verifying — compile is necessary, not sufficient

Run all that apply before declaring done (mirrors the repo-wide "spec first, then verify behavior" rule):

1. **It compiles:** `make` → `Built target`. Confirm the resource profile with
   `python3 tools/lsrsrc.py build/Name.APPL` — a real app shows `CODE` (×N segments), `SIZE`, `DATA`, `RELA`.
2. **Logic test on the host:** port the pure logic into a host-clang test and assert against known data.
   `sudoku/logic_test.c` does this for all 36 puzzles (unique-solution, conflict/win detection). Fast, runs every change.
3. **Run it for real in Mini vMac** (the gold standard — drive it, don't assume):
   - **What this is:** Mini vMac is a Macintosh Plus *emulator* that runs in a window **on the modern
     Mac (the iMac)** — the real Plus is never involved. We do **not** compile or build an OS: it boots a
     **pre-made System 6 disk image** (`Disk605.dsk` = Apple's System 6.0.5, shipped on the MacPack), using
     the real Plus ROM (`vMac.ROM`). The only thing *we* compiled is the app. So "I booted System 6" =
     emulator on the iMac booting an existing disk image, not anything running on hardware.
   - Working dir `~/mac-plus-apps/vmac/` with `Mini vMac.app`, `vMac.ROM`, `Disk605.dsk`, `Name.dsk`.
   - `open -a "…/Mini vMac.app"`, then **File ▸ Open Disk Image** (⌘⇧G to type a path) to insert
     `Disk605.dsk` (boots System 6) then `Name.dsk`.
   - Drive via the computer-use MCP: double-click the disk → double-click the app → exercise it.
     Confirm rendering + input + menus on the actual emulated 512×342 Plus screen.

---

## Injecting onto the Plus (preserving the resource fork)

Classic Mac apps keep their code in the **resource fork**, so a naive copy destroys them. Use
MacBinary mode with hfsutils. The card image is APM-partitioned; `hmount` auto-detects the HFS partition.

```bash
cd ~/mac-plus-apps/work
cp "/Volumes/NO NAME/HD20_512-1GB-MacPlus-6+7.hda" HD20.hda    # work on a local copy
hmount HD20.hda
hcd ":Apps"
hcopy -m <app>.bin ":<App Name>"          # -m = MacBinary: writes both forks + type/creator
hls -l "BlueSCSI Mac Plus:Apps:"          # verify it's there with correct APPL/<creator> + rsrc size
humount
# (optional) prove the fork survived: hcopy -m it back out and md5-compare to the source
cp HD20.hda "/Volumes/NO NAME/HD20_512-1GB-MacPlus-6+7.hda"    # back to card, SAME filename
sync && diskutil eject /dev/diskN
```

- The local filename (`HD20.hda`) is arbitrary; what matters is writing the card file under its
  **original** name. The local copy is a strict superset of the card (same volume + apps + the new one).
- For a bare app already in MacBinary (e.g. Retro68's `Name.bin`), `hcopy -m` is enough. For native
  macOS files carrying a resource fork in an xattr (e.g. unpacked `.sit`/`.hqx` downloads), encode to
  MacBinary first with `tools/macbin.py`.

---

## Worked example — how Sudoku was built (the full pipeline)

End to end, in the order it happened (`sudoku/`):
1. **Puzzles, generated + verified in Python** — `sudoku/generate_puzzles.py` builds puzzles, digs holes
   while a solver checks **uniqueness**, grades difficulty, and emits `sudoku/puzzles.h` (36 puzzles:
   8 easy / 14 medium / 14 hard, every one verified to have exactly one solution).
2. **The app, in C against the Mac Toolbox** — `sudoku/sudoku.c`: a `WaitNextEvent` loop, a QuickDraw
   9×9 grid with hit-testing, code-built menus (`MenuSelect`/`MenuKey`), selection highlight, and B&W
   styling that distinguishes givens / user entries / conflicts. Compiled for 68000 with **Retro68**
   (`sudoku/CMakeLists.txt` → `add_application`; `sudoku/build.sh` is one-command).
3. **Logic verified on the host** — `sudoku/logic_test.c` ports the exact conflict/win algorithms and
   asserts them against all 36 puzzles with the system clang (fast, catches regressions without the Mac).
4. **Injected onto the Plus** — the Retro68 `Sudoku.bin` (MacBinary) `hcopy -m`'d into the `Apps` folder
   of a local copy of the BlueSCSI image, resource fork confirmed byte-identical, then the `.hda` copied
   back to the SD card. (`tools/lsrsrc.py` confirms `CODE`/`SIZE` resources; `tools/macbin.py` is the
   MacBinary encoder for non-Retro68 apps.)
5. **Run for real in Mini vMac** — booted System 6 with the actual Plus ROM, launched Sudoku, drove it
   (clicks + keys), confirmed rendering, input, conflict-marking, and the menus before trusting the card.

This is the template for any new 68k app here: generate/verify data → Toolbox C via Retro68 → host-test
the pure logic → inject with resource fork intact → drive it in Mini vMac.

---

## Gotchas (hard-won — read before repeating the work)

- **Retro68 host tools won't build against Homebrew Boost 1.90 + CMake 4.x.** `find_package(Boost
  COMPONENTS system)` fails because `boost_system` is header-only now (no config package). Fix:
  `brew install boost@1.85`, then build host tools only with
  `build-toolchain.bash --no-ppc --no-carbon --skip-thirdparty` and env
  `CMAKE_PREFIX_PATH=/opt/homebrew/opt/boost@1.85 Boost_DIR=/opt/homebrew/opt/boost@1.85/lib/cmake/Boost-1.85.0`.
  Also put `texinfo` (makeinfo) on PATH or binutils' docs step errors out. Clear stale `build-host/` before retrying.
- **Copying `Mini vMac.app` trips Gatekeeper** ("damaged, move to Trash" → it gets deleted). After copying:
  `xattr -cr "Mini vMac.app" && codesign --force --deep -s - "Mini vMac.app"`. Keep `vMac.ROM` *next to* the `.app`.
- **Mini vMac boots raw HFS images only, not Apple-Partition-Map images.** The MacPack `*.vhd` SCSI
  images (and the BlueSCSI `.hda`) are APM → Mini vMac shows the "?" floppy forever. Boot from
  `Disk605.dsk` (raw 800 K floppy) instead. (The APM images are fine on the *real* Plus via BlueSCSI.)
- **Driving Mini vMac via computer-use:** send keystrokes with the **`key`** tool (raw keycodes the
  emulator captures), **not `type`** (synthesized unicode is ignored). System 6 menus aren't sticky —
  open them with mouse-down → drag to item → mouse-up, not a click. `open -a … disk.dsk` does **not**
  auto-insert; use File ▸ Open Disk Image.
- **Macintosh Garden download links are IP-bound tokens** (the page's signed URL only works for the IP
  that loaded the page; bots get 410/418). Use a mirror like `gardenmirror.oldapplestuff.com/apps/<file>`.
  Verify downloads against the catalog MD5.
- **hfsutils HFS path syntax:** a leading `:` means *current directory*, not root. Use the full
  `Volume:Folder:File` form for clarity; `hcd ":"` does **not** go to root.
- **Cosmetic:** Retro68-built apps show a 1903/1904 creation date (MacBinary date epoch) and creator
  `????` unless you set them — harmless.

---

## Layout of this folder

```
apps/macplus/
  CLAUDE.md                 ← this file
  sudoku/
    sudoku.c                ← the app (Mac Toolbox, ~450 lines C)
    puzzles.h               ← 36 embedded puzzles (8 easy / 14 medium / 14 hard), generated
    CMakeLists.txt          ← add_application(Sudoku sudoku.c)
    generate_puzzles.py     ← regenerates puzzles.h with verified unique-solution puzzles
    logic_test.c            ← host-clang test of conflict/win logic vs every puzzle
  tools/
    macbin.py               ← MacBinary II encoder (native macOS file w/ rsrc fork → .bin for hcopy -m)
    lsrsrc.py               ← list resource-fork types (sanity-check a built app)
```

Build artifacts (`build/`, `*.bin`, `*.dsk`, `*.APPL`) are produced under `~/mac-plus-apps/` and are
**not** committed. To rebuild Sudoku, copy `sudoku/` somewhere with the toolchain and run the build
commands above; to regenerate puzzles, `python3 sudoku/generate_puzzles.py` (writes `puzzles.h`).

## Ideas / next steps

Sudoku extensions: pencil marks, a move timer, score/streaks, a "reveal hint" using the bundled solver,
more puzzles (bump the counts in `generate_puzzles.py`). New apps: anything small + B&W is a good fit —
a notepad, a clock/stopwatch, a simple drawing toy, a chip-8-style game.
