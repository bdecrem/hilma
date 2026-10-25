#!/usr/bin/env python3
"""Screenshots of the live lesson at chosen transport positions, without the foreground.

    apps/takt/scripts/shoot.py <clock-file> <out-dir> [--sim <udid>] name:tick ...

The clock file is what the app writes with `-ClockTo` (the host time tick 0 is heard, and the
tempo); a tick is absolute (576 per chorus at 12 per beat: chorus 3, bar 4, beat 3 is
2*576 + 3*48 + 2*12). Waits until each tick is heard, then captures the Takt window on the Mac
(build/winid, from scripts/winid.swift) or the simulator screen with --sim. Holds a tempo: the
clock is only right while the tempo the app started with is playing. A window capture fails while
the Mac's screen is locked; the app's own `-SnapshotAt` hook (DebugHooks) works regardless.
"""
import subprocess
import sys
import time

args = sys.argv[1:]
clock, out = args[0], args[1]
sim = None
if len(args) > 3 and args[2] == "--sim":
    sim = args[3]
    args = args[:2] + args[4:]
# The app writes the clock once the band rolls.
for _ in range(300):
    try:
        h0, bpm = [float(x) for x in open(clock).read().split()[1:]]
        break
    except (FileNotFoundError, ValueError):
        time.sleep(0.1)
else:
    sys.exit(f"no clock in {clock}")
seconds_per_tick = 60 / (bpm * 12)

for item in args[2:]:
    name, tick = item.split(":")
    target = h0 + int(tick) * seconds_per_tick
    while (wait := target - time.clock_gettime(time.CLOCK_UPTIME_RAW)) > 0:
        time.sleep(min(wait, 0.5))
    path = f"{out}/{name}.png"
    if sim:
        subprocess.run(["xcrun", "simctl", "io", sim, "screenshot", path], capture_output=True)
    else:
        window = subprocess.run(["build/winid", "Takt"], capture_output=True, text=True).stdout.split()[0]
        subprocess.run(["screencapture", "-x", "-o", f"-l{window}", path])
    late = time.clock_gettime(time.CLOCK_UPTIME_RAW) - target
    print(f"{name} at tick {tick} (+{late:.2f} s)", flush=True)
