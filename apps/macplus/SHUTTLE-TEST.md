# Shuttle & test kit — Foundry, The Talking Plus, HelloWiFi (2026-06-10)

The SD card has been re-imaged with everything below. Eject it, put it in the
BlueSCSI, boot the Plus, and run the three tests. All backend services are up
right now (see "Prereqs" — they die on a mini reboot, so test before rebooting
the mini).

## What's on the card now (`Apps` folder)
| App | Dials | Backend (must be running) | Verifies |
|-----|-------|---------------------------|----------|
| **HelloWiFi** | `192.168.7.50:2330` (mux) | mux on mini :2330 (+ internal echo, + diag→:2331) | WiFi bring-up + the whole mux/diag path. Auto-runs on launch, draws a **smiley** if the echo round-trips, **sad face** if not. |
| **The Talking Plus** | `192.168.7.50:2329` | moose-agent on mini :2329 | Speaks aloud via MacinTalk. **MacinTalk file is now on the card** (System Folder + Apps), so this should talk, not mime. |
| **Foundry** | `192.168.7.189:2327` (iMac) | agent-foundry on **iMac** :2327 | Describe an app → Claude writes + Retro68 compiles → delivered as a real APPL onto the disk. |
| Surf | `192.168.7.50:2326` | surf-agent on mini :2326 | (already tested last round; still staged) |

MacinTalk (`ZSYS/MACS`, .SPEECH driver in a 28 KB resource fork) is in both the
**System Folder** and **Apps** so `OpenResFile("MacinTalk")` finds it either way.

## Prereqs (all confirmed up at 2026-06-10 11:00)
- **Mini (192.168.7.50)** listening: 2323 (shell), 2324 (Code), 2325 (Paint), 2326 (Surf), 2329 (Talk), 2330 (mux), 2331 (diag-sink).
- **iMac (192.168.7.189)** listening: 2327 (Foundry).
- 2323/2324/2325 are LaunchDaemons (survive reboot). **2326/2329/2330/2331 are hand-started** — if the mini reboots, re-launch them (see "Restart services" below). This is hardening task #17, not yet done.
- The Plus must be on WiFi (modem joined + `AT&W` saved) — the cable + modem work was the earlier blocker; that's cleared.

## The three tests

### 1. HelloWiFi (the go/no-go)
Double-click **HelloWiFi**. It auto-dials the mux, opens an echo channel, and
sends a round-trip. **Smiley face = the whole WiFi + mux + diag path works.**
Sad face = it names what broke on screen (no OK to AT / no CONNECT / echo
mismatch). Its full trace also streams to the mini diag-sink (no SD round-trip
needed to read it):
```
ssh admin@192.168.7.50 'ls -t /tmp/macplus-diag/ | head; cat "/tmp/macplus-diag/$(ssh ... )"'
```
(the diag-sink writes `/tmp/macplus-diag/diag-session-*.log`, newest = this run).

### 2. The Talking Plus
Double-click **The Talking Plus** → **Wake** (greeting) or **News** (live Hacker
News). He should **speak aloud** through the Plus speaker now that MacinTalk is
on the card, flapping the mouth + highlighting each word. If he's silent but the
mouth still moves, MacinTalk didn't load — check it's in the System Folder.

### 3. Foundry
Double-click **Foundry** → describe an app (e.g. "a stopwatch with lap times").
~2–4 min later a new double-clickable APPL appears on the disk. The Foundry
*agent runs on the iMac* (it has the Retro68 toolchain), so the iMac must stay
on and reachable at 192.168.7.189:2327.

## Restart services (only if the mini rebooted)
```bash
# mini — mux + diag + talk
ssh admin@192.168.7.50
cd ~/agent-mux   && nohup npx tsx src/main.ts --listen 2330 >/tmp/mux.log 2>&1 &
cd ~/agent-diag  && nohup npx tsx src/main.ts --listen 2331 >/tmp/diag.log 2>&1 &
cd ~/moose-agent && ANTHROPIC_API_KEY=... nohup npx tsx src/main.ts --listen 2329 >/tmp/talk.log 2>&1 &
# surf (socat)
nohup socat TCP-LISTEN:2326,reuseaddr,fork 'EXEC:/opt/homebrew/bin/npx tsx /Users/admin/surf-agent/src/main.ts,pty,raw,echo=0,setsid,ctty' >/tmp/surf.log 2>&1 &
```
```bash
# iMac — Foundry agent (run from the repo so it finds the toolchain)
cd ~/Documents/coding2025/hilma/apps/macplus/agent-foundry && npx tsx src/main.ts --listen 2327
```

## Known gaps
- **#17 durability:** mux/talk/diag/surf are hand-started, not daemons. Fine for
  this test; make them LaunchDaemons (template: `agent-surf/install-daemon.sh`)
  so a reboot can't silently break the link.
- **#13/#14 always-on .WIFI driver:** still parked (research-grade, needs the
  real Plus to debug residency/timing). See `wifi/RESUME-ALWAYSON.md`. HelloWiFi
  + the mux prove the data path that driver will make persistent.
