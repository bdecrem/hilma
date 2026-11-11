#!/usr/bin/env python3
"""Irrlicht: melodic techno in B minor, 124 BPM, 128 bars and an 8 s tail (4:16). The reference render for Takt.
A second track in the manner of Hannes Bieger: a fat 16th-note Moog-style bass, a second dark voice put through a
frequency shifter, a large reverb, a hand-played lead that comes late. Nothing here is taken from his records.

    python3 misc/irrlicht_reference.py out.wav [stems_dir]

Needs numpy, scipy, numba. Renders at 44.1 kHz; out.wav is misc/irrlicht/reference.flac bit for bit.
With a stems dir it also writes the pre-master stems and, next to them, parts/: every one-shot, the hat's noise
buffer, both reverb impulses, 32 s of the noise bed, the shadow bus whole (shadow_bus.wav, float32, before its gain
and duck), gains.json (every auto-levelled gain, resolved), drift.json (the five slow wanders) and events.json
(every event as it was placed). The log draws nothing from the random stream. Notes for the port: misc/IRRLICHT.md.
MIDI numbers are the sounding pitches.

The brief:
  image     Irrlicht, the wandering light: a lamp carried across a marsh, never where you last saw it.
  carrier   the bass. Its 2-bar pattern of sixteenths never changes; the filter accent on top of it runs in a cycle of its own
            (4 steps, then 3, then 5), so the bright note wanders across the bar. Cutoff, resonance and decay are on lanes.
  harmony   the bass stays on B. The pad holds C# D A and moves one finger (A to G) for two bars in eight, from bar 40.
  visitor   a hand-played lead, bars 72-87 and once more 104-111. Long notes, glide, at most 2 a bar.
  refused   an arpeggio on top, chord stabs, a riser, crashes, a vocal.

Everything synthesized here, no samples."""
import sys, os, math, json
import numpy as np
import scipy.fft
from scipy import signal
from scipy.io import wavfile
from numba import njit

SR = 44100
BPM = 124.0
BEAT = 60.0 / BPM
STEP = BEAT / 4
BAR = BEAT * 4
NBARS = 128
TAIL = 8.0
N = int(round((NBARS * BAR + TAIL) * SR))
SW = 0.04
rng = np.random.default_rng(1987)
TSEC = np.arange(N) / SR
TBAR = TSEC / BAR


# ---------------------------------------------------------------- helpers
def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def pos(bar, step=0.0, swing=0.0, jitter=0.0):
    s = step
    if swing and abs(step - round(step)) < 1e-6 and int(round(step)) % 2 == 1:
        s = step + swing
    p = (bar * 16 + s) * STEP * SR
    if jitter:
        p += rng.normal(0, jitter) * SR
    return max(0, int(round(p)))


def auto(points):
    return np.interp(TBAR, [p[0] for p in points], [p[1] for p in points])


def add(buf, x, start, gain=1.0):
    if start >= buf.shape[-1]:
        return
    L = min(x.shape[-1], buf.shape[-1] - start)
    buf[..., start:start + L] += gain * x[..., :L]


def pan(x, p):
    a = (p + 1) * np.pi / 4
    return np.stack([x * np.cos(a), x * np.sin(a)])


def hp(x, fc, order=2):
    return signal.sosfilt(signal.butter(order, fc, 'hp', fs=SR, output='sos'), x, axis=-1)


def lp(x, fc, order=2):
    return signal.sosfilt(signal.butter(order, fc, 'lp', fs=SR, output='sos'), x, axis=-1)


def bp(x, lo, hi, order=2):
    return signal.sosfilt(signal.butter(order, [lo, hi], 'bp', fs=SR, output='sos'), x, axis=-1)


def db(x):
    return 20 * np.log10(max(float(x), 1e-12))


def rms_pct(x, pct=95, win=0.4):
    m = x if x.ndim == 1 else np.sqrt((x ** 2).mean(axis=0))
    w = int(win * SR)
    k = len(m) // w
    r = np.sqrt((m[:k * w].reshape(k, w) ** 2).mean(axis=1))
    r = r[r > 1e-6]
    return float(np.percentile(r, pct)) if len(r) else 0.0


def gain_for(x, target_db, pct=95):
    r = rms_pct(x, pct)
    return 10 ** (target_db / 20) / r if r > 0 else 1.0


def peak_gain(x, target_db):
    return 10 ** (target_db / 20) / max(float(np.max(np.abs(x))), 1e-9)


def peak_norm(x, target=1.0):
    return x * (target / np.max(np.abs(x)))


def onepole(fc):
    return 1.0 - np.exp(-2 * np.pi * fc / SR)


# ---------------------------------------------------------------- dsp kernels
@njit(cache=True)
def saw_blep(n, freq, phase0, sr):
    out = np.empty(n)
    ph = phase0 % 1.0
    dt = freq / sr
    for i in range(n):
        v = 2.0 * ph - 1.0
        if ph < dt:
            t = ph / dt
            v -= t + t - t * t - 1.0
        elif ph > 1.0 - dt:
            t = (ph - 1.0) / dt
            v -= t * t + t + t + 1.0
        out[i] = v
        ph += dt
        if ph >= 1.0:
            ph -= 1.0
    return out


@njit(cache=True)
def saw_var(freq, sr):
    n = freq.shape[0]
    out = np.empty(n)
    ph = 0.0
    for i in range(n):
        dt = freq[i] / sr
        v = 2.0 * ph - 1.0
        if ph < dt:
            t = ph / dt
            v -= t + t - t * t - 1.0
        elif ph > 1.0 - dt:
            t = (ph - 1.0) / dt
            v -= t * t + t + t + 1.0
        out[i] = v
        ph += dt
        if ph >= 1.0:
            ph -= 1.0
    return out


@njit(cache=True)
def svf_lp(x, fc, q, sr):
    n = x.shape[0]
    y = np.empty(n)
    ic1 = 0.0
    ic2 = 0.0
    for i in range(n):
        g = np.tan(np.pi * fc[i] / sr)
        k = 1.0 / q[i]
        a1 = 1.0 / (1.0 + g * (g + k))
        a2 = g * a1
        a3 = g * a2
        v3 = x[i] - ic2
        v1 = a1 * ic1 + a2 * v3
        v2 = ic2 + a2 * ic1 + a3 * v3
        ic1 = 2.0 * v1 - ic1
        ic2 = 2.0 * v2 - ic2
        y[i] = v2
    return y


@njit(cache=True)
def acid_ctrl(n, starts, midis, lens, accs, slides, fdec, sr):
    """The 303's three control signals: pitch (with slide), amp (with accent), filter envelope."""
    freq = np.empty(n)
    amp = np.empty(n)
    fenv = np.empty(n)
    nn = starts.shape[0]
    k = 0
    cur = 110.0
    tgt = 110.0
    gate = False
    gate_end = -1
    lvl = 0.0
    attacking = False
    fe = 0.0
    acc = 0.0
    glide = math.exp(-1.0 / (0.038 * sr))
    att = 1.0 / (0.002 * sr)
    dec = math.exp(-1.0 / (0.30 * sr))
    rel = math.exp(-1.0 / (0.012 * sr))
    for i in range(n):
        while k < nn and starts[k] <= i:
            tgt = 440.0 * 2.0 ** ((midis[k] - 69.0) / 12.0)
            if not (slides[k] == 1 and gate):
                cur = tgt
                attacking = True
                fe = 1.0 + 0.45 * accs[k]
            acc = accs[k]
            gate = True
            gate_end = starts[k] + lens[k]
            k += 1
        if gate and i >= gate_end:
            gate = False
        cur = tgt + (cur - tgt) * glide
        if gate:
            if attacking:
                lvl += att
                if lvl >= 1.0:
                    lvl = 1.0
                    attacking = False
            else:
                lvl = 0.55 + (lvl - 0.55) * dec
        else:
            lvl *= rel
            attacking = False
        freq[i] = cur
        amp[i] = lvl * (1.0 + 0.4 * acc)
        fenv[i] = fe
        fe *= fdec[i]
    return freq, amp, fenv


@njit(cache=True)
def tape_delay(inL, inR, dly, fb, lp_a, hp_a, drive):
    n = inL.shape[0]
    mx = 0.0
    for i in range(n):
        if dly[i] > mx:
            mx = dly[i]
    size = 1
    while size < mx + 8:
        size *= 2
    mask = size - 1
    bL = np.zeros(size)
    bR = np.zeros(size)
    oL = np.empty(n)
    oR = np.empty(n)
    lpL = 0.0
    lpR = 0.0
    hpL = 0.0
    hpR = 0.0
    wp = 0
    for i in range(n):
        rp = wp - dly[i]
        if rp < 0:
            rp += size
        i0 = int(rp)
        fr = rp - i0
        i1 = (i0 + 1) & mask
        i0 = i0 & mask
        yL = bL[i0] + fr * (bL[i1] - bL[i0])
        yR = bR[i0] + fr * (bR[i1] - bR[i0])
        lpL += lp_a * (yL - lpL)
        hpL += hp_a * (lpL - hpL)
        fL = lpL - hpL
        lpR += lp_a * (yR - lpR)
        hpR += hp_a * (lpR - hpR)
        fR = lpR - hpR
        oL[i] = fL
        oR[i] = fR
        bL[wp] = inL[i] + fb[i] * np.tanh(drive * fR) / drive
        bR[wp] = inR[i] + fb[i] * np.tanh(drive * fL) / drive
        wp = (wp + 1) & mask
    return oL, oR


@njit(cache=True)
def limiter(x, thresh, att_coef, rel_coef):
    n = x.shape[1]
    env = np.ones(n)
    cur = 1.0
    for i in range(n):
        pk = max(abs(x[0, i]), abs(x[1, i]))
        tgt = thresh / pk if pk > thresh else 1.0
        if tgt < cur:
            cur = tgt
        else:
            cur += (tgt - cur) * rel_coef
        env[i] = cur
    cur = 1.0
    for i in range(n - 1, -1, -1):
        tgt = env[i]
        if tgt < cur:
            cur = tgt
        else:
            cur += (tgt - cur) * att_coef
        env[i] = cur
    out = np.empty_like(x)
    for i in range(n):
        out[0, i] = x[0, i] * env[i]
        out[1, i] = x[1, i] * env[i]
    return out, env


def make_ir(length, bands, seed, predelay=0.02, hp_fc=180.0, onset=0.012):
    r = np.random.default_rng(seed)
    n = int(length * SR)
    t = np.arange(n) / SR
    ir = np.zeros((2, n))
    for lo, hi, t60, g in bands:
        nz = r.standard_normal((2, n))
        b = lp(nz, hi) if lo is None else hp(nz, lo) if hi is None else bp(nz, lo, hi)
        ir += g * b * 10 ** (-3 * t / t60)
    ir *= (1 - np.exp(-t / onset))
    if hp_fc:
        ir = hp(ir, hp_fc)
    ir *= np.minimum(1, (length - t) / 0.2)
    ir = np.concatenate([np.zeros((2, int(predelay * SR))), ir], axis=1)
    ir /= np.sqrt((ir ** 2).sum(axis=1, keepdims=True))
    return ir


def reverb(send, ir):
    return np.stack([signal.fftconvolve(send[0], ir[0])[:N], signal.fftconvolve(send[1], ir[1])[:N]])


@njit(cache=True)
def saw_var_ph(freq, ph0, sr):
    n = freq.shape[0]
    out = np.empty(n)
    ph = ph0 % 1.0
    for i in range(n):
        dt = freq[i] / sr
        v = 2.0 * ph - 1.0
        if ph < dt:
            t = ph / dt
            v -= t + t - t * t - 1.0
        elif ph > 1.0 - dt:
            t = (ph - 1.0) / dt
            v -= t * t + t + t + 1.0
        out[i] = v
        ph += dt
        if ph >= 1.0:
            ph -= 1.0
    return out




# ---------------------------------------------------------------- the Moog-shaped parts
@njit(cache=True)
def _blep(t, dt):
    if t < dt:
        t = t / dt
        return t + t - t * t - 1.0
    if t > 1.0 - dt:
        t = (t - 1.0) / dt
        return t * t + t + t + 1.0
    return 0.0


@njit(cache=True)
def osc_moog(freq, pw, ph0, sr):
    """A saw and a pulse off one phase, PolyBLEP, pitch and pulse width per sample."""
    n = freq.shape[0]
    saw = np.empty(n)
    pul = np.empty(n)
    ph = ph0 % 1.0
    for i in range(n):
        dt = freq[i] / sr
        saw[i] = 2.0 * ph - 1.0 - _blep(ph, dt)
        w = pw[i]
        p = 1.0 if ph < w else -1.0
        p += _blep(ph, dt)
        ph2 = ph - w
        if ph2 < 0.0:
            ph2 += 1.0
        p -= _blep(ph2, dt)
        pul[i] = p
        ph += dt
        if ph >= 1.0:
            ph -= 1.0
    return saw, pul


@njit(cache=True)
def ladder(x, fc, res, drive, sr):
    """Four one-pole lowpasses in a feedback loop (24 dB an octave), zero-delay form, with a tanh at the input."""
    n = x.shape[0]
    y = np.empty(n)
    s1 = 0.0
    s2 = 0.0
    s3 = 0.0
    s4 = 0.0
    for i in range(n):
        f = fc[i]
        if f > 0.45 * sr:
            f = 0.45 * sr
        g = math.tan(math.pi * f / sr)
        G = g / (1.0 + g)
        b = 1.0 - G
        k = res[i]
        S = (G * G * G * s1 + G * G * s2 + G * s3 + s4) * b
        u = (x[i] * (1.0 + 0.5 * k) - k * S) / (1.0 + k * G * G * G * G)
        u = math.tanh(drive * u) / drive
        v = (u - s1) * G
        y1 = v + s1
        s1 = y1 + v
        v = (y1 - s2) * G
        y2 = v + s2
        s2 = y2 + v
        v = (y2 - s3) * G
        y3 = v + s3
        s3 = y3 + v
        v = (y3 - s4) * G
        y4 = v + s4
        s4 = y4 + v
        y[i] = y4
    return y


@njit(cache=True)
def seq_ctrl(n, starts, midis, lens, accs, slides, vels, att_s, adec, sus, rel, fdec, gl, f0, sr):
    """Pitch, amp and filter envelope for one mono voice. Decays, sustain, release and glide are per sample,
    so the player can turn them while the sequence runs. A slid note does not retrigger."""
    freq = np.empty(n)
    amp = np.empty(n)
    fenv = np.empty(n)
    nn = starts.shape[0]
    k = 0
    cur = f0
    tgt = f0
    gate = False
    gate_end = -1
    lvl = 0.0
    attacking = False
    fe = 0.0
    acc = 0.0
    vel = 1.0
    att = 1.0 / (att_s * sr)
    for i in range(n):
        while k < nn and starts[k] <= i:
            tgt = 440.0 * 2.0 ** ((midis[k] - 69.0) / 12.0)
            if not (slides[k] == 1 and gate):
                attacking = True
                fe = 1.0 + 0.4 * accs[k]
                vel = vels[k]
            acc = accs[k]
            gate = True
            gate_end = starts[k] + lens[k]
            k += 1
        if gate and i >= gate_end:
            gate = False
        cur = tgt + (cur - tgt) * gl[i]
        if gate:
            if attacking:
                lvl += att
                if lvl >= 1.0:
                    lvl = 1.0
                    attacking = False
            else:
                lvl = sus[i] + (lvl - sus[i]) * adec[i]
        else:
            lvl *= rel[i]
            attacking = False
        freq[i] = cur
        amp[i] = lvl * vel * (1.0 + 0.3 * acc)
        fenv[i] = fe
        fe *= fdec[i]
    return freq, amp, fenv


def coef(tau):
    """Per-sample decay coefficient for a time constant in seconds (array or number). 0 s means instant."""
    tau = np.asarray(tau, dtype=np.float64)
    return np.where(tau > 1e-5, np.exp(-1.0 / (np.maximum(tau, 1e-5) * SR)), 0.0)


DRIFT_LOG = {}


def drift(cents, seed, rate=0.25):
    """An oscillator that never quite sits still: a slow random walk in pitch, as a frequency ratio."""
    r = np.random.default_rng(seed)
    m = N // 441 + 8
    x = signal.sosfilt(signal.butter(2, rate, 'lp', fs=100.0, output='sos'), r.standard_normal(m))
    x /= np.std(x[200:]) + 1e-12
    DRIFT_LOG[str(seed)] = {'cents': float(cents), 'rate_hz': 100.0, 'unit_curve': [round(float(v), 7) for v in x]}
    return 2.0 ** (np.interp(np.arange(N) / 441.0, np.arange(m), x) * cents / 1200.0)


# ---------------------------------------------------------------- drums
def make_kick():
    d = 0.6
    n = int(d * SR)
    t = np.arange(n) / SR
    f = mtof(30) + 95 * np.exp(-t / 0.028) + 260 * np.exp(-t / 0.005)      # settles on F#1, 46 Hz: the fifth under the bass
    body = np.sin(2 * np.pi * np.cumsum(f) / SR)
    env = np.minimum(t / 0.001, 1) * np.exp(-np.maximum(t - 0.03, 0) / 0.13)
    click = lp(rng.standard_normal(n), 3500) * np.exp(-t / 0.0012) * 0.3
    x = lp(np.tanh(1.9 * body * env) + click, 7000, 1)
    return peak_norm(x * np.clip((d - t) / 0.06, 0, 1))


def make_clap(seed):
    r = np.random.default_rng(seed)
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    nz = bp(r.standard_normal(n), 750, 3600)
    env = np.zeros(n)
    for d in (0.0, 0.0085, 0.0175):
        i = int(d * SR)
        env[i:] = np.maximum(env[i:], 0.75 * np.exp(-t[:n - i] / 0.0045))
    i = int(0.027 * SR)
    env[i:] = np.maximum(env[i:], np.exp(-t[:n - i] / 0.085))
    return peak_norm(nz * env * np.clip((0.45 - t) / 0.05, 0, 1))


def make_ohh(seed):
    r = np.random.default_rng(seed)
    n = int(0.3 * SR)
    t = np.arange(n) / SR
    x = np.zeros(n)
    for f in [263.0, 400.5, 421.0, 543.0, 677.0, 812.0]:
        ph = r.random()
        x += saw_blep(n, f, ph, SR) - saw_blep(n, f, ph + 0.5, SR)
    x = x / 6 * 0.7 + r.standard_normal(n) * 0.4
    return peak_norm(hp(x, 6800, 4) * (1 - np.exp(-t / 0.0015)) * np.exp(-t / 0.055) * np.clip((0.3 - t) / 0.04, 0, 1))


def make_tom(m):
    n = int(0.3 * SR)
    t = np.arange(n) / SR
    f = mtof(m) * (1 + 0.6 * np.exp(-t / 0.012))
    x = np.sin(2 * np.pi * np.cumsum(f) / SR + 0.8 * np.exp(-t / 0.02) * np.sin(2 * np.pi * np.cumsum(f) * 1.6 / SR)) * np.minimum(t / 0.001, 1) * np.exp(-t / 0.07)
    return peak_norm(x * np.clip((0.3 - t) / 0.05, 0, 1))


def freq_shift(x, fs):
    """Single-sideband shift: every partial moves by the same number of Hz, up on the left and down on the right."""
    an = signal.hilbert(x, N=scipy.fft.next_fast_len(len(x)))[:len(x)]
    ph = np.exp(1j * 2 * np.pi * np.cumsum(fs) / SR)
    return (an * ph).real, (an * np.conj(ph)).real


# ---------------------------------------------------------------- the score
# The carrier: two bars of sixteenths. B1, with the octave above it, and A, D, F# and E in passing.
BASS = [35, 35, 47, 35, 35, 35, 38, 35, 35, 47, 35, 35, 33, 35, 47, 35,
        35, 35, 47, 35, 35, 42, 38, 35, 35, 47, 35, 33, 35, 38, 42, 40]
# The accent runs in its own cycle: (first bar, cycle in sixteenths, which step of the cycle is lit). The count restarts at each line.
ACCENTS = [(0, 4, 2), (16, 3, 0), (48, 5, 0), (56, 3, 0), (88, 5, 0), (104, 4, 2)]


def accent_at(bar, st):
    b0, cyc, ph = [a for a in ACCENTS if a[0] <= bar][-1]
    return 1 if ((bar - b0) * 16 + st) % cyc == ph else 0


def bass_note(bar, st):
    m = BASS[(bar % 2) * 16 + st]
    if bar < 8 and m != 35:
        return 35                           # the first eight bars are the root alone
    if bar < 16 and m not in (35, 47):
        return 35                           # then the octave; the passing notes come at bar 16
    return m


def pad_notes(bar):
    A, B = (61, 62, 69), (61, 62, 67)       # C# D A, and C# D G: one finger
    return B if (bar >= 40 and bar < 112 and bar % 8 >= 6) else A


PHRASE_1 = [(0, 4, 78, 10), (1, 0, 76, 6), (1, 8, 74, 8), (2, 2, 73, 12), (3, 0, 71, 6), (3, 6, 73, 8)]
PHRASE_2 = [(0, 4, 78, 10), (1, 0, 81, 8), (1, 10, 78, 6), (2, 0, 76, 6), (2, 6, 74, 10), (3, 2, 73, 12)]
VISITS = [(72, PHRASE_1), (76, PHRASE_2), (80, PHRASE_1), (84, PHRASE_2), (104, PHRASE_1), (108, PHRASE_2)]


def has_kick(bar, beat):
    if bar < 4 or 56 <= bar < 64 or 96 <= bar < 100 or bar >= 124:
        return False
    return not (bar in (55, 95) and beat >= 2)


def has_clap(bar):
    return (24 <= bar < 55) or (64 <= bar < 95) or (100 <= bar < 112)


# ================================================================ render
def render(stems_dir=None):
    print('samples', N, 'seconds', round(N / SR, 2))
    f32 = np.float32
    G, EV = {}, {k: [] for k in ('kick', 'bass', 'lead', 'clap', 'hat', 'ohat', 'tom', 'pad')}
    parts_dir = os.path.join(os.path.dirname(os.path.abspath(stems_dir)), 'parts') if stems_dir else None
    if parts_dir:
        os.makedirs(parts_dir, exist_ok=True)

    def dump(name, x):
        if parts_dir:
            x = np.asarray(x, dtype=np.float32)
            wavfile.write(os.path.join(parts_dir, name + '.wav'), SR, x.T if x.ndim == 2 else x)

    def gset(name, value):
        G[name] = float(value)
        return value

    kick1 = make_kick()
    kick = np.zeros(N)
    kpos = []
    for bar in range(NBARS):
        for beat in range(4):
            if has_kick(bar, beat):
                p = pos(bar, beat * 4)
                add(kick, kick1, p)
                kpos.append(p)
    EV['kick'] = [[int(p)] for p in kpos]
    dump('kick', kick1)
    tt = np.arange(int(0.45 * SR)) / SR
    tpl = np.minimum(tt / 0.002, 1) * np.exp(-np.maximum(tt - 0.035, 0) / 0.1)
    sc = np.zeros(N)
    for p in kpos:
        seg = sc[p:p + len(tpl)]
        np.maximum(seg, tpl[:len(seg)], out=seg)

    def duck(depth):
        return 1.0 - depth * sc

    # ---- the bass
    starts, midis, lens, accs, slides, vels = [], [], [], [], [], []
    gate_len = auto([(0, 0.55), (32, 0.6), (56, 0.85), (64, 0.6), (96, 0.85), (100, 0.6)])
    B_VEL = [0.8, 0.86, 0.96, 0.86]
    for bar in range(NBARS):
        for st in range(16):
            p = pos(bar, st)
            m = bass_note(bar, st)
            starts.append(p)
            midis.append(m)
            lens.append(int(gate_len[p] * STEP * SR))
            accs.append(accent_at(bar, st))
            slides.append(1 if (st == 0 and bar > 0 and bass_note(bar - 1, 15) == 40) else 0)      # the E slides down into the B
            vels.append(B_VEL[st % 4] * (1 + 0.04 * rng.standard_normal()))
    starts = np.array(starts, dtype=np.int64)
    lens = np.array(lens, dtype=np.int64)
    slides_a = np.array(slides, dtype=np.int64)
    b_gl = np.full(N, float(coef(0.004)))
    for i in np.nonzero(slides_a)[0]:
        lens[i - 1] = starts[i] - starts[i - 1] + 64
        b_gl[starts[i]:starts[i] + lens[i]] = float(coef(0.03))
    EV['bass'] = [[int(a_), int(b_), int(c_), int(d_), int(e_), float(f_)] for a_, b_, c_, d_, e_, f_ in zip(starts, midis, lens, accs, slides_a, vels)]
    b_adec = coef(auto([(0, 0.12), (56, 0.24), (64, 0.13), (96, 0.22), (100, 0.13)]))
    b_sus = auto([(0, 0.3), (55, 0.3), (56, 0.5), (63, 0.5), (64, 0.3), (95, 0.3), (96, 0.45), (99, 0.45), (100, 0.3)])
    b_fdec = coef(auto([(0, 0.06), (32, 0.075), (56, 0.16), (64, 0.07), (88, 0.10), (104, 0.07)]))
    freq, amp, fenv = seq_ctrl(N, starts, np.array(midis, dtype=np.float64), lens, np.array(accs, dtype=np.float64), slides_a, np.array(vels), 0.0012,
                               b_adec, b_sus, coef(np.full(N, 0.02)), b_fdec, b_gl, mtof(35), SR)
    freq *= drift(2.5, 21)
    pw = 0.5 + 0.14 * np.sin(2 * np.pi * TBAR / 11.0)
    saw1, pul1 = osc_moog(freq, pw, 0.0, SR)
    saw2, _ = osc_moog(freq * 2 ** (6 / 1200) * drift(2.5, 22), pw, 0.4, SR)
    b_base = np.exp(auto([(0, np.log(85)), (8, np.log(110)), (16, np.log(170)), (32, np.log(250)), (48, np.log(330)), (56, np.log(260)), (60, np.log(700)),
                          (63.5, np.log(1300)), (64, np.log(300)), (72, np.log(280)), (88, np.log(480)), (96, np.log(380)), (99, np.log(900)), (100, np.log(330)),
                          (112, np.log(220)), (120, np.log(140)), (127, np.log(85))]))
    b_amt = auto([(0, 1.6), (16, 2.2), (56, 1.4), (64, 2.5), (88, 2.9), (104, 2.3), (124, 1.5)])
    b_res = auto([(0, 0.5), (32, 0.9), (56, 1.6), (63, 2.0), (64, 1.0), (88, 1.5), (104, 0.9), (127, 0.5)])
    b_fc = np.clip(b_base * 2 ** (b_amt * fenv) * drift(20.0, 23, rate=0.6), 45, 3800)
    y = ladder((saw1 * 0.6 + pul1 * 0.45 + saw2 * 0.4) * 0.5, b_fc, b_res, 1.6, SR)
    bass = hp(np.tanh(1.6 * y * amp * 3.2) / 1.6, 30)
    del saw1, pul1, saw2, pw, y, freq, amp, fenv, b_fc, b_base, b_amt, b_res, b_gl
    print('  bass notes', len(starts), 'accents', int(sum(accs)))

    # ---- the shadow: a second, darker voice on the same B, through a frequency shifter. Up on the left, down on the right.
    fsh = mtof(35) * drift(4.0, 41)
    s_saw, _ = osc_moog(fsh, np.full(N, 0.5), 0.2, SR)
    _, s_pul = osc_moog(fsh * 2.0, 0.5 + 0.3 * np.sin(2 * np.pi * TBAR / 3.0), 0.6, SR)
    s_fc = auto([(32, 300), (48, 420), (56, 500), (63, 900), (64, 420), (88, 700), (96, 850), (104, 480), (120, 280)]) * (1 + 0.45 * np.sin(2 * np.pi * TBAR / 2.5 + 0.4))
    src = ladder((s_saw * 0.6 + s_pul * 0.5) * 0.4, s_fc, np.full(N, 2.3), 1.5, SR)
    shift = np.exp(auto([(32, np.log(0.4)), (48, np.log(2.0)), (56, np.log(6.0)), (63, np.log(24.0)), (64, np.log(1.5)), (88, np.log(9.0)), (96, np.log(28.0)), (100, np.log(3.0)), (120, np.log(0.5))]))
    sl_, sr_ = freq_shift(src, shift)
    shadow = np.stack([sl_, sr_]) * auto([(0, 0.0), (32, 0.0), (36, 0.7), (55, 0.8), (56, 1.0), (63.5, 1.0), (64, 0.7), (95.5, 0.8), (96, 1.0), (100, 0.75), (116, 0.5), (122, 0.0)])
    shadow = lp(hp(shadow, 120), 3200).astype(f32)
    dump('shadow_bus', shadow)
    del s_saw, s_pul, src, sl_, sr_, s_fc, shift, fsh

    # ---- the lead, played by hand
    ev = sorted(((b0 + pb) * 16 + st, m, ln) for b0, phrase in VISITS for pb, st, m, ln in phrase)
    vs, vm, vl, vsl, vv = [], [], [], [], []
    for i, (gs, m, ln) in enumerate(ev):
        legato = i > 0 and ev[i - 1][0] + ev[i - 1][2] >= gs
        vs.append(int((gs * STEP + rng.normal(0, 0.012)) * SR))
        vm.append(m)
        vl.append(int(ln * STEP * SR * (1.02 if legato else 0.94)))
        vsl.append(1 if legato else 0)
        vv.append(1.0 + 0.07 * rng.standard_normal())
    vs = np.array(vs, dtype=np.int64)
    vl = np.array(vl, dtype=np.int64)
    for i in range(len(vs) - 1):
        if vsl[i + 1] == 1:
            vl[i] = max(vl[i], vs[i + 1] - vs[i] + 64)
    EV['lead'] = [[int(a_), int(b_), int(c_), int(d_), float(e_)] for a_, b_, c_, d_, e_ in zip(vs, vm, vl, vsl, vv)]
    freq, amp, fenv = seq_ctrl(N, vs, np.array(vm, dtype=np.float64), vl, np.zeros(len(vs)), np.array(vsl, dtype=np.int64), np.array(vv), 0.02,
                               coef(np.full(N, 1.0)), np.full(N, 0.75), coef(np.full(N, 0.25)), coef(np.full(N, 0.7)), coef(np.full(N, 0.08)), mtof(78), SR)
    held = signal.lfilter([onepole(1.0)], [1, onepole(1.0) - 1], (amp > 0.5).astype(float))
    freq = freq * (1 + 0.0045 * np.sin(2 * np.pi * 4.9 * TSEC) * np.clip(held * 1.5 - 0.35, 0, 1)) * drift(1.5, 31)
    pwl = 0.36 + 0.08 * np.sin(2 * np.pi * 0.23 * TSEC)
    s_a, p_a = osc_moog(freq * 2 ** (3 / 1200), pwl, 0.1, SR)
    _, p_b = osc_moog(freq * 2 ** (-4 / 1200), pwl, 0.55, SR)
    v_base = auto([(72, 800), (80, 1050), (88, 1150), (104, 750), (112, 700)])
    v_fc = np.clip(v_base * 2 ** (1.0 * fenv) * (freq / mtof(78)) ** 0.5, 80, 8000)
    y = ladder((s_a * 0.35 + p_a * 0.5 + p_b * 0.45) * 0.5, v_fc, np.full(N, 1.3), 1.3, SR)
    lead = hp(np.tanh(1.3 * y * amp * 1.4) / 1.3, 200) * auto([(72, 0.85), (76, 1.0), (88, 1.0), (104, 0.75), (112, 0.75)])
    del s_a, p_a, p_b, pwl, y, freq, amp, fenv, v_fc, held
    print('  lead notes', len(vs))

    # ---- drums
    claps1 = [make_clap(s) for s in (5, 6)]
    ohh = [make_ohh(s) for s in (21, 22)]
    toms = {m: make_tom(m) for m in (47, 54)}
    for i_, x_ in enumerate(claps1):
        dump('clap_%d' % i_, x_)
    for i_, x_ in enumerate(ohh):
        dump('hat_open_%d' % i_, x_)
    dump('tom_47', toms[47])
    dump('tom_54', toms[54])
    claps = np.zeros((2, N), dtype=f32)
    hats = np.zeros((2, N), dtype=f32)
    ohats = np.zeros((2, N), dtype=f32)
    perc = np.zeros((2, N), dtype=f32)
    nzbuf = hp(lp(np.random.default_rng(78).standard_normal(6 * SR), 11500), 6200, 4)
    nzbuf /= np.max(np.abs(nzbuf))
    dump('hat_noise', nzbuf)
    H_VEL = [0.9, 0.3, 0.55, 0.34, 1.0, 0.3, 0.6, 0.5, 0.8, 0.34, 0.5]          # eleven steps: it never sits on the bar the same way twice
    hat_lvl = auto([(8, 0.0), (12, 0.6), (24, 0.85), (32, 1.0), (55, 1.0), (56, 0.0), (63.9, 0.0), (64, 1.0), (95.9, 0.9), (96, 0.0), (99.9, 0.0), (100, 0.9), (116, 0.8), (120, 0.0)])
    hat_dec = auto([(8, 0.012), (32, 0.018), (48, 0.026), (64, 0.018), (88, 0.03), (104, 0.02), (120, 0.012)])
    for bar in range(NBARS):
        if has_clap(bar):
            for st in (4, 12):
                k_ = int(rng.integers(2))
                p_ = pos(bar, st, jitter=0.0012)
                g_ = 0.9 * (1 + 0.05 * rng.standard_normal())
                add(claps, pan(claps1[k_], 0.05), p_, g_)
                EV['clap'].append([int(p_), float(g_), k_])
        for st in range(16):
            p = pos(bar, st, swing=SW, jitter=0.0008)
            if hat_lvl[p] > 0:
                v = H_VEL[(bar * 16 + st) % 11]
                dec = hat_dec[p] * (1 + 0.5 * math.sin(2 * math.pi * (bar * 16 + st) / 52.0))
                if bar % 8 == 7 and st >= 12:
                    dec *= 1.6 + 0.5 * (st - 12)
                    v = max(v, 0.6 + 0.1 * (st - 12))
                L = int(min(0.4, 7 * dec) * SR)
                o = int(rng.integers(0, len(nzbuf) - L))
                th = np.arange(L) / SR
                pn_ = 0.18 + 0.1 * math.sin(st * 1.9)
                g_ = v * (1 + 0.1 * rng.standard_normal()) * hat_lvl[p]
                add(hats, pan(nzbuf[o:o + L] * (1 - np.exp(-th / 0.0005)) * np.exp(-th / dec), pn_), p, g_)
                EV['hat'].append([int(p), float(g_), float(dec), int(L), int(o), pn_])
            if st % 4 == 2 and ((32 <= bar < 56) or (64 <= bar < 96) or (100 <= bar < 112)):
                k_ = int(rng.integers(2))
                p_ = pos(bar, st, jitter=0.001)
                g_ = 0.8 * (1 + 0.06 * rng.standard_normal())
                add(ohats, pan(ohh[k_], -0.2), p_, g_)
                EV['ohat'].append([int(p_), float(g_), k_])
        if ((40 <= bar < 56) or (64 <= bar < 96) or (100 <= bar < 116)) and bar % 2 == 1:
            p_ = pos(bar, 7, jitter=0.0015)
            add(perc, pan(toms[47], -0.3), p_, 0.8)
            EV['tom'].append([int(p_), 47, 0.8, -0.3])
            p_ = pos(bar, 13, jitter=0.0015)
            add(perc, pan(toms[54], 0.3), p_, 0.6)
            EV['tom'].append([int(p_), 54, 0.6, 0.3])
    hats = lp(hats, 11000).astype(f32)
    ohats = lp(ohats, 10500).astype(f32)

    # ---- pad
    pad = np.zeros((2, N))
    bars_i = np.minimum(NBARS - 1, TBAR.astype(np.int64))
    sm = onepole(1.0 / 0.9)
    for m in (61, 62, 67, 69):
        on = np.array([1.0 if m in pad_notes(b) else 0.0 for b in range(NBARS)])[bars_i]
        g = signal.lfilter([sm], [1, sm - 1], signal.lfilter([sm], [1, sm - 1], on))
        f = mtof(m)
        ph_ = [float(rng.random()) for _ in range(6)]
        EV['pad'].append([m] + ph_)
        pad[0] += g * (saw_blep(N, f * 2 ** (-9 / 1200), ph_[0], SR) + saw_blep(N, f * 2 ** (4 / 1200), ph_[1], SR) + 0.5 * saw_blep(N, 2 * f * 2 ** (3 / 1200), ph_[2], SR))
        pad[1] += g * (saw_blep(N, f * 2 ** (9 / 1200), ph_[3], SR) + saw_blep(N, f * 2 ** (-5 / 1200), ph_[4], SR) + 0.5 * saw_blep(N, 2 * f * 2 ** (-4 / 1200), ph_[5], SR))
    pad_fc = auto([(0, 400), (24, 500), (40, 700), (56, 1200), (62, 1600), (64, 800), (88, 1250), (96, 1450), (104, 900), (120, 550), (128, 380)]) * (1 + 0.18 * np.sin(2 * np.pi * TBAR / 5.0 + 0.7))
    pad = np.stack([ladder(pad[0] * 0.2, pad_fc, np.full(N, 0.4), 1.0, SR), ladder(pad[1] * 0.2, pad_fc * 1.06, np.full(N, 0.4), 1.0, SR)])
    pad *= auto([(0, 0.0), (22, 0.0), (28, 0.45), (40, 0.6), (55, 0.7), (56, 1.0), (63.5, 1.0), (64, 0.6), (95.5, 0.7), (96, 1.0), (99.5, 1.0), (100, 0.65), (120, 0.8), (126, 0.7), (NBARS + 3.5, 0.0)])
    pad = hp(pad, 200).astype(f32)
    del pad_fc

    pink = signal.lfilter([0.049922035, -0.095993537, 0.050612699, -0.004408786], [1, -2.494956002, 2.017265875, -0.522189400], rng.standard_normal((2, N)), axis=-1)
    bed = hp(pink, 500)
    dump('noise_bed_first_32s', bed[:, :32 * SR])
    noise = (bed * auto([(0, 0.0), (1, 1.0), (8, 0.8), (56, 1.0), (64, 0.6), (96, 0.9), (100, 0.6), (124, 1.0), (NBARS + 3.5, 0.0)])).astype(f32)
    del pink, bed

    # ---- stems at mix level
    S = {}
    S['kick'] = np.asarray(pan(kick * 0.62, 0.0), dtype=f32)
    B_G = gset('bass', gain_for(bass, -14.5))
    S['bass'] = np.asarray(pan(bass * B_G * duck(0.5), 0.0), dtype=f32)
    S['shadow'] = np.asarray(shadow * gset('shadow', gain_for(shadow, -25.0)) * duck(0.6), dtype=f32)
    V_G = gset('lead', gain_for(lead, -21.5))
    S['lead'] = np.asarray(pan(lead * V_G * duck(0.1), -0.08), dtype=f32)
    S['clap'] = np.asarray(claps * gset('clap', peak_gain(claps, -12.0)), dtype=f32)
    S['hats'] = np.asarray(hats * gset('hats', peak_gain(hats, -10.5)), dtype=f32)
    S['ohat'] = np.asarray(ohats * gset('ohat', peak_gain(ohats, -13.5)), dtype=f32)
    S['toms'] = np.asarray(perc * gset('toms', peak_gain(perc, -15.0)), dtype=f32)
    S['pad'] = np.asarray(pad * gset('pad', gain_for(pad, -27.0)) * duck(0.5), dtype=f32)
    S['noise'] = np.asarray(noise * gset('noise', gain_for(noise, -50.0)), dtype=f32)
    del kick, shadow, claps, hats, ohats, perc, pad, noise

    # ---- the bass's echo: only its top, so the wandering accent leaves a trail from side to side
    e_send = auto([(0, 0.0), (12, 0.0), (16, 0.5), (32, 0.6), (55, 0.7), (56, 0.8), (63.5, 0.8), (64, 0.6), (95.5, 0.7), (96, 0.8), (99.5, 0.8), (100, 0.6), (120, 0.8), (127, 1.0)])
    fb = auto([(0, 0.45), (54.5, 0.45), (55.5, 0.74), (57, 0.6), (63.5, 0.6), (64, 0.42), (94.5, 0.42), (95.5, 0.74), (97, 0.58), (100, 0.42), (120, 0.5), (126, 0.66), (132, 0.6)])
    e_in = hp(bass, 420, 2) * B_G * 1.0 * e_send
    side = np.convolve(np.floor(TBAR * 8) % 2, np.ones(400) / 400, mode='same')
    dly = 3 * STEP * SR * (1 + 0.0011 * np.sin(2 * np.pi * 0.17 * TSEC) + 0.0003 * np.sin(2 * np.pi * 2.3 * TSEC))
    eL, eR = tape_delay(e_in * (1 - side), e_in * side, dly, fb, onepole(2600), onepole(420), 1.4)
    S['echo'] = np.asarray(np.stack([eL, eR]) * 0.85 * duck(0.3), dtype=f32)
    del eL, eR, e_in, side, dly, e_send, fb, bass
    v_in = lead * V_G * 0.5
    eL, eR = tape_delay(v_in * 0.0, v_in, 6 * STEP * SR * (1 + 0.0015 * np.sin(2 * np.pi * 0.13 * TSEC)), np.full(N, 0.46), onepole(2400), onepole(350), 1.3)
    S['lead_echo'] = np.asarray(np.stack([eL, eR]) * 0.8 * duck(0.2), dtype=f32)
    del eL, eR, v_in, lead

    hall_ir = make_ir(6.5, [(None, 250, 3.2, 0.45), (250, 1000, 5.2, 1.0), (1000, 3500, 3.6, 0.7), (3500, None, 1.6, 0.35)], seed=81, predelay=0.04, hp_fc=260)
    room_ir = make_ir(0.8, [(None, 500, 0.5, 0.6), (500, 3000, 0.65, 1.0), (3000, None, 0.45, 0.8)], seed=82, predelay=0.005, hp_fc=400, onset=0.004)
    dump('ir_hall', hall_ir)
    dump('ir_room', room_ir)
    h_bass = auto([(0, 0.5), (8, 0.3), (16, 0.12), (55, 0.12), (56, 0.5), (63.5, 0.55), (64, 0.1), (95.5, 0.12), (96, 0.5), (99.5, 0.5), (100, 0.1), (120, 0.25), (124, 0.5), (128, 0.6)]).astype(f32)
    hall_send = (S['bass'] * h_bass + S['echo'] * f32(0.6) + S['shadow'] * f32(0.5) + S['lead'] * f32(0.7) + S['lead_echo'] * f32(0.6) + S['pad'] * f32(0.9)
                 + S['clap'] * f32(0.35) + S['toms'] * f32(0.4) + S['ohat'] * f32(0.1))
    hall = reverb(hp(hall_send.astype(np.float64), 180), hall_ir)
    del hall_send, h_bass
    S['hall'] = np.asarray(hall * gset('hall_return', gain_for(hall, -25.0)) * duck(0.4), dtype=f32)
    del hall
    room_send = S['clap'] * f32(0.7) + S['hats'] * f32(0.35) + S['ohat'] * f32(0.3) + S['toms'] * f32(0.4)
    room = reverb(room_send.astype(np.float64), room_ir)
    del room_send
    S['room'] = np.asarray(room * gset('room_return', gain_for(room, -36.0)), dtype=f32)
    del room

    mix = np.zeros((2, N))
    for name, s in S.items():
        mix += s
        print(f'  {name:9s} peak {db(np.max(np.abs(s))):6.1f} dB   loud-rms {db(rms_pct(s)):6.1f} dB')

    mix = hp(mix, 25)
    fade = np.ones(N)
    f0 = pos(NBARS)
    fade[f0:] = 0.5 * (1 + np.cos(np.pi * np.arange(N - f0) / (N - f0)))
    mix *= fade
    pre = float(os.environ.get('PREGAIN', '1.25'))
    mix = np.tanh(mix * pre * 1.1) / 1.1
    mix, genv = limiter(np.ascontiguousarray(mix), 0.70, 1 - np.exp(-1 / (0.004 * SR)), 1 - np.exp(-1 / (0.12 * SR)))
    print('limiter: max reduction %.1f dB, active %.1f%% of the time' % (-db(genv.min()), 100 * (genv < 0.99).mean()))
    mix *= gset('final_scale', 0.89 / np.max(np.abs(mix)))
    G.update(kick=0.62, echo_return=0.85, lead_echo_return=0.8, master_pregain=pre * 1.1, master_post=1 / 1.1, limiter_threshold=0.70)
    if parts_dir:
        json.dump(G, open(os.path.join(parts_dir, 'gains.json'), 'w'), indent=1)
        json.dump({'sr': SR, 'tempo': BPM, 'bars': NBARS, 'tail': TAIL, 'events': EV}, open(os.path.join(parts_dir, 'events.json'), 'w'))
        json.dump({'note': 'value at sample n = 2 ** (interp(n / 441, unit_curve) * cents / 1200). Keys are the seeds: 21 bass pitch, 22 bass osc 2, 23 bass cutoff, 41 shadow pitch, 31 lead pitch.', 'curves': DRIFT_LOG}, open(os.path.join(parts_dir, 'drift.json'), 'w'))
    if stems_dir:
        os.makedirs(stems_dir, exist_ok=True)
        for name, s in S.items():
            wavfile.write(os.path.join(stems_dir, name + '.wav'), SR, (np.clip(s * fade, -1, 1).T * 32767).astype(np.int16))
    return mix


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else 'irrlicht.wav'
    mix = render(sys.argv[2] if len(sys.argv) > 2 else None)
    dither = (rng.random(mix.shape) - rng.random(mix.shape)) / 32768.0
    wavfile.write(out, SR, np.clip((mix + dither).T * 32767, -32768, 32767).astype(np.int16))
    print('wrote', out)
