#!/usr/bin/env python3
"""The synth voices for the Stage songs, rendered as one-shots the sampler plays like any
recording: Takt/Sounds/syn-*.caf, registered in instruments.json.

    <venv with numpy, scipy, soundfile>/bin/python apps/takt/scripts/synths.py

The three electronic songs are ports of Bart's Berlin sketches (misc/sketches.py, numpy
synthesis, no samples): minimal techno at 127, deep house at 121, dub techno at 117. Every
voice here is that script's voice at 48 kHz, cut as a one-shot; what the sketch does at mix
time is baked in where it belongs to the note (the bleep's ping-pong delay and room, the
Rhodes' reverb and delay) and left to the engine where it belongs to the beat or the room (the
sidechain pumping: the band's `duck`; the dub chamber: the band's `dub`). Filters that
breathe over bars become velocity layers, dark to bright, and the songs drive the velocity.
The dub stab is the exception: it is synthesized live (Takt/Audio/DubStab.swift), so its
filter sweeps continuously, and the chamber's tape hiss is live too (misc/DUB_TECHNO_FIXES.md).

Drums (one root, velocity layers, round robins): kickMin / hatMin / rimMin / clickMin (minimal),
kickDH / clapDH / hatDH / hatOpenDH (deep house), kickDub / hatDub / hatDub16 (dub). Bed (one
long shot the drums channel retriggers every eight bars): crackle (vinyl).
Pitched: bleep (3 layers = the filter opening), stabMin (the bleep voice as a dark chord stab),
subMin (sine), rhodes (2 layers = the filter brightening, 2.2 s plate and a delay), bassDH
(saw and sine), subDub.

Each instrument is normalized to -3 dBFS peak like scripts/sounds.py; the songs balance them
with gainDb and `levels`. Entries for these names replace what instruments.json had.
"""
import json
import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import butter, fftconvolve, lfilter

OUT = Path(__file__).resolve().parent.parent / "Takt/Sounds"
SR = 48000
rng = np.random.default_rng(7)
# The dub voices draw from their own generator, so changing them leaves the others' noise alone.
rng_dub = np.random.default_rng(117)

NAMES = ["kickMin", "hatMin", "rimMin", "clickMin", "kickDH", "clapDH", "hatDH", "hatOpenDH", "kickDub", "hatDub",
         "hatDub16", "crackle", "bleep", "stabMin", "subMin", "rhodes", "bassDH", "subDub"]
# The electronic set before the sketches (Undertow, Nachtschicht): gone with them.
RETIRED = ["kick909", "kickRumble", "clap909", "hat909", "hatOpen909", "ride909", "shaker", "rim909", "tomSyn",
           "sub", "acid", "stab", "pad", "lead", "leadHouse", "rave",
           # The sampled dub stab, lead and room tone (0.1 (43)): the stab and the hiss are live now.
           "dubStab", "dubLead", "roomtone"]
INSTRUMENTS = {}
FILES = []


def t_axis(seconds, sr=SR):
    return np.arange(int(seconds * sr)) / sr


def env_exp(t, tau, hold=0.0):
    return np.exp(-np.maximum(t - hold, 0) / tau)


def adsr(n, a=0.005, r=0.05, sr=SR):
    e = np.ones(n)
    na = max(1, int(a * sr))
    nr = max(1, int(r * sr))
    e[:na] = np.linspace(0, 1, na)
    if nr < n:
        e[-nr:] *= np.linspace(1, 0, nr)
    return e


def lowpass(x, hz, sr=SR, order=2):
    b, a = butter(order, min(hz, sr * 0.45) / (sr / 2), btype="low")
    return lfilter(b, a, x)


def highpass(x, hz, sr=SR, order=2):
    b, a = butter(order, min(hz, sr * 0.45) / (sr / 2), btype="high")
    return lfilter(b, a, x)


def bandpass(x, lo, hi, sr=SR, order=2):
    b, a = butter(order, [lo / (sr / 2), min(hi, sr * 0.45) / (sr / 2)], btype="band")
    return lfilter(b, a, x)


def saw(freq, t, detune=0.0):
    """The sketch's saw: a naive ramp, three of them when detuned."""
    s = 2 * ((t * freq) % 1.0) - 1
    if detune:
        s += 2 * ((t * freq * (1 + detune)) % 1.0) - 1
        s += 2 * ((t * freq * (1 - detune)) % 1.0) - 1
        s /= 3
    return s


def midi_hz(n):
    return 440 * 2 ** ((n - 69) / 12)


def delay(x, seconds, fb=0.5, taps=10, tone=2500, pingpong=True, sr=SR):
    """The sketch's delay: darkening repeats, ping-pong across the two sides. Returns stereo."""
    out = np.zeros((2, len(x)))
    d = int(seconds * sr)
    cur = x.copy()
    for k in range(1, taps + 1):
        cur = lowpass(cur, tone, sr) * fb
        if k * d >= len(x):
            break
        shifted = np.zeros(len(x))
        shifted[k * d:] = cur[: len(x) - k * d]
        if pingpong:
            ch = k % 2
            out[ch] += shifted
            out[1 - ch] += shifted * 0.35
        else:
            out += shifted
    return out


def reverb(x, length=2.5, damp=4000, seed=1, sr=SR):
    """The sketch's reverb: decaying noise, two sides. Returns stereo."""
    r = np.random.default_rng(seed)
    n = int(length * sr)
    t = np.arange(n) / sr
    sides = []
    for _ in range(2):
        ir = lowpass(r.standard_normal(n) * np.exp(-t * 6.9 / length), damp, sr)
        ir /= np.sqrt(np.sum(ir ** 2))
        sides.append(fftconvolve(x, ir)[: len(x)])
    return np.stack(sides)


def resample(x, sr_to, sr_from=SR):
    """Down to a lower rate for long, dark samples (the loader takes any rate)."""
    n = int(len(x) * sr_to / sr_from)
    idx = np.linspace(0, len(x) - 1, n)
    y = lowpass(x, sr_to * 0.42, sr_from, order=4)
    return np.interp(idx, np.arange(len(x)), y)


def stereo_out(l, r):
    return np.stack([l, r], axis=1)


def register(key, release, zones, norm=-3.0, sr=SR):
    """zones: list of (root, vel ceiling, [(name, samples)]). One gain across the instrument."""
    peak = max(np.abs(x).max() for _, _, rr in zones for _, x in rr)
    g = 10 ** (norm / 20) / peak
    out = []
    for root, vel, rr in zones:
        names = []
        for name, x in rr:
            p = OUT / f"{name}.wav"
            sf.write(p, (x * g).astype(np.float32), sr, subtype="PCM_16")
            FILES.append(p)
            names.append(name)
        out.append({"root": int(root), "vel": round(float(vel), 3), "files": names})
    INSTRUMENTS[key] = {"release": release, "zones": out}
    print(f"{key}: {len(out)} zones, {sum(len(z['files']) for z in out)} files")


# MARK: The sketch's drum voices

def kick(f0=150, f1=45, pd=0.04, decay=0.35, click=0.3, drive=1.5):
    t = t_axis(decay * 3)
    f = f1 + (f0 - f1) * np.exp(-t / pd)
    ph = 2 * np.pi * np.cumsum(f) / SR
    k = np.sin(ph) * np.exp(-t / decay)
    k += click * rng.standard_normal(len(t)) * np.exp(-t / 0.002)
    return np.tanh(k * drive) / np.tanh(drive)


def hat(decay=0.03, lo=7000):
    t = t_axis(decay * 6)
    x = rng.standard_normal(len(t))
    for f in (3200, 4100, 5300, 6700, 8100, 9400):
        x += 0.4 * np.sign(np.sin(2 * np.pi * f * t))
    x = highpass(x, lo, order=4)
    return x * env_exp(t, decay)


def clap(decay=0.12):
    t = t_axis(0.5)
    n = len(t)
    x = rng.standard_normal(n)
    e = np.zeros(n)
    for off in (0, 0.011, 0.022, 0.031):
        o = int(off * SR)
        e[o:] += np.exp(-(t[: n - o]) / (0.007 if off < 0.03 else decay))
    return bandpass(x, 900, 3500) * e


def rim(f=1700, decay=0.025):
    t = t_axis(0.15)
    x = np.sin(2 * np.pi * f * t) * np.exp(-t / decay) + 0.5 * bandpass(rng.standard_normal(len(t)), 1500, 5000) * np.exp(-t / 0.008)
    return x


def click():
    t = t_axis(0.02)
    return highpass(rng.standard_normal(len(t)), 3000) * env_exp(t, 0.002)


def drum(key, render, layers, robins, release=0.02):
    zones = []
    for b in range(layers):
        vel = (b + 1) / layers
        rr = []
        for r in range(robins):
            x = render() * (0.6 + 0.4 * (b + 0.5) / layers)
            rr.append((f"syn-{key}-{b}{chr(97 + r)}", x))
        zones.append((0, vel, rr))
    register(key, release, zones)


# MARK: Beds

def crackle_bed(seconds=16.0):
    """The deep house sketch's vinyl crackle: sparse clicks over a faint hiss."""
    n = int(seconds * SR)
    x = np.zeros(n)
    idx = rng.integers(0, n, int(30 * seconds))
    x[idx] = rng.standard_normal(len(idx)) * 0.4
    x = highpass(x, 1500) + lowpass(rng.standard_normal(n), 3000) * 0.004
    return resample(x, 24000)


def rbj_highpass(x, hz, q=0.707, sr=SR):
    w = 2 * np.pi * hz / sr
    alpha, c = np.sin(w) / (2 * q), np.cos(w)
    b = np.array([(1 + c) / 2, -(1 + c), (1 + c) / 2])
    a = np.array([1 + alpha, -2 * c, 1 - alpha])
    return lfilter(b / a[0], a / a[0], x)


def noise_hat(decay, hp, late=0.0):
    """Dub hats as in misc/dub_reference.py: noise only (no square partials to alias), through two
    highpasses, a 0.5 ms attack. `late` seconds of silence first: the 16ths' shuffle (6% of a
    sixteenth at 117 bpm), finer than the tick grid."""
    n = int(decay * 8 * SR)
    t = np.arange(n) / SR
    x = rbj_highpass(rbj_highpass(rng_dub.standard_normal(n), hp), hp)
    x = x * np.minimum(1, t / 0.0005) * np.exp(-t / decay)
    return np.concatenate([np.zeros(int(late * SR)), x])


def bleep(n, layer):
    """Minimal: half square, half saw, through the filter at one of three openings, with the
    dotted-eighth ping-pong delay at 127 and the room."""
    t = t_axis(2.4)
    f = midi_hz(n)
    cut = [500, 1750, 3000][layer]
    x = np.sign(np.sin(2 * np.pi * f * t)) * 0.5 + saw(f, t) * 0.5
    x = lowpass(x, cut) * env_exp(t, 0.06)
    d = delay(x, 60 / 127 * 0.75, fb=0.45, taps=6, tone=2200)
    rv = reverb(x * 0.3, 1.2, 5000)
    l = x * 0.8 + d[0] * 0.5 + rv[0] * 0.35
    r = x * 0.8 + d[1] * 0.5 + rv[1] * 0.35
    return stereo_out(resample(l, 24000), resample(r, 24000))


def stab_min(n, layer):
    """The bleep's voice as a short dark chord stab, no delay: minimal's chords part."""
    t = t_axis(0.5)
    f = midi_hz(n)
    cut = [420, 900][layer]
    x = np.sign(np.sin(2 * np.pi * f * t)) * 0.4 + saw(f, t, 0.003) * 0.6
    x = lowpass(lowpass(x, cut), cut * 1.4) * env_exp(t, 0.07)
    return x


def sub_min(n):
    """Minimal's bass: a sine with a touch of the octave, short."""
    t = t_axis(0.6)
    f = midi_hz(n)
    x = np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t)
    return x * env_exp(t, 0.25, hold=0.08)


def rhodes(n, layer):
    """Deep house: sine plus a bell partial and a little detuned saw, the filter at 1800 (dark)
    or 2600 (bright), a 2.2 s plate and a dotted-eighth delay at 121."""
    t = t_axis(3.4)
    f = midi_hz(n)
    x = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * f * 2 * t) * np.exp(-t / 0.15)
    x += 0.15 * saw(f, t, 0.004)
    x = lowpass(x, [1800, 2600][layer])
    x *= adsr(len(t), 0.004, 0.12) * env_exp(t, 0.6)
    rv = reverb(x, 2.2, 3500)
    d = delay(x, 60 / 121 * 0.75, fb=0.35, taps=4, tone=1800)
    l = x + d[0] * 0.4 + rv[0] * 0.45
    r = x + d[1] * 0.4 + rv[1] * 0.45
    return stereo_out(resample(l, 24000), resample(r, 24000))


def bass_dh(n):
    """Deep house: a saw under a lowpass with a sine underneath."""
    t = t_axis(1.2)
    f = midi_hz(n)
    x = lowpass(saw(f, t), 750) * 0.6 + np.sin(2 * np.pi * f * t) * 0.7
    return x * adsr(len(t), 0.004, 0.04) * env_exp(t, 0.5, hold=0.5)


def sub_dub(n):
    """A plain sine, 20 ms in; the note's length and a short release end it (misc/dub_reference.py)."""
    t = t_axis(1.4)
    return np.sin(2 * np.pi * midi_hz(n) * t) * adsr(len(t), 0.02, 0.2)


def pitched(key, render, roots, release, layers=1, sr=SR):
    zones = []
    for n in roots:
        if layers > 1:
            for b in range(layers):
                zones.append((n, (b + 1) / layers, [(f"syn-{key}-{n}-{b}", render(n, b))]))
        else:
            zones.append((n, 1.0, [(f"syn-{key}-{n}", render(n))]))
    register(key, release, zones, sr=sr)


def main():
    for p in list(OUT.glob("syn-*.wav")) + list(OUT.glob("syn-*.caf")):
        p.unlink()
    # Minimal techno
    drum("kickMin", lambda: kick(f0=170, f1=48, pd=0.025, decay=0.22, click=0.5, drive=2.0), 2, 1, release=0.03)
    drum("hatMin", lambda: hat(0.018, 8000), 2, 3)
    drum("rimMin", lambda: rim(), 2, 2)
    drum("clickMin", click, 1, 3)
    # Deep house
    drum("kickDH", lambda: kick(f0=120, f1=50, pd=0.05, decay=0.3, click=0.15, drive=1.3), 2, 1, release=0.03)
    drum("clapDH", lambda: clap(0.15), 2, 2, release=0.03)
    drum("hatDH", lambda: hat(0.025, 7000), 3, 3)
    drum("hatOpenDH", lambda: hat(0.12, 6000), 2, 2, release=0.03)
    # Dub techno
    drum("kickDub", lambda: kick(f0=110, f1=44, pd=0.045, decay=0.32, click=0.05, drive=1.2), 2, 1, release=0.03)
    drum("hatDub", lambda: noise_hat(0.025, 8000), 1, 4)
    drum("hatDub16", lambda: noise_hat(0.012, 9000, late=0.06 * 60 / 117 / 4), 1, 4)
    register("crackle", 0.5, [(0, 1.0, [("syn-crackle", crackle_bed())])], sr=24000)
    # Pitched
    pitched("bleep", bleep, range(57, 82, 3), 0.6, layers=3, sr=24000)
    pitched("stabMin", stab_min, range(43, 68, 3), 0.08, layers=2)
    pitched("subMin", sub_min, range(28, 41, 2), 0.03)
    pitched("rhodes", rhodes, range(48, 82, 3), 0.9, layers=2, sr=24000)
    pitched("bassDH", bass_dh, range(24, 49, 2), 0.05)
    pitched("subDub", sub_dub, range(24, 41, 2), 0.06)

    manifest = json.loads((OUT / "instruments.json").read_text())
    for k in NAMES + RETIRED:
        manifest.pop(k, None)
    manifest.update(INSTRUMENTS)
    (OUT / "instruments.json").write_text(json.dumps(manifest, indent=1) + "\n")
    for p in FILES:
        subprocess.run(["afconvert", "-f", "caff", "-d", "alac", str(p), str(p.with_suffix(".caf"))], check=True)
        p.unlink()
    total = sum(p.stat().st_size for p in OUT.glob("syn-*.caf"))
    print(f"{len(list(OUT.glob('syn-*.caf')))} synth files, {total / 1e6:.1f} MB")


main()
