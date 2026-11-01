"""Takt count-in sound cues. Pure numpy/scipy synthesis.

Writes per-variant one-shots (b1..b4, swell, land) + a 121 BPM preview mix.
Every cue is tempo-agnostic: its musical content fits in < 300 ms (one beat at 200 BPM);
tails ring over the next beat. The swell is scheduled to END on the landing.
"""
import numpy as np, scipy.signal as ss, scipy.io.wavfile as wf, os, sys, json

SR = 48000
OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(1967)

def N(d): return int(round(d * SR))
def T(n): return np.arange(n) / SR
def mtof(m): return 440.0 * 2 ** ((m - 69) / 12)

def sos(kind, fc, order=2):
    return ss.butter(order, fc, kind, fs=SR, output='sos')
def lp(x, fc, o=2): return ss.sosfilt(sos('low', min(fc, SR*0.45), o), x, axis=-1)
def hp(x, fc, o=2): return ss.sosfilt(sos('high', fc, o), x, axis=-1)
def bp(x, lo, hi, o=2): return ss.sosfilt(sos('band', [lo, hi], o), x, axis=-1)

def st(x, pan=0.0):
    """mono -> stereo, equal-power pan (-1..1)"""
    a = (pan + 1) * np.pi / 4
    return np.vstack([x * np.cos(a), x * np.sin(a)])

def place(buf, x, at):
    """mix stereo x into stereo buf at time `at` (s), growing buf if needed"""
    i = N(at)
    need = i + x.shape[1]
    if need > buf.shape[1]:
        buf = np.hstack([buf, np.zeros((2, need - buf.shape[1]))])
    buf[:, i:i + x.shape[1]] += x
    return buf

def fade_end(x, d):
    n = x.shape[-1]; k = min(N(d), n)
    w = np.ones(n); w[n - k:] = 0.5 * (1 + np.cos(np.linspace(0, np.pi, k)))
    return x * w

def empty(d=0.0): return np.zeros((2, N(d)))

# ---------------------------------------------------------------- instruments

def rhodes(midi, dur=1.8, vel=0.7, hold=None):
    """FM electric piano: 1:1 bark that softens, a 14:1 tine ping, suitcase-style ring."""
    f = mtof(midi); n = N(dur); t = T(n)
    I = (0.9 + 2.6 * vel) * np.exp(-t / 0.16) + 0.22
    car = np.sin(2 * np.pi * f * t + I * np.sin(2 * np.pi * f * t))
    tine = 0.22 * vel * np.sin(2 * np.pi * f * 14 * t) * np.exp(-t / 0.018)
    body = 0.12 * np.sin(2 * np.pi * f * 2 * t) * np.exp(-t / 0.5)
    tau = 1.4 * (261.6 / f) ** 0.3
    e = np.minimum(t / 0.002, 1) * np.exp(-t / tau)
    if hold is not None:
        e *= np.clip(1 - (t - hold) / 0.07, 0, 1) ** 2
    x = (car + tine + body) * e * vel
    x = np.tanh(1.4 * x) / 1.4
    # the tine is too bright on high notes: tame by register
    return fade_end(lp(x, 5200 if f > 300 else 3800), 0.35)

def epiano(notes, dur=1.8, trem=True):
    """notes: list of (midi, vel, onset, hold) -> stereo with suitcase autopan"""
    out = empty(dur + 0.3)
    for m, v, on, h in notes:
        out = place(out, st(rhodes(m, dur, v, h)), on)
    if trem:
        t = T(out.shape[1]); s = 0.18 * np.sin(2 * np.pi * 4.6 * t)
        out = out * np.vstack([1 + s, 1 - s])
    return out

def kick(vel=1.0, dur=0.9):
    n = N(dur); t = T(n)
    f = 46 + 120 * np.exp(-t / 0.032)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.30)
    click = hp(rng.standard_normal(n) * np.exp(-t / 0.0018), 2500) * 0.35
    x = np.tanh(1.8 * (x + click)) / np.tanh(1.8)
    return st(fade_end(x, 0.25) * vel)

def hat(vel=0.5, tau=0.022, pan=0.25):
    """808-style: six detuned squares, bandpassed, plus air"""
    n = N(0.18); t = T(n)
    sq = sum(np.sign(np.sin(2 * np.pi * fr * t)) for fr in (205.3, 304.4, 369.6, 522.7, 540.0, 800.0))
    x = bp(sq, 7000, 11500, 3) + 0.4 * hp(rng.standard_normal(n), 9000)
    x *= np.exp(-t / tau) * np.minimum(t / 0.0005, 1)
    return st(fade_end(x / np.max(np.abs(x)), 0.05) * vel, pan)

def rim(vel=0.5, pan=-0.15):
    n = N(0.12); t = T(n)
    x = np.sin(2 * np.pi * 1720 * t) * np.exp(-t / 0.012) + 0.6 * bp(rng.standard_normal(n), 800, 3200) * np.exp(-t / 0.006)
    return st(x / np.max(np.abs(x)) * vel, pan)

def acid(notes, dur=0.6, res=0.86, pan=-0.3, base=260, decay=0.07, drive=2.2, env=1800):
    """mono saw through a Chamberlin SVF; notes: (midi, onset, gate, accent)"""
    n = N(dur); t = T(n)
    f = np.zeros(n); gate = np.zeros(n); fenv = np.zeros(n)
    for m, on, g, acc in notes:
        i0, i1 = N(on), N(on + g)
        f[i0:] = mtof(m)
        gate[i0:i1] = 1
        k = np.arange(n - i0) / SR
        fenv[i0:] = np.maximum(fenv[i0:] * 0, (env + 2600 * acc) * np.exp(-k / decay))
    gate = lp(gate, 200, 1)
    ph = np.cumsum(f) / SR
    saw = 2 * (ph % 1) - 1
    fc = np.clip(base + fenv, 40, 7000)
    low = band = 0.0; y = np.zeros(n); q = 1 - res
    g = 2 * np.sin(np.pi * fc / (SR * 2))  # 2x oversampled step below
    for i in range(n):
        for _ in range(2):
            low += g[i] * band
            high = saw[i] - low - q * band
            band += g[i] * high
        y[i] = low
    y = np.tanh(drive * y * gate) * 0.6
    return st(y, pan)

def hum(dur=0.75, vel=0.12):
    """50 Hz mains — it's a Berlin rig"""
    n = N(dur); t = T(n)
    x = sum(a * np.sin(2 * np.pi * 50 * k * t) for k, a in ((1, 1), (2, .5), (3, .35), (5, .15), (7, .08)))
    e = np.minimum(t / 0.04, 1) * np.exp(-t / 0.22)
    return st(fade_end(x * e, 0.2) * vel)

def plug(vel=0.7):
    """quarter-inch jack seated: low thunk + two crackles"""
    n = N(0.25); t = T(n)
    th = np.sin(2 * np.pi * (62 + 40 * np.exp(-t / 0.01)) * t) * np.exp(-t / 0.045)
    cr = np.zeros(n)
    for at, a in ((0.0, 1.0), (0.019, 0.5), (0.031, 0.25)):
        i = N(at); k = np.arange(n - i) / SR
        cr[i:] += a * rng.standard_normal(n - i) * np.exp(-k / 0.004)
    cr = bp(cr, 400, 3500)
    return st(fade_end(th * 0.9 + cr * 0.5, 0.08) * vel)

def stab(midis, vel=0.5, gate=0.11, pan=0.0):
    """dub-techno chord stab: detuned saws, closing lowpass"""
    n = N(0.4); t = T(n)
    x = np.zeros(n)
    for m in midis:
        for d in (-0.08, 0.08):
            ph = mtof(m + d) * t
            x += 2 * (ph % 1) - 1
    e = np.minimum(t / 0.002, 1) * np.clip(1 - (t - gate) / 0.04, 0, 1)
    x = x * e / len(midis)
    # sweep: approximate a closing filter by crossfading two static LPs
    a = np.exp(-t / 0.06)
    x = a * lp(x, 2400, 2) + (1 - a) * lp(x, 650, 2)
    return st(x * vel, pan)

# ---------------------------------------------------------------- space

def make_ir(dur=1.7, tau=0.42, damp=3500):
    n = N(dur); t = T(n)
    ir = np.vstack([rng.standard_normal(n), rng.standard_normal(n)]) * np.exp(-t / tau)
    ir = lp(ir, damp, 2)
    ir[:, :N(0.012)] = 0
    for at, g in ((0.017, .5), (0.023, .4), (0.031, .3), (0.043, .25)):  # early reflections
        ir[0, N(at)] += g; ir[1, N(at * 1.13)] += g
    return ir / np.sqrt(np.sum(ir ** 2) / 2)

IR = make_ir()

def verb(x, mix=0.2):
    wet = np.vstack([ss.fftconvolve(x[c], IR[c]) for c in (0, 1)])
    out = np.zeros_like(wet); out[:, :x.shape[1]] = x
    return out + mix * 0.35 * wet

def dub(x, d=0.372, fb=0.42, n=6, tone=2600):
    """ping-pong tape-ish delay, darker each repeat. 3/16 at 121 BPM."""
    out = np.hstack([x, np.zeros((2, N(d * n) + 10))])
    tap = x.mean(0)
    for k in range(1, n + 1):
        tap = hp(lp(tap, tone, 1), 180, 1) * fb
        side = k % 2
        i = N(d * k)
        out[side, i:i + len(tap)] += tap * 0.9
        out[1 - side, i:i + len(tap)] += tap * 0.25
    return out

def reverse_swell(chord, dur=0.34):
    """reverb tail of the landing chord, reversed: the room inhales"""
    src = epiano([(m, 0.6, 0, None) for m in chord], dur=1.2, trem=False)
    wet = np.vstack([ss.fftconvolve(src[c], IR[c]) for c in (0, 1)])[:, :N(1.0)]
    r = wet[:, ::-1][:, -N(dur):]
    n = r.shape[1]; t = T(n)
    air = hp(rng.standard_normal(n), 3000) * (t / t[-1]) ** 3 * 0.06
    r = r + st(air)
    r *= (t / t[-1]) ** 1.6 * 0.7
    r[:, -N(0.004):] *= np.linspace(1, 0, N(0.004))  # click-free cut, right before the 1
    return r

# ---------------------------------------------------------------- finishing

def door(x, fc):
    """'through the door' — the room opens beat by beat"""
    return x if fc is None else lp(x, fc, 2)

def trim(x, floor_db=-66):
    a = np.max(np.abs(x), axis=0)
    thr = 10 ** (floor_db / 20) * max(a.max(), 1e-9)
    idx = np.nonzero(a > thr)[0]
    end = idx[-1] + N(0.02) if len(idx) else x.shape[1]
    y = x[:, :end].copy()
    f = N(0.015); y[:, -f:] *= np.linspace(1, 0, f)
    return y

DOOR = [1100, 2300, 4800, 9500, None]   # b1..b4, land
C9 = [48, 52, 58, 62]                    # C3 E3 Bb3 D4 — blues dominant 9th, also a dub chord

def land(full=True):
    keys = epiano([(m, v, 0, None) for m, v in zip(C9, (0.62, 0.52, 0.55, 0.5))], dur=2.4)
    if not full:
        return dub(verb(keys, 0.35), fb=0.38, n=5)
    x = empty(2.6)
    x = place(x, kick(0.95), 0)
    x = place(x, verb(keys, 0.3), 0)
    x = place(x, dub(stab([m + 12 for m in C9], 0.34), fb=0.45, n=7), 0)
    x = place(x, hat(0.22, tau=0.16, pan=0.3), 0)  # an open hat breathes on the 1
    return x

def variant_soundcheck():
    """call and response: rig, keys, rig, keys — then everyone on the 1"""
    b1 = place(plug(1.4), hum(0.8, 0.24), 0.01)
    b2 = verb(epiano([(48, 0.42, 0, None), (58, 0.48, 0, None),
                      (63, 0.55, 0, 0.042), (64, 0.66, 0.045, None)]), 0.3)
    b3 = empty(0.6)
    b3 = place(b3, kick(0.6), 0)
    b3 = place(b3, acid([(36, 0.0, 0.09, 1.0), (48, 0.105, 0.07, 0.3)], 0.5), 0)
    for k, at in enumerate((0.07, 0.14, 0.21)):
        b3 = place(b3, hat(0.32 - 0.05 * k), at)
    b4 = verb(epiano([(48, 0.42, 0, None), (67, 0.5, 0.0, 0.05), (66, 0.5, 0.055, 0.05),
                      (65, 0.52, 0.11, 0.05), (64, 0.6, 0.165, None), (58, 0.42, 0.165, None)]), 0.3)
    return dict(b1=b1, b2=b2, b3=b3, b4=b4, swell=reverse_swell(C9), land=land())

def variant_boogie():
    """one bar of boogie-woogie left hand; the rig stacks a layer under each beat"""
    def lh(top, v=0.55):
        return epiano([(36, v, 0, None), (top, v * 0.85, 0.0, None)], dur=1.4)
    b1 = place(lh(43), plug(0.6), 0)
    b1 = place(b1, hum(0.7, 0.1), 0.01)
    b2 = place(lh(45), kick(0.55), 0)
    b3 = place(place(lh(46), kick(0.6), 0), hat(0.3), 0.07)
    b3 = place(b3, hat(0.24), 0.14)
    b4 = place(place(lh(45), kick(0.65), 0), hat(0.3), 0.07)
    b4 = place(b4, acid([(36, 0.0, 0.08, 0.8), (39, 0.105, 0.06, 0.4), (48, 0.2, 0.06, 1.0)], 0.55), 0)
    b1, b2, b3, b4 = (verb(b, 0.22) for b in (b1, b2, b3, b4))
    return dict(b1=b1, b2=b2, b3=b3, b4=b4, swell=reverse_swell(C9), land=land())

def variant_latenight():
    """keys alone, after hours. no drums, softest"""
    def lh(top, v=0.42, extra=()):
        return verb(epiano([(36, v, 0, None), (top, v * 0.85, 0.0, None), *extra], dur=1.6), 0.4)
    b1, b2, b3 = lh(43), lh(45), lh(46)
    b4 = lh(45, extra=[(75, 0.28, 0.0, 0.04), (76, 0.34, 0.045, None)])  # a high crushed third, a wink
    return dict(b1=b1, b2=b2, b3=b3, b4=b4, swell=reverse_swell(C9), land=land(full=False))


def moog(midi, dur=1.2, cut=420, vel=0.7):
    """Sub 37-ish bass: two detuned saws + square sub, 24 dB lowpass with a pluck"""
    n = N(dur); t = T(n); f = mtof(midi)
    saw = sum(2 * ((f * (1 + d) * t) % 1) - 1 for d in (-0.004, 0.004)) / 2
    sub = np.sign(np.sin(np.pi * f * t))
    x = saw + 0.7 * sub
    a = np.exp(-t / 0.09)
    x = a * lp(x, cut * 3.5, 4) + (1 - a) * lp(x, cut, 4)
    e = np.minimum(t / 0.003, 1) * np.exp(-t / 0.6)
    return st(fade_end(np.tanh(1.6 * x * e) * vel, 0.3))

def reverse_of(src, dur=0.34):
    wet = np.vstack([ss.fftconvolve(src[c], IR[c]) for c in (0, 1)])[:, :N(1.0)]
    r = wet[:, ::-1][:, -N(dur):]; n = r.shape[1]; t = T(n)
    r = r + st(hp(rng.standard_normal(n), 3000) * (t / t[-1]) ** 3 * 0.05)
    r = r * (t / t[-1]) ** 1.6
    r[:, -N(0.004):] *= np.linspace(1, 0, N(0.004))
    return r / max(np.max(np.abs(r)), 1e-9) * 0.35

def variant_blues():
    """keys finger-warmer: C, the crushed blue third, G, B-flat — a C7 with the blue note, up the keys"""
    def note(*ns, rv=0.28):
        return verb(epiano(list(ns), dur=1.6), rv)
    b1 = note((36, 0.42, 0, 0.32), (60, 0.62, 0, 0.26))          # left hand C2 + C4
    b2 = note((63, 0.5, 0, 0.038), (64, 0.66, 0.04, 0.26))        # E-flat slips to E
    b3 = note((67, 0.76, 0, 0.26))                                # G
    b4 = note((69, 0.38, 0, 0.03), (70, 0.66, 0.032, 0.3))        # a flick of A into B-flat
    keys = epiano([(36, 0.5, 0, None)] + [(m, v, 0, None) for m, v in zip(C9 + [72], (0.6, 0.5, 0.52, 0.5, 0.46))], dur=2.6)
    land = dub(verb(keys, 0.38), fb=0.32, n=4, tone=2200)
    return dict(b1=b1, b2=b2, b3=b3, b4=b4, swell=reverse_swell(C9), land=land)

CM9 = [48, 51, 55, 58, 62]  # C Eb G Bb D

def variant_acid():
    """303 finger-warmer: four notes, cutoff and resonance a notch higher each time"""
    def one(m, base, env, res, acc, gate=0.13):
        x = acid([(m, 0.0, gate, acc)], 0.55, res=res, pan=0.0, base=base, decay=0.09, drive=2.6, env=env)
        return 1.7 * dub(verb(x, 0.12), d=0.372, fb=0.28, n=3, tone=2200)
    b1 = one(36, 160, 250, 0.78, 0.0)    # C2, filter shut, round
    b2 = one(48, 320, 600, 0.84, 0.2)    # up the octave, a little bite
    b3 = one(39, 600, 1100, 0.89, 0.45)  # E-flat, squelch arriving
    b4 = one(43, 900, 1600, 0.93, 1.0)   # G, accent, knob most of the way
    x = empty(2.6)
    x = place(x, kick(0.8), 0)
    x = place(x, moog(24, 1.4, 380, 0.55), 0)                       # C1 sub
    x = place(x, dub(acid([(36, 0, 0.16, 1.0)], 0.6, res=0.93, pan=0.0, base=1500, decay=0.12, drive=2.8), fb=0.4, n=6), 0)
    x = place(x, dub(stab([m + 12 for m in CM9], 0.28), fb=0.45, n=7), 0)
    x = place(x, hat(0.2, tau=0.16, pan=0.3), 0)
    sw = reverse_of(stab([m + 12 for m in CM9], 0.6, gate=0.3))
    return dict(b1=b1, b2=b2, b3=b3, b4=b4, swell=sw, land=x)

def sub37(midi, from_midi=None, glide=0.045, dur=1.2, gate=0.34, cut=300, env=900,
          res=0.35, vel=0.7, drive=1.8, decay=0.16):
    """Sub 37-style mono bass: 2 detuned saws + square sub, 24 dB (two cascaded SVFs),
    glide from the previous note, filter pluck, a little overdrive."""
    n = N(dur); t = T(n)
    m = np.full(n, float(midi))
    if from_midi is not None:
        k = t < glide
        m[k] = from_midi + (midi - from_midi) * (1 - np.exp(-t[k] / (glide / 4)))
    f = 440.0 * 2 ** ((m - 69) / 12)
    ph = np.cumsum(f) / SR
    x = (2 * ((ph * 1.003) % 1) - 1 + 2 * ((ph * 0.997) % 1) - 1) / 2 + 0.75 * np.sign(np.sin(np.pi * ph))
    fc = np.clip(cut + env * np.exp(-t / decay), 30, 6000)
    g = 2 * np.sin(np.pi * fc / (SR * 2)); q = 1 - res
    y = np.zeros(n)
    l1 = b1_ = l2 = b2_ = 0.0
    for i in range(n):
        for _ in range(2):
            l1 += g[i] * b1_; h = x[i] - l1 - q * b1_; b1_ += g[i] * h
            l2 += g[i] * b2_; h2 = l1 - l2 - 1.4 * b2_; b2_ += g[i] * h2
        y[i] = l2
    amp = np.minimum(t / 0.003, 1) * (0.62 + 0.38 * np.exp(-t / 0.12))
    amp *= np.clip(1 - (t - gate) / 0.12, 0, 1)
    y = np.tanh(drive * y * amp) / np.tanh(drive)
    return st(fade_end(y * vel, 0.2))

def variant_deep():
    """deep house bass finger-warmer: octave pop, down, down, gliding the whole way"""
    def one(m, frm, cut, env, vel=0.72):
        return 1.4 * verb(sub37(m, frm, cut=cut, env=env, vel=vel), 0.1)
    b1 = one(36, None, 240, 700)        # C2, round
    b2 = one(48, 36, 320, 1100, 0.6)    # glides up the octave: the house octave pop
    b3 = one(46, 48, 280, 900)          # down to B-flat
    b4 = one(43, 46, 300, 1300)         # down to G, a bit more filter, leaning into the 1
    keys = epiano([(m, v, 0, None) for m, v in zip(CM9, (0.5, 0.42, 0.44, 0.46, 0.42))], dur=2.6)
    x = empty(2.8)
    x = place(x, kick(0.6), 0)
    x = place(x, sub37(24, 31, cut=220, env=600, gate=0.9, dur=1.6, vel=0.62), 0)  # C1, scooped up from G
    x = place(x, dub(verb(keys, 0.4), fb=0.3, n=4, tone=2000), 0)
    x = place(x, hat(0.14, tau=0.12, pan=0.3), 0)
    return dict(b1=b1, b2=b2, b3=b3, b4=b4, swell=reverse_swell(CM9), land=x)

VARIANTS = {  # name: (builder, peak dBFS, door arc)
    'blues':      (variant_blues, -10.0, False),
    'acid':       (variant_acid, -9.0, False),
    'deep':       (variant_deep, -9.0, False),
    'soundcheck': (variant_soundcheck, -9.0, True),
    'boogie':     (variant_boogie, -9.0, True),
    'latenight':  (variant_latenight, -13.0, True),
}

def preview(cues, bpm=121.0):
    i = 60.0 / bpm
    x = empty(6.0)
    for k in range(4):
        x = place(x, cues[f'b{k+1}'], k * i)
    x = place(x, cues['swell'], 4 * i - cues['swell'].shape[1] / SR)
    x = place(x, cues['land'], 4 * i)
    return x

def write(path, x):
    y = np.clip(x, -1, 1)
    wf.write(path, SR, (y.T * 32767).astype(np.int16))

manifest = {}
for name, (fn, peak_db, use_door) in VARIANTS.items():
    cues = fn()
    for k, f in enumerate(DOOR[:4]):
        if use_door:
            cues[f'b{k+1}'] = door(cues[f'b{k+1}'], f)
    cues = {k: trim(v) if k != 'swell' else v for k, v in cues.items()}
    # one gain for the whole variant, so beat-to-beat balance is what was designed
    mix = preview(cues)
    g = 10 ** (peak_db / 20) / np.max(np.abs(mix))
    os.makedirs(f'{OUT}/{name}', exist_ok=True)
    manifest[name] = {}
    for k, v in cues.items():
        write(f'{OUT}/{name}/countin_{name}_{k}.wav', v * g)
        manifest[name][k] = round(v.shape[1] / SR, 3)
    write(f'{OUT}/{name}/preview_{name}_121bpm.wav', mix * g)
    print(name, 'gain', round(20 * np.log10(g), 1), 'dB', manifest[name])

json.dump(manifest, open(f'{OUT}/manifest.json', 'w'), indent=1)
