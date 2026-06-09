#!/usr/bin/env bash
#
# Start the virtual modem and launch the patched Mini vMac wired to it, booting
# System 6 + a Macinclaude app disk. Then in the emulator: launch the app, set
# Settings to the Modem port / 9600 / host 192.168.7.50 / port 2324 (Code) or
# 2325 (Paint) / blank SSID, and Connect. Watch /tmp/vmodem.log: you'll see the
# app's AT and ATDT, then "CONNECT", then the live session.
#
#   ./run-test.sh code     # boot with Macinclaude.dsk
#   ./run-test.sh paint    # boot with Atkinson.dsk
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="${MNVM_WORK:-$HOME/mac-plus-apps}"
T="$WORK/mctest"
WHICH="${1:-code}"
case "$WHICH" in
  code)  APPDISK="Macinclaude.dsk" ;;
  paint) APPDISK="Atkinson.dsk" ;;
  *) echo "usage: $0 code|paint"; exit 1 ;;
esac

# virtual modem (idempotent)
pkill -f "vmodem.py" 2>/dev/null || true
sleep 0.3
nohup python3 "$HERE/vmodem.py" 5454 > /tmp/vmodem.log 2>&1 &
sleep 0.5
echo ">> vmodem: $(tail -1 /tmp/vmodem.log)"

# patched emulator, modem port bridged to vmodem
killall minivmac 2>/dev/null || true
sleep 0.5
cd "$T"
MNVM_SERIAL=127.0.0.1:5454 nohup ./minivmac.app/Contents/MacOS/minivmac \
  Disk605.dsk "$APPDISK" > /tmp/minivmac.log 2>&1 &
echo ">> launched patched Mini vMac with $APPDISK (modem -> 127.0.0.1:5454 -> mini)"
echo ">> watch: tail -f /tmp/vmodem.log"
