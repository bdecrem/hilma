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

## What we've built — app & service catalog

**Apps**
- **Sudoku** (`sudoku/`) — 36-puzzle game, unique-solution verified
- **Macinclaude Code** (`macinclaude/`) — Claude Code agent in a VT100 terminal
- **Macinclaude Paint** (`atkinson/`) — prompt → image → 1-bit Atkinson dither → progressive blit
- **Macinclaude Surf** (`surf/`) — reader-mode web browser
- **Macinclaude Foundry** (`foundry/`) — describe an app → Claude writes + Retro68 compiles → lands on disk
- **Quote of the Day** (`quote/`) — daily quote, served over the WiFi service
- **The Bridge** (`bridge/`) — over-the-air app delivery (drop a `.bin` in the mini outbox → installs on the Plus)
- **Daily Pixel** (`pixel/` + `agent-pixel/`, :2337) — persistent collaborative 64x64 1-bit canvas; you draw with the mouse, Claude adds a few strokes daily (or on invite, Canvas ▸ Invite Claude), updates appear live while watching

**Services / infrastructure**
- **WiFi system service** (`wifi/wifi.c` + `wifi.h`) + **boot INIT** (`wifi/wifiinit.c`) — one shared resident link to the mux; dial once, every app just attaches (no AT/ATDT in apps)
- **Multiplexer** (`agent-mux/`) — one serial connection, channel fan-out to backend services
- **Diagnostic stack** (`diag/diag.inc` + `agent-diag/`) — 3-sink logger (screen ring / wire / SD file) + mini sink, so hardware debugging needs no SD round-trip
- **Mini agents** (the brains) — `agent-foundry/`, `agent-surf/`, `agent-atkinson/`, `agent-quote/`, `agent-bridge/`
- **Mini vMac serial bridge** (`minivmac/vmodem.py` + `minivmac/e2e.sh`) — drive any app against its live agent in the emulator, no SD shuttling
- **SerialDoc** (`serialdoc/`) — serial-cable diagnostic (byte counts, hex view, baud sweep)
- **HelloWiFi** (`wifi/`) — WiFi bring-up + link test; smiley/sad verdict
- **MuxDemo** (`wifi/`) — 2-channel multiplexer demo
- **WiFiTest** (`wifi/`) — WiFi-service echo round-trip test

---

## WHERE WE LEFT OFF (2026-07-01) — read this FIRST when resuming

This is the current state. The 2026-06-11 section below is older history.

### SD card archive — restore a working card in minutes

`~/mac-plus-apps/sdcard-archive/` holds a complete, verified copy of the SD
card (boot image + bluescsi.ini + NE4.hda + firmware) with a step-by-step
restore guide at `~/mac-plus-apps/sdcard-archive/RESTORE.md`. If the card ever dies again:
format any microSD, copy three files on, done. The archive image is gated by
`tools/hfscheck.py` (full HFS integrity check) and was boot-tested in Mini vMac.
Refresh the archive after meaningful card changes (procedure in RESTORE.md).

### What's new since 2026-06-11

- **The apps moved off the serial WiFi service to direct TCP (`net/nettcp.c` →
  MacTCP → BlueSCSI DaynaPORT).** Every app now `NetConnect`s to the mini by IP
  (`192.168.7.50`). MacTCP + the DaynaPORT driver are installed in the Plus
  System Folder. The old `wifi.c`/`wifi.h` system-service path is legacy.
- **Plutonix (`plutonix/`) — a small Unix subsystem that runs ON the Plus.** A
  real shell + pipeline engine (`a | b | c`, `< > >>`), ~18 stream tools
  (echo/cat/ls/grep/wc/head/tail/sort/uniq/rev/nl/tr/date/mem/uname…), the HFS
  disk presented as the Unix tree (`/` = boot volume; **`rm`/`cat` hit real
  files**), plus a **from-scratch SSH-2 client (`pssh/`)** + scp. Shell core is
  in `shell.inc` (host-tested by `shtest.c`, 32/32). `mini` / `ssh` open a shell
  on the mini.
- **SSH timeout — FIXED via `agent-pssh` (mini, :2222).** The 68000 takes SEVERAL
  MINUTES to grind the curve25519 handshake; the mini's **system sshd (:22) kills
  it on LoginGraceTime (~2 min)** and we can't change that (no sudo). `agent-pssh`
  is a user-space `ssh2` SSH server with **no grace limit** + **TCP keepalive**,
  shell to admin. Algorithms match pssh (curve25519, aes256/128-ctr,
  hmac-sha2-256/512, ssh-ed25519). Plutonix `ssh admin@192.168.7.50` routes to
  **:2222** (not :22). Deployed; verified my client connects + gets a shell.
  Recent UX fixes: console **blink** (now repaints only on new output via
  `gDirty`), idle **disconnect** (TCP keepalive on pssh AND the bridge agent).
- **The INSTANT shell (2026-07-01): Plutonix `mini` / `rsh` → `agent-rsh` (:2329).**
  The fast sibling of pssh for the trusted LAN: raw TCP → pty → admin login
  shell. No key exchange (was minutes), no per-keystroke encrypt/decrypt (was
  why typing crawled). `mini` now takes ~a second to a live zsh; `ssh` remains
  the real-crypto path. `rsh host[:port]` reaches any host. ESC returns to
  Plutonix. Server: `agent-rsh/server.mjs` (dependency-free node + socat pty,
  TCP keepalive so idle sessions survive). Plutonix's ANSI stripper also now
  swallows OSC/charset escapes, not just CSI (zsh emits OSC on some setups).
- **SIZE bumped 1MB → 2MB** on all the nettcp apps. Atkinson and the Bridge
  crashed at 1MB (the 68000 nettcp working set was too tight); 2MB fixed it.
- **Shared app-event logging (`net/applog.inc`) — the remote-troubleshooting loop.**
  Any app calls `AppLogOpen("Name")` then `AppLog("event")`; lines stream to the
  diag sink (:2331) → **`~/macplus-logs/all.log` on the mini**. Pull it with one
  ssh: `ssh admin@192.168.7.50 'tail ~/macplus-logs/all.log'`. Wired into every
  app including The Bridge (launched / connected / connect-failed; the Bridge
  also logs receiving app / app installed / delivery failed). Best-effort +
  safe (off if the sink is down; never blocks/crashes the app). Companion
  tools: `agent-screen` (:2334, screenshot the Plus) + `agent-diag` (:2331).
- **applog v2 (2026-07-02): heartbeats + reconnect — silence is now a signal.**
  Apps call `AppLogTick()` once per event-loop pass (and `AppLogClose()` on
  quit — also fixes a MacTCP stream leak). Idle apps send `~hb` every 60 s;
  the sink swallows heartbeats (session files only, never all.log) and derives
  liveness: ~3 min without one → `(went silent …)` in all.log, then
  `(heartbeat resumed)` / `(link closed)`. So a FROZEN Plus now shows up in
  the log within ~3 min instead of just going quiet. A failed/dropped log
  link reconnects with backoff (15 s doubling to 10 min cap). Sink sets TCP
  keepalive so dead links reap instead of wedging. State machine host-tested:
  `net/applog_test.c` (19 asserts). Apps only pick this up when rebuilt —
  pre-v2 builds still log, they just never heartbeat.

### The 2026-06-27 "disk corruption" was a misdiagnosis — resolved 2026-07-01

What actually happened, established by full forensics (HFS integrity checker +
resource-fork validation + Mini vMac boot tests on every snapshot):

- **The HFS volume was never corrupted.** The "corrupted" image
  (`~/mac-plus-apps/work/corrupted-backup.hda`) passes every structural check
  and boots in Mini vMac with all 17 apps. The "corruption at ~50 KB" was the
  MDB (volume header at partition offset 48 K), which legitimately differs
  between any two mounts.
- **The disk writer is innocent.** Audit of `bridge/bridge.c` `MBConsume` +
  `foundry/foundry_rx.inc`: File-Manager-only writes (FSWrite to its own file
  refnums), bounds-checked, cannot reach HFS structures. The 17:23 freeze
  during the Plutonix delivery was most likely the Bridge's known 1 MB-SIZE
  crash — the card was running the 14:47 1 MB build; the 2 MB fix landed 17:06.
- **The no-boot was the SD CARD failing in the BlueSCSI's SDIO interface.**
  The full 2026-07-01 boot log shows ~700 consecutive `SD Error Code: 0x02`
  lines during init — when the storm doesn't clear, the SCSI bus stays dead
  and the Plus can't boot ("black screen with BlueSCSI attached"); when it
  clears, everything works. The card reads perfectly in a Mac reader — it
  fails only at the BlueSCSI's 26 MHz SDIO. Reseating/power-cycling revived
  it on 2026-07-01. (The staged firmware self-flash never triggered — fw is
  still 2026.02.08; if updating, use USB/BOOTSEL with the .uf2 from the
  archive.) **Replace the card with a fresh name-brand microSD** — restore
  takes minutes from `~/mac-plus-apps/sdcard-archive/` (see RESTORE.md there).

**The Bridge is on the card (2 MB build).** Frame parser 20/20 host tests
(incl. fuzz), delivery pipeline E2E-verified byte-exact from agent-bridge over
the wire, and a real hardware delivery confirmed (BridgeTest, 2026-07-02).
Foundry uses the same delivery path and inherits this verification.

**RULE: never update The Bridge over itself (OTA). Bridge updates go via SD
card only.** A running Bridge delivering a newer copy of itself over the slow
link crashed the Plus (2026-07-02). OTA (drop a `.bin` in the mini's
`~/bridge-outbox/` while The Bridge is open, watch `~/macplus-logs/all.log`) is
fine for every OTHER app; for the Bridge itself, rebuild and ship on the SD
card. (Chose not to build a self-update guard — the operational rule is enough.)

### How to ship an app update via the SD card
Build the app, then inject onto the inserted card with hfsutils (see "Injecting
onto the Plus" below): `cp` card→work copy, `hmount`, `hcopy -m <App>.bin
":<Name>"`, `humount`, `cp` back, `sync`, `diskutil eject`. The card volume is
**"BlueSCSI Mac Plus"**, apps live in the **`Apps`** folder. Then refresh the
archive copy (RESTORE.md "Keeping the archive current").

---

## WHERE WE LEFT OFF (2026-06-11) — older history

**The Plus is online and the whole app suite ships over WiFi.** The serial-cable
blocker is long resolved (the proper mini-DIN-8 → DB-9 Mac modem cable arrived);
the Plus talks to the mini over the RetroWiFi SI modem. Earlier cable/diagnostic
history is preserved further down ("Connecting the Plus to WiFi", "RetroWiFi SI").

- **WiFi system service — built + working.** Apps no longer dial the modem. A
  boot INIT (`wifi/wifiinit.c`) brings up ONE shared link to the mini multiplexer
  at startup; every app calls `WIFIConnect()` / `WIFIOpen("<service>")` (client
  lib = `wifi/wifi.c` + `wifi.h`) and just attaches — dial once, every app after
  reuses it. This replaced the planned resident `.WIFI` DRVR (which fought
  Retro68's flat-code format); the **system-heap manager + INIT** is the shipped
  design. The link persists across app-quit because the serial driver stays open
  and the modem stays online; `WIFIConnect` pings the mux and reuses a live link.
- **The Bridge = over-the-air delivery (how new builds reach the Plus now).**
  Keep `bridge/` running on the Plus, drop a built `.bin` into the mini's
  `~/bridge-outbox/`, and it streams over WiFi and writes it to the boot disk —
  no SD-card shuttling. **Atomic overwrite (2026-07-03):** the app is written to
  a temp file `Bridge Incoming`, and only once its checksum verifies is the
  existing same-named app deleted and the temp renamed into place — so a delivery
  updates in place (no `IMessage3`-style versioned duplicates) and a dropped
  transfer can never clobber the installed copy. If the target can't be deleted
  because it's the running app (delivering the Bridge to itself), the swap fails
  cleanly and the temp is kept — the running app is untouched. Reuses Foundry's
  MacBinary-to-disk writer (incl. the odd-address bomb fix).
- **iMessage is live.** Reads the mini's `chat.db` (contact names resolved via
  `agent-imessage/contacts.ts`), conversation list + thread both scroll, threads
  are chronological (newest at bottom), and **Reply actually sends — to both
  iMessage (blue) AND SMS (green)** via `osascript` → Messages.app on the mini.
  Caveat: it reads the *mini's* iMessage account, which can differ from your iMac.
- **Verified apps:** Foundry, Surf, Quote of the Day, The Bridge, iMessage —
  driven in Mini vMac against the live mini backend and/or on the real Plus. See
  the app catalog at the top.
- **Talking Plus: retired.** MacinTalk bangs the sound hardware directly and
  freezes the Plus mouse until reboot (Apple PT-22, no fix). Source stays as
  history; it's off the app lists and the SD card.

**Mini backend — SOLVED (2026-06-11): see [`BACKEND.md`](BACKEND.md), the canonical ops doc.**
The model in brief — every mini-side agent (`agent-*` in this folder) runs on the mini as:

```
launchd (~/Library/LaunchAgents/sh.macplus.<name>.plist — starts at boot, restarts on crash)
  └─> backend/run-service.sh <name>     (the one runner, in git; loads ~/.macplus-backend.env)
        └─> the agent from the deploy clone ~/hilma-deploy/apps/macplus/agent-<name>/
            (socat wrapper for the dial-in agents code/paint/surf; plain `tsx … --listen <port>`
             for the TCP servers mux/imessage/diag/quote/bridge/screen)
```

Nothing is started by hand — launchd is both launcher and keeper-alive (they're user
LaunchAgents, gui/501, NOT root daemons, because iMessage needs admin's GUI session for
Automation + FDA; auto-login is on so they still start at boot). The deploy clone only
ever `git pull`s; GitHub is the only sync path (the old rsync/hand-started copies
`~/claude-plus`, `~/surf-agent`, `~/agent-*` are retired). **To ship a backend change:
push to `main`, then run `bash ~/hilma-deploy/apps/macplus/backend/update.sh` on the
mini** — it pulls, npm-installs, re-syncs secrets, and kickstarts the long-runners (the
socat agents pick up new code on the next dial-in). Run iMessage WITHOUT `IMSG_DRY_RUN`
for live sends.

**Deploying from a remote machine (after your commit + push), one line:**
```bash
ssh admin@192.168.7.50 'bash ~/hilma-deploy/apps/macplus/backend/update.sh'
```
That single script does the pull, deps, secret sync, and daemon restarts, then prints a
fleet status table. No ssh handy? `nc 192.168.7.50 2323` drops you in a shell on the mini —
run the same command — or just ask the Claude Code session running on the mini.

---

## The hardware/storage setup

- **Machine:** Macintosh Plus (Motorola 68000, 1–4 MB RAM, 512×342 1-bit B&W screen, no Control key, no fan).
- **Storage:** BlueSCSI reads disk images (`.hda`) off a **FAT32 microSD card**. The Plus mounts those images as SCSI disks.
- **Boot image on the card:** `HD20_512-1GB-MacPlus-6+7.hda` — a 1 GB image with an **Apple Partition Map**,
  one HFS volume named **"BlueSCSI Mac Plus"**, holding System 6.0.8 + System 7.0.1 boot folders and an
  **`Apps`** folder. This is where built apps land.
- **Rule:** never reformat the card or alter its other files (`bluescsi.ini`, `NE4.hda`,
  `HD30_512 DaynaInstall.hda`). We only overwrite the one boot `.hda` file. (The card is
  exFAT; a full archive + restore guide lives at `~/mac-plus-apps/sdcard-archive/RESTORE.md`.)

---

## Current state of the Macintosh Plus

- **Boots fine** off the BlueSCSI card into System 6.0.8 (volume "BlueSCSI Mac Plus"); a System 7.0.1
  folder is also present, plus Apple HD SC Setup, Silver Lining, System Picker.
- **`Apps/` folder on the card holds five working apps**, all with resource forks verified intact:
  **MacPaint 2.0** (`APPL/MPNT`), **MacWrite 4.5** (`APPL/MACA`), **ZTerm 1.0.1** (`APPL/zTRM`),
  **Sudoku** (`APPL/????`, built here), and **SerialDoc** (`APPL/????`, built here — the serial-cable
  diagnostic, see `serialdoc/`). MacPaint/MacWrite/ZTerm were sourced from Macintosh Garden;
  Sudoku and SerialDoc were built from scratch (see the worked example below).
- **Simulator we use: Mini vMac** (the Mac Plus emulator) on the iMac — boots a *pre-made* System 6.0.5
  floppy image (`Disk605.dsk`) with the real Plus ROM (`boot0.rom`/`vMac.ROM`). We do **not** compile an
  OS. Mini vMac boots **raw HFS** images only, not the APM `.hda`/`.vhd` SCSI images (those work on the
  real Plus). It's the only emulator in the loop; everything visual is verified there before the card.
- **Networking / WiFi: working.** The Plus reaches the mini over the RetroWiFi SI modem; apps use the
  WiFi system service (`wifi/`) — boot INIT brings the link up, apps attach via `WIFIConnect`. The whole
  app suite (Foundry/Surf/Quote/Bridge/iMessage) runs over it. See "WHERE WE LEFT OFF" at the top.

---

## Hardware inventory — extra parts Bart has

| Item | What it is | Interface | Use |
|------|-----------|-----------|-----|
| **Simulant RetroWiFi SI** | WiFi-to-serial modem (Hayes/Zimodem-compatible) — bridges a serial port to modern WiFi | **DE-9 (DB-9) female RS-232** (Hayes modem = DCE); **5V micro-USB** power (USB-only — the serial port can't run it); 300–115200 baud; AT command set; RTS/CTS + XON/XOFF | **This is how the Plus gets online over WiFi.** Simulant also sells a DB-9→DB-25 adapter. See the docs block below. |
| **Practical Peripherals PM2400SA** | 2400-baud external dial-up modem | **DB-25 RS-232**; analog phone line (RJ-11) | Legacy *real* dial-up only — **not used for WiFi**. |
| Cable: **Apple Mac modem cable** | Mac serial → external RS-232 modem | mini-DIN-8 ↔ **DB-25** | Connects the Plus serial port to a DB-25 modem (e.g. the PM2400SA). Modem end = DB-25. |
| Cable: **Mac serial cable** | Mac-to-Mac / printer / LocalTalk-style | mini-DIN-8 ↔ **mini-DIN-8** (both ends round) | Not directly usable with the DB-9 RetroWiFi SI. |
| Coiled cords | Mac Plus **keyboard** coiled cable and/or an **RJ-11** phone cord | RJ-style 4P4C / RJ-11 | Keyboard; phone cord is for the PM2400SA, not WiFi. |

Plus the BlueSCSI + SD card and the Macintosh Plus itself (see top).

### RetroWiFi SI — documentation & specs (reference)

**Official docs** (both thin on pinout/LED detail — the User Instructions PDF on the shop page and the
Amstrad BBS at `amstrad.simulant.uk` are the deeper sources):
- Shop / spec page: https://www.simulant.uk/shop/retro-vintage-computer-wifi-modem-rs232-serial-hayes-compatible
- Simulant wiki: https://wiki.simulant.uk/index.php?title=Retro_Wifi_SI_(rs232_serial_port_Hayes_compatible_modem)
- Tindie listing: https://www.tindie.com/products/simulant/retro-wifi-si-rs232-serial-port-internet-modem/
- Related/sibling firmware with documented LED scheme (ESP8266 RS-232 modem): https://github.com/mecparts/RetroWiFiModem

**Confirmed specs:** ESP8266 + MAX3232; **5V micro-USB power only** (no USB cable included; the RS-232
port does NOT power it); standard **DE-9 RS-232**, female, wired as a **DCE/Hayes modem** (so the Plus is
the DTE → wants a **straight-through** data path, 2→2 / 3→3); supports 300–115200 baud; Hayes AT command
set; HW (RTS/CTS) + SW (XON/XOFF) flow control; DCD + RI supported. Firmware is Zimodem (auto-bauds on `AT`).

**Cable bring-up findings (2026-06-06) — ROOT CAUSE: wrong cable type.** The cable being tried is a
generic **PLC programming cable** — "DB9 RS232 to Mini 8-Pin Round Head, DB9 9-pin **female** → mini-DIN-8
**male**, PLC programming adapter" (marketed for touchscreens / PLCs / industrial controllers). **That is
not a Macintosh serial cable.** PLC programming cables wire TxD/RxD/GND onto whatever DIN-8 pins that
particular PLC family uses — which do **not** match the Mac Plus modem-port pinout (TxD− pin 3, GND pin 4,
RxD− pin 5). So the data/ground never land where the Plus drives/expects them.

This is confirmed by the **orange-light tell**: with the **old** DIN-8→DB-9 cable (the dead one, DB-9 pins
2 & 3 physically snapped off) an **orange LED inside the SI lights up** when connected to the Plus; with the
**PLC cable** it does **not** light, on **either** gender-changer (straight or null-modem). The old cable
still wires **GND + all the control lines** (DTR/RTS/DSR/CTS/DCD) on the correct Mac pins — only the data
pins are gone — enough to satisfy the SI's line-sense and light the LED. The PLC cable failing to light it
means GND/control aren't reaching the SI, and **no ground ⇒ no RS-232 ⇒ the zero-bytes-at-every-baud**
result SerialDoc's Baud Sweep reports. The adapters can't fix it (straight/null only swaps pins 2 & 3, never
addresses a wrong-pinout ground).

**The fix is a correct cable, not more adapter-swapping.** Use the **C2G 25041 / 70810** — a genuine
"DB9-Female → 8-Pin Mini-DIN-Male **Apple Mac** adapter cable" (DIN-8 wired to Apple's pinout: TxD− 3,
RxD− 5, GND 4, HSKo 1, HSKi 2). Confirmed to be the right *type* (the on-order cable from the resume note);
its internal straight-vs-crossed DB-9 wiring is undocumented, but the two gender changers cover both cases.
Hook-up: mini-DIN-8 → Plus modem port; DB-9-female end → male-male gender changer → SI. **First checkpoint
is the orange LED** — it should light once this cable seats (GND/control finally on the right pins), before
any data works; then it's just the straight↔null sweep. (Avoid PLC programming cables and any non-Apple
DIN-8 cable — wrong pinout, as proven above.) Also worth doing when
resuming: (1) confirm the SI has real **USB power** (if it only ever lit via the old cable, that was
parasitic leakage off the RS-232 lines, not real power — plug in 5V micro-USB and confirm it lights on its
own); (2) optionally **meter the PLC cable** DIN-8↔DB-9 to see its actual map (expect GND NOT on DIN-8 pin 4
↔ DB-9 pin 5) — but don't sink time into salvaging a PLC cable; replace it. **Diagnose with SerialDoc**
(`serialdoc/`), not ZTerm — see the bring-up note below.

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

**Use SerialDoc for the AT test, not (just) ZTerm.** `serialdoc/` is a purpose-built diagnostic that
shows what ZTerm hides: it reports exact byte counts ("sent 3, received 0"), a **Hex View** that turns
"garbage" into reportable byte values (e.g. `4F 4B 0D | OK.`), and a **Baud Sweep** that fires `AT` at
300→19200 in one run so you find cable-good + correct-baud at once. It opens the port with hardware flow
control **forced off**, so a cable missing the CTS line can't silently hang transmit. Flow: Port ▸ Open
Port → Tests ▸ Baud Sweep → Tests ▸ AT Probe (expect PASS/OK). Zero bytes at every rate ⇒ swap the adapter.

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

### Macinclaude (the Plus-side client) — `macinclaude/`

The bring-up steps above (open port, `AT`, `ATDT`-dial) are the manual ZTerm ritual. **Macinclaude**
(`macinclaude/`) is a purpose-built Plus app that bakes the whole ritual in, so launching it ≈ typing
`claude` on the Plus. It is the client half of the same-named product whose server half is the agent in
`agent/` (no namespace clash — different machine/language/folder; the only shared token is the name).

- **First launch (no prefs):** a Settings dialog (DLOG/DITL in `macinclaude.r`) — WiFi SSID + password,
  Mac mini host + TCP port, baud. Saving joins WiFi and persists it **in the modem** (`ATW"ssid,pass"`
  then `AT&W`), and writes host/port/baud to a `Macinclaude Prefs` data file in the **System Folder**
  (located via `SysEnvirons().sysVRefNum`).
- **Every launch after:** auto-connect — open the modem port (flow control forced off, à la SerialDoc),
  `AT`/`OK` to confirm the modem, `ATDT"host:port"`, watch for `CONNECT`, then drop into a live terminal
  talking to the agent. Defaults: host `192.168.7.50`, **port 2324** (the agent), baud 9600.
- **Connection menu:** Connect/Reconnect, Disconnect (`+++`/`ATH`), Settings… Any failed step prints a
  plain status line naming what broke (no `OK`, no `CONNECT`) — no silent fallback.
- **Status (2026-06-07):** built & compiles clean with Retro68 (`CODE×9, DLOG, DITL, SIZE`); `.dsk`
  staged in `~/mac-plus-apps/vmac/`. **Not yet driven in Mini vMac** (the emulator's screen didn't render
  into the screenshot tool that session) and the live connect needs the real Plus (no serial in the
  emulator). The mini agent on 2324 runs as LaunchAgent **`sh.macplus.code`** from the deploy
  clone — see [`BACKEND.md`](BACKEND.md). (The old `sh.claude-plus.terminal` root daemon +
  `~/claude-plus` rsync copy were retired 2026-06-11.)

### Atkinson (the Plus draws, in 1-bit) — `atkinson/` + `agent-atkinson/`

Same two-halves shape as Macinclaude, but instead of a terminal it produces pictures: you type an image
idea on the Plus, the mini generates the image and Atkinson-dithers it to 1-bit, and the Plus paints the
bitmap row-by-row so it "develops" like a Polaroid over the slow link.

- **Plus side (`atkinson/atkinson.c` + `atkinson.r`):** reuses Macinclaude's Settings dialog + prefs +
  serial transport + modem connect (defaults: host `192.168.7.50`, **port 2325**, baud 9600 — 2323 is the
  login shell, 2324 the Macinclaude text agent, 2325 this image agent). Adds **Image ▸ New Image…** → a
  prompt dialog → sends the text → parses the streamed frame and blits each scanline as it arrives. The
  canvas is the whole window; transient status (`connecting…`, `receiving 42%`, `done`) lives in the title
  bar. New Image is disabled until connected. **Image ▸ Draw Test Image** reveals the embedded
  `test_image.h` offline (no link needed) — handy for verifying the renderer in Mini vMac. A standard
  **Edit** menu + a shared modal-dialog filter give Cmd-X/C/V in the Settings and New Image fields (so a
  long prompt can be pasted instead of typed on the Plus keyboard) plus desk-accessory support, ported
  from Macinclaude.
- **Mini side (`agent-atkinson/`):** reads a prompt line → generates an image (OpenAI `gpt-image-1`, or
  Together FLUX via `ATK_IMAGE_PROVIDER`) → Atkinson-dithers + packs to 1bpp by shelling out to the proven
  `atkinson/dither.py` (the single source of truth for the packed-byte layout) → streams the frame. Runs
  under socat like the text agent. See `agent-atkinson/README.md`.
- **Wire format** (must match both halves): `ATKIMG <w> <h> <rb>\r\n`, then `h` lines of `rb*2` hex chars
  (one image row each), then `ATKEND\r\n` (or `ATKERR <msg>\r\n`). Hex, not raw binary, so the bytes
  survive the modem's telnet layer (a raw `0xFF` reads as a telnet IAC) and the 68000 parser stays trivial.
  480×300 → 60 bytes/row → 18000 bytes → 36000 hex chars ≈ 37 s to develop at 9600 baud.
- **Tested without the wire:** the receive parser lives in `atkinson/atkinson_rx.inc` (shared verbatim
  between the app and `atkinson/rxtest.c`); `rxtest.c` feeds it a *real* agent frame and asserts it
  reconstructs the exact 18000 bytes, in order. The agent half is covered by `agent-atkinson` `npm run
  selftest` (prompt → frame → validate → preview PNG). All four UI surfaces (Settings dialog, canvas +
  test-image render, menu enable/disable, New Image dialog) were driven in Mini vMac — the New Image dialog
  via a `#ifdef ATK_TEST_UI` build that forces the connected state (shipping build is clean). Build:
  `cd atkinson && ./build.sh`.
- **Status (2026-06-08):** built, compiles clean (`CODE×9, DLOG×2, DITL×2, SIZE`), UI verified in Mini
  vMac, full data path verified except the physical serial wire (still blocked on the Plus↔modem cable).
  The mini listener on 2325 runs as LaunchAgent **`sh.macplus.paint`** from the deploy clone
  (`ATK_PYTHON=/usr/bin/python3` set by the runner; `OPENAI_API_KEY` from `~/.macplus-backend.env`) —
  see [`BACKEND.md`](BACKEND.md). (The old `sh.macplus.atkinson` root daemon was retired 2026-06-11.)
  Logs: `~/Library/Logs/macplus-paint.{out,err}.log`. Verified end-to-end over the socket (banner + /quit).

### The Macinclaude app family — port map

All four "Plus front-end + mini brain" apps share the same transport (settings/prefs/serial/dial,
ported app to app) and the same two-halves shape. Each dials its own TCP port so they can run side
by side:

| port | app | what it does |
|------|-----|--------------|
| 2323 | login shell | raw zsh on the mini (socat → `login -f admin`) |
| 2324 | Macinclaude Code | Claude Code agent, VT100 terminal |
| 2325 | Macinclaude Paint (`atkinson/`) | prompt → image → 1-bit dither → progressive blit |
| 2326 | Macinclaude Surf (`surf/`) | reader-mode web browser |
| 2327 | Macinclaude Foundry (`foundry/`) | describe an app → Claude writes + Retro68 compiles it → delivered as a real APPL onto the disk |
| 2328 | Macinclaude iMessage (`imessage/`) | read + reply to iMessages from the Plus; mini reads chat.db and sends via AppleScript |

(Infrastructure ports, not user apps: rsh `:2329` (Plutonix instant shell), mux `:2330`,
diag `:2331`, quote `:2332`, bridge `:2333`, screen `:2334`, netspeed `:2335`,
porthole `:2336`, pixel `:2337` (Daily Pixel canvas), pssh `:2222`.
**How all mini-side services are deployed, updated, and restarted: [`BACKEND.md`](BACKEND.md).**)

The mini-side agents are `agent-foundry/` and `agent-moose/` (each a standalone
`node:net` TCP server — **no socat/pty**, which sidesteps the echo/ONLCR traps the Surf agent hit).
All four serial lessons from Surf (separate SerSetBuf ring vs FSRead scratch; paced output to wire
speed; CONNECT-tail handoff into the parser; raw transport) are baked into every new app.

**Status (2026-06-11):** Foundry is **built, verified in Mini vMac, and shipped to the real Plus** —
it compiled and delivered a working analog clock end to end (and the on-the-fly MacBinary writer's
odd-address bomb is fixed). Quote of the Day, The Bridge, and iMessage joined the family on the WiFi
service; all run over the shared link. **The Talking Plus is retired** (MacinTalk freezes the Plus
mouse — see its section below). Mini agents run as launchd-managed LaunchAgents from the deploy
clone — see [`BACKEND.md`](BACKEND.md) (the hand-started era ended 2026-06-11).

#### Macinclaude Foundry (`foundry/` + `agent-foundry/`) — the self-extending Plus

Type a wish ("a stopwatch with lap times") → the agent has Claude write a complete Toolbox C app
(system prompt carries the house skeleton `agent-foundry/testapp/hello.c` + every Retro68/System-6
constraint), cross-compiles it with Retro68 **with up to 4 fix-it retries** (compiler errors fed
back to Claude), and streams the resulting MacBinary back as a hex `FNDBIN` frame. The Plus decodes
it on the fly and writes **both forks to the boot disk**, so a new double-clickable APPL appears in
the Finder ~2–4 min after the sentence, no SD-card shuttle. `foundry.c` is a build-log console +
streaming MacBinary→disk writer (`MBConsume` routes header → data fork → padding → rsrc fork; 16-bit
additive checksum verified before keeping the file). **Runs on the machine with the Retro68
toolchain** (the iMac today, `192.168.7.189:2327`; moves to the mini once the toolchain lands there).
Verified: agent selftest compiled a real "DiceRoller" (Claude, clean on attempt 2); `rxtest` 13/13
against that real .bin.

#### The Talking Plus (`talkingplus/` + `agent-moose/`) — RETIRED (MacinTalk homage to the Talking Moose)

> **RETIRED (2026-06-11).** MacinTalk bangs the Plus's sound hardware directly and leaves the VIA in a
> state that freezes a mouse axis until reboot — Apple's own PT-22 technote says there's no fix. So a
> speaking Plus and a usable mouse can't coexist on this hardware. Removed from the app lists and the SD
> card; the source stays as history (and for the hard-won MacinTalk/SCC notes below). Voice was made
> opt-in (Talk ▸ Use MacinTalk Voice) before retiring; default was mime, which is mouse-safe.

A wry 1-bit character who **speaks aloud through the Plus's own speaker** using the 1986 **MacinTalk**
TTS driver, with Claude writing his lines (deadpan, "awake since 1986") from real data. Three
commands: **Wake** (greeting, uses an optional `~/.talking-plus/briefing.json` calendar/inbox feed),
**News** (live Hacker News gossip — public, no creds, the guaranteed demo), **Tell Him Something**
(`SAY <topic>`). Claude writes the line AND transcribes it to MacinTalk phonemes word-by-word
(`agent-moose/persona.ts` carries the phoneme alphabet); the app speaks each word and flaps the
mouth + highlights the word in a speech bubble in time. Moods drive the face (eyebrows/eyes/mouth).

**MacinTalk mechanism (reverse-engineered from the 1.31 driver's glue):** speak = build an `IOParam`
with the phoneme C-string as `ioBuffer`/`ioReqCount` and the `.SPEECH` driver refNum, then
**`PBWriteSync`** (synchronous — blocks while the word plays, which is exactly why per-word chunking
gives free mouth-flap + karaoke timing). Rate/pitch would be `_Control` calls. The driver is a
`DRVR` resource named `.SPEECH` inside Apple's **MacinTalk file** — **not redistributed** (copyright,
same rule as the ROM); the app `OpenResFile("MacinTalk")` + `OpenDriver(".SPEECH")` off the boot
disk, so Bart drops the freely-available MacinTalk file on the BlueSCSI card next to the app. If the
file's absent (e.g. the emulator), he **mimes** — silent mouth-flap + word highlight, so the visual
still demos. Claude does English→phonemes (better than the 1985 Reader rules and needs no extra
driver resources). Verified: agent selftest, live — e.g. *"Oh good, Bart, you are vertical again. I
have been awake since 1986, but sure, take your time."* + valid phonemes; `rxtest` 15/15.
MacinTalk research + the driver-glue disassembly notes: the driver was pulled to `/tmp` for analysis
only, not committed.

#### Macinclaude iMessage (`imessage/` + `agent-imessage/`) — texting from a 1986 Mac

Read and reply to iMessages on the Plus — **live, sending real texts to both
iMessage (blue) and SMS (green)**. It runs on the WiFi system service like
Quote/Bridge: `WIFIConnect()` then `WIFIOpen("imessage")`, no dialing in the app
(`wifi.c` owns the serial + MUX). There is no Settings dialog — the service +
INIT own the link.

- **Plus side (`imessage.c` + `imessage.r`):** a two-pane UI — conversation list
  on the left with **its own scrollbar** (`gListScroll`/`gListTop`), the selected
  thread on the right (word-wrapped, outgoing right-aligned / incoming left, its
  own scrollbar), and a modal **Reply…** (Cmd-R) compose box. Window is **500×290
  at top=40** so it fits the real Plus screen (CRT overscan). The payload parser
  is `im_rx.inc`, shared verbatim with `rxtest.c` (which includes an overflow
  fuzz pass — more rows/messages/longer lines than the client allots are dropped
  gracefully, never overflow).
- **Mini side (`agent-imessage/`, port 2328):** a `node:net` server (no socat).
  Reads `~/Library/Messages/chat.db` via `sqlite3 -readonly` (typedstream decoder
  for the rows whose `text` is NULL and body lives in `attributedBody`); resolves
  handles → contact names via `contacts.ts` (a `~/.imessage-contacts` DB,
  `IMSG_CONTACTS_DB` to override). Conversations are `ORDER BY last_date DESC`
  (most-recent first); a thread is fetched newest-`limit` then **reversed to
  chronological** so the Plus renders newest at the bottom. **Sends via
  AppleScript** (`osascript` → Messages.app, `send … to chat id <guid>`) — routes
  by the chat's own service, so blue chats send iMessage and green chats send SMS
  (needs Text Message Forwarding on the mini, which is set up). Needs **Full Disk
  Access** + **Automation** permission (admin's GUI session). `IMSG_DRY_RUN=1`
  logs sends instead of texting — **must be OFF for live use**.
- **Protocol:** `LIST` / `OPEN <idx>` / `SEND <idx> <text>` up; `IMLIST`/`C`,
  `IMCONV`/`M`/`+`, `IMSTS`/`IMERR`/`IMSENT` down (ASCII, line-capped, paced).
  `agent-mux` SERVICES maps `imessage -> 127.0.0.1:2328`.
- **Status (2026-06-11): live + verified.** Drives in Mini vMac against the live
  mini backend — lists real conversations, opens real threads (chronological),
  both panes scroll, and **Reply delivers to blue and green** (confirmed an SMS
  send recorded `is_from_me=1, is_sent=1, service=SMS` in chat.db). Shipped to the
  real Plus via the Bridge. Caveat: reads the *mini's* iMessage account, which can
  differ from the iMac's Messages.

### Macinclaude Surf (a web browser for the Plus) — `surf/` + `agent-surf/`

Same two-halves shape as Macinclaude/Atkinson: a **reader-mode web browser**. The Plus sends one
command line (`GO <url-or-search-words>` / `LINK <n>` / `BACK` / `SUM` / `ASK <q>`); the mini fetches
the page, strips it locally, and Claude (`claude-opus-4-8`, override `SURF_MODEL`) re-emits it as a
compact line-tagged markup ("SRF": `T/H/P/Q/-/L/B` blocks + `+` continuations, ≤220 chars/line,
ASCII only). The Plus renders it progressively — word-wrapped styled Geneva text, clickable
underlined links, a real Control-Manager scrollbar. A cleaned article is 5–8 KB → loads in 6–8 s at
9600 baud. Plain words in the Open Location dialog become a Claude `web_search`; `SUM`/`ASK` answer
from the already-fetched page text without a re-fetch. `BACK` replays from the agent's frame cache.

- **Plus side (`surf/surf.c` + `surf.r`):** settings/prefs/serial/dial ported from Atkinson
  (defaults host `192.168.7.50`, **port 2326**, 9600). Layout engine: blocks → word-wrap via
  TextWidth binary search → line records → scrolling document. Frame parser in `surf_rx.inc`,
  shared verbatim with the host test `rxtest.c` (21 asserts: continuation joining, link numbers,
  error/abort recovery, noise rejection, overflow caps). Build `surf/build.sh` (normal) or
  `build.sh test` (SURF_TEST: offline Mini vMac build, commands load the embedded `test_page.h`).
- **Mini side (`agent-surf/`):** `extract.ts` (fetch + HTML strip + absolute link list, no parser
  dep) → `claude.ts` (readerify / web_search / summarize-ask) → `page.ts` (sanitize to a legal
  frame: ASCII fold, line splitting, link numbering, caps) → `session.ts` (history + frame cache)
  → `main.ts` (stdin loop + **paced output**, see below). `npm run selftest` validates offline
  (extract/frame rules) and live (real URL + search) without the Plus.
- **Deploy:** runs as LaunchAgent `sh.macplus.surf` (port 2326, `raw,echo=0`) from the deploy
  clone — see [`BACKEND.md`](BACKEND.md). (The hand-started socat from 2026-06-09 is retired.)
- **Status (2026-06-09): fully verified end-to-end in Mini vMac over the serial bridge** — dialed
  through vmodem to the live mini agent; loaded the welcome page, live Hacker News, the Anthropic
  Fable 5 announcement (published that day), and the Wikipedia Mac Plus article; exercised links,
  scrollbar/keys, Summarize, Back, and word-search via Open Location. Not yet run on the real Plus.

**Hard-won serial lessons (apply to ALL Plus apps):**
1. **Never pass the same buffer to `SerSetBuf` and `FSRead`.** The driver owns the SerSetBuf ring;
   reading into it corrupts the stream (glued/repeated text mid-page). Use two buffers
   (`gSerRing` for the driver, a separate scratch for FSRead). **Atkinson/Macinclaude/SerialDoc
   still have this latent bug** — they share one `gSerBuf`. It only bites under sustained receive,
   which Atkinson's serial path hasn't exercised yet. Fix when next touched.
2. **socat pty must be `raw,echo=0`** for line-protocol agents. A cooked pty echoes the Plus's
   commands back and the echo re-triggered commands (duplicated frames), and ONLCR turns `\r\n`
   into `\r\r\n`. (The 2324/2325 daemons run cooked + `stderr`; they're interactive/tolerant, but
   don't copy that pattern for new protocol agents.)
3. **Pace agent output to wire speed** (surf paces to `SURF_BAUD`/10 bytes/s, default 960). A full
   TCP burst overruns the small buffers downstream (the emulator's SCC bridge, and plausibly the
   RetroWiFi SI's ESP8266) and drops bytes mid-frame. The wire is the bottleneck anyway.
4. **Don't blind-capture after `ATDT`.** If the agent pushes data on connect, a fixed
   `CaptureFor(600)` swallows it. Scan for `CONNECT` incrementally and hand the tail of the
   capture to the protocol parser (see `DialAgent` in surf.c).

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
   - **This step is for a session running on the iMac** (which has the computer-use MCP). **The
     Macinclaude Code agent on the mini CANNOT do it** — it has no computer-use MCP (only a Playwright
     browser MCP), and the mini is headless, so `screencapture` fails with "could not create image from
     display." So the agent must NOT try to open Mini vMac or a computer-use/Playwright MCP for a Plus
     app. Instead it verifies with steps 1 (build) + 2 (host-logic test), and for anything VISUAL it
     builds the app and delivers it to the REAL Plus over the Bridge (drop the `.bin` in
     `~/bridge-outbox/`, tell Bart to open The Bridge to receive) so Bart can look at real hardware.

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
  serialdoc/
    serialdoc.c             ← serial-port diagnostic (Serial Manager + TextEdit console, ~500 lines C)
    CMakeLists.txt          ← add_application(SerialDoc serialdoc.c)
    build.sh                ← one-command Retro68 build
  macinclaude/
    macinclaude.c           ← the Plus-side "Claude Code launcher": Settings dialog + prefs
                              persistence + auto-connect state machine + live terminal (~700 lines C)
    macinclaude.r           ← Settings dialog (DLOG/DITL 128) + SIZE resource (Rez)
    CMakeLists.txt          ← add_application(Macinclaude macinclaude.c macinclaude.r)
    build.sh                ← one-command Retro68 build
  atkinson/
    atkinson.c              ← the Plus-side image client: Settings + serial (from Macinclaude) +
                              New Image prompt dialog + frame receive/progressive blit (~700 lines C)
    atkinson_rx.inc         ← the frame parser, shared verbatim with rxtest.c
    atkinson.r              ← Settings (DLOG/DITL 128) + New Image (DLOG/DITL 129) + SIZE (Rez)
    rxtest.c                ← host-clang test: decode a real agent frame, assert exact bytes
    dither.py               ← Atkinson dither + 1bpp pack (defines the wire byte layout)
    test_image.h            ← embedded 480x300 1bpp image (offline renderer self-test)
    CMakeLists.txt          ← add_application(Atkinson atkinson.c atkinson.r)
    build.sh                ← one-command Retro68 build
  agent-atkinson/           ← mini side: prompt → image gen → dither → stream frame (Node/TS)
    src/{main,draw,frame,selftest}.ts
    README.md               ← protocol + how to run (socat on :2325)
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
