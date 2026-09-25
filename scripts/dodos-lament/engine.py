"""Dodo's Lament — a small synthesis engine. Everything is made from scratch at 48 kHz.

- Pipe organ: additive ranks read from band-limited wavetables, each pipe with
  its own detune, a speech transient (the octave speaks first, the pitch starts
  a hair flat, a breath of chiff noise), wind jitter, and C-side / C#-side
  panning like a real case. Stops are ranks at 16', 8', 4', 2 2/3', 2', 1 3/5',
  a four-rank mixture that breaks back in the treble, and trumpet/oboe/posaune
  reeds with a formant.
- Strings: an ensemble of band-limited saws per note, each with its own detune,
  delayed vibrato and drift; the body resonances are an EQ on the bus, so the
  vibrato sweeps the harmonics through them the way a real body does.
- Plucks: additive saw/square through a resonant low-pass whose cutoff falls
  over the note, computed per harmonic, so nothing aliases.
- Celesta: two-operator FM plus a glassy inharmonic partial.
- Drums: a deep sine kick, 808-style metallic hats, shaker, rim; a sine sub.
- Rooms: convolution with impulse responses synthesized as noise whose decay
  time depends on frequency (STFT), plus a few early reflections.
- numba for the per-sample loops (swept filter, compressor, limiter release).
"""
import numpy as np
from scipy import signal
from scipy.ndimage import minimum_filter1d, uniform_filter1d
import numba

SR = 48000
TABLE_N = 8192

NOTE = {'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'Gb': 6,
        'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11}


def m(name):
    """'C#4' -> MIDI number (C4 = 60)."""
    head = name[:-1] if name[-1].isdigit() and not name[-2].isdigit() else name[:-2]
    octave = int(name[len(head):])
    return NOTE[head] + 12 * (octave + 1)


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


# ---------------------------------------------------------------------------
# wavetables
# ---------------------------------------------------------------------------
_tables = {}


def table(key, amps):
    """Single-cycle table with sine harmonics `amps` (k = 1..K), RMS of a unit sine."""
    t = _tables.get(key)
    if t is not None:
        return t
    spec = np.zeros(TABLE_N // 2 + 1, dtype=np.complex128)
    K = min(len(amps), TABLE_N // 2 - 1)
    spec[1:K + 1] = -1j * np.asarray(amps[:K], dtype=np.float64) * (TABLE_N / 2)
    t = np.fft.irfft(spec, TABLE_N)
    rms = np.sqrt(np.mean(t ** 2))
    if rms > 0:
        t = t / (rms * np.sqrt(2.0))
    _tables[key] = t
    return t


def wt_osc(tab, freq, phase0=0.0):
    """Read a wavetable at a per-sample frequency (Hz array), linear interpolation."""
    ph = np.cumsum(freq, dtype=np.float64) / SR + phase0
    ph -= np.floor(ph)
    idx = ph * TABLE_N
    i0 = idx.astype(np.int64)
    fr = idx - i0
    i0 %= TABLE_N
    i1 = (i0 + 1) % TABLE_N
    return tab[i0] * (1.0 - fr) + tab[i1] * fr


def smooth_noise(n, rate_hz, rng):
    """Slow random wobble, roughly unit RMS, changing about `rate_hz` times a second."""
    pts = int(n / SR * rate_hz) + 4
    v = rng.standard_normal(pts)
    x = np.linspace(0, pts - 3, n)
    y = np.interp(x, np.arange(pts), v)
    w = max(3, int(SR / rate_hz / 2))
    return uniform_filter1d(y, w, mode='nearest')


# ---------------------------------------------------------------------------
# pipe organ
# ---------------------------------------------------------------------------
def _principal(K, seed):
    r = np.random.default_rng(seed)
    k = np.arange(1, K + 1)
    a = k ** -1.1 * np.abs(1 + 0.16 * r.standard_normal(K))
    if K > 1:
        a[1] *= 1.15
    return a


_GEDACKT = np.array([1, .025, .24, .015, .07, .01, .03, .005, .012, .003, .006])
_FLUTE = np.array([1, .17, .19, .06, .055, .02, .018, .01, .006])


def _reed(K, f, formant, bright, fund):
    k = np.arange(1, K + 1)
    fk = k * f
    a = k ** -bright
    a = a * (1 + 2.4 * np.exp(-np.log2(fk / formant) ** 2 / 0.35))
    a = a / (1 + (fk / 6500.0) ** 4)
    a[0] *= fund
    return a


def recipe(name, K, f, seed=0):
    if name == 'principal':
        return _principal(K, seed)
    if name == 'gedackt':
        a = np.zeros(K)
        a[:min(K, len(_GEDACKT))] = _GEDACKT[:K]
        return a
    if name == 'flute':
        a = np.zeros(K)
        a[:min(K, len(_FLUTE))] = _FLUTE[:K]
        return a
    if name == 'trumpet':
        return _reed(K, f, 1300, 0.35, 0.8)
    if name == 'oboe':
        return _reed(K, f, 1700, 0.55, 0.45)
    if name == 'posaune':
        return _reed(K, f, 620, 0.4, 1.0)
    raise KeyError(name)


# name: (pitch ratio to 8', recipe, level, kind)
STOPS = {
    'gedackt8': (1.0, 'gedackt', 1.0, 'flue'),
    'principal8': (1.0, 'principal', 0.9, 'flue'),
    'octave4': (2.0, 'principal', 0.55, 'flue'),
    'flute4': (2.0, 'flute', 0.5, 'flue'),
    'nasard': (3.0, 'flute', 0.32, 'flue'),
    'flute2': (4.0, 'flute', 0.36, 'flue'),
    'superoctave2': (4.0, 'principal', 0.38, 'flue'),
    'tierce': (5.0, 'flute', 0.28, 'flue'),
    'mixture': (None, 'principal', 0.2, 'flue'),
    'trumpet8': (1.0, 'trumpet', 0.8, 'reed'),
    'oboe8': (1.0, 'oboe', 0.6, 'reed'),
    'subbass16': (0.5, 'gedackt', 1.0, 'flue'),
    'pprincipal8': (1.0, 'principal', 0.7, 'flue'),
    'poctave4': (2.0, 'principal', 0.42, 'flue'),
    'posaune16': (0.5, 'posaune', 0.6, 'reed'),
}
CORNET = ['gedackt8', 'flute4', 'nasard', 'flute2', 'tierce']


def _mixture_ratios(f):
    out = []
    for r in (6, 8, 12, 16):
        while f * r > 4200 and r > 2:
            r /= 2
        if r not in out:
            out.append(r)
    return out


def pipe(freq, dur, rec, rng, level=1.0, kind='flue', chiff=0.07, breath=0.0, rel=0.07, seed=0):
    """One organ pipe held for `dur` seconds. Returns mono float64."""
    n_on = max(1, int(dur * SR))
    n = n_on + int(rel * SR * 4)
    t = np.arange(n) / SR
    f = freq * 2 ** (rng.normal(0, 1.3) / 1200)
    K = max(1, min(40, int(18500 / (f * 1.003))))
    midi_key = int(round(12 * np.log2(freq / 440.0) + 69))
    amps = recipe(rec, K, f, seed)
    att = amps.copy()
    if kind == 'flue':
        att[0] *= 0.35
        if K > 1:
            att[1] *= 2.2
        att[2:] *= 1.25
        ta = float(np.clip(0.018 + 0.05 * np.sqrt(220.0 / f), 0.015, 0.14))
    else:
        att[0] *= 0.6
        att[3:] *= 1.5
        ta = float(np.clip(0.012 + 0.025 * np.sqrt(220.0 / f), 0.01, 0.07))
    tab_s = table((rec, K, midi_key if rec in ('trumpet', 'oboe', 'posaune') else 0, seed), amps)
    tab_a = table((rec, K, midi_key if rec in ('trumpet', 'oboe', 'posaune') else 0, seed, 'att'), att)
    fr = f * (1 + 0.00025 * smooth_noise(n, 5.0, rng))
    fr = fr * (1 - 0.004 * np.exp(-t / (ta * 0.8)))
    ph0 = rng.random()
    s = wt_osc(tab_s, fr, ph0)
    a = wt_osc(tab_a, fr, ph0)
    xf = np.clip(t / (2.2 * ta), 0, 1) ** 0.7
    y = a + (s - a) * xf
    env = 1 - np.exp(-t / (ta / 2.5))
    env *= 1 + 0.006 * smooth_noise(n, 3.0, rng)
    env[n_on:] = env[n_on - 1] * np.exp(-(t[n_on:] - t[n_on - 1]) / (rel / 3))
    y *= env
    if kind == 'flue' and chiff > 0:
        cn = min(n, int(min(0.1, 2.4 * ta) * SR))
        nz = rng.standard_normal(cn)
        fc = min(f * 3.0, 9000.0)
        sos = signal.butter(2, [fc / 1.7, min(fc * 1.7, 20000.0)], 'bandpass', fs=SR, output='sos')
        nz = signal.sosfilt(sos, nz)
        nz /= np.std(nz) + 1e-12
        tc = np.arange(cn) / SR
        y[:cn] += chiff * nz * np.exp(-tc / (ta * 0.6)) * (1 - np.exp(-tc / 0.003))
    if breath > 0:
        nz = rng.standard_normal(n)
        sos = signal.butter(2, [min(f * 2, 8000) / 2, min(f * 4, 16000)], 'bandpass', fs=SR, output='sos')
        nz = signal.sosfilt(sos, nz)
        nz /= np.std(nz) + 1e-12
        y += breath * nz * env
    return y * level


def organ_note(midi, dur, stops, rng, gain=1.0):
    """A key held with a set of stops drawn. Returns mono."""
    f8 = hz(midi)
    out = None
    for i, name in enumerate(stops):
        ratio, rec, level, kind = STOPS[name]
        ratios = _mixture_ratios(f8) if name == 'mixture' else [ratio]
        for j, r in enumerate(ratios):
            y = pipe(f8 * r, dur, rec, rng, level=level, kind=kind,
                     breath=0.012 if rec in ('gedackt', 'flute') else 0.0, seed=(i * 7 + j) % 5)
            if out is None:
                out = y
            else:
                if len(y) > len(out):
                    y, out = out, y
                out[:len(y)] += y
    return out * gain


def organ_pan(midi):
    """C side / C# side: alternate semitones left and right, basses in the middle."""
    side = 1.0 if midi % 2 else -1.0
    return side * (0.15 + 0.5 * float(np.clip((midi - 40) / 40, 0, 1)))


# ---------------------------------------------------------------------------
# strings
# ---------------------------------------------------------------------------
def string_note(midi, dur, rng, vel=1.0, voices=5, attack=0.35, release=0.6, vib=0.0042, detune=8.0, pan=0.0, spread=0.5):
    """Returns stereo (2, n): the ensemble's players spread around `pan`."""
    f0 = hz(midi)
    n_on = max(1, int(dur * SR))
    n = n_on + int(release * SR * 3)
    t = np.arange(n) / SR
    K = max(1, int(17000 / (f0 * 1.03)))
    tab = table(('saw', K), 1.0 / np.arange(1, K + 1))
    y = np.zeros((2, n))
    for vi in range(voices):
        p = float(np.clip(pan + spread * (2 * vi / max(voices - 1, 1) - 1), -1, 1))
        a_ = (p + 1) * np.pi / 4
        det = 2 ** (rng.uniform(-detune, detune) / 1200)
        rate = rng.uniform(4.6, 6.0)
        depth = vib * rng.uniform(0.7, 1.2)
        onset = np.clip((t - rng.uniform(0.15, 0.4)) / 0.6, 0, 1)
        v = depth * onset * np.sin(2 * np.pi * rate * t + rng.random() * 6.283)
        drift = 0.0012 * smooth_noise(n, 0.8, rng)
        w = wt_osc(tab, f0 * det * (1 + v + drift), rng.random()) * rng.uniform(0.75, 1.0)
        y[0] += w * np.cos(a_)
        y[1] += w * np.sin(a_)
    y /= np.sqrt(voices)   # same total power as the mono version it replaced
    a = np.clip(t / attack, 0, 1)
    env = 0.5 - 0.5 * np.cos(np.pi * a)
    env *= 1 + 0.12 * np.sin(np.pi * np.clip(t / max(dur, 1e-3), 0, 1))
    env[n_on:] = env[n_on - 1] * np.exp(-(t[n_on:] - t[n_on - 1]) / (release / 2.5))
    nz = rng.standard_normal(n)
    sos = signal.butter(2, [1800, 7000], 'bandpass', fs=SR, output='sos')
    nz = signal.sosfilt(sos, nz)
    nz /= np.std(nz) + 1e-12
    y = y + 0.025 * nz * (0.6 + 0.4 * np.abs(np.sin(2 * np.pi * 1.3 * t)))
    return y * env * vel


def string_pan(midi):
    """Orchestra seating: high strings left, low strings right."""
    return float(np.clip((62 - midi) / 30, -0.55, 0.55))


# ---------------------------------------------------------------------------
# pluck, celesta, sub
# ---------------------------------------------------------------------------
def pluck_note(midi, dur, rng, vel=1.0, fc0=2500.0, fc_min=350.0, tau_f=0.12, tau_a=0.24, q=1.4, sq=0.25):
    f0 = hz(midi)
    L = min(dur + 0.25, 1.4)
    n = int(L * SR)
    t = np.arange(n, dtype=np.float32) / SR
    K = max(1, int(min(fc0 * 6, 17000) / f0))
    k = np.arange(1, K + 1, dtype=np.float32)
    a0 = (1 - sq) / k + sq * (k % 2 == 1) / k
    fc = (fc_min + (fc0 - fc_min) * np.exp(-t / tau_f)).astype(np.float32)
    phi = (2 * np.pi * f0 * t).astype(np.float32)
    y = np.zeros(n, dtype=np.float32)
    for i in range(K):
        r = (k[i] * f0) / fc
        H = 1.0 / np.sqrt((1 - r * r) ** 2 + (r / q) ** 2)
        y += a0[i] * H * np.sin(k[i] * phi + i * 0.7)
    env = np.exp(-t / tau_a) * (1 - np.exp(-t / 0.002))
    off = int(dur * SR)
    if off < n:
        env[off:] *= np.exp(-(t[off:] - t[off]) / 0.05)
    return (y * env * vel).astype(np.float64)


def celesta_note(midi, rng, vel=1.0, ring=1.8):
    f = hz(midi)
    n = int(ring * 3.2 * SR)
    t = np.arange(n) / SR
    idx = 1.3 * np.exp(-t / 0.25) + 0.22
    y = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * f * t)) * np.exp(-t / ring)
    y += 0.16 * np.sin(2 * np.pi * 4.07 * f * t) * np.exp(-t / (ring * 0.16))
    y += 0.07 * np.sin(2 * np.pi * 2.0 * f * t + 0.3) * np.exp(-t / (ring * 0.5))
    y *= 1 - np.exp(-t / 0.0012)
    return y * vel


def sub_note(midi, dur, vel=1.0):
    f = hz(midi)
    n_on = int(dur * SR)
    n = n_on + int(0.25 * SR)
    t = np.arange(n) / SR
    y = np.sin(2 * np.pi * f * t) + 0.1 * np.sin(4 * np.pi * f * t)
    env = 1 - np.exp(-t / 0.008)
    env[n_on:] = env[n_on - 1] * np.exp(-(t[n_on:] - t[n_on - 1]) / 0.05)
    return np.tanh(1.2 * y * env) / np.tanh(1.2) * vel


# ---------------------------------------------------------------------------
# drums
# ---------------------------------------------------------------------------
def kick(rng, vel=1.0, f_end=50.0, f_start=125.0, pitch_tau=0.032, decay=0.3, click=0.08):
    n = int(0.9 * SR)
    t = np.arange(n) / SR
    f = f_end + (f_start - f_end) * np.exp(-t / pitch_tau)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / decay) * (1 - np.exp(-t / 0.0008))
    nz = signal.sosfilt(signal.butter(2, 3000, 'high', fs=SR, output='sos'), rng.standard_normal(n))
    ck = nz / (np.std(nz) + 1e-12) * np.exp(-t / 0.0025) * click
    return np.tanh(1.8 * (body + ck)) / np.tanh(1.8) * vel


_MET = np.array([205.3, 304.4, 369.6, 522.7, 540.0, 800.0])


def _metal(n, scale):
    t = np.arange(n) / SR
    y = np.zeros(n)
    for f in _MET * scale:
        k = 1
        while k * f < 20000:
            y += np.sin(2 * np.pi * k * f * t) / k
            k += 2
    return y


_HAT_CACHE = {}


def hat(rng, vel=1.0, open_=False):
    key = 'o' if open_ else 'c'
    if key not in _HAT_CACHE:
        L = 0.5 if open_ else 0.14
        n = int(L * SR)
        base = _metal(n, 1.9) + 1.2 * rng.standard_normal(n)
        base = signal.sosfilt(signal.butter(4, 7200, 'high', fs=SR, output='sos'), base)
        base = signal.sosfilt(signal.butter(2, 15000, 'low', fs=SR, output='sos'), base)
        _HAT_CACHE[key] = base / (np.std(base) + 1e-12)
    base = _HAT_CACHE[key]
    n = len(base)
    t = np.arange(n) / SR
    tau = 0.16 if open_ else 0.028
    wob = 1 + 0.15 * rng.standard_normal()
    return base * np.exp(-t / (tau * wob)) * (1 - np.exp(-t / 0.0004)) * vel


def shaker(rng, vel=1.0):
    n = int(0.11 * SR)
    t = np.arange(n) / SR
    nz = signal.sosfilt(signal.butter(2, [4800, 11000], 'bandpass', fs=SR, output='sos'), rng.standard_normal(n))
    nz /= np.std(nz) + 1e-12
    env = (1 - np.exp(-t / 0.006)) * np.exp(-t / 0.032)
    return nz * env * vel


def rim(rng, vel=1.0):
    n = int(0.09 * SR)
    t = np.arange(n) / SR
    y = 0.6 * np.sin(2 * np.pi * 1650 * t) * np.exp(-t / 0.009) + 0.4 * np.sin(2 * np.pi * 820 * t) * np.exp(-t / 0.013)
    nz = signal.sosfilt(signal.butter(2, 2500, 'high', fs=SR, output='sos'), rng.standard_normal(n))
    y += 0.3 * nz / (np.std(nz) + 1e-12) * np.exp(-t / 0.002)
    return y * vel


# ---------------------------------------------------------------------------
# rooms and effects
# ---------------------------------------------------------------------------
def make_ir(rt, length, predelay, seed, early=12, early_span=0.07, onset=0.02):
    """Stereo IR: noise whose decay time follows `rt` [(Hz, seconds), ...], unit energy per channel."""
    rng = np.random.default_rng(seed)
    n = int(length * SR)
    fs_ = np.log([p[0] for p in rt])
    rs_ = [p[1] for p in rt]
    chans = []
    for _ in range(2):
        f, tt, Z = signal.stft(rng.standard_normal(n), fs=SR, nperseg=1024, noverlap=768)
        rtf = np.interp(np.log(np.maximum(f, 20.0)), fs_, rs_)
        Z = Z * np.exp(-6.91 * tt[None, :] / rtf[:, None])
        _, x = signal.istft(Z, fs=SR, nperseg=1024, noverlap=768)
        x = x[:n]
        tn = np.arange(len(x)) / SR
        x = x * (1 - np.exp(-tn / onset))
        peak = np.max(np.abs(x[:int(0.15 * SR)]))
        for _ in range(early):
            d = rng.uniform(0.004, early_span)
            i = int(d * SR)
            x[i] += rng.choice([-1.0, 1.0]) * rng.uniform(0.4, 1.0) * peak * np.exp(-d / 0.05)
        x = signal.sosfilt(signal.butter(1, 12000, 'low', fs=SR, output='sos'), x)
        chans.append(x)
    ir = np.stack(chans)
    # rooms are close to mono in the bass: share one low band between the channels
    lo = signal.butter(4, 160, 'low', fs=SR, output='sos')
    hi = signal.butter(4, 160, 'high', fs=SR, output='sos')
    low = signal.sosfiltfilt(lo, ir[0])
    ir = np.stack([signal.sosfiltfilt(hi, ir[0]) + low, signal.sosfiltfilt(hi, ir[1]) + low])
    ir /= np.sqrt(np.sum(ir ** 2, axis=1, keepdims=True))
    pad = np.zeros((2, int(predelay * SR)))
    return np.concatenate([pad, ir], axis=1)


def convolve(x2, ir2):
    n = x2.shape[1]
    out = np.zeros((2, n), dtype=np.float32)
    for c in range(2):
        out[c] = signal.oaconvolve(x2[c].astype(np.float64), ir2[c])[:n]
    return out


def pingpong(x2, delay_s, first, fb, echoes, lp_hz=4000.0, hp_hz=300.0):
    n = x2.shape[1]
    out = np.zeros((2, n), dtype=np.float32)
    d = int(delay_s * SR)
    sig = signal.sosfilt(signal.butter(1, hp_hz, 'high', fs=SR, output='sos'), x2.mean(axis=0).astype(np.float64))
    lp = signal.butter(1, lp_hz, 'low', fs=SR, output='sos')
    g = first
    for k in range(1, echoes + 1):
        sig = signal.sosfilt(lp, sig)
        s = k * d
        if s >= n:
            break
        out[(k - 1) % 2, s:] += (g * sig[:n - s]).astype(np.float32)
        g *= fb
    return out


def eq(x2, sos):
    return signal.sosfilt(sos, x2, axis=1).astype(np.float32)


def peaking(f0, gain_db, q):
    """RBJ peaking EQ as one SOS row."""
    A = 10 ** (gain_db / 40)
    w = 2 * np.pi * f0 / SR
    al = np.sin(w) / (2 * q)
    b = [1 + al * A, -2 * np.cos(w), 1 - al * A]
    a = [1 + al / A, -2 * np.cos(w), 1 - al / A]
    return np.array([[b[0] / a[0], b[1] / a[0], b[2] / a[0], 1.0, a[1] / a[0], a[2] / a[0]]])


def shelf(f0, gain_db, high=True):
    A = 10 ** (gain_db / 40)
    w = 2 * np.pi * f0 / SR
    al = np.sin(w) / 2 * np.sqrt(2)
    c = np.cos(w)
    sA = 2 * np.sqrt(A) * al
    if high:
        b = [A * ((A + 1) + (A - 1) * c + sA), -2 * A * ((A - 1) + (A + 1) * c), A * ((A + 1) + (A - 1) * c - sA)]
        a = [(A + 1) - (A - 1) * c + sA, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - sA]
    else:
        b = [A * ((A + 1) - (A - 1) * c + sA), 2 * A * ((A - 1) - (A + 1) * c), A * ((A + 1) - (A - 1) * c - sA)]
        a = [(A + 1) + (A - 1) * c + sA, -2 * ((A - 1) + (A + 1) * c), (A + 1) + (A - 1) * c - sA]
    return np.array([[b[0] / a[0], b[1] / a[0], b[2] / a[0], 1.0, a[1] / a[0], a[2] / a[0]]])


@numba.njit(cache=True)
def svf_lp(x, fc, q):
    """Topology-preserving state-variable low-pass with a per-sample cutoff."""
    y = np.empty_like(x)
    ic1 = 0.0
    ic2 = 0.0
    k = 1.0 / q
    for i in range(x.shape[0]):
        f = fc[i]
        if f > 0.45 * 48000.0:
            f = 0.45 * 48000.0
        g = np.tan(np.pi * f / 48000.0)
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


def swept_lp(x2, fc, q=0.707):
    out = np.empty_like(x2)
    for c in range(2):
        out[c] = svf_lp(x2[c].astype(np.float64), fc.astype(np.float64), q)
    return out


@numba.njit(cache=True)
def _comp(det_db, thr, ratio, knee, att, rel):
    n = det_db.shape[0]
    g = np.empty(n)
    env = 0.0
    for i in range(n):
        over = det_db[i] - thr
        if over <= -knee / 2:
            target = 0.0
        elif over >= knee / 2:
            target = over * (1 - 1 / ratio)
        else:
            target = (1 - 1 / ratio) * (over + knee / 2) ** 2 / (2 * knee)
        if target > env:
            env = att * env + (1 - att) * target
        else:
            env = rel * env + (1 - rel) * target
        g[i] = env
    return g


def compress(x2, thr_db=-16.0, ratio=1.6, knee=6.0, attack=0.03, release=0.25, makeup_db=0.0):
    p = (x2[0].astype(np.float64) ** 2 + x2[1].astype(np.float64) ** 2) / 2
    p = signal.lfilter([1 - np.exp(-1 / (0.01 * SR))], [1, -np.exp(-1 / (0.01 * SR))], p)
    det = 10 * np.log10(p + 1e-12)
    gr = _comp(det, thr_db, ratio, knee, np.exp(-1 / (attack * SR)), np.exp(-1 / (release * SR)))
    g = 10 ** ((makeup_db - gr) / 20)
    return (x2 * g).astype(np.float32), gr


@numba.njit(cache=True)
def _release(target, coef):
    g = np.empty_like(target)
    cur = 1.0
    for i in range(target.shape[0]):
        up = cur + (1.0 - cur) * (1.0 - coef)
        cur = target[i] if target[i] < up else up
        g[i] = cur
    return g


def true_peak_env(x2, os_=4, chunk=1 << 20):
    """Per-sample peak of the 4x oversampled signal (what a true-peak meter sees)."""
    n = x2.shape[1]
    out = np.zeros(n)
    pad = 64
    for s in range(0, n, chunk):
        a, e = max(0, s - pad), min(n, s + chunk + pad)
        seg = signal.resample_poly(x2[:, a:e].astype(np.float64), os_, 1, axis=1)
        pk = np.max(np.abs(seg), axis=0)
        pk = pk[: (e - a) * os_].reshape(-1, os_).max(axis=1)
        out[s:min(n, s + chunk)] = pk[s - a: s - a + min(chunk, n - s)]
    return out


def limit(x2, ceiling_db=-1.3, lookahead_ms=5.0, release_ms=80.0):
    """Look-ahead limiter on the true (4x oversampled) peak."""
    ceil = 10 ** (ceiling_db / 20)
    peak = np.maximum(true_peak_env(x2), np.max(np.abs(x2), axis=0)).astype(np.float64)
    need = np.minimum(1.0, ceil / np.maximum(peak, 1e-9))
    L = int(lookahead_ms * SR / 1000)
    held = minimum_filter1d(need, size=2 * L + 1, mode='nearest')
    smooth = uniform_filter1d(held, size=L, mode='nearest')
    g = _release(np.minimum(smooth, held), np.exp(-1 / (release_ms * SR / 1000)))
    y = x2 * g
    return np.clip(y, -ceil, ceil).astype(np.float32), g


def pan2(y, pan):
    """Equal-power pan of a mono signal to (2, n)."""
    a = (pan + 1) * np.pi / 4
    return np.stack([y * np.cos(a), y * np.sin(a)])
