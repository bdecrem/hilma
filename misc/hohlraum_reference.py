#!/usr/bin/env python3
"""Hohlraum: techno in G sharp, 126 BPM, 128 bars and a 7 s tail (4:11). A reference render for Takt.
The same hand as Gegenlicht on another record: no acid line. A low knock, and the hollow that answers it.

The brief (.claude/skills/takt-electronic/references/taste.md, "Making one"):

  image     Hohlraum, a hollow: the space under a road at night. Everything arrives from above as a
            knock and the hollow answers. Everything in the record has a hole in it: the chord its
            third, the hats the beat, the form its carrier for four bars.
  carrier   a low tuned knock (G#3 and the F# under it; one two-bar cell in three densities) and its
            dotted-eighth echo. Its story is two lanes: the ring (a 30 ms thud becomes a quarter-second
            tone in the break) and the shape (a sine at first, a hollow square by the peak: odd
            harmonics only, the hole again); the lowpass and the drive follow them.
  event     one. From bar 70 (54 % in) to bar 95, for two bars in every eight, the pad's fourth D#-G#
            moves up a semitone to E-A around a held F#, and the knock's answer rises to A instead of
            falling to F#. The kick and its rumble stay on G#.
  visitor   none.
  refused   a sub bass under the knocks (the rumble is the low end); a held tone, or any line, over
            the break; crashes on the section downbeats.

Budget: two pitched voices (the knock, the pad) over the kick and its rumble; one pitched idea (the
cell); the lanes are LANES below, and the form is those curves.

Clocks: the kick in 4, a tick every seventh sixteenth of the whole song (velocities cycling in 5,
its echo five sixteenths long), the shaker's accent every fifth sixteenth, the knock's cell in two bars.

    python3 misc/hohlraum_reference.py out.wav [stems_dir]

Needs numpy, scipy, numba. Renders at 44.1 kHz. With a stems dir it also writes the pre-master stems
and, next to them, parts/: every one-shot, the three impulses, the risers, 32 s of the noise bed,
gains.json (every levelled gain, resolved) and events.json (every event as it was placed). The log
draws nothing from the random stream. HR_ONLY=kick,knock,knock_delay renders only those stems through
the master (the mute test). Built from misc/gegenlicht_reference.py: the kick bus, the rumble, the
tape echo, the reverbs, the pad's saws, the hats and the master are that record's, retuned."""
import sys, os, math, json
import numpy as np
from scipy import signal
from scipy.io import wavfile
from numba import njit

SR = 44100
BPM = 126.0
BEAT = 60.0 / BPM
STEP = BEAT / 4
BAR = BEAT * 4
NBARS = 128
TAIL = 7.0
N = int(round((NBARS * BAR + TAIL) * SR))
SW = 0.09                       # hats and shaker: odd sixteenths this much of a step late; the knock half of it
rng = np.random.default_rng(126)
TSEC = np.arange(N) / SR
TBAR = TSEC / BAR

# ---------------------------------------------------------------- the form, as lanes (bar, value)
LANES = {
    # the knock: how long it rings, how far the lowpass is open, how square it is (1 nearly a sine, 6 a square)
    'knock_ring':  [(16, 0.045), (32, 0.06), (48, 0.085), (63, 0.11), (64, 0.20), (68, 0.24), (71.5, 0.22), (72, 0.12),
                    (80, 0.135), (88, 0.16), (95, 0.15), (100, 0.10), (108, 0.07), (120, 0.055), (128, 0.09)],
    'knock_fc':    [(16, 340), (32, 520), (48, 800), (60, 1050), (63.5, 1100), (64, 640), (71, 820), (72, 1500), (80, 1900),
                    (88, 3200), (93, 2800), (96, 1200), (100, 1000), (108, 640), (116, 420), (124, 300)],          # Hz, read in log
    'knock_shape': [(16, 2.0), (48, 3.0), (63, 3.6), (64, 2.2), (72, 4.0), (88, 6.0), (96, 3.2), (108, 2.4), (124, 2.0)],
    'knock_drive': [(16, 1.2), (48, 1.9), (63, 2.3), (64, 1.2), (72, 2.6), (88, 4.0), (96, 2.2), (108, 1.5), (124, 1.2)],   # into the tanh after the filter
    'knock_env':   [(16, 1.3), (48, 1.6), (63.5, 1.6), (64, 1.0), (72, 1.7), (88, 1.9), (100, 1.5), (124, 1.2)],   # octaves a hit kicks the filter
    'knock_envtime': [(16, 0.09), (64, 0.10), (72, 0.11), (88, 0.15), (100, 0.10), (124, 0.09)],                 # s: how long the kick to the filter lasts
    'knock_q':     [(16, 1.8), (64, 2.2), (88, 3.6), (104, 2.2), (124, 1.8)],
    'knock_hall':  [(16, 0.35), (48, 0.45), (63, 0.5), (64, 0.75), (71.5, 0.75), (72, 0.45), (96, 0.5), (120, 0.8)],
    # its echo: thrown half a bar before a section ends, and nowhere else
    'echo_fb':     [(0, 0.38), (46.5, 0.38), (47.5, 0.84), (48.5, 0.42), (62.5, 0.42), (63.5, 0.90), (65, 0.66), (71, 0.66),
                    (72, 0.40), (94.5, 0.40), (95.5, 0.90), (96.5, 0.62), (99.5, 0.50), (100, 0.44), (119, 0.50), (120, 0.70),
                    (122.5, 0.72), (123.5, 0.90), (125, 0.86), (132, 0.80)],
    'pad_fc':      [(0, 380), (32, 620), (48, 900), (64, 1500), (72, 1000), (88, 1700), (96, 1100), (108, 800), (128, 380)],
    'pad_level':   [(0, 0.0), (3, 0.5), (16, 0.5), (40, 0.65), (63, 0.7), (64, 1.0), (71.5, 1.0), (72, 0.7), (95, 0.75),
                    (96, 0.85), (100, 0.7), (112, 0.8), (120, 1.0), (125, 0.8), (NBARS + 2.5, 0.0)],
    'noise':       [(0, 0.0), (1, 1.0), (8, 0.7), (64, 1.0), (72, 0.6), (96, 0.9), (100, 0.6), (120, 1.0), (NBARS + 3, 0.0)],
    'hats':        [(8, 0.45), (16, 0.7), (32, 1.0), (64, 0.9), (68, 0.25), (72, 1.0), (96, 0.9), (100, 0.9), (112, 0.6), (120, 0.0)],
    'tick_level':  [(0, 0.0), (1, 0.6), (8, 0.8), (64, 1.0), (72, 0.8), (96, 1.0), (100, 0.8), (120, 0.9), (126, 0.0)],
    'tick_fc':     [(0, 1800), (32, 2800), (64, 4200), (88, 7000), (108, 3000), (128, 1500)],                      # Hz, read in log
    'rumble':      [(0, 0.0), (7.5, 0.0), (8.5, 1.0), (NBARS, 1.0)],
    'kick_gain':   [(0, 0.8), (8, 1.0), (NBARS, 1.0)],
    'kick_fc':     [(0, 16000), (NBARS, 16000)],                                                                   # Hz, read in log
}


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


def auto_log(points):
    return np.exp(np.interp(TBAR, [p[0] for p in points], [np.log(p[1]) for p in points]))


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
def hit_env(n, starts, vels, dec):
    """What kicks the knock's filter open: each hit sets it to its velocity if that is higher, and it
    falls by dec[i] a sample (e^(-1/(tau*sr)), tau from a lane)."""
    e = np.empty(n)
    cur = 0.0
    k = 0
    nn = starts.shape[0]
    for i in range(n):
        while k < nn and starts[k] <= i:
            if vels[k] > cur:
                cur = vels[k]
            k += 1
        e[i] = cur
        cur *= dec[i]
    return e


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


# ---------------------------------------------------------------- one-shots (each from its own seed)
def make_kick():
    """Lands on G#1, 51.9 Hz: Gegenlicht's kick a semitone down and a touch longer (0.13 s)."""
    r = np.random.default_rng(301)
    d = 0.45
    n = int(d * SR)
    t = np.arange(n) / SR
    f = mtof(32) + 95 * np.exp(-t / 0.034) + 320 * np.exp(-t / 0.006)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR)
    env = np.minimum(t / 0.001, 1) * np.exp(-t / 0.13)
    click = bp(r.standard_normal(n), 1800, 7000) * np.exp(-t / 0.003) * 0.55
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


def make_tick():
    """The seventh-sixteenth clock: a relay, not a note. A struck block on the fifth (D#5 and its octave),
    30 and 18 ms long, with a 1 ms click."""
    r = np.random.default_rng(302)
    n = int(0.2 * SR)
    t = np.arange(n) / SR
    x = np.sin(2 * np.pi * mtof(75) * t) * 0.5 * np.exp(-t / 0.030) + np.sin(2 * np.pi * mtof(87) * t) * 0.6 * np.exp(-t / 0.018)
    x += bp(r.standard_normal(n), 2500, 7000) * np.exp(-t / 0.001) * 0.5
    return peak_norm(hp(x, 350) * np.clip((0.2 - t) / 0.02, 0, 1))


def make_skin(seed):
    """What the knock is struck with: 12 ms of band-passed noise, three of them."""
    r = np.random.default_rng(seed)
    n = int(0.012 * SR)
    t = np.arange(n) / SR
    return peak_norm(bp(r.standard_normal(n), 700, 3200) * np.exp(-t / 0.003))


def knock_hit(m, tau, shape, vel, skin, cents):
    """One side of one knock: an oscillator that falls onto its note in 9 ms, shaped from a sine toward a
    square (odd harmonics only: hollow), ringing for tau, struck with a skin. The lowpass is the bus's."""
    f0 = mtof(m) * 2 ** (cents / 1200)
    n = int((min(7 * tau, 1.9) + 0.02) * SR)
    t = np.arange(n) / SR
    f = f0 * (1 + 0.35 * np.exp(-t / 0.009))
    osc = np.tanh(shape * np.sin(2 * np.pi * np.cumsum(f) / SR)) / np.tanh(shape)
    x = osc * np.minimum(t / 0.0015, 1) * np.exp(-t / tau)
    k = min(n, len(skin))
    x[:k] += 0.22 * skin[:k]
    return vel * x * np.clip((t[-1] - t) / 0.01, 0, 1)


# ---------------------------------------------------------------- the knock's cell (G sharp; step in the two bars, role, velocity)
KNOCK, ANSWER, ANSWER_UP = 56, 54, 57            # G#3; the F# under it; in the event bars the A over it
CELL_SPARSE = [(6, 'da', 1.0), (7, 'dum', 0.75), (26, 'da', 0.8), (27, 'dum', 0.6)]
CELL_MEDIUM = [(6, 'da', 1.0), (7, 'dum', 0.75), (13, 'f', 0.5), (19, 'f', 0.6), (26, 'da', 1.0), (27, 'dum', 0.75)]
CELL_FULL = [(2, 'f', 0.45), (6, 'da', 1.0), (7, 'dum', 0.75), (13, 'f', 0.5), (19, 'f', 0.6), (26, 'da', 1.0), (27, 'dum', 0.75), (30, 'f', 0.4)]


def cell_at(bar):
    """Which two-bar cell starts at this (even) bar, or None."""
    if 16 <= bar < 32:
        return CELL_SPARSE
    if 32 <= bar < 48:
        return CELL_MEDIUM
    if 48 <= bar < 64:
        return CELL_FULL
    if 64 <= bar < 72:
        return CELL_MEDIUM          # the break: fewer knocks, each ringing four times as long
    if 72 <= bar < 96:
        return CELL_FULL
    if 96 <= bar < 100:
        return None                 # the floor alone: the hole where the carrier was
    if 100 <= bar < 108:
        return CELL_MEDIUM
    if 108 <= bar < 124:
        return CELL_SPARSE
    return None


def is_event(bar):
    """The record's one harmonic event: bars 70-71, 78-79, 86-87, 94-95."""
    return 70 <= bar < 96 and (bar - 64) % 8 >= 6


def pad_notes(bar):
    """A fourth with no third (D#4 G#4); from the break an F# inside it; in the event bars the fourth a semitone up."""
    if bar < 64 or bar >= 120:
        return (63, 68)
    if is_event(bar):
        return (64, 66, 69)
    return (63, 66, 68)


def has_kick(bar, beat):
    if bar < 64:
        return not (bar == 63 and beat >= 2)
    if 72 <= bar < 96:
        return not (bar == 95 and beat == 3)
    if 96 <= bar < 120:
        return True
    return False


# ================================================================ render
def render(stems_dir=None):
    print('samples', N, 'seconds', round(N / SR, 2))
    f32 = np.float32
    G, EV = {}, {k: [] for k in ('kick', 'knock', 'tick', 'hatc', 'hato', 'ride', 'shaker', 'clap', 'riser', 'pad')}
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

    # ---- kick: dry from the first sample
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
    kick = svf_lp(kick, auto_log(LANES['kick_fc']), np.full(N, 0.8), SR)
    kick *= auto(LANES['kick_gain'])

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
    rum = np.tanh(3.2 * rum / G['rumble_norm'])
    rum = lp(rum, 260, 2) * (1.0 - sc_r)
    rum *= auto(LANES['rumble'])
    del taps
    dump('ir_rumble', rum_ir[0])

    # ---- the knock: the cell, each hit rung and shaped by the lanes at its moment, into one filter a side
    ring = auto(LANES['knock_ring'])
    kshape = auto(LANES['knock_shape'])
    skins = [make_skin(s) for s in (41, 42, 43)]
    for i_, x_ in enumerate(skins):
        dump('knock_skin_%d' % i_, x_)
    knock = np.zeros((2, N))
    k_starts, k_vels = [], []
    hi = 0
    for bar in range(0, NBARS, 2):
        cell = cell_at(bar)
        if cell is None:
            continue
        for st, role, vel in cell:
            b = bar + st // 16
            m = KNOCK if role != 'dum' else (ANSWER_UP if is_event(b) else ANSWER)
            p = pos(b, st % 16, swing=SW / 2, jitter=0.0012)
            v = vel * (1 + 0.07 * rng.standard_normal())
            rr = int(rng.integers(3))
            pn = -0.3 if role == 'da' else 0.3 if role == 'dum' else (0.12 if hi % 2 else -0.12)
            a_ = (pn + 1) * np.pi / 4                                  # two oscillators a hit: the left 6 cents flat, the right 6 sharp
            hit = np.stack([knock_hit(m, ring[p], kshape[p], v, skins[rr], -6.0) * np.cos(a_),
                            knock_hit(m, ring[p], kshape[p], v, skins[rr], 6.0) * np.sin(a_)])
            add(knock, hit, p)
            EV['knock'].append([int(p), m, float(v), pn, rr, float(ring[p]), float(kshape[p])])
            k_starts.append(p)
            k_vels.append(v)
            hi += 1
    order = np.argsort(k_starts)
    fenv = hit_env(N, np.array(k_starts, dtype=np.int64)[order], np.array(k_vels)[order], np.exp(-1.0 / (auto(LANES['knock_envtime']) * SR)))
    k_fc = np.clip(auto_log(LANES['knock_fc']) * 2 ** (auto(LANES['knock_env']) * fenv) * (1 + 0.08 * np.sin(2 * np.pi * TBAR / 6.5)), 60, 6500)
    k_q = auto(LANES['knock_q'])
    knock = np.stack([svf_lp(svf_lp(knock[c], k_fc, k_q, SR), np.minimum(k_fc * 1.25, 9000), np.full(N, 0.7), SR) for c in range(2)])
    knock = hp(knock, 250)                                        # thins the body: the rumble has that octave, and a laptop hears the rest
    k_drive = auto(LANES['knock_drive'])
    knock = np.tanh(k_drive * knock) / np.tanh(k_drive)          # the bus is driven after its filter: two knocks ringing together growl
    knock *= (1100.0 / auto_log(LANES['knock_fc'])) ** 0.15       # it gets much louder as it opens; this takes back about half
    del fenv, k_fc
    print('  knock hits', len(k_starts))

    # ---- the tick: every seventh sixteenth of the whole song, velocities cycling in five, its echo five sixteenths
    VEL5 = [1.0, 0.5, 0.7, 0.4, 0.8]
    tick1 = make_tick()
    dump('tick', tick1)
    tick = np.zeros((2, N))
    tick_lvl = auto(LANES['tick_level'])
    for i in range(0, NBARS * 16, 7):
        p = pos(i // 16, i % 16)
        if p < N and tick_lvl[p] > 0:
            j = i // 7
            v, pn = VEL5[j % 5], 0.6 * math.sin(j * 0.83)
            add(tick, pan(tick1, pn), p, v * tick_lvl[p])
            EV['tick'].append([int(p), v, pn, float(tick_lvl[p])])
    tfc = auto_log(LANES['tick_fc'])
    tick = np.stack([svf_lp(tick[c], tfc, np.full(N, 1.0), SR) for c in range(2)])
    tl, tr = tape_delay(tick.mean(axis=0), np.zeros(N), np.full(N, 5 * STEP * SR), np.full(N, 0.45), onepole(4500), onepole(500), 1.5)
    tick = (tick + 0.6 * np.stack([tl, tr])).astype(f32)
    del tl, tr, tfc

    # ---- drums: hats with their hole on the beat, an open hat off the beat, clap, ride and shaker
    chh = [make_chh(s) for s in (1, 2, 3)]
    ohh = [make_ohh(s) for s in (4, 5)]
    ride1, clap1 = make_ride(6), make_clap(8)
    shk = [make_shaker(s) for s in (9, 10, 11)]
    hats = np.zeros((2, N), dtype=f32)
    rides = np.zeros((2, N), dtype=f32)
    shaker = np.zeros((2, N), dtype=f32)
    claps = np.zeros((2, N), dtype=f32)
    hat_lvl = auto(LANES['hats'])
    CH_VEL = [0.0, 0.5, 0.34, 0.62]          # nothing on the beat: the kick has it
    for bar in range(NBARS):
        closed = (8 <= bar < 64) or (68 <= bar < 120)
        opened = (24 <= bar < 64) or (72 <= bar < 96) or (100 <= bar < 112)
        for st in range(16):
            b4 = st % 4
            if closed and b4 != 0 and not (opened and b4 == 2) and (bar >= 16 or b4 == 2):
                p = pos(bar, st, swing=SW, jitter=0.001)
                if p < N:
                    k_ = int(rng.integers(3))
                    g_ = (0.55 if bar < 16 else CH_VEL[b4]) * (1 + 0.12 * rng.standard_normal()) * hat_lvl[p]
                    add(hats, pan(chh[k_], 0.2), p, g_)
                    EV['hatc'].append([int(p), float(g_), k_])
            if opened and b4 == 2:
                p = pos(bar, st, jitter=0.001)
                k_ = int(rng.integers(2))
                g_ = 0.72 * (1 + 0.06 * rng.standard_normal()) * hat_lvl[p]
                add(hats, pan(ohh[k_], -0.12), p, g_)
                EV['hato'].append([int(p), float(g_), k_])
            for a, b in ((56, 64), (80, 96)):                     # ride: before the break, and the peak
                if a <= bar < b and b4 in (0, 2):
                    p_ = pos(bar, st, jitter=0.001)
                    g_ = (0.5 if b4 == 0 else 0.9) * (1 + 0.08 * rng.standard_normal()) * min(1.0, (bar - a + st / 16) / 2 + 0.3)
                    add(rides, pan(ride1, 0.3), p_, g_)
                    EV['ride'].append([int(p_), float(g_)])
            for a, b in ((48, 64), (80, 96)):                     # shaker: sixteenths, the accent every fifth one
                if a <= bar < b:
                    k_ = int(rng.integers(3))
                    p_ = pos(bar, st, swing=SW, jitter=0.002)
                    g_ = (1.0 if (bar * 16 + st) % 5 == 0 else 0.42) * (1 + 0.1 * rng.standard_normal()) * min(1.0, (bar - a + st / 16) / 2 + 0.3)
                    add(shaker, pan(shk[k_], -0.4), p_, g_)
                    EV['shaker'].append([int(p_), float(g_), k_])
        if (40 <= bar < 64) or (72 <= bar < 96):
            for st in (4, 12):
                if bar == 63 and st == 12:
                    continue
                p_ = pos(bar, st, jitter=0.001)
                add(claps, pan(clap1, 0.0), p_, 0.9)
                EV['clap'].append([int(p_), 0.9])
    for i_, x_ in enumerate(chh):
        dump('hat_closed_%d' % i_, x_)
    for i_, x_ in enumerate(ohh):
        dump('hat_open_%d' % i_, x_)
    for i_, x_ in enumerate(shk):
        dump('shaker_%d' % i_, x_)
    dump('ride', ride1); dump('clap', clap1)
    hats = lp(hats, 13000).astype(f32)

    # ---- pad: a fourth, slow filter; the gates open and close by the bar
    pad = np.zeros((2, N))
    bars_i = np.minimum(NBARS - 1, TBAR.astype(np.int64))
    smooth_a = onepole(1.0 / 0.9)
    for m in (63, 64, 66, 68, 69):
        on = np.array([1.0 if m in pad_notes(b) else 0.0 for b in range(NBARS)])[bars_i]
        g = signal.lfilter([smooth_a], [1, smooth_a - 1], on)
        g = signal.lfilter([smooth_a], [1, smooth_a - 1], g)
        f = mtof(m)
        ph_ = [rng.random(), rng.random(), rng.random(), rng.random()]     # left -7 and +4 cents, right +7 and -3
        EV['pad'].append([m] + ph_)
        pad[0] += g * (saw_blep(N, f * 2 ** (-7 / 1200), ph_[0], SR) + saw_blep(N, f * 2 ** (4 / 1200), ph_[1], SR))
        pad[1] += g * (saw_blep(N, f * 2 ** (7 / 1200), ph_[2], SR) + saw_blep(N, f * 2 ** (-3 / 1200), ph_[3], SR))
    pad_fc = auto(LANES['pad_fc']) * (1 + 0.22 * np.sin(2 * np.pi * TBAR / 9.0 + 0.6))
    pad = np.stack([svf_lp(pad[0], pad_fc, np.full(N, 0.9), SR), svf_lp(pad[1], pad_fc * 1.06, np.full(N, 0.9), SR)])
    pad *= auto(LANES['pad_level'])
    pad = hp(pad, 170).astype(f32)
    del pad_fc

    # ---- room tone and risers
    rn = np.random.default_rng(303)
    pink = signal.lfilter([0.049922035, -0.095993537, 0.050612699, -0.004408786], [1, -2.494956002, 2.017265875, -0.522189400], rn.standard_normal((2, N)), axis=-1)
    bed = hp(pink, 500)
    dump('noise_bed_first_32s', bed[:, :32 * SR])
    noise = (bed * auto(LANES['noise'])).astype(f32)
    del pink, bed
    riser = np.zeros((2, N), dtype=f32)
    for a, b, g in [(46, 48, 0.4), (68, 72, 1.0), (78, 80, 0.45)]:
        s, e = pos(a), pos(b)
        n = e - s
        u = np.arange(n) / n
        cut = 300 * (9000 / 300) ** u
        sw = np.stack([svf_lp(rn.standard_normal(n), cut, np.full(n, 1.8), SR) for _ in range(2)])
        seg_ = hp(sw, 250) * (u ** 2.4)
        riser[:, s:e] += seg_ * g
        dump('riser_bar%d' % a, seg_)
        EV['riser'].append([int(s), int(e), g])

    # ---- the knock's echo: three sixteenths, ping-pong, fed at mix level
    fb = auto(LANES['echo_fb'])
    k_ref = knock[:, pos(80):pos(88)]                              # levelled where it is fullest, bars 80-87
    K_G = gset('knock', 10 ** (float(os.environ.get('HR_KNOCK_DB', '-23.0')) / 20) / np.sqrt((k_ref ** 2).mean()))
    dly = 3 * STEP * SR * (1 + 0.001 * np.sin(2 * np.pi * 0.19 * TSEC))
    dL, dR = tape_delay(knock[0] * K_G, knock[1] * K_G, dly, fb, onepole(3200), onepole(120), 1.6)
    kdly = np.stack([dL, dR])
    del dL, dR, dly

    hall_ir = make_ir(5.0, [(None, 300, 1.8, 0.45), (300, 1200, 3.6, 1.0), (1200, 4000, 2.8, 0.9), (4000, None, 1.4, 0.45)], seed=31, predelay=0.03, hp_fc=180)
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
    S['knock'] = st(knock, K_G, 0.3)
    S['knock_delay'] = st(kdly, float(os.environ.get('HR_ECHO', '0.5')), 0.4)
    S['tick'] = st(tick, gset('tick', peak_gain(tick, -13.0)), 0.2)
    S['pad'] = st(pad, gset('pad', gain_for(pad, float(os.environ.get('HR_PAD_DB', '-26.5')))), 0.6)
    S['hats'] = st(hats, gset('hats', peak_gain(hats, -12.5)), 0.12)
    S['ride'] = st(rides, gset('ride', peak_gain(rides, -19.0)), 0.15)
    S['shaker'] = st(shaker, gset('shaker', peak_gain(shaker, -18.0)))
    S['clap'] = st(claps, gset('clap', peak_gain(claps, -11.0)))
    S['noise'] = st(noise, gset('noise', gain_for(noise, -50.0)), 0.4)
    S['riser'] = st(riser, gset('riser', gain_for(riser, -29.0)))
    del kick, rum, knock, kdly, tick, pad, hats, rides, shaker, claps, noise, riser

    k_hall = auto(LANES['knock_hall']).astype(f32)
    hall_send = (S['knock'] * k_hall + S['knock_delay'] * f32(0.5) + S['pad'] * f32(0.9) + S['tick'] * f32(0.6) + S['clap'] * f32(0.3)
                 + S['riser'] * f32(0.8) + S['ride'] * f32(0.2))
    hall = reverb(hall_send.astype(np.float64), hall_ir)
    del hall_send
    S['hall'] = st(hall, gset('hall_return', gain_for(hall, float(os.environ.get('HR_HALL_DB', '-24.5')))), 0.5)
    del hall
    room_send = S['clap'] * f32(0.8) + S['hats'] * f32(0.3) + S['shaker'] * f32(0.4) + S['tick'] * f32(0.3) + S['knock'] * f32(0.25)
    room = reverb(room_send.astype(np.float64), room_ir)
    del room_send
    S['room'] = st(room, gset('room_return', gain_for(room, -35.0)))
    del room

    only = [s for s in os.environ.get('HR_ONLY', '').split(',') if s]
    mix = np.zeros((2, N))
    for name, s in S.items():
        if not only or name in only:
            mix += s
        print(f'  {name:11s} peak {db(np.max(np.abs(s))):6.1f} dB   loud-rms {db(rms_pct(s)):6.1f} dB')

    # ---- master
    mix = hp(mix, 25)
    fade = np.ones(N)
    f0 = pos(NBARS - 1)
    fade[f0:] = 0.5 * (1 + np.cos(np.pi * np.arange(N - f0) / (N - f0)))
    mix *= fade
    pre = float(os.environ.get('PREGAIN', '1.42'))
    mix = np.tanh(mix * pre * 1.1) / 1.1
    mix, genv = limiter(np.ascontiguousarray(mix), 0.70, 1 - np.exp(-1 / (0.004 * SR)), 1 - np.exp(-1 / (0.12 * SR)))
    print('limiter: max reduction %.1f dB, active %.1f%% of the time' % (-db(genv.min()), 100 * (genv < 0.99).mean()))
    if only:
        mix *= 1.2714            # about the full mix's own final scale, so a mute test sits where it sits in the record
    else:
        mix *= gset('final_scale', 0.89 / np.max(np.abs(mix)))
    G.update(kick=0.66, knock_delay_return=float(os.environ.get('HR_ECHO', '0.5')), tick_delay_mix=0.6, master_pregain=pre * 1.1, master_post=1 / 1.1, limiter_threshold=0.70)
    if parts_dir:
        json.dump(G, open(os.path.join(parts_dir, 'gains.json'), 'w'), indent=1)
        json.dump({'sr': SR, 'tempo': BPM, 'bars': NBARS, 'tail': TAIL, 'lanes': LANES, 'events': EV}, open(os.path.join(parts_dir, 'events.json'), 'w'))

    if stems_dir:
        os.makedirs(stems_dir, exist_ok=True)
        for name, s in S.items():
            wavfile.write(os.path.join(stems_dir, name + '.wav'), SR, (np.clip(s * fade, -1, 1).T * 32767).astype(np.int16))
    return mix


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else 'hohlraum.wav'
    mix = render(sys.argv[2] if len(sys.argv) > 2 else None)
    dr = np.random.default_rng(304)
    dither = (dr.random(mix.shape) - dr.random(mix.shape)) / 32768.0
    wavfile.write(out, SR, np.clip((mix + dither).T * 32767, -32768, 32767).astype(np.int16))
    print('wrote', out)
