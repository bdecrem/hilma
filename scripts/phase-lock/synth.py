"""Phase Lock — the instruments. Berlin techno, synthesized from first principles.

Tuning: everything hangs off the kick. A1 = 55 Hz at 132 BPM is exactly 25
cycles per beat, so a sustained sub at the root meets every kick at the same
point of its cycle (no beat-to-beat drift between kick and sub, no random
cancellation). Pitched parts use just intonation against that root — the
track never modulates, so equal temperament's compromise buys nothing, and
pure thirds and fifths don't beat against the drone.

General DSP (wavetables, rooms, filters, limiter) comes from ../dodos-lament/engine.py.
"""
import os
import sys

import numba
import numpy as np
from scipy import signal

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dodos-lament'))
from engine import SR, table, wt_osc, svf_lp  # noqa: E402

BPM = 132.0
BEAT = 60.0 / BPM
BAR = 4 * BEAT
STEP = BEAT / 4
ROOT = 55.0                      # A1
CYCLES_PER_BEAT = ROOT * BEAT    # 25.0 exactly
assert abs(CYCLES_PER_BEAT - round(CYCLES_PER_BEAT)) < 1e-9

# just intonation, ratios to A
JI = {'1': 1.0, 'b2': 16 / 15, '2': 9 / 8, 'b3': 6 / 5, '3': 5 / 4, '4': 4 / 3, '5': 3 / 2, 'b6': 8 / 5,
      'b7': 9 / 5, '7': 15 / 8}


def ji(degree, octave):
    """Frequency of a scale degree; octave 1 = the A1 root octave."""
    return ROOT * JI[degree] * 2 ** (octave - 1)


# ---------------------------------------------------------------------------
# kick, and the phase of its tail
# ---------------------------------------------------------------------------
def kick_wave():
    """One kick, used for every hit (identical hits = identical phase relation to the sub).
    Pitch falls from the 3rd harmonic of A to A1 in ~30 ms, a short knock at 165 Hz (also
    the 3rd harmonic, so it's in tune), a noise click, soft-saturated for small speakers."""
    n = int(0.62 * SR)
    t = np.arange(n) / SR
    f = ROOT + 2 * ROOT * np.exp(-t / 0.026) + 3.5 * ROOT * np.exp(-t / 0.0028)
    ph = 2 * np.pi * np.concatenate([[0.0], np.cumsum(f[:-1])]) / SR
    amp = np.exp(-t / 0.17) * (1 - np.exp(-t / 0.0006)) * np.clip((0.62 - t) / 0.12, 0, 1)
    body = np.sin(ph) * amp
    knock = 0.22 * np.sin(2 * np.pi * 3 * ROOT * t) * np.exp(-t / 0.011) * (1 - np.exp(-t / 0.0006))
    rng = np.random.default_rng(132)
    nz = signal.sosfilt(signal.butter(2, [2500, 9000], 'bandpass', fs=SR, output='sos'), rng.standard_normal(n))
    click = 0.3 * nz / (np.std(nz) + 1e-12) * np.exp(-t / 0.0014)
    y = np.tanh(2.0 * (body + knock + click)) / np.tanh(2.0)
    # phase of the tail relative to a free-running A1 that started with the kick
    i = int(0.3 * SR)
    tail_phase = (ph[i] - 2 * np.pi * ROOT * t[i]) % (2 * np.pi)
    return y, tail_phase


def duck_env(kick_times, n, floor=0.0, recover=0.09, hold=0.012):
    """Gain that drops to `floor` at each kick and recovers with time constant `recover`."""
    g = np.ones(n, np.float64)
    L = int(BEAT * SR * 1.2)
    tt = np.arange(L) / SR
    curve = floor + (1 - floor) * (1 - np.exp(-np.maximum(tt - hold, 0) / recover))
    for tk in kick_times:
        i = int(round(tk * SR))
        if i >= n:
            continue
        j = min(n, i + L)
        g[i:j] = np.minimum(g[i:j], curve[:j - i])
    return g


def sub_drone(n, phase0, amp):
    """The phase-locked sub: A1 plus a little octave. `amp` is a per-sample envelope."""
    t = np.arange(n) / SR
    y = np.sin(2 * np.pi * ROOT * t + phase0) + 0.14 * np.sin(2 * np.pi * 2 * ROOT * t + 2 * phase0)
    return y * amp


def rumble(kick_mono, ir_mono, drive):
    """Berghain rumble: the kick into a dark room, low-passed, driven, low-passed again.
    `drive` is a per-sample array (the saturation opens up through the track)."""
    n = len(kick_mono)
    wet = signal.oaconvolve(kick_mono, ir_mono)[:n]
    wet = signal.sosfilt(signal.butter(4, 150, 'low', fs=SR, output='sos'), wet)
    wet /= np.sqrt(np.mean(wet[wet != 0] ** 2)) + 1e-12
    y = np.tanh(drive * wet * 0.5) / np.tanh(drive * 0.5 + 1e-9)
    return signal.sosfilt(signal.butter(2, 230, 'low', fs=SR, output='sos'), y)


# ---------------------------------------------------------------------------
# metal and noise
# ---------------------------------------------------------------------------
_MET = np.array([205.3, 304.4, 369.6, 522.7, 540.0, 800.0])


def _metal(n, scale):
    t = np.arange(n) / SR
    y = np.zeros(n)
    for f in _MET * scale:
        k = 1
        while k * f < 20000:
            y += np.sin(2 * np.pi * k * f * t + 0.37 * k) / k
            k += 2
    return y


_cache = {}


def _hat_base():
    if 'hat' not in _cache:
        n = int(0.6 * SR)
        rng = np.random.default_rng(909)
        b = _metal(n, 1.85) + 1.3 * rng.standard_normal(n)
        b = signal.sosfilt(signal.butter(4, 5200, 'high', fs=SR, output='sos'), b)
        b = signal.sosfilt(signal.butter(2, 14500, 'low', fs=SR, output='sos'), b)
        _cache['hat'] = b / (np.std(b) + 1e-12)
    return _cache['hat']


def hat(decay, vel=1.0):
    b = _hat_base()
    n = min(len(b), int((decay * 7 + 0.01) * SR))
    t = np.arange(n) / SR
    return b[:n] * np.exp(-t / decay) * (1 - np.exp(-t / 0.0004)) * vel


def ride(vel=1.0):
    if 'ride' not in _cache:
        n = int(1.8 * SR)
        t = np.arange(n) / SR
        rng = np.random.default_rng(606)
        y = np.zeros(n)
        for f in [3150, 3840, 4410, 5290, 6180, 6780, 7890, 9120, 10430, 11850]:
            y += np.sin(2 * np.pi * f * t + rng.random() * 6.3) * np.exp(-t / rng.uniform(0.35, 0.9))
        nz = signal.sosfilt(signal.butter(4, 5000, 'high', fs=SR, output='sos'), rng.standard_normal(n))
        y = y / np.std(y) + 1.4 * nz / np.std(nz) * np.exp(-t / 0.55)
        y *= (1 - np.exp(-t / 0.0005)) * np.exp(-t / 0.9)
        y = signal.sosfilt(signal.butter(2, 3200, 'high', fs=SR, output='sos'), y)
        _cache['ride'] = y / np.max(np.abs(y))
    return _cache['ride'] * vel


def clap(vel=1.0):
    """Dry and hard: four fast noise bursts through the hand-clap band."""
    if 'clap' not in _cache:
        n = int(0.32 * SR)
        t = np.arange(n) / SR
        rng = np.random.default_rng(22)
        nz = rng.standard_normal(n)
        env = np.zeros(n)
        for tb in (0.0, 0.0085, 0.0165, 0.0245):
            env += (t >= tb) * np.exp(-np.maximum(t - tb, 0) / 0.0055)
        env += (t >= 0.0245) * 0.55 * np.exp(-np.maximum(t - 0.0245, 0) / 0.075)
        y = signal.sosfilt(signal.butter(2, [850, 2900], 'bandpass', fs=SR, output='sos'), nz) * env
        y += 0.5 * signal.sosfilt(signal.butter(2, [3500, 9000], 'bandpass', fs=SR, output='sos'), nz) * env * np.exp(-t / 0.03)
        y = np.tanh(3 * y / np.max(np.abs(y))) / np.tanh(3)
        _cache['clap'] = y
    return _cache['clap'] * vel


def tom(freq, vel=1.0):
    """909-ish tom, tuned in just intonation to the root."""
    key = ('tom', round(freq, 3))
    if key not in _cache:
        n = int(0.55 * SR)
        t = np.arange(n) / SR
        f = freq * (1 + 0.55 * np.exp(-t / 0.018))
        ph = 2 * np.pi * np.concatenate([[0.0], np.cumsum(f[:-1])]) / SR
        y = np.sin(ph) * np.exp(-t / 0.15) * (1 - np.exp(-t / 0.0008))
        rng = np.random.default_rng(int(freq))
        nz = signal.sosfilt(signal.butter(2, [1200, 4500], 'bandpass', fs=SR, output='sos'), rng.standard_normal(n))
        y += 0.18 * nz / np.std(nz) * np.exp(-t / 0.004)
        _cache[key] = np.tanh(1.6 * y) / np.tanh(1.6)
    return _cache[key] * vel


# ---------------------------------------------------------------------------
# tonal parts
# ---------------------------------------------------------------------------
def stab(freqs, cutoff, env_amt=3.0, q=1.6, drive=1.8, length=0.6, decay=0.16):
    """A chord hit: band-limited saw + pulse per voice, exact just-intonation pitches,
    through a resonant low-pass with a fast envelope, lightly driven."""
    n = int(length * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for f in freqs:
        K = max(1, int(16000 / f))
        k = np.arange(1, K + 1)
        saw = table(('saw', K), 1.0 / k)
        pulse = table(('pulse30', K), np.abs(np.sin(np.pi * k * 0.3)) / k)
        fr = np.full(n, f)
        y += wt_osc(saw, fr, 0.0) + 0.6 * wt_osc(pulse, fr, 0.25)
    y /= len(freqs)
    fc = np.minimum(cutoff * (1 + env_amt * np.exp(-t / 0.045)), 18000.0)
    y = svf_lp(y, fc, q)
    amp = (1 - np.exp(-t / 0.002)) * np.exp(-t / decay) * np.clip((length - t) / 0.05, 0, 1)
    y = np.tanh(drive * y * amp) / np.tanh(drive)
    return y


def blip(freq, vel=1.0):
    """Metallic sequence voice: FM with an inharmonic (sqrt 2) modulator, short."""
    n = int(0.22 * SR)
    t = np.arange(n) / SR
    idx = 2.2 * np.exp(-t / 0.03) + 0.3
    y = np.sin(2 * np.pi * freq * t + idx * np.sin(2 * np.pi * freq * np.sqrt(2) * t))
    return y * np.exp(-t / 0.05) * (1 - np.exp(-t / 0.0015)) * vel


def tuned_wind(n, partials, rng, q=45.0, lfo_bars=(5, 7, 11, 13)):
    """Noise through narrow resonators at just-intonation partials: breath with a pitch.
    partials: [(freq, gain), ...]. Returns stereo (2, n), unit-ish RMS."""
    t = np.arange(n) / SR
    y = np.zeros((2, n))
    for i, (f, g) in enumerate(partials):
        b, a = signal.iirpeak(f, q, fs=SR)
        per = lfo_bars[i % len(lfo_bars)] * BAR
        lfo = 0.55 + 0.45 * np.sin(2 * np.pi * t / per + rng.random() * 6.28)
        for c in range(2):
            v = signal.lfilter(b, a, rng.standard_normal(n))
            y[c] += g * v / (np.std(v) + 1e-12) * lfo
    return y / (np.sqrt(np.mean(y ** 2)) + 1e-12) * 0.3


@numba.njit(cache=True)
def svf_bp(x, fc, q):
    y = np.empty_like(x)
    ic1 = 0.0
    ic2 = 0.0
    k = 1.0 / q
    for i in range(x.shape[0]):
        f = min(fc[i], 0.45 * 48000.0)
        g = np.tan(np.pi * f / 48000.0)
        a1 = 1.0 / (1.0 + g * (g + k))
        a2 = g * a1
        a3 = g * a2
        v3 = x[i] - ic2
        v1 = a1 * ic1 + a2 * v3
        v2 = ic2 + a2 * ic1 + a3 * v3
        ic1 = 2.0 * v1 - ic1
        ic2 = 2.0 * v2 - ic2
        y[i] = v1
    return y


@numba.njit(cache=True)
def dub_delay(x, d, fb, lp_coef, hp_coef, drive):
    """Ping-pong echo, filtered and saturated inside the loop (tape-ish). Returns the wet (2, n)."""
    n = x.shape[0]
    out = np.zeros((2, n))
    bl = np.zeros(d)
    br = np.zeros(d)
    lpl = 0.0
    lpr = 0.0
    hpl = 0.0
    hpr = 0.0
    for i in range(n):
        j = i % d
        yl = bl[j]
        yr = br[j]
        out[0, i] = yl
        out[1, i] = yr
        il = x[i] + fb * yr
        ir = fb * yl
        lpl += lp_coef * (il - lpl)
        lpr += lp_coef * (ir - lpr)
        hpl += hp_coef * (lpl - hpl)
        hpr += hp_coef * (lpr - hpr)
        bl[j] = np.tanh(drive * (lpl - hpl)) / drive
        br[j] = np.tanh(drive * (lpr - hpr)) / drive
    return out


def one_pole(hz):
    return 1 - np.exp(-2 * np.pi * hz / SR)


def soft_clip(x, thr=0.7):
    """Linear below `thr`, tanh-rounded above: shaves peaks without touching the body."""
    a = np.abs(x)
    over = a > thr
    y = x.copy()
    y[over] = np.sign(x[over]) * (thr + (1 - thr) * np.tanh((a[over] - thr) / (1 - thr)))
    return y


def mono_below(x2, hz=150.0):
    """Mid/side: no side signal below `hz` (club systems sum the sub to mono anyway)."""
    mid = (x2[0] + x2[1]) / 2
    side = (x2[0] - x2[1]) / 2
    side = signal.sosfilt(signal.butter(8, hz, 'high', fs=SR, output='sos'), side)
    return np.stack([mid + side, mid - side]).astype(np.float32)
