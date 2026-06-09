# Mini vMac serial bridge — end-to-end testing for the Macinclaude apps

Stock Mini vMac emulates the Mac's serial ports with **nothing attached**, so
the Macinclaude apps (which talk to the Mac mini over the modem port) can't be
tested in the emulator. This adds a real serial path so the **unmodified apps
run their full modem handshake inside Mini vMac and reach the mini's agents**.

```
patched Mini vMac ──TCP 127.0.0.1:5454──> vmodem.py ──TCP──> Mac mini agent
   (Mac modem port,                       (virtual Hayes      (Code  :2324)
    SCC channel 0)                          modem)            (Paint :2325)
```

Two pieces:

1. **`minivmac-rawserial.patch`** — patches Mini vMac's SCC emulation
   (`SCCEMDEV.c/.h`, `PROGMAIN.c`). The modem port (SCC channel 0) is bridged to
   a host TCP client socket: bytes the Mac transmits are `send()`-ed; bytes from
   the socket are fed into the SCC receive register and raise the channel-A
   receive interrupt (mirroring the already-working channel-B/LocalTalk receive
   path, so the interrupt handshake is proven). Host endpoint from env
   `MNVM_SERIAL` (default `127.0.0.1:5454`). New build flag `EmRawSerial`.

2. **`vmodem.py`** — a virtual Hayes modem. Listens on `127.0.0.1:5454`; speaks
   `AT`→`OK`, `ATDT"host:port"`→dials TCP and relays (`CONNECT`/`NO CARRIER`),
   `+++`/`ATH`→hang up. So the app's real connect ritual (AT, then
   `ATDT"192.168.7.50:2324"`) reaches the mini.

## Build

```
./build.sh
```
Clones Mini vMac, applies the patch, generates a **Mac Plus / Cocoa / Apple
Silicon** Xcode project, builds + codesigns `minivmac.app`, and stages a test
dir at `~/mac-plus-apps/mctest/` (needs a Plus `vMac.ROM` and a System 6 boot
`Disk605.dsk` there — copy them from `~/mac-plus-apps/vmac/`).

The app disks (`Macinclaude.dsk`, `Atkinson.dsk`) come from each app's own
`build.sh` under `apps/macplus/`.

## Run the test

```
./run-test.sh code     # or: paint
```
Starts vmodem, launches the patched emulator booting System 6 + the app disk.
Then in the emulator:

1. Launch the app (double-click its disk, then the app).
2. **Settings**: Modem port, **9600** baud, host **192.168.7.50**, port
   **2324** (Code) / **2325** (Paint), **leave SSID blank** (skips the WiFi
   join — there's no WiFi in the emulator), Save.
3. The app dials. Watch `/tmp/vmodem.log`: you'll see `AT`, then
   `ATDT"192.168.7.50:2324"`, then `CONNECT`, then the live agent session
   streaming back into the emulator.

(With a saved prefs file the app auto-connects on launch and step 2 is skipped.)

## Notes / status

- The bridge half is verified independently: driving vmodem with a simulated
  handshake returns the full live Macinclaude agent banner from the mini.
- The patched emulator boots and its modem port connects to vmodem at startup.
- `EmRawSerial` only touches SCC **channel 0** (the modem port). The printer
  port and (optional) LocalTalk are untouched.
- The mini agents must be listening (`apps/macplus/CLAUDE.md` for how they run;
  Paint's 2325 listener and the LaunchDaemon are documented there too).
