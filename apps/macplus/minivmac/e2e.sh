#!/usr/bin/env bash
#
# e2e.sh — drive a Plus app against its LIVE backend agent inside Mini vMac.
#
# Wires the serial bridge end to end:
#
#   patched Mini vMac --TCP(5454)--> vmodem --TCP--> the real agent
#
# so the UNMODIFIED app runs its full modem handshake (AT / ATDT / CONNECT) and
# exchanges real frames with the real backend. This is the closest thing to the
# hardware short of the Plus itself, and it needs no SD-card shuttling.
#
# Usage:
#   ./e2e.sh <App> [redirect-host:port]
#     <App>      HelloWiFi | Foundry | TalkingPlus | Surf | Atkinson | Macinclaude
#                (uses the freshly-BUILT .dsk in ../<app>/build, so you test the
#                 current binary, not a stale staged copy)
#     redirect   optional MNVM_REDIRECT — reroute every dial here regardless of
#                what the app dials. Omit to honor the app's own host:port.
#
# Examples:
#   ./e2e.sh HelloWiFi                      # dials the mux it's configured for
#   ./e2e.sh Foundry 127.0.0.1:2327         # force-point at a local Foundry agent
#
# ---------------------------------------------------------------------------
# WHAT THIS HARNESS CAN VERIFY:
#   - the whole serial/modem/mux data path and every frame protocol
#   - connect / receive / render, progressive draws, scrollback
#   - Foundry's compile→deliver→write-to-disk loop (a real app appears)
#   - HelloWiFi bring-up AND the re-run path (Tests ▸ Run WiFi Test twice)
#   - Surf page loads, Talking Plus performance (it MIMES — see below)
#
# WHAT IT CANNOT VERIFY (drive these on the real Plus):
#   - The SCC mouse path. Mini vMac injects the host mouse directly; it does NOT
#     emulate the SCC DCD-line quadrature interrupt the real Plus uses for the
#     mouse. So the "serial use freezes the mouse" class of bug (the Talking Plus
#     report) cannot reproduce here — it is hardware-only.
#   - MacinTalk speech. The emulator boot floppy has no MacinTalk file, so the
#     Talking Plus mimes (silent mouth-flap). Audio only happens on the card/Plus.
# ---------------------------------------------------------------------------
set -e

APP="${1:?usage: e2e.sh <App> [redirect-host:port]}"
REDIR="${2:-}"

HERE="$(cd "$(dirname "$0")" && pwd)"
MACPLUS="$(cd "$HERE/.." && pwd)"
VMAC=~/mac-plus-apps/vmac

# App -> built disk image. Build first if missing.
case "$APP" in
  HelloWiFi)    DISK="$MACPLUS/wifi/build/HelloWiFi.dsk" ;;
  Foundry)      DISK="$MACPLUS/foundry/build/Foundry.dsk" ;;
  TalkingPlus)  DISK="$MACPLUS/talkingplus/build/TalkingPlus.dsk" ;;
  Surf)         DISK="$MACPLUS/surf/build/Surf.dsk" ;;
  Atkinson)     DISK="$MACPLUS/atkinson/build/Atkinson.dsk" ;;
  Macinclaude)  DISK="$MACPLUS/macinclaude/build/Macinclaude.dsk" ;;
  *) echo "unknown app '$APP' (HelloWiFi|Foundry|TalkingPlus|Surf|Atkinson|Macinclaude)"; exit 1 ;;
esac
if [ ! -f "$DISK" ]; then
  echo "no built disk at $DISK — build the app first (its build.sh), then re-run."
  exit 1
fi

[ -f "$VMAC/Disk605.dsk" ] || { echo "missing $VMAC/Disk605.dsk (the System 6 boot floppy)"; exit 1; }
[ -x "$VMAC/Mini vMac.app/Contents/MacOS/minivmac" ] || { echo "missing patched Mini vMac in $VMAC"; exit 1; }

# 1. (re)start vmodem
pkill -f "vmodem.py 5454" 2>/dev/null || true
sleep 0.3
[ -n "$REDIR" ] && export MNVM_REDIRECT="$REDIR"
python3 "$HERE/vmodem.py" 5454 >/tmp/vmodem.log 2>&1 &
sleep 0.5
echo "vmodem listening on 127.0.0.1:5454  (log: /tmp/vmodem.log)${REDIR:+  redirect -> $REDIR}"

# 2. launch the emulator: boot floppy + the app disk, serial pointed at vmodem
cd "$VMAC"
MNVM_SERIAL=127.0.0.1:5454 "./Mini vMac.app/Contents/MacOS/minivmac" Disk605.dsk "$DISK" &
echo "emulator up: Disk605 (System 6) + $APP"
echo
echo "Next: double-click the $APP disk, then the app. Watch /tmp/vmodem.log for"
echo "the dial and the live relay. (Screen must be unlocked for computer-use.)"
