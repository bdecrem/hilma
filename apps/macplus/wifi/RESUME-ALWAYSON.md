# Always-on WiFi + diagnostics — resume notes (parked 2026-06-09)

The goal: the Plus dials once and stays connected; every app shares one link so
nothing re-dials, and the link enables push (Talking Plus pipes up on its own).
Architecture decided + partly built. **Confidence the full vision lands clean
without real-Plus iteration: ~55-60%; eventually with hardware: ~90%.** The hard,
unverifiable-in-emulator part is the resident driver's residency + timing.

## Architecture (agreed)
- **Modem already gives "always associated"** — `AT&W` makes the RetroWiFi
  rejoin WiFi on power. Free.
- **`.WIFI` driver** (68k DRVR, lives in the **system heap** so it survives app
  quit). Owns the serial port, holds one connection to the mini multiplexer,
  drains it on periodic time (`accRun` during SystemTask, + maybe a VBL
  backstop), hands out **channels**. Apps stop dialing — they open a channel and
  read/write via the driver.
- **INIT** installs the driver at boot (production). For testing, first app
  installs it into the system heap (no reboot) — same engine.
- **Mini multiplexer** (`agent-mux/`, DONE): one endpoint; frames tagged by
  channel; fans out to backend agents (Code 2324 / Paint 2325 / Surf 2326 /
  Foundry 2327 / Talking 2329, or host:port). Driver stays dumb; mux routes.
- **WiFi Status DA** — Apple-menu face (connected / channel / signal).
- **Client lib** — the `.WIFI` calls apps make instead of AT/ATDT.

## Build status
| piece | state |
|---|---|
| `agent-mux/` mini multiplexer | **DONE, committed.** selftest 9/9 (framing + live 2-channel relay). `npm start` → :2330 |
| `wifi/mux_rx.inc` | **DONE** — 68k MUX parser, shared with driver + host test (host test not yet written) |
| diagnostic stack (`diag/`, `agent-diag/`) | **DONE, committed** — see task #15. Emulator drive-through pending (screen lock) |
| `.WIFI` driver (`wifi/wifidrvr.c`) | **NOT STARTED.** Build via Retro68 `--mac-flat` code-resource + Rez (templates: `~/mac-plus-apps/Retro68/Samples/SystemExtension` = INIT, `Samples/WDEF` = code resource w/ custom entry point) |
| INIT, DA, client lib, app conversion | **NOT STARTED** (task #14) |

## MUX wire format (driver <-> mini, see agent-mux/src/protocol.ts + wifi/mux_rx.inc)
```
MUXOPEN <chan> <service>\r\n      open a channel to a named service
MUXCLOSE <chan>\r\n
MUX <chan> <nbytes>\r\n<bytes>    data chunk (raw payload, no trailing CRLF)
MUXPING\r\n / MUXPONG\r\n         keepalive
MUXERR <chan> <msg>\r\n
```

## Next steps on resume
1. **Unblock:** ask Bart to disable macOS screen lock/screensaver — it has
   interrupted every recent emulator drive-through (screenshots fail when locked).
2. Finish the diag loop in Mini vMac (task #15) — verify Plus->wire->mini live.
3. Write `wifi/wifidrvr.c` — the DRVR. Open (serial+dial mux+install), accRun
   periodic drain → `MuxRxFeed` → per-channel ring buffers, Control csCodes
   (open channel / send / close), Status read. Globals in system heap. Instrument
   with diag.inc from line one. Host-test the parser path (`wifi/rxtest.c`).
4. INIT to install it; WiFi Status DA; `wifi/wifi_client.c`; convert Talking
   Plus to use the driver instead of dialing; end-to-end in Mini vMac.
5. The driver's residency/timing realistically needs **real-Plus** debugging —
   that's why the diagnostic stack exists (logs stream to the mini, no SD trips).

## Resume commands
- mux:  `cd apps/macplus/agent-mux && npx tsx src/main.ts --listen 2330`
- diag sink: `cd apps/macplus/agent-diag && npx tsx src/main.ts --listen 2331`
- bridge (redirect for iMac-side agents): `MNVM_REDIRECT=127.0.0.1:<port> python3 apps/macplus/minivmac/vmodem.py 5454`
- emulator: `cd ~/mac-plus-apps/mctest && MNVM_SERIAL=127.0.0.1:5454 ./minivmac.app/Contents/MacOS/minivmac Disk605.dsk <App>.dsk`
