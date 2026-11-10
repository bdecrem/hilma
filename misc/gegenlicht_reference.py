#!/usr/bin/env python3
"""Gegenlicht: techno in A minor, 128 BPM, 128 bars and a 7 s tail (4:07). The reference render for Takt.
One acid line, a kick and its rumble, three clocks (4, 3 and 5 sixteenths) running against each other.

    python3 misc/gegenlicht_reference.py out.wav [stems_dir]

Needs numpy, scipy, numba. Renders at 44.1 kHz; out.wav is misc/gegenlicht/reference.flac bit for bit.
With a stems dir it also writes the pre-master stems and, next to them, parts/: every one-shot, both
reverb impulses and the rumble's, the risers, 32 s of the noise bed, gains.json (every auto-levelled
gain, resolved) and events.json (every event as it was placed: its sample, its gain after the
humanizing, its round robin, its pan; the pad's start phases). The log draws nothing from the random
stream. Notes for the port: misc/GEGENLICHT.md. MIDI numbers here are the sounding pitches."""
import sys, os, math, json
import numpy as np
from scipy import signal
from scipy.io import wavfile
from numba import njit

SR = 44100
BPM = 128.0
BEAT = 60.0 / BPM
STEP = BEAT / 4
BAR = BEAT * 4
NBARS = 128
TAIL = 7.0
N = int(round((NBARS * BAR + TAIL) * SR))
SW = 0.06
rng = np.random.default_rng(808)
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


# ---------------------------------------------------------------- one-shots
def make_kick():
    d = 0.42
    n = int(d * SR)
    t = np.arange(n) / SR
    f = mtof(33) + 95 * np.exp(-t / 0.034) + 320 * np.exp(-t / 0.006)   # lands on A1, 55 Hz
    body = np.sin(2 * np.pi * np.cumsum(f) / SR)
    env = np.minimum(t / 0.001, 1) * np.exp(-t / 0.125)
    click = bp(rng.standard_normal(n), 1800, 7000) * np.exp(-t / 0.003) * 0.6
    x = np.tanh(3.0 * body * env) + click
    x = lp(x, 11000, 1)
    x *= np.clip((d - t) / 0.05, 0, 1)
    return peak_norm(x)


def metal(n, r, mult):
    """Six band-limited squares at inharmonic ratios: the cymbal source."""
    x = np.zeros(n)
    for f in [205.3, 304.4, 369.6, 522.7, 540.0, 800.0]:
        ph = r.random()
        x += saw_blep(n, f * mult, ph, SR) - saw_blep(n, f * mult, ph + 0.5, SR)
    return x / 6


def make_chh(seed):
    r = np.random.default_rng(seed)
    n = int(0.08 * SR)
    t = np.arange(n) / SR
    x = metal(n, r, 1.0) * 0.7 + r.standard_normal(n) * 0.45
    return peak_norm(hp(x, 8000, 4) * np.exp(-t / 0.011))


def make_ohh(seed):
    r = np.random.default_rng(seed)
    n = int(0.36 * SR)
    t = np.arange(n) / SR
    x = metal(n, r, 1.0) * 0.8 + r.standard_normal(n) * 0.35
    return peak_norm(hp(x, 6800, 4) * (1 - np.exp(-t / 0.0015)) * np.exp(-t / 0.085))


def make_ride(seed):
    r = np.random.default_rng(seed)
    n = int(0.9 * SR)
    t = np.arange(n) / SR
    x = metal(n, r, 1.37) * 0.9 + r.standard_normal(n) * 0.2
    x = bp(x, 4500, 12500) * (0.6 * np.exp(-t / 0.045) + 0.4 * np.exp(-t / 0.33))
    return peak_norm(x * np.clip((0.9 - t) / 0.1, 0, 1))


def make_crash(seed):
    r = np.random.default_rng(seed)
    n = int(2.8 * SR)
    t = np.arange(n) / SR
    x = metal(n, r, 1.21) * 0.5 + r.standard_normal(n) * 0.6
    x = hp(x, 3500, 2) * (1 - np.exp(-t / 0.003)) * np.exp(-t / 0.65)
    return peak_norm(x * np.clip((2.8 - t) / 0.3, 0, 1))


def make_shaker(seed):
    r = np.random.default_rng(seed)
    n = int(0.12 * SR)
    t = np.arange(n) / SR
    return peak_norm(bp(r.standard_normal(n), 5000, 10000) * (1 - np.exp(-t / 0.005)) * np.exp(-t / 0.025))


def make_clap(seed):
    r = np.random.default_rng(seed)
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    env = np.zeros(n)
    for d0 in [0.0, 0.010, 0.019]:
        env += (t >= d0) * np.exp(-np.maximum(t - d0, 0) / 0.005) * 0.6
    env += (t >= 0.027) * np.exp(-np.maximum(t - 0.027, 0) / 0.07)
    return peak_norm(bp(r.standard_normal(n), 950, 3200) * env)


def make_rim():
    n = int(0.08 * SR)
    t = np.arange(n) / SR
    x = np.sin(2 * np.pi * 1820 * t) * 0.6 + np.sin(2 * np.pi * 510 * t) * 0.5
    x = x * np.exp(-t / 0.010) + rng.standard_normal(n) * np.exp(-t / 0.001) * 0.5
    return peak_norm(hp(x, 350))


def make_tom(m):
    n = int(0.3 * SR)
    t = np.arange(n) / SR
    f = mtof(m) * (1 + 0.7 * np.exp(-t / 0.010))
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.minimum(t / 0.001, 1) * np.exp(-t / 0.055)
    return peak_norm(np.tanh(1.8 * x))


def make_ping(vel):
    """The sonar: one soft FM tone on E5."""
    f = mtof(76)
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    idx = 0.9 * vel * np.exp(-t / 0.025)
    x = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * 2.0 * f * t))
    return x * np.minimum(t / 0.0015, 1) * np.exp(-t / 0.075) * vel


# ---------------------------------------------------------------- the acid line (A minor; step, midi, length in steps, accent, slide)
MOTIF_SPARSE = [(0, 45, 1.5, 1, 0), (6, 52, 1.0, 0, 0), (7, 50, 2.0, 0, 1), (12, 45, 1.5, 0, 0),
                (18, 52, 2.5, 1, 0), (24, 48, 1.0, 0, 0), (25, 47, 2.0, 0, 1), (28, 45, 1.5, 0, 0)]
MOTIF_A = [(0, 45, 1.5, 1, 0), (3, 48, 1.0, 0, 0), (6, 52, 1.0, 0, 0), (7, 50, 2.0, 0, 1), (10, 48, 1.0, 0, 0),
           (12, 45, 1.5, 1, 0), (14, 43, 1.0, 0, 0), (15, 45, 1.0, 0, 1),
           (18, 52, 2.5, 1, 0), (22, 50, 1.0, 0, 0), (24, 48, 1.0, 0, 0), (25, 47, 2.0, 0, 1), (28, 45, 1.5, 0, 0),
           (30, 40, 1.5, 0, 0)]
MOTIF_B = [(0, 45, 1.5, 1, 0), (3, 48, 1.0, 0, 0), (6, 52, 1.0, 0, 0), (7, 55, 2.0, 1, 1), (10, 52, 1.0, 0, 0),
           (12, 50, 1.5, 0, 0), (14, 48, 1.0, 0, 0), (15, 50, 1.0, 0, 1),
           (18, 52, 2.5, 1, 0), (22, 50, 1.0, 0, 0), (24, 57, 1.0, 1, 0), (25, 55, 2.0, 0, 1), (28, 52, 1.5, 0, 0),
           (30, 50, 1.5, 0, 0)]


def motif_at(bar):
    """Which 2-bar motif starts at this (even) bar, or None."""
    if 24 <= bar < 32:
        return MOTIF_SPARSE
    if 32 <= bar < 56:
        return MOTIF_A
    if 56 <= bar < 72:
        return MOTIF_B
    if 72 <= bar < 88:
        return MOTIF_A if (bar // 2) % 2 == 0 else MOTIF_B
    if 88 <= bar < 92:
        return MOTIF_SPARSE      # the line alone, before the kick comes back
    if 92 <= bar < 108:
        return MOTIF_A
    if 108 <= bar < 120:
        return MOTIF_SPARSE
    return None


# pad: three notes, 4 bars each; no thirds on the outer chords
PAD_CYCLE = [(57, 64, 71), (57, 65, 72), (57, 64, 71), (55, 62, 69)]


def pad_notes(bar):
    if bar < 32:
        return (57, 64)
    if bar < 88:
        return PAD_CYCLE[((bar - 32) // 4) % 4]
    return (57, 64, 71)


def has_kick(bar, beat):
    if bar < 48:
        return not (bar == 47 and beat >= 2)
    if 56 <= bar < 88:
        return not (bar == 87 and beat == 3)
    if 92 <= bar < 126:
        return True
    return False


# ================================================================ render
def render(stems_dir=None):
    print('samples', N, 'seconds', round(N / SR, 2))
    f32 = np.float32
    G, EV = {}, {k: [] for k in ('kick', 'acid', 'ping', 'hatc', 'hato', 'ride', 'shaker', 'tom', 'clap', 'rim', 'crash', 'riser', 'pad')}
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

    # ---- kick, through a filter that opens over the first 8 bars and closes over the last 8
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
    kfc = np.exp(auto([(0, np.log(140)), (6, np.log(900)), (8, np.log(16000)), (118, np.log(16000)), (124, np.log(300)), (128, np.log(110))]))
    kick = svf_lp(kick, kfc, np.full(N, 0.8), SR)
    kick *= auto([(0, 0.6), (8, 1.0), (118, 1.0), (126, 0.32)])       # it walks in, and at the end it walks away

    def sc_env(hold, rel, attack=0.002):
        tt = np.arange(int(0.46 * SR)) / SR
        tpl = np.minimum(tt / attack, 1) * np.exp(-np.maximum(tt - hold, 0) / rel)
        e = np.zeros(N)
        for p in kpos:
            seg = e[p:p + len(tpl)]
            np.maximum(seg, tpl[:len(seg)], out=seg)
        return e

    sc = sc_env(0.03, 0.09)
    sc_r = sc_env(0.10, 0.06)

    def duck(depth):
        return 1.0 - depth * sc

    # ---- rumble: the kick, echoed, through a dark room, low-passed, driven, and pushed out of the kick's way
    taps = np.zeros(N)
    d2, d3 = int(round(2 * STEP * SR)), int(round(3 * STEP * SR))
    taps[d2:] += 0.45 * kick[:-d2]
    taps[d3:] += 0.7 * kick[:-d3]
    rum_ir = make_ir(0.9, [(None, 220, 0.75, 1.0)], seed=11, predelay=0.0, hp_fc=0, onset=0.02)
    rum = signal.fftconvolve(kick * 0.6 + taps, rum_ir[0])[:N]
    rum = lp(hp(rum, 34), 105, 4)
    gset('rumble_norm', np.percentile(np.abs(rum), 99.5) + 1e-9)
    if os.environ.get('GL_TAPS'):
        np.save(os.path.join(os.environ['GL_TAPS'], 'rumble_pre.npy'), rum.astype(np.float32))
    rum = np.tanh(3.2 * rum / G['rumble_norm'])
    rum = lp(rum, 260, 2) * (1.0 - sc_r)
    rum *= auto([(0, 0.0), (7.5, 0.0), (8.5, 1.0), (126, 1.0), (128, 0.6)])
    del taps
    dump('ir_rumble', rum_ir[0])
    if parts_dir:   # what one kick puts into the rumble before the tanh, for a console without a third convolver
        k_open = svf_lp(np.concatenate([kick1, np.zeros(int(1.4 * SR))]), np.full(len(kick1) + int(1.4 * SR), 16000.0), np.full(len(kick1) + int(1.4 * SR), 0.8), SR)
        dump('rumble_source', lp(hp(signal.fftconvolve(k_open, rum_ir[0])[:len(k_open)], 34), 105, 4))

    # ---- the acid line
    starts, midis, lens, accs, slides = [], [], [], [], []
    for bar in range(0, NBARS, 2):
        m = motif_at(bar)
        if m is None:
            continue
        for st, note, ln, ac, sl in m:
            starts.append(pos(bar, st))
            midis.append(note)
            lens.append(int(ln * STEP * SR))
            accs.append(ac)
            slides.append(sl)
    starts = np.array(starts, dtype=np.int64)
    lens = np.array(lens, dtype=np.int64)
    slides_a = np.array(slides, dtype=np.int64)
    for i in range(len(starts) - 1):          # a note that is slid out of holds its gate until the next one starts
        if slides_a[i + 1] == 1:
            lens[i] = starts[i + 1] - starts[i] + 64
    EV['acid'] = [[int(a), int(b), int(c), int(d), int(e)] for a, b, c, d, e in zip(starts, midis, lens, accs, slides_a)]
    ftau = auto([(24, 0.13), (48, 0.17), (52, 0.26), (56, 0.16), (76, 0.22), (96, 0.14), (120, 0.11)])
    freq, amp, fenv = acid_ctrl(N, starts, np.array(midis, dtype=np.float64), lens, np.array(accs, dtype=np.float64), slides_a,
                                np.exp(-1.0 / (ftau * SR)), SR)
    a_base = np.exp(auto([(24, np.log(170)), (32, np.log(250)), (44, np.log(480)), (48, np.log(380)), (54, np.log(700)), (56, np.log(560)),
                          (64, np.log(700)), (76, np.log(950)), (84, np.log(800)), (88, np.log(450)), (96, np.log(420)),
                          (108, np.log(260)), (120, np.log(150))]))
    a_amt = auto([(24, 1.1), (44, 1.9), (52, 2.3), (56, 2.0), (76, 2.35), (88, 1.9), (108, 1.4), (120, 0.9)])
    a_q = auto([(24, 2.2), (40, 4.5), (48, 6.0), (54, 8.5), (56, 6.0), (76, 9.0), (88, 6.0), (104, 4.0), (120, 2.5)])
    a_fc = np.clip(a_base * 2 ** (a_amt * fenv) * (1 + 0.06 * np.sin(2 * np.pi * TBAR / 5.0)), 60, 8000)
    osc = saw_var(freq, SR)
    y = svf_lp(osc * 0.8, a_fc, a_q, SR)
    y = svf_lp(y, np.minimum(a_fc * 1.25, 9000), np.full(N, 0.7), SR)
    a_drive = auto([(24, 1.2), (56, 1.8), (76, 2.6), (96, 1.6), (120, 1.2)])
    acid = np.tanh(a_drive * y * amp) / a_drive
    acid = hp(acid, 75)
    del osc, y, freq, fenv, a_fc
    print('  acid notes', len(starts))

    # ---- the sonar ping: a 5-step gate against the 16-step bar, one pitch
    GATE5 = [1, 0, 1, 1, 0]
    VEL7 = [1.0, 0.5, 0.7, 0.4, 0.85, 0.5, 0.6]
    ping = np.zeros((2, N), dtype=f32)
    ping_lvl = auto([(0, 0.0), (2, 0.5), (8, 0.8), (48, 1.0), (56, 0.8), (88, 1.0), (96, 0.8), (120, 0.9), (126, 0.0)])
    pings = {v: make_ping(v) for v in set(VEL7)}
    for i in range(NBARS * 16):
        if GATE5[i % 5]:
            p = pos(i // 16, i % 16)
            if p < N and ping_lvl[p] > 0:
                v = VEL7[i % 7]
                add(ping, pan(pings[v], 0.55 * math.sin(i * 0.37)), p, ping_lvl[p])
                EV['ping'].append([int(p), v, 0.55 * math.sin(i * 0.37), float(ping_lvl[p])])
    for v_, x_ in pings.items():
        dump('ping_%03d' % round(v_ * 100), x_)
    pfc = np.exp(auto([(0, np.log(1400)), (32, np.log(2600)), (56, np.log(4200)), (76, np.log(6500)), (104, np.log(2600)), (128, np.log(1200))]))
    ping = np.stack([svf_lp(ping[c].astype(np.float64), pfc, np.full(N, 1.2), SR) for c in range(2)])
    pm = ping.mean(axis=0)
    pl, pr = tape_delay(pm, np.zeros(N), np.full(N, 2 * STEP * SR), np.full(N, 0.5), onepole(5000), onepole(400), 1.5)
    ping = (ping + 0.6 * np.stack([pl, pr])).astype(f32)
    del pm, pl, pr

    # ---- drums
    chh = [make_chh(s) for s in (1, 2, 3)]
    ohh = [make_ohh(s) for s in (4, 5)]
    ride1, crash1, clap1, rim1 = make_ride(6), make_crash(7), make_clap(8), make_rim()
    shk = [make_shaker(s) for s in (9, 10, 11)]
    toms = {m: make_tom(m) for m in (52, 55, 57)}
    hats = np.zeros((2, N), dtype=f32)
    rides = np.zeros((2, N), dtype=f32)
    shaker = np.zeros((2, N), dtype=f32)
    claps = np.zeros((2, N), dtype=f32)
    rims = np.zeros((2, N), dtype=f32)
    perc = np.zeros((2, N), dtype=f32)
    crash = np.zeros((2, N), dtype=f32)
    hat_lvl = auto([(8, 0.35), (16, 0.7), (32, 1.0), (48, 0.9), (52, 0.25), (56, 1.0), (88, 1.0), (92, 0.55), (96, 0.9), (104, 0.8), (112, 0.5), (120, 0.0)])
    CH_VEL = [0.35, 0.55, 0.22, 0.6]
    TOM_SEQ = [57, 52, 52, 55]
    TOM_VEL = [1.0, 0.6, 0.8, 0.5, 0.7]
    ti = 0
    for bar in range(NBARS):
        closed = (8 <= bar < 48) or (52 <= bar < 120)
        opened = (16 <= bar < 48) or (56 <= bar < 88) or (92 <= bar < 104)
        for st in range(16):
            b4 = st % 4
            if closed and not (opened and b4 == 2):
                p = pos(bar, st, swing=SW, jitter=0.001)
                if p < N:
                    k_ = int(rng.integers(3))
                    g_ = CH_VEL[b4] * (1 + 0.12 * rng.standard_normal()) * hat_lvl[p]
                    add(hats, pan(chh[k_], 0.2), p, g_)
                    EV['hatc'].append([int(p), float(g_), k_])
            if opened and b4 == 2:
                p = pos(bar, st, jitter=0.001)
                k_ = int(rng.integers(2))
                g_ = 0.72 * (1 + 0.06 * rng.standard_normal()) * hat_lvl[p]
                add(hats, pan(ohh[k_], -0.12), p, g_)
                EV['hato'].append([int(p), float(g_), k_])
            if 64 <= bar < 88 and b4 in (0, 2):
                p_ = pos(bar, st, jitter=0.001)
                g_ = (0.55 if b4 == 0 else 0.9) * (1 + 0.08 * rng.standard_normal()) * min(1.0, (bar - 64 + st / 16) / 2 + 0.3)
                add(rides, pan(ride1, 0.3), p_, g_)
                EV['ride'].append([int(p_), float(g_)])
            if 72 <= bar < 88:
                k_ = int(rng.integers(3))
                p_ = pos(bar, st, swing=SW, jitter=0.002)
                g_ = [0.5, 0.75, 1.0, 0.75][b4] * (1 + 0.1 * rng.standard_normal())
                add(shaker, pan(shk[k_], -0.4), p_, g_)
                EV['shaker'].append([int(p_), float(g_), k_])
            # toms on every third sixteenth, their own clock
            gi = bar * 16 + st
            if gi % 3 == 0:
                if (16 <= bar < 48) or (56 <= bar < 88) or (92 <= bar < 108):
                    m = TOM_SEQ[ti % 4]
                    p_ = pos(bar, st, jitter=0.0015)
                    g_ = TOM_VEL[ti % 5] * (1 + 0.08 * rng.standard_normal())
                    add(perc, pan(toms[m], 0.35 * math.sin(ti * 0.9)), p_, g_)
                    EV['tom'].append([int(p_), m, float(g_), 0.35 * math.sin(ti * 0.9)])
                ti += 1
        if (32 <= bar < 48) or (56 <= bar < 88) or (92 <= bar < 104):
            for st in (4, 12):
                if bar == 47 and st == 12:
                    continue
                p_ = pos(bar, st, jitter=0.001)
                add(claps, pan(clap1, 0.0), p_, 0.9)
                EV['clap'].append([int(p_), 0.9])
        if (40 <= bar < 48) or (64 <= bar < 88):
            for st, v in ([(3, 0.8), (10, 0.6)] if bar % 2 == 0 else [(6, 0.8), (13, 0.55)]):
                p_ = pos(bar, st, jitter=0.001)
                add(rims, pan(rim1, 0.4), p_, v)
                EV['rim'].append([int(p_), v])
    for bar, g in [(32, 0.5), (56, 1.0), (72, 0.55), (92, 0.7)]:
        add(crash, np.stack([crash1, np.roll(crash1, 37)]), pos(bar), g)
        EV['crash'].append([int(pos(bar)), g])
    for i_, x_ in enumerate(chh):
        dump('hat_closed_%d' % i_, x_)
    for i_, x_ in enumerate(ohh):
        dump('hat_open_%d' % i_, x_)
    for i_, x_ in enumerate(shk):
        dump('shaker_%d' % i_, x_)
    for m_, x_ in toms.items():
        dump('tom_%d' % m_, x_)
    dump('ride', ride1); dump('crash', np.stack([crash1, np.roll(crash1, 37)])); dump('clap', clap1); dump('rim', rim1)
    hats = lp(hats, 13000).astype(f32)
    perc = hp(perc, 110).astype(f32)

    # ---- pad: two or three notes, slow filter
    pad = np.zeros((2, N))
    bars_i = np.minimum(NBARS - 1, TBAR.astype(np.int64))
    smooth_a = onepole(1.0 / 0.9)
    for m in (55, 57, 62, 64, 65, 69, 71, 72):
        on = np.array([1.0 if m in pad_notes(b) else 0.0 for b in range(NBARS)])[bars_i]
        if on.max() == 0:
            continue
        g = signal.lfilter([smooth_a], [1, smooth_a - 1], on)
        g = signal.lfilter([smooth_a], [1, smooth_a - 1], g)
        f = mtof(m)
        ph_ = [rng.random(), rng.random(), rng.random(), rng.random()]     # left -7 and +4 cents, right +7 and -3
        EV['pad'].append([m] + ph_)
        pad[0] += g * (saw_blep(N, f * 2 ** (-7 / 1200), ph_[0], SR) + saw_blep(N, f * 2 ** (4 / 1200), ph_[1], SR))
        pad[1] += g * (saw_blep(N, f * 2 ** (7 / 1200), ph_[2], SR) + saw_blep(N, f * 2 ** (-3 / 1200), ph_[3], SR))
    pad_fc = auto([(0, 420), (32, 800), (48, 1500), (56, 1000), (76, 1700), (88, 1300), (96, 800), (128, 380)]) * (1 + 0.22 * np.sin(2 * np.pi * TBAR / 7.0 + 0.6))
    pad = np.stack([svf_lp(pad[0], pad_fc, np.full(N, 0.9), SR), svf_lp(pad[1], pad_fc * 1.06, np.full(N, 0.9), SR)])
    pad *= auto([(0, 0.0), (3, 0.5), (16, 0.5), (32, 0.75), (47, 0.8), (48, 1.0), (55.5, 1.0), (56, 0.7), (87, 0.75), (88, 1.0), (92, 0.7), (112, 0.8), (124, 0.7), (NBARS + 2.5, 0.0)])
    pad = hp(pad, 170).astype(f32)
    del pad_fc

    # ---- room tone and risers
    pink = signal.lfilter([0.049922035, -0.095993537, 0.050612699, -0.004408786], [1, -2.494956002, 2.017265875, -0.522189400], rng.standard_normal((2, N)), axis=-1)
    bed = hp(pink, 500)
    dump('noise_bed_first_32s', bed[:, :32 * SR])
    noise = (bed * auto([(0, 0.0), (1, 1.0), (8, 0.7), (48, 1.0), (56, 0.6), (88, 1.0), (92, 0.6), (120, 1.0), (NBARS + 3, 0.0)])).astype(f32)
    del pink, bed
    riser = np.zeros((2, N), dtype=f32)
    for a, b, g in [(30, 32, 0.45), (52, 56, 1.0), (70, 72, 0.4), (86, 88, 0.6), (90, 92, 0.7)]:
        s, e = pos(a), pos(b)
        n = e - s
        u = np.arange(n) / n
        cut = 300 * (9000 / 300) ** u
        sw = np.stack([svf_lp(rng.standard_normal(n), cut, np.full(n, 1.8), SR) for _ in range(2)])
        seg_ = hp(sw, 250) * (u ** 2.4)
        riser[:, s:e] += seg_ * g
        dump('riser_bar%d' % a, seg_)
        EV['riser'].append([int(s), int(e), g])

    # ---- delay on the acid line: three sixteenths, ping-pong, thrown open at the two drops
    fb = auto([(0, 0.42), (46.5, 0.42), (47.5, 0.86), (49, 0.62), (55, 0.62), (56, 0.40), (86.5, 0.42), (87.5, 0.88), (91, 0.7), (92, 0.42), (118, 0.5), (128, 0.6)])
    A_G = gset('acid', gain_for(acid, -16.0))
    a_in = acid * A_G
    side = (np.floor(TBAR * 2) % 2)                       # the echo's entry side swaps every half bar
    side = np.convolve(side, np.ones(400) / 400, mode='same')
    dly = 3 * STEP * SR * (1 + 0.001 * np.sin(2 * np.pi * 0.21 * TSEC))
    dL, dR = tape_delay(a_in * (1 - side), a_in * side, dly, fb, onepole(3600), onepole(320), 1.6)
    adly = np.stack([dL, dR])
    del dL, dR, side, dly

    hall_ir = make_ir(5.5, [(None, 300, 3.2, 0.5), (300, 1200, 4.0, 1.0), (1200, 4000, 3.0, 0.9), (4000, None, 1.6, 0.5)], seed=21, predelay=0.03, hp_fc=300)
    room_ir = make_ir(1.1, [(None, 500, 0.7, 0.6), (500, 3000, 0.85, 1.0), (3000, None, 0.6, 0.8)], seed=22, predelay=0.006, hp_fc=400, onset=0.004)

    dump('ir_hall', hall_ir)
    dump('ir_room', room_ir)

    # ---- stems at mix level
    def st(x, g, depth=0.0, p=None):
        y = x * g
        if depth:
            y = y * duck(depth)
        if p is not None:
            y = pan(y, p)
        return np.asarray(y, dtype=f32)

    S = {}
    S['kick'] = st(kick, 0.66, 0, 0.0)
    S['rumble'] = st(rum, gset('rumble', gain_for(rum, -19.5)), 0, 0.0)
    S['acid'] = st(acid, A_G, 0.32, 0.0)
    S['acid_delay'] = st(adly, 0.7, 0.4)
    S['ping'] = st(ping, gset('ping', gain_for(ping, -31.0)), 0.2)
    S['pad'] = st(pad, gset('pad', gain_for(pad, -27.5)), 0.6)
    S['hats'] = st(hats, gset('hats', peak_gain(hats, -12.5)), 0.12)
    S['ride'] = st(rides, gset('ride', peak_gain(rides, -19.0)), 0.15)
    S['shaker'] = st(shaker, gset('shaker', peak_gain(shaker, -18.0)))
    S['clap'] = st(claps, gset('clap', peak_gain(claps, -11.0)))
    S['rim'] = st(rims, gset('rim', peak_gain(rims, -12.5)))
    S['toms'] = st(perc, gset('toms', peak_gain(perc, -14.5)))
    S['crash'] = st(crash, gset('crash', peak_gain(crash, -15.0)), 0.3)
    S['noise'] = st(noise, gset('noise', gain_for(noise, -50.0)), 0.4)
    S['riser'] = st(riser, gset('riser', gain_for(riser, -29.0)))
    del kick, rum, acid, adly, ping, pad, hats, rides, shaker, claps, rims, perc, crash, noise, riser

    hall_send = (S['acid'] * f32(0.55) + S['acid_delay'] * f32(0.5) + S['pad'] * f32(0.9) + S['ping'] * f32(0.8) + S['clap'] * f32(0.3)
                 + S['rim'] * f32(0.35) + S['toms'] * f32(0.25) + S['riser'] * f32(0.8) + S['crash'] * f32(0.5) + S['ride'] * f32(0.2))
    hall = reverb(hall_send.astype(np.float64), hall_ir)
    del hall_send
    S['hall'] = st(hall, gset('hall_return', gain_for(hall, -24.5)), 0.5)
    del hall
    room_send = S['clap'] * f32(0.8) + S['hats'] * f32(0.3) + S['toms'] * f32(0.6) + S['rim'] * f32(0.6) + S['shaker'] * f32(0.4)
    room = reverb(room_send.astype(np.float64), room_ir)
    del room_send
    S['room'] = st(room, gset('room_return', gain_for(room, -35.0)))
    del room

    mix = np.zeros((2, N))
    for name, s in S.items():
        mix += s
        print(f'  {name:11s} peak {db(np.max(np.abs(s))):6.1f} dB   loud-rms {db(rms_pct(s)):6.1f} dB')

    # ---- master
    mix = hp(mix, 25)
    fade = np.ones(N)
    f0 = pos(NBARS - 1)
    fade[f0:] = 0.5 * (1 + np.cos(np.pi * np.arange(N - f0) / (N - f0)))
    mix *= fade
    pre = float(os.environ.get('PREGAIN', '1.3'))
    mix = np.tanh(mix * pre * 1.1) / 1.1
    mix, genv = limiter(np.ascontiguousarray(mix), 0.70, 1 - np.exp(-1 / (0.004 * SR)), 1 - np.exp(-1 / (0.12 * SR)))
    print('limiter: max reduction %.1f dB, active %.1f%% of the time' % (-db(genv.min()), 100 * (genv < 0.99).mean()))
    mix *= gset('final_scale', 0.89 / np.max(np.abs(mix)))
    G.update(kick=0.66, acid_delay_return=0.7, ping_delay_mix=0.6, master_pregain=pre * 1.1, master_post=1 / 1.1, limiter_threshold=0.70)
    if parts_dir:
        json.dump(G, open(os.path.join(parts_dir, 'gains.json'), 'w'), indent=1)
        json.dump({'sr': SR, 'tempo': BPM, 'bars': NBARS, 'tail': TAIL, 'events': EV}, open(os.path.join(parts_dir, 'events.json'), 'w'))

    if stems_dir:
        os.makedirs(stems_dir, exist_ok=True)
        for name, s in S.items():
            wavfile.write(os.path.join(stems_dir, name + '.wav'), SR, (np.clip(s * fade, -1, 1).T * 32767).astype(np.int16))
    return mix


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else 'gegenlicht.wav'
    mix = render(sys.argv[2] if len(sys.argv) > 2 else None)
    dither = (rng.random(mix.shape) - rng.random(mix.shape)) / 32768.0
    wavfile.write(out, SR, np.clip((mix + dither).T * 32767, -32768, 32767).astype(np.int16))
    print('wrote', out)
