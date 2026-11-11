#!/usr/bin/env python3
"""Restlicht: melancholic Detroit electro, D dorian (white keys), 124 BPM, 120 bars and a 6 s tail (3:58).
The reference render for Takt. One 2-bar bass riff carries it; its filter lane is the story.

    python3 misc/restlicht_reference.py out.wav [stems_dir]

Needs numpy, scipy, numba. Renders at 44.1 kHz; out.wav is misc/restlicht/reference.flac bit for bit.
With a stems dir it also writes the pre-master stems and, next to them, parts/: every one-shot, both
reverb impulses, 32 s of the noise bed, gains.json (every auto-levelled gain, resolved) and events.json
(every event as it was placed: its sample, its gain after the humanizing, its round robin, its pan; the
pad's start phases). The log draws nothing from the random stream. Notes for the port: misc/RESTLICHT.md.
MIDI numbers here are the sounding pitches.

The brief:
  image     Restlicht, residual light: a drum machine still running in a room everyone has left.
  carrier   the bassline, one 2-bar riff in two densities. Its filter lane tells the story (190 -> 1100 -> 200 Hz).
  harmony   one event, late: from bar 56 the pad's three notes drop a step for one bar in four (D A E -> C G D). The riff never moves.
  visitor   a soft whistle, bars 64-79 and once more 96-103. At most 2 notes a bar.
  refused   an arpeggio, a vocoder or robot voice, zaps and cowbell, a riser.

Everything synthesized here, no samples."""
import sys, os, math, json
import numpy as np
from scipy import signal
from scipy.io import wavfile
from numba import njit

SR = 44100
BPM = 124.0
BEAT = 60.0 / BPM
STEP = BEAT / 4
BAR = BEAT * 4
NBARS = 120
TAIL = 6.0
N = int(round((NBARS * BAR + TAIL) * SR))
SW = 0.05
rng = np.random.default_rng(1985)
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


# ---------------------------------------------------------------- one-shots: an 808-shaped kit
def make_kick(decay=0.24):
    d = 0.95
    n = int(d * SR)
    t = np.arange(n) / SR
    f = mtof(33) + 70 * np.exp(-t / 0.026) + 170 * np.exp(-t / 0.004)   # settles on A1, 55 Hz: the fifth under the D riff
    body = np.sin(2 * np.pi * np.cumsum(f) / SR)
    env = np.minimum(t / 0.001, 1) * np.exp(-t / decay)
    click = lp(rng.standard_normal(n), 2500) * np.exp(-t / 0.0015) * 0.25
    x = np.tanh(2.1 * body * env) + click
    x = lp(x, 6000, 1)
    x *= np.clip((d - t) / 0.08, 0, 1)
    return peak_norm(x)


def make_snare(seed):
    r = np.random.default_rng(seed)
    n = int(0.34 * SR)
    t = np.arange(n) / SR
    tone = np.sin(2 * np.pi * 186 * t) * np.exp(-t / 0.05) * 0.75 + np.sin(2 * np.pi * 332 * t) * np.exp(-t / 0.032) * 0.45
    nz = lp(hp(r.standard_normal(n), 1400), 6000) * (np.exp(-t / 0.07) * 0.6 + np.exp(-t / 0.012) * 0.35)
    return peak_norm(np.tanh(1.3 * (tone + nz)) * np.clip((0.34 - t) / 0.04, 0, 1))


def metal(n, r, mult):
    x = np.zeros(n)
    for f in [205.3, 304.4, 369.6, 522.7, 540.0, 800.0]:
        ph = r.random()
        x += saw_blep(n, f * mult, ph, SR) - saw_blep(n, f * mult, ph + 0.5, SR)
    return x / 6


def make_chh(seed):
    r = np.random.default_rng(seed)
    n = int(0.1 * SR)
    t = np.arange(n) / SR
    x = metal(n, r, 1.0) * 0.85 + r.standard_normal(n) * 0.3
    return peak_norm(hp(x, 7200, 4) * np.exp(-t / 0.017))


def make_ohh(seed):
    r = np.random.default_rng(seed)
    n = int(0.5 * SR)
    t = np.arange(n) / SR
    x = metal(n, r, 1.0) * 0.9 + r.standard_normal(n) * 0.25
    return peak_norm(hp(x, 6500, 4) * (1 - np.exp(-t / 0.002)) * np.exp(-t / 0.13) * np.clip((0.5 - t) / 0.05, 0, 1))


def make_shaker(seed):
    r = np.random.default_rng(seed)
    n = int(0.1 * SR)
    t = np.arange(n) / SR
    return peak_norm(hp(r.standard_normal(n), 6000, 2) * (1 - np.exp(-t / 0.004)) * np.exp(-t / 0.02))


def make_rim():
    n = int(0.07 * SR)
    t = np.arange(n) / SR
    x = np.sin(2 * np.pi * 1667 * t) * 0.6 + np.sin(2 * np.pi * 455 * t) * 0.5
    x = x * np.exp(-t / 0.008) + rng.standard_normal(n) * np.exp(-t / 0.0008) * 0.4
    return peak_norm(hp(x, 380))


def make_tom(m):
    n = int(0.5 * SR)
    t = np.arange(n) / SR
    f = mtof(m) * (1 + 0.35 * np.exp(-t / 0.02))
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.minimum(t / 0.001, 1) * np.exp(-t / 0.13)
    return peak_norm(np.tanh(1.3 * x) * np.clip((0.5 - t) / 0.05, 0, 1))


# ---------------------------------------------------------------- the score
# The carrier: one 2-bar bass riff on D2. (step, midi, length in steps, accent, slide). All white keys.
RIFF = [(0, 38, 1.5, 1, 0), (3, 38, 1.0, 0, 0), (6, 41, 1.5, 0, 0), (9, 38, 1.0, 0, 0), (11, 48, 1.0, 0, 0), (13, 45, 1.5, 0, 0), (15, 36, 1.0, 0, 0),
        (16, 38, 1.5, 1, 0), (19, 38, 1.0, 0, 0), (22, 41, 1.5, 0, 0), (25, 43, 1.5, 0, 0), (27, 45, 1.0, 0, 0), (30, 48, 1.0, 0, 0), (31, 47, 1.0, 0, 1)]
RIFF_SPARSE = [(0, 38, 1.5, 1, 0), (6, 41, 1.5, 0, 0), (9, 38, 1.0, 0, 0),
               (16, 38, 1.5, 1, 0), (22, 41, 1.5, 0, 0), (27, 45, 1.0, 0, 0), (30, 48, 1.0, 0, 0), (31, 47, 1.0, 0, 1)]


def riff_at(bar):
    """Which riff starts at this even bar, or None."""
    if 8 <= bar < 16 or 48 <= bar < 56 or 92 <= bar < 96 or 104 <= bar < 116:
        return RIFF_SPARSE
    if 16 <= bar < 48 or 56 <= bar < 88 or 96 <= bar < 104:
        return RIFF
    return None            # bars 88-91: the floor without the riff


def pad_notes(bar):
    if bar < 16 or bar >= 112:
        return (50, 57)                                   # D A
    if bar < 32 or bar >= 104:
        return (50, 57, 64)                               # D A E: fifths, no third
    if bar < 56:
        return (50, 57, 64) if ((bar - 32) // 4) % 2 == 0 else (50, 57, 67)      # one finger: E up to G and back
    return [(50, 57, 64), (50, 57, 67), (50, 57, 64), (48, 55, 62)][(bar - 56) % 4]   # the event: C G D one bar in four


# The visitor: a whistle. (bar in phrase, step, midi, length in steps)
PHRASE_1 = [(0, 0, 69, 12), (1, 0, 67, 6), (1, 8, 64, 8), (2, 2, 65, 12), (3, 0, 64, 6), (3, 8, 62, 8)]
PHRASE_2 = [(0, 0, 69, 12), (1, 0, 72, 6), (1, 8, 69, 8), (2, 2, 67, 12), (3, 0, 64, 14)]
VISITS = [(64, PHRASE_1), (68, PHRASE_2), (72, PHRASE_1), (76, PHRASE_2), (96, PHRASE_1), (100, PHRASE_2)]


def kick_steps(bar):
    if bar < 4 or 48 <= bar < 56 or bar >= 116:
        return []
    if bar == 47:
        return [(0, 1.0)]
    k = [(0, 1.0), (6, 0.9), (10, 0.95)]
    if bar % 4 == 3:
        k.append((15, 0.5))
    return k


def has_snare(bar):
    return (8 <= bar < 48) or (56 <= bar < 116)


# ================================================================ render
def render(stems_dir=None):
    print('samples', N, 'seconds', round(N / SR, 2))
    f32 = np.float32
    G, EV = {}, {k: [] for k in ('kick', 'bass', 'snare', 'hatc', 'hato', 'shaker', 'rim', 'tom', 'lead', 'pad')}
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

    # ---- kick
    kick_a, kick_b = make_kick(0.24), make_kick(0.09)
    kick = np.zeros(N)
    kpos = []
    for bar in range(NBARS):
        for st, v in kick_steps(bar):
            p = pos(bar, st)
            add(kick, kick_b if st == 15 else kick_a, p, v)
            EV['kick'].append([int(p), v, 1 if st == 15 else 0])
            if st != 15:
                kpos.append(p)
    dump('kick', kick_a)
    dump('kick_ghost', kick_b)
    tt = np.arange(int(0.5 * SR)) / SR
    tpl = np.minimum(tt / 0.002, 1) * np.exp(-np.maximum(tt - 0.04, 0) / 0.12)
    sc = np.zeros(N)
    for p in kpos:
        seg = sc[p:p + len(tpl)]
        np.maximum(seg, tpl[:len(seg)], out=seg)

    def duck(depth):
        return 1.0 - depth * sc

    # ---- the bass: a round mono synth, saw plus square, two lowpasses, the filter on a lane
    starts, midis, lens, accs, slides = [], [], [], [], []
    for bar in range(0, NBARS, 2):
        r_ = riff_at(bar)
        if r_ is None:
            continue
        for st, note, ln, ac, sl in r_:
            starts.append(pos(bar, st))
            midis.append(note)
            lens.append(int(ln * STEP * SR))
            accs.append(ac)
            slides.append(sl)
    starts = np.array(starts, dtype=np.int64)
    lens = np.array(lens, dtype=np.int64)
    slides_a = np.array(slides, dtype=np.int64)
    for i in range(len(starts) - 1):
        if slides_a[i + 1] == 1:
            lens[i] = starts[i + 1] - starts[i] + 64
    EV['bass'] = [[int(a_), int(b_), int(c_), int(d_), int(e_)] for a_, b_, c_, d_, e_ in zip(starts, midis, lens, accs, slides_a)]
    ftau = auto([(8, 0.10), (48, 0.14), (76, 0.20), (104, 0.12)])
    freq, amp, fenv = acid_ctrl(N, starts, np.array(midis, dtype=np.float64), lens, np.array(accs, dtype=np.float64), slides_a, np.exp(-1.0 / (ftau * SR)), SR)
    b_base = np.exp(auto([(8, np.log(190)), (16, np.log(280)), (32, np.log(480)), (47, np.log(620)), (48, np.log(300)), (56, np.log(560)),
                          (76, np.log(1100)), (84, np.log(900)), (88, np.log(600)), (92, np.log(420)), (104, np.log(330)), (116, np.log(200))]))
    b_amt = auto([(8, 0.7), (32, 1.3), (56, 1.5), (76, 1.9), (96, 1.3), (116, 0.7)])
    b_q = auto([(8, 1.2), (56, 1.7), (76, 2.4), (96, 1.6), (116, 1.2)])
    b_fc = np.clip(b_base * 2 ** (b_amt * fenv), 60, 6000)
    osc = saw_var_ph(freq, 0.0, SR) * 0.7 + (saw_var_ph(freq, 0.25, SR) - saw_var_ph(freq, 0.75, SR)) * 0.45
    y = svf_lp(osc, b_fc, b_q, SR)
    y = svf_lp(y, np.minimum(b_fc * 1.3, 7000), np.full(N, 0.7), SR)
    b_drive = auto([(8, 1.3), (76, 1.9), (116, 1.3)])
    bass = hp(np.tanh(b_drive * y * amp) / b_drive, 38)
    del osc, y, freq, fenv, b_fc
    print('  bass notes', len(starts))

    # ---- drums
    snare1 = [make_snare(s) for s in (3, 4)]
    chh = [make_chh(s) for s in (11, 12, 13)]
    ohh = [make_ohh(s) for s in (21, 22)]
    shk = [make_shaker(s) for s in (31, 32, 33)]
    rim1 = make_rim()
    toms = {m: make_tom(m) for m in (45, 50)}
    for i_, x_ in enumerate(snare1):
        dump('snare_%d' % i_, x_)
    for i_, x_ in enumerate(chh):
        dump('hat_closed_%d' % i_, x_)
    for i_, x_ in enumerate(ohh):
        dump('hat_open_%d' % i_, x_)
    for i_, x_ in enumerate(shk):
        dump('shaker_%d' % i_, x_)
    dump('rim', rim1)
    dump('tom_45', toms[45])
    dump('tom_50', toms[50])
    snare = np.zeros((2, N), dtype=f32)
    hats = np.zeros((2, N), dtype=f32)
    shaker = np.zeros((2, N), dtype=f32)
    rims = np.zeros((2, N), dtype=f32)
    perc = np.zeros((2, N), dtype=f32)
    hat_lvl = auto([(8, 0.5), (16, 0.8), (32, 1.0), (47, 1.0), (48, 0.45), (55, 0.6), (56, 1.0), (88, 0.85), (96, 0.9), (104, 0.0)])
    CH_VEL = [0.62, 0.26, 0.46, 0.28]
    for bar in range(NBARS):
        if has_snare(bar):
            for st in (4, 12):
                if bar == 47 and st == 12:
                    continue
                k_ = int(rng.integers(2))
                p_ = pos(bar, st, jitter=0.0008)
                g_ = 0.92 * (1 + 0.04 * rng.standard_normal())
                add(snare, pan(snare1[k_], 0.0), p_, g_)
                EV['snare'].append([int(p_), float(g_), k_])
        for st in range(16):
            b4 = st % 4
            if 8 <= bar < 104:
                p = pos(bar, st, swing=SW, jitter=0.001)
                opened = st == 14 and bar % 2 == 1 and ((16 <= bar < 48) or (56 <= bar < 104))
                if opened:
                    k_ = int(rng.integers(2))
                    g_ = 0.7 * (1 + 0.06 * rng.standard_normal()) * hat_lvl[p]
                    add(hats, pan(ohh[k_], -0.15), p, g_)
                    EV['hato'].append([int(p), float(g_), k_])
                else:
                    k_ = int(rng.integers(3))
                    g_ = CH_VEL[b4] * (1 + 0.14 * rng.standard_normal()) * hat_lvl[p]
                    add(hats, pan(chh[k_], 0.2), p, g_)
                    EV['hatc'].append([int(p), float(g_), k_])
            if (40 <= bar < 48) or (56 <= bar < 88):
                k_ = int(rng.integers(3))
                p_ = pos(bar, st, swing=SW, jitter=0.002)
                g_ = [0.5, 0.75, 1.0, 0.75][b4] * (1 + 0.1 * rng.standard_normal()) * min(1.0, (bar - (40 if bar < 48 else 56) + st / 16) / 3 + 0.3)
                add(shaker, pan(shk[k_], -0.4), p_, g_)
                EV['shaker'].append([int(p_), float(g_), k_])
        # rim, into the echo
        if bar < 8 or bar >= 112:
            rp = [(3, 0.8)] if bar % 2 == 0 else [(13, 0.7)]
        else:
            rp = [(3, 0.85), (9, 0.6)] if bar % 2 == 0 else [(7, 0.8), (13, 0.6)]
        for st, v in rp:
            p_ = pos(bar, st, jitter=0.001)
            add(rims, pan(rim1, 0.35), p_, v)
            EV['rim'].append([int(p_), v])
        # two toms into every eighth bar
        if bar % 8 == 7 and 32 <= bar < 104 and bar != 47:
            p_ = pos(bar, 13, jitter=0.002)
            add(perc, pan(toms[50], -0.3), p_, 0.9)
            EV['tom'].append([int(p_), 50, 0.9, -0.3])
            p_ = pos(bar, 15, jitter=0.002)
            add(perc, pan(toms[45], 0.3), p_, 0.8)
            EV['tom'].append([int(p_), 45, 0.8, 0.3])
    hats = lp(hats, 12500).astype(f32)

    # ---- pad: fifths, no third; one note moves
    pad = np.zeros((2, N))
    bars_i = np.minimum(NBARS - 1, TBAR.astype(np.int64))
    sm = onepole(1.0 / 0.8)
    for m in (48, 50, 55, 57, 62, 64, 67):
        on = np.array([1.0 if m in pad_notes(b) else 0.0 for b in range(NBARS)])[bars_i]
        if on.max() == 0:
            continue
        g = signal.lfilter([sm], [1, sm - 1], signal.lfilter([sm], [1, sm - 1], on))
        f = mtof(m)
        ph_ = [float(rng.random()) for _ in range(4)]
        EV['pad'].append([m] + ph_)
        pad[0] += g * (saw_blep(N, f * 2 ** (-8 / 1200), ph_[0], SR) + saw_blep(N, f * 2 ** (5 / 1200), ph_[1], SR))
        pad[1] += g * (saw_blep(N, f * 2 ** (8 / 1200), ph_[2], SR) + saw_blep(N, f * 2 ** (-4 / 1200), ph_[3], SR))
    pad_fc = auto([(0, 460), (8, 480), (16, 600), (48, 1300), (56, 900), (76, 1500), (104, 700), (120, 350)]) * (1 + 0.2 * np.sin(2 * np.pi * TBAR / 6.0 + 1.3))
    pad = np.stack([svf_lp(pad[0], pad_fc, np.full(N, 0.9), SR), svf_lp(pad[1], pad_fc * 1.05, np.full(N, 0.9), SR)])
    pad *= auto([(0, 0.0), (1.5, 0.95), (4, 0.85), (8, 0.6), (16, 0.7), (47, 0.75), (48, 1.0), (55.5, 1.0), (56, 0.7), (87.5, 0.75), (88, 1.0), (92, 0.75), (112, 1.0), (119, 0.8), (NBARS + 2.5, 0.0)])
    pad = hp(pad, 160).astype(f32)
    del pad_fc

    # ---- the visitor: a whistle, a sine with a little second harmonic, gliding
    vs, vm, vl = [], [], []
    for b0, phrase in VISITS:
        for pb, st, m, ln in phrase:
            vs.append(pos(b0 + pb, st, jitter=0.004))
            vm.append(m)
            vl.append(int(ln * STEP * SR))
    order = np.argsort(vs)
    vs = np.array(vs, dtype=np.int64)[order]
    vm = np.array(vm, dtype=np.float64)[order]
    vl = np.array(vl, dtype=np.int64)[order]
    EV['lead'] = [[int(a_), int(b_), int(c_)] for a_, b_, c_ in zip(vs, vm, vl)]
    vfreq, vamp, _ = acid_ctrl(N, vs, vm, vl, np.zeros(len(vs)), np.zeros(len(vs), dtype=np.int64), np.full(N, 0.999), SR)
    ga = onepole(14.0)                                            # soften the gate into a breath
    vamp = signal.lfilter([ga], [1, ga - 1], signal.lfilter([ga], [1, ga - 1], vamp))
    gf = onepole(1.0 / (2 * np.pi * 0.05))                        # and the pitch into a glide
    vfreq = np.exp(signal.lfilter([gf], [1, gf - 1], np.log(vfreq), zi=[np.log(vfreq[0]) * (1 - gf)])[0])
    vib = 1 + 0.0035 * np.sin(2 * np.pi * 5.1 * TSEC) * np.clip(signal.lfilter([onepole(1.5)], [1, onepole(1.5) - 1], (vamp > 0.3).astype(float)), 0, 1)
    ph = 2 * np.pi * np.cumsum(vfreq * vib) / SR
    lead = (np.sin(ph) + 0.22 * np.sin(2 * ph + 0.4) + 0.06 * np.sin(3 * ph)) * vamp
    lead = lp(lead, 2600) * auto([(64, 0.9), (72, 1.0), (80, 1.0), (96, 0.7), (104, 0.7)])
    del vfreq, vamp, vib, ph

    # ---- room tone
    pink = signal.lfilter([0.049922035, -0.095993537, 0.050612699, -0.004408786], [1, -2.494956002, 2.017265875, -0.522189400], rng.standard_normal((2, N)), axis=-1)
    bed = hp(pink, 450)
    dump('noise_bed_first_32s', bed[:, :32 * SR])
    noise = (bed * auto([(0, 0.0), (1, 1.0), (8, 0.8), (48, 1.0), (56, 0.6), (88, 0.9), (92, 0.6), (112, 1.0), (NBARS + 2.5, 0.0)])).astype(f32)
    del pink, bed
    # ---- one tape echo for the rim, a little snare and the whistle: three sixteenths, thrown at the two section ends
    S = {}
    S['kick'] = np.asarray(pan(kick * 0.58, 0.0), dtype=f32)
    B_G = gset('bass', gain_for(bass, -14.4))
    S['bass'] = np.asarray(pan(bass * B_G * duck(0.4), 0.0), dtype=f32)
    S['snare'] = np.asarray(snare * gset('snare', peak_gain(snare, -11.8)), dtype=f32)
    S['hats'] = np.asarray(hats * gset('hats', peak_gain(hats, -12.5)), dtype=f32)
    S['shaker'] = np.asarray(shaker * gset('shaker', peak_gain(shaker, -18.5)), dtype=f32)
    S['rim'] = np.asarray(rims * gset('rim', peak_gain(rims, -11.5)), dtype=f32)
    S['toms'] = np.asarray(perc * gset('toms', peak_gain(perc, -13.0)), dtype=f32)
    S['pad'] = np.asarray(pad * gset('pad', gain_for(pad, -26.5)) * duck(0.3), dtype=f32)
    L_G = gset('lead', gain_for(lead, -22.5))
    S['lead'] = np.asarray(pan(lead * L_G, -0.08), dtype=f32)
    S['noise'] = np.asarray(noise * gset('noise', gain_for(noise, -49.0)), dtype=f32)
    del kick, bass, snare, hats, shaker, rims, perc, pad, noise

    fb = auto([(0, 0.52), (46.5, 0.5), (47.5, 0.88), (49, 0.66), (55, 0.66), (56, 0.48), (86.5, 0.48), (87.5, 0.86), (89, 0.6), (92, 0.48), (112, 0.6), (116, 0.74), (120, 0.7)])
    sn_send = auto([(0, 0.12), (47.1, 0.12), (47.2, 0.75), (47.6, 0.75), (47.7, 0.12), (87.65, 0.12), (87.72, 0.45), (87.97, 0.45), (88.0, 0.12)])
    e_in = S['rim'].mean(axis=0) * 1.0 + S['snare'].mean(axis=0) * sn_send + lead * L_G * 0.55
    side = np.convolve(np.floor(TBAR * 4) % 2, np.ones(400) / 400, mode='same')        # the echo's entry side swaps every beat pair
    dly = 3 * STEP * SR * (1 + 0.0012 * np.sin(2 * np.pi * 0.19 * TSEC) + 0.0004 * np.sin(2 * np.pi * 2.7 * TSEC))
    eL, eR = tape_delay(e_in * (1 - side), e_in * side, dly, fb, onepole(3000), onepole(350), 1.5)
    S['echo'] = np.asarray(np.stack([eL, eR]) * 0.8 * duck(0.2), dtype=f32)
    del eL, eR, e_in, side, dly, lead

    hall_ir = make_ir(4.8, [(None, 300, 2.8, 0.5), (300, 1200, 3.6, 1.0), (1200, 4000, 2.8, 0.9), (4000, None, 1.5, 0.5)], seed=41, predelay=0.03, hp_fc=300)
    room_ir = make_ir(0.9, [(None, 500, 0.55, 0.6), (500, 3000, 0.7, 1.0), (3000, None, 0.5, 0.8)], seed=42, predelay=0.006, hp_fc=400, onset=0.004)
    dump('ir_hall', hall_ir)
    dump('ir_room', room_ir)
    hall_send = (S['pad'] * f32(0.9) + S['lead'] * f32(0.75) + S['echo'] * f32(0.5) + S['snare'] * f32(0.16) + S['rim'] * f32(0.3) + S['toms'] * f32(0.3) + S['bass'] * f32(0.05))
    hall = reverb(hall_send.astype(np.float64), hall_ir)
    del hall_send
    S['hall'] = np.asarray(hall * gset('hall_return', gain_for(hall, -28.0)) * duck(0.3), dtype=f32)
    del hall
    room_send = S['snare'] * f32(0.7) + S['hats'] * f32(0.3) + S['toms'] * f32(0.5) + S['rim'] * f32(0.5) + S['shaker'] * f32(0.4)
    room = reverb(room_send.astype(np.float64), room_ir)
    del room_send
    S['room'] = np.asarray(room * gset('room_return', gain_for(room, -35.0)), dtype=f32)
    del room

    mix = np.zeros((2, N))
    for name, s in S.items():
        mix += s
        print(f'  {name:8s} peak {db(np.max(np.abs(s))):6.1f} dB   loud-rms {db(rms_pct(s)):6.1f} dB')

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
    G.update(kick=0.58, echo_return=0.8, master_pregain=pre * 1.1, master_post=1 / 1.1, limiter_threshold=0.70)
    if parts_dir:
        json.dump(G, open(os.path.join(parts_dir, 'gains.json'), 'w'), indent=1)
        json.dump({'sr': SR, 'tempo': BPM, 'bars': NBARS, 'tail': TAIL, 'events': EV}, open(os.path.join(parts_dir, 'events.json'), 'w'))

    if stems_dir:
        os.makedirs(stems_dir, exist_ok=True)
        for name, s in S.items():
            wavfile.write(os.path.join(stems_dir, name + '.wav'), SR, (np.clip(s * fade, -1, 1).T * 32767).astype(np.int16))
    return mix


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else 'restlicht.wav'
    mix = render(sys.argv[2] if len(sys.argv) > 2 else None)
    dither = (rng.random(mix.shape) - rng.random(mix.shape)) / 32768.0
    wavfile.write(out, SR, np.clip((mix + dither).T * 32767, -32768, 32767).astype(np.int16))
    print('wrote', out)
