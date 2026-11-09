#!/usr/bin/env python3
"""Halbschatten: dub techno in G minor, 122 BPM, 120 bars (4:03). The reference render for Takt.

    python3 misc/halbschatten_reference.py out.wav [stems_dir]

Needs numpy, scipy, numba. Renders at 44.1 kHz. With a stems dir it also writes the pre-master
stems, and next to them parts/: every one-shot, the raw stab buffers, both reverb impulses and
gains.json (every auto-levelled gain, resolved). Notes for the port: misc/HALBSCHATTEN.md.

MIDI numbers in this file are written in F minor and sound a whole step up (TRANSPOSE = 2).
"""
import json
import sys, os
import numpy as np
from scipy import signal
from scipy.io import wavfile
from numba import njit

SR = 44100
BPM = 122.0
BEAT = 60.0 / BPM
STEP = BEAT / 4
BAR = BEAT * 4
NBARS = 120
TAIL = 7.0
N = int(round((NBARS * BAR + TAIL) * SR))
SW = 0.13  # swing, in 16th steps, applied to odd 16ths
rng = np.random.default_rng(303)
TSEC = np.arange(N) / SR
TBAR = TSEC / BAR


# ---------------------------------------------------------------- helpers
TRANSPOSE = 2  # written in F minor, sounds in G minor: root at 49 Hz


def mtof(m):
    return 440.0 * 2 ** ((m + TRANSPOSE - 69) / 12)


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
    return 20 * np.log10(max(x, 1e-12))


def rms_pct(x, pct=95, win=0.4):
    """High percentile of short-window RMS, so stems are levelled on their loud parts."""
    m = x if x.ndim == 1 else np.sqrt((x ** 2).mean(axis=0))
    w = int(win * SR)
    k = len(m) // w
    r = np.sqrt((m[:k * w].reshape(k, w) ** 2).mean(axis=1))
    r = r[r > 1e-6]
    return float(np.percentile(r, pct)) if len(r) else 0.0


def level(x, target_db, pct=95):
    r = rms_pct(x, pct)
    return x * (10 ** (target_db / 20) / r) if r > 0 else x


def gain_for(x, target_db, pct=95):
    r = rms_pct(x, pct)
    return 10 ** (target_db / 20) / r if r > 0 else 1.0


def peak_level(x, target_db):
    return x * (10 ** (target_db / 20) / np.max(np.abs(x)))


def peak_norm(x, target=1.0):
    return x * (target / np.max(np.abs(x)))


# ---------------------------------------------------------------- dsp kernels
@njit(cache=True)
def saw_blep(n, freq, phase0, sr):
    out = np.empty(n)
    ph = phase0
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
def svf_lp(x, fc, q, sr):
    n = x.shape[0]
    y = np.empty(n)
    ic1 = 0.0
    ic2 = 0.0
    k = 1.0 / q
    for i in range(n):
        g = np.tan(np.pi * fc[i] / sr)
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
def tape_delay(inL, inR, dly, fb, lp_a, hp_a, drive):
    """Ping-pong delay, band-passed and saturated in the feedback path, so repeats get darker and thinner."""
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


def onepole(fc):
    return 1.0 - np.exp(-2 * np.pi * fc / SR)


def make_ir(length, bands, seed, predelay=0.02, hp_fc=180.0, onset=0.012):
    """Synthetic reverb: decaying noise, each band with its own decay time."""
    r = np.random.default_rng(seed)
    n = int(length * SR)
    t = np.arange(n) / SR
    ir = np.zeros((2, n))
    for lo, hi, t60, g in bands:
        nz = r.standard_normal((2, n))
        if lo is None:
            b = lp(nz, hi)
        elif hi is None:
            b = hp(nz, lo)
        else:
            b = bp(nz, lo, hi)
        ir += g * b * 10 ** (-3 * t / t60)
    ir *= (1 - np.exp(-t / onset))
    ir = hp(ir, hp_fc)
    ir *= np.minimum(1, (length - t) / 0.2)
    ir = np.concatenate([np.zeros((2, int(predelay * SR))), ir], axis=1)
    ir /= np.sqrt((ir ** 2).sum(axis=1, keepdims=True))
    return ir


def reverb(send, ir):
    return np.stack([signal.fftconvolve(send[0], ir[0])[:N], signal.fftconvolve(send[1], ir[1])[:N]])


# ---------------------------------------------------------------- one-shots
def make_kick():
    d = 0.52
    n = int(d * SR)
    t = np.arange(n) / SR
    f = mtof(29) + 60 * np.exp(-t / 0.05) + 230 * np.exp(-t / 0.007)  # lands on F1
    body = np.sin(2 * np.pi * np.cumsum(f) / SR)
    env = np.minimum(t / 0.0015, 1) * np.exp(-t / 0.15)
    click = bp(rng.standard_normal(n), 1200, 5500) * np.exp(-t / 0.004) * 0.55
    x = np.tanh(2.4 * body * env) + click
    x = lp(x, 9000, 1)
    x *= np.clip((d - t) / 0.04, 0, 1)
    return peak_norm(x)


def bass_note(m, dur, vel):
    f = mtof(m)
    n = int((dur + 0.12) * SR)
    t = np.arange(n) / SR
    ph = 2 * np.pi * f * t
    x = np.sin(ph) + 0.4 * np.sin(2 * ph + 0.3) + 0.15 * np.sin(3 * ph)
    x = np.tanh(1.4 * x)
    grit = lp(saw_blep(n, 2 * f, 0.25, SR), 380) * 0.28  # octave-up layer so the line reads on small speakers
    env = np.minimum(t / 0.008, 1) * np.where(t < dur, 1.0 - 0.25 * t / dur, 0.75 * np.exp(-(t - dur) / 0.03))
    return (x + grit) * env * vel


def make_stab(midis, seed, dur=1.6):
    r = np.random.default_rng(seed)
    n = int(dur * SR)
    L = np.zeros(n)
    R = np.zeros(n)
    for m in midis:
        f = mtof(m)
        for det, p in [(-9.0, -0.75), (0.0, 0.0), (8.0, 0.75)]:
            s = saw_blep(n, f * 2 ** ((det + r.normal(0, 1.5)) / 1200), r.random(), SR)
            L += s * (1 - p) / 2
            R += s * (1 + p) / 2
    x = np.stack([L, R]) / len(midis)
    x += r.standard_normal((2, n)) * 0.10  # a little noise through the same filter: the "chhh" in a dub chord
    return x


def metal(n, r, mult=1.0):
    t = np.arange(n) / SR
    x = np.zeros(n)
    for f in [205.3, 304.4, 369.6, 522.7, 540.0, 800.0]:
        x += signal.square(2 * np.pi * f * mult * t + r.random() * 2 * np.pi)
    return x / 6


def make_chh(seed):
    r = np.random.default_rng(seed)
    n = int(0.09 * SR)
    t = np.arange(n) / SR
    x = metal(n, r, 1.0) * 0.6 + r.standard_normal(n) * 0.5
    x = hp(x, 7500, 4) * np.exp(-t / 0.013)
    return peak_norm(x)


def make_ohh(seed):
    r = np.random.default_rng(seed)
    n = int(0.42 * SR)
    t = np.arange(n) / SR
    x = metal(n, r, 1.0) * 0.7 + r.standard_normal(n) * 0.4
    x = hp(x, 6200, 4) * (1 - np.exp(-t / 0.002)) * np.exp(-t / 0.095)
    return peak_norm(x)


def make_shaker(seed):
    r = np.random.default_rng(seed)
    n = int(0.14 * SR)
    t = np.arange(n) / SR
    x = bp(r.standard_normal(n), 4500, 9500) * (1 - np.exp(-t / 0.006)) * np.exp(-t / 0.03)
    return peak_norm(x)


def make_clap(seed):
    r = np.random.default_rng(seed)
    n = int(0.5 * SR)
    t = np.arange(n) / SR
    env = np.zeros(n)
    for d0 in [0.0, 0.011, 0.021]:
        env += (t >= d0) * np.exp(-np.maximum(t - d0, 0) / 0.006) * 0.6
    env += (t >= 0.030) * np.exp(-np.maximum(t - 0.030, 0) / 0.085)
    x = bp(r.standard_normal(n), 900, 2800) * env
    return peak_norm(x)


def make_rim():
    n = int(0.09 * SR)
    t = np.arange(n) / SR
    x = np.sin(2 * np.pi * 1750 * t) * 0.6 + np.sin(2 * np.pi * 478 * t) * 0.5
    x = x * np.exp(-t / 0.011) + rng.standard_normal(n) * np.exp(-t / 0.0012) * 0.5
    return peak_norm(hp(x, 300))


def make_tom(m):
    n = int(0.4 * SR)
    t = np.arange(n) / SR
    f = mtof(m) * (1 + 0.55 * np.exp(-t / 0.012))
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.minimum(t / 0.001, 1) * np.exp(-t / 0.065)
    return peak_norm(np.tanh(1.5 * x))


def fm_pluck(m, dur, vel):
    """Soft FM electric-piano bell for the lead line."""
    f = mtof(m)
    n = int((dur + 1.2) * SR)
    t = np.arange(n) / SR
    idx = 2.4 * vel * np.exp(-t / 0.11) + 0.35
    car = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * 2 * f * t))
    car2 = np.sin(2 * np.pi * f * 1.004 * t + 0.6 * idx * np.sin(2 * np.pi * 3 * f * 1.004 * t))
    env = np.minimum(t / 0.004, 1) * np.exp(-t / 0.55)
    env *= np.where(t < dur, 1.0, np.exp(-np.maximum(t - dur, 0) / 0.25))
    return np.stack([car + 0.35 * car2, car * 0.9 + 0.5 * car2]) * env * vel


# ---------------------------------------------------------------- harmony
CH = {
    'F': [53, 56, 60, 63, 67],   # Fm9
    'Bb': [46, 49, 53, 56, 60],  # Bbm9
    'C': [48, 51, 55, 58, 62],   # Cm9
}
PROG = ['F', 'F', 'Bb', 'C']
PROG_A, PROG_B = 48, 88  # bars where the i-i-iv-v movement runs; one-chord dub before and after


def chord_at(bar):
    if PROG_A <= bar < PROG_B:
        return PROG[(bar - PROG_A) % 4]
    return 'F'


B_P1 = [(3, 29, 2.0, 1.0), (6, 29, 1.3, 0.8), (10, 29, 2.5, 1.0), (14, 36, 1.5, 0.85)]
B_P2 = [(3, 29, 2.0, 1.0), (6, 29, 1.3, 0.8), (10, 32, 2.5, 0.95), (14, 39, 1.5, 0.8)]
B_BB = [(3, 34, 2.0, 1.0), (6, 34, 1.3, 0.8), (10, 34, 2.5, 1.0), (14, 37, 1.5, 0.85)]
B_C = [(3, 36, 2.0, 1.0), (6, 36, 1.3, 0.8), (10, 36, 2.5, 1.0), (14, 39, 1.5, 0.85)]


def bass_pat(bar):
    if 56 <= bar < PROG_B:
        return [B_P1, B_P2, B_BB, B_C][(bar - PROG_A) % 4]
    return B_P1 if bar % 2 == 0 else B_P2


LEAD = [
    [(0, 72, 6), (6, 68, 4), (10, 67, 6)],
    [(0, 65, 10), (10, 67, 2), (12, 68, 4)],
    [(0, 75, 6), (6, 72, 4), (10, 70, 6)],
    [(0, 72, 14)],
]
LEAD_ALT_END = [(0, 72, 6), (6, 75, 4), (10, 79, 6)]


def has_kick(bar, beat):
    if 8 <= bar < 48:
        return not (bar == 47 and beat >= 2)
    if 56 <= bar < 112:
        return not (bar == 87 and beat == 3)
    return False


# ================================================================ render
def render(stems_dir=None):
    print('samples', N, 'seconds', N / SR)
    G = {}
    parts_dir = os.path.join(os.path.dirname(os.path.abspath(stems_dir)), 'parts') if stems_dir else None
    if parts_dir:
        os.makedirs(parts_dir, exist_ok=True)

    def dump(name, x):
        if parts_dir:
            x = np.asarray(x, dtype=np.float32)
            wavfile.write(os.path.join(parts_dir, name + '.wav'), SR, x.T if x.ndim == 2 else x)

    # ---- kick + sidechain
    kick1 = make_kick()
    dump('kick', kick1)
    kick = np.zeros(N)
    sc = np.zeros(N)
    tt = np.arange(int(0.45 * SR)) / SR
    tpl = np.minimum(tt / 0.003, 1) * np.exp(-np.maximum(tt - 0.02, 0) / 0.11)
    for bar in range(NBARS):
        for beat in range(4):
            if has_kick(bar, beat):
                p = pos(bar, beat * 4)
                add(kick, kick1, p)
                seg = sc[p:p + len(tpl)]
                np.maximum(seg, tpl[:len(seg)], out=seg)

    def duck(depth):
        return 1.0 - depth * sc

    # ---- bass
    bass = np.zeros(N)
    for bar in range(NBARS):
        if (16 <= bar < 48) or (56 <= bar < 108):
            for step, m, ln, vel in bass_pat(bar):
                if bar == 47 and step >= 8:
                    continue
                add(bass, bass_note(m, ln * STEP, vel), pos(bar, step))
    bass = lp(bass, 520).astype(np.float32)

    # ---- chord stabs
    stabs = {k: [make_stab(v, 100 * i + j) for j in range(4)] for i, (k, v) in enumerate(CH.items())}
    for k_, vs_ in stabs.items():
        for j_, v_ in enumerate(vs_):
            dump('stab_raw_%s_%d' % ({'F': 'Gm9', 'Bb': 'Cm9', 'C': 'Dm9'}[k_], j_), v_)
    chord_bus = np.zeros((2, N))
    fenv = np.zeros(N)
    stab_tau = auto([(0, 0.11), (32, 0.14), (48, 0.24), (56, 0.16), (76, 0.20), (96, 0.13), (120, 0.10)])
    ft = np.arange(int(0.7 * SR)) / SR
    hit_pos = []
    SPARSE = [[(2, 1.0)], [(2, 0.9), (11, 0.55)]]
    MED = [[(2, 1.0), (11, 0.7)], [(2, 1.0), (7, 0.5), (13, 0.7)]]
    FULL = [[(2, 1.0), (7, 0.55), (11, 0.8)], [(2, 1.0), (7, 0.55), (13, 0.8)]]
    for bar in range(0, 118):
        if bar < 16:
            pat = SPARSE
        elif bar < 32 or 48 <= bar < 56 or bar >= 96:
            pat = MED
        else:
            pat = FULL
        hits = list(pat[bar % 2])
        if 32 <= bar < 96 and bar % 4 == 3:
            hits.append((15, 0.35))
        for step, vel in hits:
            ch = chord_at(bar)
            if 32 <= bar < PROG_A and bar % 8 == 7 and step >= 13:
                ch = 'C'  # a hint of the movement to come
            s = pos(bar, step, swing=SW * 0.5)
            if s >= N:
                continue
            hit_pos.append(s)
            tau = stab_tau[s]
            raw = stabs[ch][rng.integers(4)]
            n = min(raw.shape[1], int(tau * 7 * SR))
            t = np.arange(n) / SR
            v = vel * (1 + 0.07 * rng.standard_normal())
            add(chord_bus, raw[:, :n] * (np.minimum(t / 0.003, 1) * np.exp(-t / tau)), s, v)
            fe = v * np.exp(-ft / 0.085)
            seg = fenv[s:s + len(fe)]
            np.maximum(seg, fe[:len(seg)], out=seg)

    base_fc = auto([(0, 250), (8, 360), (16, 500), (32, 720), (44, 1050), (48, 560), (56, 1400), (64, 1750),
                    (76, 2500), (84, 2100), (88, 1200), (96, 800), (104, 520), (112, 360), (120, 230)])
    fc = base_fc * 2 ** (1.6 * fenv) * (1 + 0.10 * np.sin(2 * np.pi * TBAR / 6.5))
    fc = np.clip(fc, 60, 14000)
    chords = np.stack([svf_lp(svf_lp(np.ascontiguousarray(chord_bus[c]), fc, 2.4, SR), fc, 0.7, SR) for c in range(2)])
    chords = np.tanh(1.3 * chords) / 1.3
    # the stab gets much louder as the filter opens; take back about half of that
    chords *= (700.0 / base_fc) ** 0.15
    chords = chords.astype(np.float32)
    del chord_bus, fenv, stab_tau, fc, base_fc

    # ---- percussion
    chh = [make_chh(s) for s in (11, 12, 13)]
    ohh = [make_ohh(s) for s in (21, 22)]
    clap1 = make_clap(31)
    rim1 = make_rim()
    toms = {m: make_tom(m) for m in (48, 51, 53)}
    shk = [make_shaker(s) for s in (41, 42, 43)]
    for i_, x_ in enumerate(chh):
        dump('hat_closed_%d' % i_, x_)
    for i_, x_ in enumerate(ohh):
        dump('hat_open_%d' % i_, x_)
    for i_, x_ in enumerate(shk):
        dump('shaker_%d' % i_, x_)
    dump('clap', clap1)
    dump('rim', rim1)
    for m_, x_ in toms.items():
        dump('tom_%d' % (m_ + TRANSPOSE), x_)
    shaker = np.zeros((2, N), dtype=np.float32)
    SH_VEL = [0.45, 0.7, 1.0, 0.7]
    hats = np.zeros((2, N), dtype=np.float32)
    claps = np.zeros((2, N), dtype=np.float32)
    rims = np.zeros((2, N), dtype=np.float32)
    perc = np.zeros((2, N), dtype=np.float32)
    hat_lvl = auto([(12, 0.0), (16, 0.6), (24, 0.8), (40, 1.0), (48, 0.9), (52, 0.0), (56, 0.9), (64, 1.0),
                    (88, 1.0), (96, 0.7), (104, 0.0)])
    CH_VEL = [0.42, 0.24, 0.0, 0.34]
    for bar in range(NBARS):
        for st in range(16):
            b4 = st % 4
            # closed hats
            closed16 = (24 <= bar < 48) or (56 <= bar < 96)
            closed_off = (12 <= bar < 16) or (52 <= bar < 56)
            if closed16 and CH_VEL[b4] > 0:
                p = pos(bar, st, swing=SW, jitter=0.0015)
                if p < N:
                    v = CH_VEL[b4] * (1 + 0.15 * rng.standard_normal()) * hat_lvl[p]
                    add(hats, pan(chh[rng.integers(3)], 0.18), p, v)
            if closed_off and b4 == 2:
                p = pos(bar, st, jitter=0.0015)
                v = 0.4 * (0.3 + 0.7 * ((bar % 4) + st / 16) / 4)
                add(hats, pan(chh[rng.integers(3)], 0.18), p, v)
            # open hat on the offbeat
            if b4 == 2 and ((16 <= bar < 48) or (56 <= bar < 104)):
                p = pos(bar, st, jitter=0.001)
                if p < N:
                    v = 0.62 * (1 + 0.08 * rng.standard_normal()) * hat_lvl[p]
                    add(hats, pan(ohh[rng.integers(2)], -0.15), p, v)
        if 64 <= bar < 88:
            for st in range(16):
                p = pos(bar, st, swing=SW, jitter=0.002)
                add(shaker, pan(shk[rng.integers(3)], 0.4), p, SH_VEL[st % 4] * (1 + 0.12 * rng.standard_normal()) * min(1.0, (bar - 64 + st / 16) / 4 + 0.25))
        # clap on 2 and 4
        if (40 <= bar < 48) or (56 <= bar < 88):
            for st in (4, 12):
                if bar == 47 and st == 12:
                    continue
                add(claps, pan(clap1, 0.0), pos(bar, st, jitter=0.001), 0.9)
        # rim, sent to the dub delay
        if (32 <= bar < 48) or (64 <= bar < 96):
            for st, v in ([(7, 0.9), (13, 0.6)] if bar % 2 == 0 else [(10, 0.8), (15, 0.55)]):
                add(rims, pan(rim1, 0.35), pos(bar, st, swing=SW, jitter=0.001), v)
        # low toms, tuned to the key
        if (24 <= bar < 48) or (56 <= bar < 104):
            pat = [(5, 53, 0.9), (11, 51, 0.7)] if bar % 2 == 0 else [(5, 53, 0.9), (9, 48, 0.6), (14, 51, 0.75)]
            for i, (st, m, v) in enumerate(pat):
                add(perc, pan(toms[m], -0.3 if i % 2 == 0 else 0.3), pos(bar, st, swing=SW, jitter=0.002),
                    v * (1 + 0.1 * rng.standard_normal()))
    hats = lp(hats, 12500).astype(np.float32)
    del hat_lvl

    CH_G = gain_for(chords, -22.0)
    RIM_G = 10 ** (-11 / 20) / np.max(np.abs(rims))
    TOM_G = 10 ** (-15 / 20) / np.max(np.abs(perc))
    G.update(chords=CH_G, rim=RIM_G, toms=TOM_G)

    # ---- pad: F / C drone with a flat seventh on top, slow filter
    padL = np.zeros(N)
    padR = np.zeros(N)
    for m, g in [(41, 1.0), (48, 0.9), (53, 0.7), (60, 0.5), (63, 0.4)]:
        f = mtof(m)
        padL += g * (saw_blep(N, f * 2 ** (-6 / 1200), rng.random(), SR) + saw_blep(N, f * 2 ** (3 / 1200), rng.random(), SR))
        padR += g * (saw_blep(N, f * 2 ** (6 / 1200), rng.random(), SR) + saw_blep(N, f * 2 ** (-2 / 1200), rng.random(), SR))
    pad_fc = auto([(0, 300), (16, 480), (48, 900), (56, 620), (76, 1100), (96, 600), (120, 300)])
    pad_fc = pad_fc * (1 + 0.28 * np.sin(2 * np.pi * TBAR / 9.0 + 1.0))
    pad = np.stack([svf_lp(padL, pad_fc, 0.9, SR), svf_lp(padR, pad_fc * 1.07, 0.9, SR)])
    pad *= auto([(0, 0.0), (4, 0.8), (8, 1.0), (16, 0.75), (32, 0.6), (47, 0.7), (48, 1.0), (55, 1.0), (56, 0.6),
                 (88, 0.75), (112, 1.0), (118, 0.7), (NBARS + 2, 0.0)])
    pad = hp(pad, 110).astype(np.float32)
    del padL, padR, pad_fc

    # ---- lead
    lead = np.zeros((2, N), dtype=np.float32)
    for start in list(range(48, 72, 4)) + [80, 84]:
        alt = ((start - 48) // 4) % 2 == 1
        for i in range(4):
            notes = LEAD_ALT_END if (i == 3 and alt) else LEAD[i]
            for st, m, ln in notes:
                add(lead, fm_pluck(m, ln * STEP, 0.8 + 0.15 * rng.random()), pos(start + i, st, jitter=0.003))
    lead = (lp(lead, 5200) * auto([(48, 0.55), (56, 1.0), (72, 1.0), (80, 0.8), (88, 0.8)])).astype(np.float32)

    # ---- noise bed, crackle, risers
    pink = signal.lfilter([0.049922035, -0.095993537, 0.050612699, -0.004408786],
                          [1, -2.494956002, 2.017265875, -0.522189400], rng.standard_normal((2, N)), axis=-1)
    hiss = hp(pink, 400) * 0.5
    crk = np.zeros(N)
    k = rng.poisson(5.0 * N / SR)
    crk[rng.integers(0, N, k)] = rng.lognormal(0, 0.9, k) * rng.choice([-1, 1], k)
    crk = bp(crk, 900, 7000)
    crk2 = np.stack([crk, np.roll(crk, 7)])
    noise = level(hiss, -20) + crk2 / np.max(np.abs(crk2)) * 0.9
    noise *= auto([(0, 0.0), (1, 1.0), (16, 0.8), (32, 0.6), (48, 1.0), (56, 0.6), (96, 0.8), (112, 1.0),
                   (120, 0.9), (NBARS + 2.5, 0.0)])
    dump('noise_bed_first_32s', (level(hiss, -20) + crk2 / np.max(np.abs(crk2)) * 0.9)[:, :32 * SR])
    noise = noise.astype(np.float32)
    del pink, hiss, crk, crk2

    riser = np.zeros((2, N), dtype=np.float32)
    for a, b, g in [(14, 16, 0.4), (30, 32, 0.5), (52, 56, 1.0), (86, 88, 0.6)]:
        s, e = pos(a), pos(b)
        n = e - s
        u = np.arange(n) / n
        nz = rng.standard_normal((2, n))
        cut = 250 * (9000 / 250) ** u
        sw = np.stack([svf_lp(nz[c], cut, 1.6, SR) for c in range(2)])
        riser[:, s:e] += hp(sw, 200) * (u ** 2.2) * g
        # the wash after the downbeat
        n2 = int(BAR * 2 * SR)
        u2 = np.arange(n2) / SR
        cut2 = 6000 * np.exp(-u2 / 0.9) + 400
        sw2 = np.stack([svf_lp(rng.standard_normal(n2), cut2, 1.0, SR) for c in range(2)])
        add(riser, hp(sw2, 300) * np.exp(-u2 / 0.7) * 0.5 * g, e)

    # ---- dub delay on the chords (dotted eighth, ping-pong), with feedback "throws" at section ends
    fb = auto([(0, 0.68), (15, 0.68), (15.5, 0.86), (16.25, 0.66), (31, 0.66), (31.5, 0.88), (32.25, 0.64),
               (46.5, 0.64), (47.5, 0.90), (49, 0.74), (55, 0.74), (55.5, 0.86), (56.25, 0.62), (86.5, 0.62),
               (87.5, 0.88), (88.5, 0.66), (110, 0.68), (112, 0.82), (118, 0.76), (120, 0.6)])
    dsend = auto([(0, 1.0), (32, 0.9), (48, 1.0), (56, 0.9), (88, 0.95), (104, 1.0)])
    d_in = chords.mean(axis=0) * dsend * CH_G   # at mix level, so the feedback saturation stays gentle
    side = np.zeros(N)
    hp_sorted = sorted(hit_pos)
    for i, s0 in enumerate(hp_sorted):
        s1 = hp_sorted[i + 1] if i + 1 < len(hp_sorted) else N
        side[max(0, s0 - 120):max(0, s1 - 120)] = i % 2
    side = np.convolve(side, np.ones(200) / 200, mode='same')
    extra = rims.mean(axis=0) * (0.6 * RIM_G) + perc.mean(axis=0) * (0.25 * TOM_G)
    dly = 3 * STEP * SR * (1 + 0.0012 * np.sin(2 * np.pi * 0.23 * TSEC) + 0.0004 * np.sin(2 * np.pi * 3.1 * TSEC))
    dL, dR = tape_delay(d_in * (1 - side) + extra, d_in * side, dly, fb, onepole(4200), onepole(130), 1.5)
    del side, extra
    dub = np.stack([dL, dR]).astype(np.float32)
    del dL, dR, d_in, dly, fb, dsend

    # ---- lead echo: dotted quarter, lazier
    lm = lead.mean(axis=0)
    dly2 = 6 * STEP * SR * (1 + 0.001 * np.sin(2 * np.pi * 0.17 * TSEC))
    l2, r2 = tape_delay(np.zeros(N), lm, dly2, np.full(N, 0.42), onepole(3000), onepole(350), 1.5)
    lead_echo = np.stack([l2, r2]).astype(np.float32)
    del l2, r2, lm, dly2

    # ---- reverbs
    hall_ir = make_ir(7.0, [(None, 300, 4.0, 0.6), (300, 1200, 4.6, 1.0), (1200, 4000, 3.2, 0.9), (4000, None, 1.7, 0.55)],
                      seed=5, predelay=0.028, hp_fc=330)
    room_ir = make_ir(1.4, [(None, 500, 0.9, 0.7), (500, 3000, 1.0, 1.0), (3000, None, 0.7, 0.8)],
                      seed=6, predelay=0.008, hp_fc=350, onset=0.004)

    # ---- level every stem on its loud passages (dB RMS), then mix
    dump('ir_hall', hall_ir)
    dump('ir_room', room_ir)
    dump('riser', riser)
    f32 = np.float32
    G.update(kick=0.64, bass=gain_for(bass, -13.0), pad=gain_for(pad, -27.0), lead=gain_for(lead, -24.0),
             hats=10 ** (-13.5 / 20) / np.max(np.abs(hats)), clap=10 ** (-11.5 / 20) / np.max(np.abs(claps)),
             shaker=10 ** (-17 / 20) / np.max(np.abs(shaker)), noise=10 ** (-29 / 20), riser=gain_for(riser, -30.0),
             echo_return=1.2, lead_echo_return=0.7)

    def stem(x, target_db=None, depth=0.0):
        y = level(x, target_db) if target_db is not None else x
        if depth:
            y = y * duck(depth)
        return y.astype(f32)

    kick_s = (pan(kick, 0.0) * 0.64).astype(f32)
    bass_s = pan(stem(bass, -13.0, 0.78), 0.0).astype(f32)
    chords_s = stem(chords * f32(CH_G), None, 0.30); del chords
    dub_s = stem(dub * f32(1.2), None, 0.35); del dub      # echo keeps its natural level against the dry stab
    pad_s = stem(pad, -27.0, 0.55); del pad
    LD_G = gain_for(lead, -24.0)
    lead_s = stem(lead * f32(LD_G)); del lead
    lecho_s = stem(lead_echo * f32(LD_G * 0.7), None, 0.25); del lead_echo
    hats_s = peak_level(hats, -13.5).astype(f32); del hats
    claps_s = peak_level(claps, -11.5).astype(f32); del claps
    rims_s = (rims * f32(RIM_G)).astype(f32); del rims
    perc_s = (perc * f32(TOM_G)).astype(f32); del perc
    shaker_s = peak_level(shaker, -17.0).astype(f32); del shaker
    noise_s = stem(noise * f32(10 ** (-29 / 20)), None, 0.3); del noise
    riser_s = stem(riser, -30.0); del riser

    hall_send = (chords_s * f32(0.55) + dub_s * f32(0.5) + pad_s * f32(0.9) + lead_s * f32(0.7) + lecho_s * f32(0.5)
                 + claps_s * f32(0.35) + rims_s * f32(0.3) + riser_s * f32(0.8))
    hall = reverb(hall_send.astype(np.float64), hall_ir); del hall_send
    G['hall_return'] = gain_for(hall, -27.0)
    hall_s = stem(hall, -27.0, 0.40); del hall
    room_send = claps_s * f32(0.8) + hats_s * f32(0.35) + perc_s * f32(0.5) + rims_s * f32(0.6) + shaker_s * f32(0.4)
    room = reverb(room_send.astype(np.float64), room_ir); del room_send
    G['room_return'] = gain_for(room, -36.0)
    room_s = stem(room, -36.0); del room

    stems = dict(kick=kick_s, bass=bass_s, chords=chords_s, dub_delay=dub_s, pad=pad_s, lead=lead_s,
                 lead_echo=lecho_s, hats=hats_s, shaker=shaker_s, clap=claps_s, rim=rims_s, toms=perc_s, noise=noise_s,
                 riser=riser_s, hall=hall_s, room=room_s)
    mix = np.zeros((2, N))
    for name, s in stems.items():
        mix += s
        print(f'  {name:10s} peak {db(np.max(np.abs(s))):6.1f} dB   loud-rms {db(rms_pct(s)):6.1f} dB')

    # ---- master
    mix = hp(mix, 24)
    fade = np.ones(N)
    f0 = pos(NBARS - 2)
    fade[f0:] = 0.5 * (1 + np.cos(np.pi * np.arange(N - f0) / (N - f0)))
    mix *= fade
    pre = float(os.environ.get('PREGAIN', '1.3'))
    mix = np.tanh(mix * pre * 1.1) / 1.1  # gentle tape-ish saturation
    mix, genv = limiter(np.ascontiguousarray(mix), 0.70, 1 - np.exp(-1 / (0.004 * SR)), 1 - np.exp(-1 / (0.12 * SR)))
    print('limiter: max reduction %.1f dB, active %.1f%% of the time' % (-db(genv.min()), 100 * (genv < 0.99).mean()))
    scale = 0.89 / np.max(np.abs(mix))
    mix *= scale
    G.update(master_pregain=pre * 1.1, master_post=1 / 1.1, limiter_threshold=0.70, final_scale=float(scale))
    if parts_dir:
        json.dump({k: float(v) for k, v in G.items()}, open(os.path.join(parts_dir, 'gains.json'), 'w'), indent=1)

    if stems_dir:
        os.makedirs(stems_dir, exist_ok=True)
        for name, s in stems.items():
            wavfile.write(os.path.join(stems_dir, name + '.wav'), SR, (np.clip(s * fade, -1, 1).T * 32767).astype(np.int16))
    return mix


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else 'halbschatten.wav'
    stems_dir = sys.argv[2] if len(sys.argv) > 2 else None
    mix = render(stems_dir)
    dither = (rng.random(mix.shape) - rng.random(mix.shape)) / 32768.0
    wavfile.write(out, SR, np.clip((mix + dither).T * 32767, -32768, 32767).astype(np.int16))
    print('wrote', out, 'peak', db(np.max(np.abs(mix))))
