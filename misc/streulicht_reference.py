#!/usr/bin/env python3
"""Streulicht: melodic techno in E minor, 122 BPM, 128 bars and an 8 s tail (4:20). The reference render for Takt.
In the manner of Hannes Bieger: one long Moog-style sequence performed over the whole length, a punchy
16th-note bass, a large reverb, a hand-played lead that comes late. Nothing here is taken from his records.

    python3 misc/streulicht_reference.py out.wav [stems_dir]

Needs numpy, scipy, numba. Renders at 44.1 kHz; out.wav is misc/streulicht/reference.flac bit for bit.
With a stems dir it also writes the pre-master stems and, next to them, parts/: every one-shot, the hat's
noise buffer, both reverb impulses, 32 s of the noise bed, gains.json (every auto-levelled gain, resolved),
drift.json (the six slow pitch and cutoff wanders) and events.json (every event as it was placed: its
sample, its gain after the humanizing, its round robin, its pan; the pad's start phases). The log draws
nothing from the random stream. Notes for the port: misc/STREULICHT.md. MIDI numbers are the sounding pitches.

The brief:
  image     Streulicht, stray light: one line scattering in a big dark room.
  carrier   the line: an 8-stage sequencer row whose length the player changes (8, 7, 6 stages), so it drifts
            against the bar. Its filter, resonance, decay and second oscillator are the story.
  harmony   the bass never leaves E. The pad holds B D F# and moves one finger to C D F# for a bar now and then.
  visitor   a hand-played lead, bars 72-87 and once more 104-111. Long notes, glide, at most 2 a bar.
  refused   chord stabs, a riser, crashes, a supersaw, a vocal.

Everything synthesized here, no samples."""
import sys, os, math, json
import numpy as np
from scipy import signal
from scipy.io import wavfile
from numba import njit

SR = 44100
BPM = 122.0
BEAT = 60.0 / BPM
STEP = BEAT / 4
BAR = BEAT * 4
NBARS = 128
TAIL = 8.0
N = int(round((NBARS * BAR + TAIL) * SR))
SW = 0.04
rng = np.random.default_rng(1967)
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
    f = mtof(31) + 95 * np.exp(-t / 0.028) + 260 * np.exp(-t / 0.005)      # settles on G1, 49 Hz
    body = np.sin(2 * np.pi * np.cumsum(f) / SR)
    env = np.minimum(t / 0.001, 1) * np.exp(-np.maximum(t - 0.03, 0) / 0.13)
    click = lp(rng.standard_normal(n), 3500) * np.exp(-t / 0.0012) * 0.3
    x = np.tanh(1.9 * body * env) + click
    x = lp(x, 7000, 1)
    x *= np.clip((d - t) / 0.06, 0, 1)
    return peak_norm(x)


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


# ---------------------------------------------------------------- the score
# The line. One row of eight stages, as on a step sequencer: E3 B3 G3 D4 E3 F#4 B3 A3.
ROW = [52, 59, 55, 62, 52, 66, 59, 57]
ROW_ACC = [1, 0, 0, 0, 0, 1, 0, 0]
# (first bar, last bar + 1, stages in use, stage that is skipped or -1). The row restarts at each section.
LINE_SECTIONS = [(0, 16, 8, 4), (16, 32, 8, -1), (32, 56, 7, -1), (56, 64, 6, -1), (64, 96, 7, -1), (96, 104, 6, -1), (104, 128, 8, -1)]


def row_note(bar, stage):
    if stage == 5 and 88 <= bar < 104:
        return 67              # at the peak the player tunes stage 6 up from F#4 to G4
    return ROW[stage]


def pad_notes(bar):
    A, B = (59, 62, 66), (60, 62, 66)          # B D F#, and C D F#: one finger
    if bar < 40 or bar >= 104:
        return A
    if 56 <= bar < 64:
        return A if ((bar - 56) // 2) % 2 == 0 else B
    return B if bar % 4 == 3 else A


# The visitor: a lead played by hand. (bar in phrase, step, midi, length in steps)
PHRASE_1 = [(0, 0, 71, 10), (0, 12, 74, 4), (1, 0, 76, 13), (2, 2, 74, 6), (2, 10, 71, 6), (3, 0, 67, 4), (3, 4, 66, 10)]
PHRASE_2 = [(0, 0, 71, 10), (0, 12, 74, 4), (1, 0, 79, 10), (1, 12, 78, 4), (2, 0, 76, 8), (2, 10, 74, 6), (3, 0, 71, 14)]
VISITS = [(72, PHRASE_1), (76, PHRASE_2), (80, PHRASE_1), (84, PHRASE_2), (104, PHRASE_1), (108, PHRASE_2)]


def has_kick(bar, beat):
    if bar < 8 or 56 <= bar < 64 or 96 <= bar < 100 or bar >= 124:
        return False
    if bar in (55, 95) and beat >= 2:
        return False
    return True


def has_bass(bar):
    return (16 <= bar < 56) or (64 <= bar < 96) or (104 <= bar < 120)


def has_clap(bar):
    return (32 <= bar < 55) or (64 <= bar < 95) or (104 <= bar < 112)


# ================================================================ render
def render(stems_dir=None):
    print('samples', N, 'seconds', round(N / SR, 2))
    f32 = np.float32
    G, EV = {}, {k: [] for k in ('kick', 'line', 'bass', 'lead', 'clap', 'hat', 'ohat', 'pad')}
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

    # ---- kick and the duck it drives
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

    # ---- the line
    starts, midis, lens, accs, vels = [], [], [], [], []
    gate_len = auto([(0, 0.55), (32, 0.6), (56, 0.95), (64, 0.6), (88, 0.7), (96, 0.95), (104, 0.6)])
    for b0, b1, nst, skip in LINE_SECTIONS:
        for s in range((b1 - b0) * 16):
            stage = s % nst
            if stage == skip:
                continue
            bar, st = b0 + s // 16, s % 16
            p = pos(bar, st)
            starts.append(p)
            midis.append(row_note(bar, stage))
            lens.append(int(gate_len[p] * STEP * SR))
            accs.append(ROW_ACC[stage])
            vels.append(1.0 + 0.05 * rng.standard_normal())
    n_line = len(starts)
    EV['line'] = [[int(a_), int(b_), int(c_), int(d_), float(e_)] for a_, b_, c_, d_, e_ in zip(starts, midis, lens, accs, vels)]
    l_adec = coef(auto([(0, 0.10), (32, 0.13), (56, 0.30), (64, 0.12), (88, 0.17), (96, 0.28), (104, 0.13), (120, 0.09)]))
    l_sus = auto([(0, 0.0), (55, 0.0), (56, 0.35), (63, 0.35), (64, 0.0), (95, 0.0), (96, 0.3), (103, 0.3), (104, 0.0)])
    l_rel = coef(auto([(0, 0.03), (56, 0.09), (64, 0.03), (96, 0.08), (104, 0.03)]))
    l_fdec = coef(auto([(0, 0.07), (32, 0.10), (56, 0.25), (64, 0.10), (88, 0.16), (96, 0.22), (104, 0.10), (124, 0.06)]))
    l_gl = coef(auto([(0, 0.0), (55.9, 0.0), (56, 0.024), (63, 0.03), (64, 0.0), (95.9, 0.0), (96, 0.026), (103.9, 0.026), (104, 0.0)]))
    freq, amp, fenv = seq_ctrl(N, np.array(starts, dtype=np.int64), np.array(midis, dtype=np.float64), np.array(lens, dtype=np.int64),
                               np.array(accs, dtype=np.float64), np.zeros(n_line, dtype=np.int64), np.array(vels), 0.0015,
                               l_adec, l_sus, l_rel, l_fdec, l_gl, mtof(52), SR)
    del l_adec, l_sus, l_rel, l_fdec, l_gl
    freq *= drift(3.5, 11)
    pw = 0.5 + 0.13 * np.sin(2 * np.pi * TBAR / 9.0)
    saw1, pul1 = osc_moog(freq, pw, 0.0, SR)
    saw2, _ = osc_moog(freq * 2 ** (-7 / 1200) * drift(3.0, 12), pw, 0.31, SR)
    saw3, _ = osc_moog(freq * 2.0 * 2 ** (5 / 1200) * drift(3.0, 13), pw, 0.67, SR)
    pulse_mix = auto([(0, 0.15), (32, 0.35), (56, 0.5), (64, 0.3), (88, 0.5), (104, 0.3), (127, 0.1)])
    osc2_lvl = auto([(0, 0.0), (30, 0.0), (34, 0.3), (56, 0.15), (64, 0.3), (88, 0.5), (96, 0.25), (104, 0.2), (116, 0.0)])
    osc = saw1 * 0.6 + pul1 * pulse_mix + saw2 * 0.45 + saw3 * osc2_lvl
    del saw1, pul1, saw2, saw3, pw, pulse_mix, osc2_lvl
    l_base = np.exp(auto([(0, np.log(200)), (8, np.log(240)), (16, np.log(340)), (32, np.log(540)), (48, np.log(760)), (55, np.log(920)),
                          (56, np.log(600)), (60, np.log(1250)), (63.5, np.log(1700)), (64, np.log(760)), (72, np.log(660)), (87, np.log(680)),
                          (88, np.log(1250)), (92, np.log(1600)), (96, np.log(850)), (100, np.log(1100)), (104, np.log(760)), (112, np.log(520)),
                          (120, np.log(340)), (127, np.log(190))]))
    l_amt = auto([(0, 1.4), (32, 1.7), (56, 1.2), (64, 1.8), (88, 2.1), (104, 1.7), (124, 1.2)])
    l_res = auto([(0, 1.0), (32, 1.5), (56, 2.1), (63, 2.4), (64, 1.5), (88, 2.2), (96, 2.0), (104, 1.4), (127, 1.0)])
    l_fc = np.clip(l_base * 2 ** (l_amt * fenv) * (freq / mtof(52)) ** 0.35 * drift(25.0, 14, rate=0.6), 60, 4200)
    y = ladder(osc * 0.5, l_fc, l_res, 1.4, SR)
    l_drive = auto([(0, 1.2), (56, 1.6), (88, 2.0), (104, 1.4), (127, 1.2)])
    line = hp(np.tanh(l_drive * y * amp * 2.2) / l_drive, 95)
    del osc, y, freq, amp, fenv, l_fc, l_base, l_amt, l_res, l_drive
    print('  line notes', n_line)

    # ---- the bass: sixteenths on E, punched by its filter
    starts, midis, lens, accs, slides, vels = [], [], [], [], [], []
    B_VEL = [0.6, 0.82, 1.0, 0.86]
    for bar in range(NBARS):
        if not has_bass(bar):
            continue
        for st in range(16):
            m = 40
            sl = 0
            if bar % 4 == 3 and st == 14:
                m = 52
            if bar % 8 == 7 and st == 15:
                m = 38
            if bar % 8 == 0 and st == 0 and has_bass(bar - 1):
                sl = 1                                   # the D slides up into the E of the next bar
            starts.append(pos(bar, st))
            midis.append(m)
            lens.append(int((0.62 if st % 4 != 3 else 0.8) * STEP * SR))
            accs.append(1 if st % 4 == 2 else 0)
            slides.append(sl)
            vels.append(B_VEL[st % 4] * (1 + 0.04 * rng.standard_normal()))
    starts = np.array(starts, dtype=np.int64)
    lens = np.array(lens, dtype=np.int64)
    slides_a = np.array(slides, dtype=np.int64)
    for i in range(len(starts) - 1):
        if slides_a[i + 1] == 1:
            lens[i] = starts[i + 1] - starts[i] + 64
    EV['bass'] = [[int(a_), int(b_), int(c_), int(d_), int(e_), float(f_)] for a_, b_, c_, d_, e_, f_ in zip(starts, midis, lens, accs, slides_a, vels)]
    b_gl = np.full(N, float(coef(0.004)))
    for i in np.nonzero(slides_a)[0]:
        b_gl[starts[i]:starts[i] + lens[i]] = float(coef(0.03))
    freq, amp, fenv = seq_ctrl(N, starts, np.array(midis, dtype=np.float64), lens, np.array(accs, dtype=np.float64), slides_a, np.array(vels), 0.0012,
                               coef(np.full(N, 0.13)), np.full(N, 0.3), coef(np.full(N, 0.02)), coef(np.full(N, 0.075)), b_gl, mtof(40), SR)
    freq *= drift(2.5, 21)
    half = np.full(N, 0.5)
    sawb, _ = osc_moog(freq, half, 0.0, SR)
    _, subb = osc_moog(freq * 0.5, half, 0.25, SR)
    b_base = np.exp(auto([(16, np.log(95)), (24, np.log(130)), (32, np.log(190)), (48, np.log(260)), (56, np.log(150)), (64, np.log(260)),
                          (88, np.log(340)), (96, np.log(200)), (104, np.log(280)), (120, np.log(150))]))
    b_fc = np.clip(b_base * 2 ** (2.2 * fenv), 50, 5000)
    y = ladder((sawb * 0.75 + subb * 0.4) * 0.6, b_fc, np.full(N, 0.6), 1.6, SR)
    bass = hp(np.tanh(1.5 * y * amp * 2.2) / 1.5, 32)
    del sawb, subb, half, y, freq, amp, fenv, b_fc, b_base, b_gl
    print('  bass notes', len(starts))

    # ---- the lead, played by hand: late, long, gliding
    ev = []
    for b0, phrase in VISITS:
        for pb, st, m, ln in phrase:
            ev.append(((b0 + pb) * 16 + st, m, ln))
    ev.sort()
    vs, vm, vl, vsl, vv = [], [], [], [], []
    for i, (gs, m, ln) in enumerate(ev):
        legato = i > 0 and ev[i - 1][0] + ev[i - 1][2] >= gs            # the note before is still held: no new attack
        p = int((gs * STEP + rng.normal(0, 0.012)) * SR)
        vs.append(p)
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
    freq, amp, fenv = seq_ctrl(N, vs, np.array(vm, dtype=np.float64), vl, np.zeros(len(vs)), np.array(vsl, dtype=np.int64), np.array(vv), 0.014,
                               coef(np.full(N, 0.9)), np.full(N, 0.72), coef(np.full(N, 0.22)), coef(np.full(N, 0.55)), coef(np.full(N, 0.065)), mtof(71), SR)
    held = signal.lfilter([onepole(1.1)], [1, onepole(1.1) - 1], (amp > 0.5).astype(float))      # the mod wheel comes up on long notes
    vib = 1 + 0.0042 * np.sin(2 * np.pi * 5.3 * TSEC + 0.4 * np.sin(2 * np.pi * 0.31 * TSEC)) * np.clip(held * 1.5 - 0.35, 0, 1)
    freq = freq * vib * drift(1.5, 31)
    pwl = np.full(N, 0.42)
    s_a, p_a = osc_moog(freq * 2 ** (4 / 1200), pwl, 0.1, SR)
    s_b, _ = osc_moog(freq * 2 ** (-4 / 1200), pwl, 0.55, SR)
    _, p_c = osc_moog(freq * 0.5, np.full(N, 0.5), 0.8, SR)
    v_base = auto([(72, 950), (80, 1200), (88, 1300), (104, 850), (112, 800)])
    v_fc = np.clip(v_base * 2 ** (0.9 * fenv) * (freq / mtof(71)) ** 0.5, 80, 9000)
    y = ladder((s_a * 0.55 + s_b * 0.5 + p_a * 0.3 + p_c * 0.25) * 0.5, v_fc, np.full(N, 1.1), 1.3, SR)
    lead = hp(np.tanh(1.3 * y * amp * 1.4) / 1.3, 180) * auto([(72, 0.85), (76, 1.0), (88, 1.0), (104, 0.75), (112, 0.75)])
    del s_a, p_a, s_b, p_c, pwl, y, freq, amp, fenv, v_fc, vib, held
    print('  lead notes', len(vs))

    # ---- drums
    claps1 = [make_clap(s) for s in (5, 6)]
    ohh = [make_ohh(s) for s in (21, 22)]
    for i_, x_ in enumerate(claps1):
        dump('clap_%d' % i_, x_)
    for i_, x_ in enumerate(ohh):
        dump('hat_open_%d' % i_, x_)
    claps = np.zeros((2, N), dtype=f32)
    hats = np.zeros((2, N), dtype=f32)
    ohats = np.zeros((2, N), dtype=f32)
    nzbuf = hp(lp(np.random.default_rng(77).standard_normal(6 * SR), 11500), 6200, 4)
    nzbuf /= np.max(np.abs(nzbuf))
    dump('hat_noise', nzbuf)
    H_VEL = [1.0, 0.34, 0.6, 0.3, 0.85, 0.36, 0.55, 0.45]       # eight steps, as on the little drum sequencer
    hat_lvl = auto([(12, 0.0), (16, 0.6), (24, 0.8), (32, 1.0), (55, 1.0), (56, 0.0), (63.9, 0.0), (64, 1.0), (95.9, 0.9), (96, 0.0), (99.9, 0.0), (100, 0.8), (104, 1.0), (116, 0.8), (120, 0.0)])
    hat_dec = auto([(12, 0.012), (32, 0.018), (48, 0.026), (64, 0.018), (88, 0.03), (104, 0.02), (120, 0.012)])
    oh_lvl = auto([(24, 0.6), (32, 1.0), (55, 1.0), (56, 0.0), (63.9, 0.0), (64, 1.0), (95.9, 1.0), (96, 0.0), (103.9, 0.0), (104, 0.9), (112, 0.0)])
    for bar in range(NBARS):
        if has_clap(bar):
            for st in (4, 12):
                k_ = int(rng.integers(2))
                p_ = pos(bar, st, jitter=0.0012)
                g_ = 0.9 * (1 + 0.05 * rng.standard_normal())
                add(claps, pan(claps1[k_], 0.05), p_, g_)
                EV['clap'].append([int(p_), float(g_), k_])
        rot = (bar // 8) % 8 if bar >= 64 else 0                   # later on the player nudges the pattern round
        for st in range(16):
            p = pos(bar, st, swing=SW, jitter=0.0008)
            if hat_lvl[p] > 0:
                v = H_VEL[(st + rot) % 8]
                dec = hat_dec[p] * (1 + 0.5 * math.sin(2 * math.pi * (bar * 16 + st) / 44.0))
                if bar % 8 == 7 and st >= 12:                      # a small fill into every eighth bar: the decay opens
                    dec *= 1.6 + 0.5 * (st - 12)
                    v = max(v, 0.6 + 0.1 * (st - 12))
                L = int(min(0.4, 7 * dec) * SR)
                o = int(rng.integers(0, len(nzbuf) - L))
                th = np.arange(L) / SR
                hit = nzbuf[o:o + L] * (1 - np.exp(-th / 0.0005)) * np.exp(-th / dec)
                pn_ = 0.18 + 0.1 * math.sin(st * 1.9)
                g_ = v * (1 + 0.1 * rng.standard_normal()) * hat_lvl[p]
                add(hats, pan(hit, pn_), p, g_)
                EV['hat'].append([int(p), float(g_), float(dec), int(L), int(o), pn_])
            if st % 4 == 2 and bar >= 24 and oh_lvl[p] > 0:
                k_ = int(rng.integers(2))
                p_ = pos(bar, st, jitter=0.001)
                g_ = 0.8 * (1 + 0.06 * rng.standard_normal()) * oh_lvl[p]
                add(ohats, pan(ohh[k_], -0.2), p_, g_)
                EV['ohat'].append([int(p_), float(g_), k_])
    hats = lp(hats, 11000).astype(f32)
    ohats = lp(ohats, 10500).astype(f32)

    # ---- pad: three notes, one of which moves a semitone now and then
    pad = np.zeros((2, N))
    bars_i = np.minimum(NBARS - 1, TBAR.astype(np.int64))
    sm = onepole(1.0 / 0.9)
    for m in (59, 60, 62, 66):
        on = np.array([1.0 if m in pad_notes(b) else 0.0 for b in range(NBARS)])[bars_i]
        g = signal.lfilter([sm], [1, sm - 1], signal.lfilter([sm], [1, sm - 1], on))
        f = mtof(m)
        ph_ = [float(rng.random()) for _ in range(6)]
        EV['pad'].append([m] + ph_)
        pad[0] += g * (saw_blep(N, f * 2 ** (-9 / 1200), ph_[0], SR) + saw_blep(N, f * 2 ** (4 / 1200), ph_[1], SR) + 0.5 * saw_blep(N, 2 * f * 2 ** (3 / 1200), ph_[2], SR))
        pad[1] += g * (saw_blep(N, f * 2 ** (9 / 1200), ph_[3], SR) + saw_blep(N, f * 2 ** (-5 / 1200), ph_[4], SR) + 0.5 * saw_blep(N, 2 * f * 2 ** (-4 / 1200), ph_[5], SR))
    pad_fc = auto([(0, 400), (16, 480), (40, 700), (56, 1200), (62, 1700), (64, 800), (88, 1300), (96, 1500), (104, 900), (120, 600), (128, 380)]) * (1 + 0.18 * np.sin(2 * np.pi * TBAR / 5.0 + 0.7))
    pad = np.stack([ladder(pad[0] * 0.2, pad_fc, np.full(N, 0.4), 1.0, SR), ladder(pad[1] * 0.2, pad_fc * 1.06, np.full(N, 0.4), 1.0, SR)])
    pad *= auto([(0, 0.0), (14, 0.0), (20, 0.45), (40, 0.6), (55, 0.7), (56, 1.0), (63.5, 1.0), (64, 0.6), (95.5, 0.7), (96, 1.0), (103.5, 1.0), (104, 0.65), (120, 0.8), (126, 0.7), (NBARS + 3.5, 0.0)])
    pad = hp(pad, 190).astype(f32)
    del pad_fc

    # ---- room tone
    pink = signal.lfilter([0.049922035, -0.095993537, 0.050612699, -0.004408786], [1, -2.494956002, 2.017265875, -0.522189400], rng.standard_normal((2, N)), axis=-1)
    bed = hp(pink, 500)
    dump('noise_bed_first_32s', bed[:, :32 * SR])
    noise = (bed * auto([(0, 0.0), (1, 1.0), (8, 0.8), (56, 1.0), (64, 0.6), (96, 0.9), (104, 0.6), (124, 1.0), (NBARS + 3.5, 0.0)])).astype(f32)
    del pink, bed

    # ---- stems at mix level
    S = {}
    S['kick'] = np.asarray(pan(kick * 0.62, 0.0), dtype=f32)
    B_G = gset('bass', gain_for(bass, -15.5))
    S['bass'] = np.asarray(pan(bass * B_G * duck(0.5), 0.0), dtype=f32)
    L_G = gset('line', gain_for(line, -17.8))
    line_lvl = auto([(0, 0.8), (8, 0.9), (16, 1.0), (56, 0.9), (64, 1.0), (72, 0.9), (88, 1.0), (120, 0.95), (127, 0.8)])
    S['line'] = np.asarray(pan(line * L_G * line_lvl * duck(0.22), -0.06), dtype=f32)
    V_G = gset('lead', gain_for(lead, -21.5))
    S['lead'] = np.asarray(pan(lead * V_G * duck(0.1), 0.08), dtype=f32)
    S['clap'] = np.asarray(claps * gset('clap', peak_gain(claps, -12.0)), dtype=f32)
    S['hats'] = np.asarray(hats * gset('hats', peak_gain(hats, -10.5)), dtype=f32)
    S['ohat'] = np.asarray(ohats * gset('ohat', peak_gain(ohats, -13.5)), dtype=f32)
    S['pad'] = np.asarray(pad * gset('pad', gain_for(pad, -27.0)) * duck(0.5), dtype=f32)
    S['noise'] = np.asarray(noise * gset('noise', gain_for(noise, -50.0)), dtype=f32)
    del kick, bass, claps, hats, ohats, pad, noise

    # ---- the line's echo: three sixteenths, side to side
    l_send = auto([(0, 0.55), (16, 0.4), (32, 0.35), (55, 0.4), (56, 0.55), (63.5, 0.6), (64, 0.35), (95.5, 0.4), (96, 0.55), (103.5, 0.55), (104, 0.35), (120, 0.5), (127, 0.7)])
    l_fb = auto([(0, 0.5), (54.5, 0.45), (55.5, 0.74), (57, 0.6), (63.5, 0.6), (64, 0.42), (94.5, 0.42), (95.5, 0.74), (97, 0.58), (103.5, 0.6), (104, 0.42), (120, 0.5), (126, 0.66), (130, 0.6)])
    e_in = line * L_G * line_lvl * l_send
    side = np.convolve(np.floor(TBAR * 8) % 2, np.ones(400) / 400, mode='same')
    dly = 3 * STEP * SR * (1 + 0.0011 * np.sin(2 * np.pi * 0.17 * TSEC) + 0.0003 * np.sin(2 * np.pi * 2.3 * TSEC))
    eL, eR = tape_delay(e_in * (1 - side), e_in * side, dly, l_fb, onepole(2800), onepole(260), 1.4)
    S['echo'] = np.asarray(np.stack([eL, eR]) * 0.85 * duck(0.3), dtype=f32)
    del eL, eR, e_in, side, dly, l_send, l_fb, line
    # ---- the lead's echo: a quarter note and a half, slower, darker
    v_in = lead * V_G * 0.5
    dly = 6 * STEP * SR * (1 + 0.0015 * np.sin(2 * np.pi * 0.13 * TSEC))
    eL, eR = tape_delay(v_in, v_in * 0.0, dly, np.full(N, 0.46), onepole(2400), onepole(350), 1.3)
    S['lead_echo'] = np.asarray(np.stack([eL, eR]) * 0.8 * duck(0.2), dtype=f32)
    del eL, eR, v_in, dly, lead

    # ---- the hall, large and dark, and a short room for the drums
    hall_ir = make_ir(6.5, [(None, 250, 3.2, 0.45), (250, 1000, 5.2, 1.0), (1000, 3500, 3.6, 0.7), (3500, None, 1.6, 0.35)], seed=51, predelay=0.04, hp_fc=260)
    room_ir = make_ir(0.8, [(None, 500, 0.5, 0.6), (500, 3000, 0.65, 1.0), (3000, None, 0.45, 0.8)], seed=52, predelay=0.005, hp_fc=400, onset=0.004)
    dump('ir_hall', hall_ir)
    dump('ir_room', room_ir)
    h_line = auto([(0, 0.95), (8, 0.7), (16, 0.42), (32, 0.36), (55, 0.4), (56, 0.9), (63.5, 0.95), (64, 0.34), (95.5, 0.4), (96, 0.85), (103.5, 0.85), (104, 0.36), (120, 0.6), (124, 0.9), (128, 1.0)]).astype(f32)
    hall_send = (S['line'] * h_line + S['echo'] * f32(0.5) + S['lead'] * f32(0.7) + S['lead_echo'] * f32(0.6) + S['pad'] * f32(0.9)
                 + S['clap'] * f32(0.35) + S['ohat'] * f32(0.1))
    hall = reverb(hall_send.astype(np.float64), hall_ir)
    del hall_send, h_line
    S['hall'] = np.asarray(hall * gset('hall_return', gain_for(hall, -24.0)) * duck(0.4), dtype=f32)
    del hall
    room_send = S['clap'] * f32(0.7) + S['hats'] * f32(0.35) + S['ohat'] * f32(0.3)
    room = reverb(room_send.astype(np.float64), room_ir)
    del room_send
    S['room'] = np.asarray(room * gset('room_return', gain_for(room, -36.0)), dtype=f32)
    del room

    mix = np.zeros((2, N))
    for name, s in S.items():
        mix += s
        print(f'  {name:9s} peak {db(np.max(np.abs(s))):6.1f} dB   loud-rms {db(rms_pct(s)):6.1f} dB')

    # ---- master
    mix = hp(mix, 25)
    fade = np.ones(N)
    f0 = pos(NBARS)
    fade[f0:] = 0.5 * (1 + np.cos(np.pi * np.arange(N - f0) / (N - f0)))
    mix *= fade
    pre = float(os.environ.get('PREGAIN', '1.2'))
    mix = np.tanh(mix * pre * 1.1) / 1.1
    mix, genv = limiter(np.ascontiguousarray(mix), 0.70, 1 - np.exp(-1 / (0.004 * SR)), 1 - np.exp(-1 / (0.12 * SR)))
    print('limiter: max reduction %.1f dB, active %.1f%% of the time' % (-db(genv.min()), 100 * (genv < 0.99).mean()))
    mix *= gset('final_scale', 0.89 / np.max(np.abs(mix)))
    G.update(kick=0.62, echo_return=0.85, lead_echo_return=0.8, master_pregain=pre * 1.1, master_post=1 / 1.1, limiter_threshold=0.70)
    if parts_dir:
        json.dump(G, open(os.path.join(parts_dir, 'gains.json'), 'w'), indent=1)
        json.dump({'sr': SR, 'tempo': BPM, 'bars': NBARS, 'tail': TAIL, 'events': EV}, open(os.path.join(parts_dir, 'events.json'), 'w'))
        json.dump({'note': 'value at sample n = 2 ** (interp(n / 441, unit_curve) * cents / 1200). Keys are the seeds: 11 line pitch, 12 line osc 2, 13 line osc 3, 14 line cutoff, 21 bass pitch, 31 lead pitch.', 'curves': DRIFT_LOG}, open(os.path.join(parts_dir, 'drift.json'), 'w'))

    if stems_dir:
        os.makedirs(stems_dir, exist_ok=True)
        for name, s in S.items():
            wavfile.write(os.path.join(stems_dir, name + '.wav'), SR, (np.clip(s * fade, -1, 1).T * 32767).astype(np.int16))
    return mix


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else 'streulicht.wav'
    mix = render(sys.argv[2] if len(sys.argv) > 2 else None)
    dither = (rng.random(mix.shape) - rng.random(mix.shape)) / 32768.0
    wavfile.write(out, SR, np.clip((mix + dither).T * 32767, -32768, 32767).astype(np.int16))
    print('wrote', out)
