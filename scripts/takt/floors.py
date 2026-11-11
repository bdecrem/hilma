#!/usr/bin/env python3
"""floors.py: the checks taste.md did not have. Run on the pre-master stems of a reference render.

    python3 floors.py STEMS_DIR BPM BARS CARRIER_STEM [--drums a,b,c] [--ground a,b]

The pitched group is every stem that is not a drum, noise, a riser, the drum room or the ground
(a rumble made from the kick). A bassline is pitched. Needs numpy and scipy.

From misc/electronic-craft.md §9 (Claude in the Claude app, 2026-11-10); the only change is
'snare' in the default drum list (Restlicht has one). The pass bands, the measured records and
how to read a failure are in .claude/skills/takt-electronic/references/craft.md.

    ~/.cache/takt-venv/bin/python scripts/takt/floors.py stems/ 128 128 acid   # Gegenlicht"""
import sys, os, glob, argparse
import numpy as np
from scipy.io import wavfile
from scipy import signal

ap = argparse.ArgumentParser()
ap.add_argument('stems'); ap.add_argument('bpm', type=float); ap.add_argument('bars', type=int); ap.add_argument('carrier')
ap.add_argument('--drums', default='kick,hats,ohat,clap,rim,ride,shaker,crash,toms,noise,riser,room,snare')
ap.add_argument('--ground', default='rumble')
a = ap.parse_args()
BAR = 240.0 / a.bpm
S = {}
for f in sorted(glob.glob(os.path.join(a.stems, '*.wav'))):
    SR, x = wavfile.read(f)
    x = x.astype(np.float64) / (32768.0 if x.dtype == np.int16 else 1.0)
    S[os.path.basename(f)[:-4]] = x.mean(axis=1) if x.ndim == 2 else x
n = min(len(v) for v in S.values())
drums, ground = set(a.drums.split(',')), set(a.ground.split(','))
pitched = sum(v[:n] for k, v in S.items() if k not in drums and k not in ground)
kick, car = S['kick'][:n], S[a.carrier][:n]


def db(p):
    return 10 * np.log10(p + 1e-14)


def seg(x, b0, b1):
    return x[int(b0 * BAR * SR):int(b1 * BAR * SR)]


def band(x, lo, hi):
    return signal.sosfilt(signal.butter(4, [lo, hi], btype='band', fs=SR, output='sos'), x)


def power(x):
    return float((x ** 2).mean()) if len(x) else 0.0


body = (16, a.bars - 16)
blocks = list(range(0, a.bars, 8))
k_db = db(power(seg(kick, *body)))
rows = []

# 1. how full the record is: the pitched group against the kick, over the body
rows.append(('pitched group under the kick, bars %d-%d' % body, k_db - db(power(seg(pitched, *body))), 2.0, 5.0, 'dB'))

# 2. the mids at the peak: the pitched group's 500-2000 Hz, its loudest 8 bars that have a kick, against the kick
mid = band(pitched, 500, 2000)
kicked = [b for b in blocks if db(power(seg(kick, b, b + 8))) > k_db - 3]
rows.append(('pitched 500-2k under the kick, best 8 bars with a kick', k_db - max(db(power(seg(mid, b, b + 8))) for b in kicked), 6.0, 12.0, 'dB'))

# 3. is the carrier there most of the time: 20 ms frames within 20 dB of its loud level, first sound to last
w = int(0.02 * SR)
fr = np.sqrt((car[:len(car) // w * w].reshape(-1, w) ** 2).mean(axis=1) + 1e-14)
ref = np.percentile(fr, 97)
on = fr > ref * 1e-3
i0, i1 = int(np.argmax(on)), len(on) - int(np.argmax(on[::-1]))
rows.append(('carrier present (duty)', 100 * float((fr[i0:i1] > ref * 0.1).mean()), 50.0, 100.0, '%'))

# 4-6. the carrier by 8-bar block: its level should hold, its timbre should travel
lev = np.array([db(power(seg(car, b, b + 8))) for b in blocks])
hi = band(car, 800, 3200)
share = np.array([db(power(seg(hi, b, b + 8))) for b in blocks]) - lev
alive = lev > -60
core = [i for i, b in enumerate(blocks) if alive[i] and a.bars * 0.25 <= b < a.bars * 0.85]
rows.append(('carrier level, spread across 25-85 % of the track', float(lev[core].max() - lev[core].min()), 0.0, 3.5, 'dB'))
rows.append(('carrier timbre travel (800-3200 Hz share, max - min)', float(share[alive].max() - share[alive].min()), 10.0, 40.0, 'dB'))
rows.append(('carrier, its first 8 bars against its middle', float(np.median(lev[core]) - lev[alive][0]), -3.0, 4.0, 'dB under'))

print('%-54s %8s   %-12s' % ('check', 'value', 'pass'))
for name, v, lo, hi_, unit in rows:
    print('%-54s %8.1f   %g to %g %s   %s' % (name, v, lo, hi_, unit, 'ok' if lo <= v <= hi_ else '<-- FAIL'))
print('\nby 8-bar block   carrier level (dBFS)        : ' + ' '.join('%4.0f' % v if v > -90 else '   -' for v in lev))
print('                 carrier 800-3200 share (dB) : ' + ' '.join('%4.0f' % v if al else '   -' for v, al in zip(share, alive)))
print('                 pitched 500-2k (dBFS)       : ' + ' '.join('%4.0f' % db(power(seg(mid, b, b + 8))) for b in blocks))
