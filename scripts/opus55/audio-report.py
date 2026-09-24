#!/usr/bin/env python3
"""Loudness, clipping and band balance of a WAV, optionally against a reference.

usage: audio-report.py mine.wav [ref.wav] [--notes] [--skip-ref SECONDS]
  --notes      also print the loudest bass note and top melody notes every 0.5 s
  --skip-ref   ignore the first N seconds of the reference (screen-recording silence)

Band balance is each band's share of total energy (dB), after normalising
loudness, so two mixes can be compared by shape. Aim for every band within
about 2 dB of the reference.
"""
import sys, wave
import numpy as np

BANDS = [(20, 200), (200, 550), (550, 2500), (2500, 8000), (8000, 16000)]
NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

def load(fn, skip=0.0):
    w = wave.open(fn); sr = w.getframerate(); ch = w.getnchannels()
    x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(float).reshape(-1, ch) / 32768
    return x[int(skip * sr):], sr

def bands(m, sr):
    m = m / (np.sqrt((m ** 2).mean()) or 1)
    sp = np.abs(np.fft.rfft(m)) ** 2; f = np.fft.rfftfreq(len(m), 1 / sr); tot = sp.sum()
    return [10 * np.log10(sp[(f > lo) & (f < hi)].sum() / tot) for lo, hi in BANDS]

def note(f):
    k = round(12 * np.log2(f / 440) + 69); return NAMES[k % 12] + str(k // 12 - 1)

def report(fn, skip=0.0):
    x, sr = load(fn, skip); m = x.mean(1)
    print(f'{fn}: {len(m)/sr:.1f}s  peak {np.abs(x).max():.3f}  rms {np.sqrt((m**2).mean()):.3f}  clipped {(np.abs(x) > .99).sum()}')
    return m, sr

args = [a for a in sys.argv[1:] if not a.startswith('--')]
skip = float(sys.argv[sys.argv.index('--skip-ref') + 1]) if '--skip-ref' in sys.argv else 0.0
if '--skip-ref' in sys.argv: args = [a for a in args if a != sys.argv[sys.argv.index('--skip-ref') + 1]]
m, sr = report(args[0])
rows = [('mine' if len(args) > 1 else 'wav', bands(m, sr))]
if len(args) > 1:
    r, rsr = report(args[1], skip); rows.append(('ref', bands(r, rsr)))
print('band dB     ' + '  '.join(f'{lo}-{hi}'.rjust(10) for lo, hi in BANDS))
for name, b in rows: print(name.ljust(10) + '  '.join(f'{v:10.1f}' for v in b))
if len(rows) == 2: print('diff'.ljust(10) + '  '.join(f'{a - b:+10.1f}' for a, b in zip(rows[0][1], rows[1][1])))
for t in range(0, int(len(m) / sr), 2):
    s = m[t * sr:(t + 2) * sr]; print(f'  {t:3d}s rms {np.sqrt((s**2).mean()):.3f}')
if '--notes' in sys.argv:
    big = 8192
    for t in np.arange(0, len(m) / sr - .2, .5):
        s = m[int(t * sr):int(t * sr) + big]
        if len(s) < big: break
        sp = np.abs(np.fft.rfft(s * np.hanning(big))); ff = np.fft.rfftfreq(big, 1 / sr)
        bm = (ff > 35) & (ff < 260); mm = (ff > 260) & (ff < 2500)
        tops = []
        for k in np.argsort(sp[mm])[::-1]:
            n = note(ff[mm][k])
            if n not in tops: tops.append(n)
            if len(tops) == 4: break
        print(f'  {t:5.1f}s bass {note(ff[bm][np.argmax(sp[bm])]):4s} top {" ".join(tops)}')
