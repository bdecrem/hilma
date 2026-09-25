"""Loudness and spectrum helpers shared by track.py and check.py."""
import subprocess

import numpy as np
from scipy import signal

SR = 48000


def kweight(x):
    """BS.1770 K-weighting (48 kHz coefficients)."""
    b1 = [1.53512485958697, -2.69169618940638, 1.19839281085285]
    a1 = [1.0, -1.69065929318241, 0.73248077421585]
    b2 = [1.0, -2.0, 1.0]
    a2 = [1.0, -1.99004745483398, 0.99007225036621]
    return signal.lfilter(b2, a2, signal.lfilter(b1, a1, x, axis=-1), axis=-1)


def lufs(xk):
    """Loudness of an already K-weighted (channels, n) block (no gating)."""
    p = np.sum(np.mean(np.atleast_2d(xk) ** 2, axis=-1))
    return float(-0.691 + 10 * np.log10(p + 1e-12))


def ebur128(path):
    r = subprocess.run(['ffmpeg', '-nostats', '-i', path, '-af', 'ebur128=peak=true', '-f', 'null', '-'],
                       capture_output=True, text=True)
    txt = r.stderr[r.stderr.rfind('Summary:'):]
    out = {}
    for key, label in [('I', 'integrated'), ('LRA', 'lra'), ('Peak', 'true_peak')]:
        for line in txt.splitlines():
            if line.strip().startswith(key + ':'):
                out[label] = float(line.split(':')[1].split()[0])
    return out


BANDS = [('sub', 20, 60), ('low', 60, 250), ('lowmid', 250, 1000), ('mid', 1000, 4000), ('pres', 4000, 10000),
         ('air', 10000, 20000)]


def band_shares(mono):
    X = np.abs(np.fft.rfft(mono * np.hanning(len(mono)))) ** 2
    f = np.fft.rfftfreq(len(mono), 1 / SR)
    e = {k: X[(f >= lo) & (f < hi)].sum() for k, lo, hi in BANDS}
    tot = sum(e.values()) + 1e-12
    return {k: round(v / tot * 100, 1) for k, v in e.items()}
