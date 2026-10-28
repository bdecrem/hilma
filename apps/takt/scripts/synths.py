#!/usr/bin/env python3
"""The synth voices for the Stage songs (deep house, techno), rendered as one-shots the
sampler plays like any recording: Takt/Sounds/syn-*.caf, registered in instruments.json.

    <venv with numpy, scipy, soundfile>/bin/python apps/takt/scripts/synths.py

Drums (one root, velocity layers, round robins): kick909 (round, 909-style), kickRumble (a
techno kick with a sub tail and a rumble under it), clap909, hat909 / hatOpen909 (six
detuned squares, the 808 way), ride909, shaker, rim909 (also the click), tomSyn.
Pitched (a root every two or three semitones, the sampler pitches in between): sub (a sine
bass), acid (a 303-style saw through a resonant sweep), stab (an FM electric piano, two
velocity layers), pad (detuned saws, slow attack, 8 s at 24 kHz), lead (a square lead with
vibrato), rave (a short detuned-saw stab).

Each instrument is normalized to -3 dBFS peak like scripts/sounds.py; the songs balance them
with gainDb. Entries for these names replace what instruments.json had; the recorded
instruments stay untouched.
"""
import json
import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import butter, fftconvolve, lfilter

OUT = Path(__file__).resolve().parent.parent / "Takt/Sounds"
SR = 48000
rng = np.random.default_rng(909)

NAMES = ["kick909", "kickRumble", "clap909", "hat909", "hatOpen909", "ride909", "shaker", "rim909", "tomSyn",
         "sub", "acid", "stab", "pad", "lead", "leadHouse", "rave"]
INSTRUMENTS = {}
FILES = []


def t_axis(seconds, sr=SR):
    return np.arange(int(seconds * sr)) / sr


def env_exp(t, tau, hold=0.0):
    e = np.exp(-np.maximum(t - hold, 0) / tau)
    return e


def attack(t, seconds):
    return np.minimum(t / max(seconds, 1e-6), 1.0)


def lowpass(x, hz, sr=SR, order=2):
    b, a = butter(order, min(hz, sr * 0.49) / (sr / 2), btype="low")
    return lfilter(b, a, x)


def highpass(x, hz, sr=SR, order=2):
    b, a = butter(order, min(hz, sr * 0.49) / (sr / 2), btype="high")
    return lfilter(b, a, x)


def bandpass(x, lo, hi, sr=SR, order=2):
    b, a = butter(order, [lo / (sr / 2), min(hi, sr * 0.49) / (sr / 2)], btype="band")
    return lfilter(b, a, x)


def saw(freq, t, harmonics=None):
    """Band-limited sawtooth by additive synthesis (harmonics up to 18 kHz)."""
    n = int(min(harmonics or 400, 18000 / max(freq, 1)))
    k = np.arange(1, n + 1)[:, None]
    phase = 2 * np.pi * freq * t[None, :]
    return (2 / np.pi) * np.sum(np.sin(k * phase) * ((-1) ** (k + 1)) / k, axis=0)


def square(freq, t):
    n = int(min(300, 18000 / max(freq, 1)))
    k = np.arange(1, n + 1, 2)[:, None]
    return (4 / np.pi) * np.sum(np.sin(2 * np.pi * freq * k * t[None, :]) / k, axis=0)


def sweep_sine(t, f_end, f_start, tau):
    """A sine whose pitch falls from f_start to f_end with time constant tau (a kick)."""
    f = f_end + (f_start - f_end) * np.exp(-t / tau)
    phase = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(phase)


def saturate(x, drive):
    return np.tanh(x * drive) / np.tanh(drive)


def resonant_sweep(x, cutoff_hz, q, sr=SR):
    """A time-varying resonant two-pole lowpass (Chamberlin SVF), cutoff per sample."""
    y = np.zeros_like(x)
    low = band = 0.0
    f = 2 * np.sin(np.pi * np.minimum(cutoff_hz, sr * 0.22) / sr)
    damp = 1.0 / q
    for i in range(len(x)):
        high = x[i] - low - damp * band
        band += f[i] * high
        low += f[i] * band
        y[i] = low
    return y


def midi_hz(n):
    return 440 * 2 ** ((n - 69) / 12)


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


# MARK: Drums


def kick909(velocity):
    t = t_axis(0.6)
    body = sweep_sine(t, 50, 50 + 130 * (0.7 + 0.3 * velocity), 0.030) * env_exp(t, 0.19 + 0.08 * velocity)
    click = rng.normal(size=len(t)) * env_exp(t, 0.0025) * (0.10 + 0.16 * velocity)
    click = lowpass(highpass(click, 1500), 9000)
    x = saturate(body * (0.6 + 0.4 * velocity) + click, 1.5 + velocity)
    return x * env_exp(t, 0.5, hold=0.3)


def kick_rumble(velocity):
    t = t_axis(0.9)
    punch = sweep_sine(t, 46, 46 + 150 * (0.7 + 0.3 * velocity), 0.024) * env_exp(t, 0.13)
    subtail = np.sin(2 * np.pi * 46 * t) * env_exp(t, 0.28, hold=0.02) * 0.9
    rumble = lowpass(rng.normal(size=len(t)), 110, order=4) * env_exp(t, 0.33, hold=0.05) * attack(t, 0.03) * 2.2
    click = lowpass(highpass(rng.normal(size=len(t)) * env_exp(t, 0.002), 2500), 9000) * 0.16
    x = saturate(punch * 1.1 + subtail + rumble + click, 2.2)
    return x * env_exp(t, 0.6, hold=0.5)


def clap909(velocity):
    t = t_axis(0.45)
    x = np.zeros_like(t)
    for i, at in enumerate([0.0, 0.009, 0.019, 0.030]):
        s = int(at * SR)
        n = rng.normal(size=len(t) - s)
        x[s:] += n * env_exp(t[: len(n)], 0.006) * (0.8 if i < 3 else 1.0)
    tail = rng.normal(size=len(t)) * env_exp(t, 0.09, hold=0.03) * 0.55
    x = bandpass(x + tail, 800, 4200) + bandpass(tail, 1500, 7000) * 0.3
    return x * (0.6 + 0.4 * velocity)


def metallic(t, decay, hp, bp_hi):
    ratios = [205.3, 304.4, 369.6, 522.7, 540.0, 800.0]
    x = sum(square(f * 1.0, t) for f in ratios)
    x = highpass(x, hp, order=4)
    x = bandpass(x, hp * 0.9, bp_hi, order=1) * 0.6 + x * 0.6
    return x * env_exp(t, decay)


def hat909(velocity, rr):
    t = t_axis(0.25)
    x = metallic(t, 0.030 + 0.012 * velocity, 6500 + 300 * rr, 12000)
    x += highpass(rng.normal(size=len(t)), 8000) * env_exp(t, 0.015) * 0.6
    return x


def hat_open(velocity, rr):
    t = t_axis(0.9)
    x = metallic(t, 0.22 + 0.06 * velocity, 6000 + 200 * rr, 12000)
    x += highpass(rng.normal(size=len(t)), 7000) * env_exp(t, 0.15) * 0.5
    return x


def ride909(velocity):
    t = t_axis(1.8)
    x = metallic(t, 0.55, 3500, 9000) * 0.6
    x += bandpass(rng.normal(size=len(t)), 3000, 11000) * env_exp(t, 0.6) * 0.5
    x += np.sin(2 * np.pi * 5280 * t) * env_exp(t, 0.25) * 0.25
    return x * (0.6 + 0.4 * velocity)


def shaker(velocity, rr):
    t = t_axis(0.2)
    x = bandpass(rng.normal(size=len(t)), 3500 + 400 * rr, 9500) * attack(t, 0.010) * env_exp(t, 0.045, hold=0.01)
    return x


def rim909(velocity):
    t = t_axis(0.12)
    x = np.sin(2 * np.pi * 1700 * t) * env_exp(t, 0.012)
    x += np.sin(2 * np.pi * 440 * t) * env_exp(t, 0.02) * 0.6
    x += highpass(rng.normal(size=len(t)), 3000) * env_exp(t, 0.003) * 0.7
    return saturate(x, 2.0)


def tom_syn(velocity):
    t = t_axis(0.5)
    x = sweep_sine(t, 95, 180, 0.08) * env_exp(t, 0.22)
    x += highpass(rng.normal(size=len(t)), 2000) * env_exp(t, 0.004) * 0.2
    return saturate(x, 1.4)


def drum(key, render, layers, robins, release=0.02):
    zones = []
    for b in range(layers):
        vel = (b + 1) / layers
        v = (b + 0.5) / layers
        rr = []
        for r in range(robins):
            x = render(v, r) if render.__code__.co_argcount == 2 else render(v)
            rr.append((f"syn-{key}-{b}{chr(97 + r)}", x))
        zones.append((0, vel, rr))
    register(key, release, zones)


# MARK: Pitched


def sub_bass(n):
    t = t_axis(2.6)
    f = midi_hz(n)
    x = np.sin(2 * np.pi * f * t) + 0.12 * np.sin(2 * np.pi * 2 * f * t) + 0.04 * np.sin(2 * np.pi * 3 * f * t)
    x = saturate(x, 1.3)
    return x * attack(t, 0.004) * env_exp(t, 0.5, hold=1.5)


def acid(n):
    t = t_axis(1.1)
    f = midi_hz(n)
    x = saw(f, t)
    cutoff = 240 + 2600 * np.exp(-t / 0.11) + 140 * np.exp(-t / 0.6)
    y = resonant_sweep(x, cutoff, 5.5)
    y = saturate(y * 1.4, 1.8)
    return y * attack(t, 0.002) * env_exp(t, 0.22, hold=0.03)


def stab(n, soft):
    """An FM electric piano: a tine's bright attack that settles into a warm sine."""
    t = t_axis(2.4)
    f = midi_hz(n)
    index = (0.9 if soft else 2.2) * env_exp(t, 0.35) + 0.25
    mod = np.sin(2 * np.pi * f * t) * index
    carrier = np.sin(2 * np.pi * f * t + mod)
    tine = np.sin(2 * np.pi * f * 14 * t) * env_exp(t, 0.03) * (0.05 if soft else 0.12)
    body = np.sin(2 * np.pi * f * 2 * t + mod * 0.5) * 0.18
    x = carrier + tine + body
    x = lowpass(x, 5500 if soft else 7000)
    return x * attack(t, 0.0015) * env_exp(t, 0.75, hold=0.02)


def pad(n, sr=24000):
    t = t_axis(8.0, sr)
    f = midi_hz(n)
    x = np.zeros_like(t)
    for d in (-0.007, -0.003, 0.003, 0.007):
        x += saw(f * (1 + d), t, harmonics=int(min(200, 11000 / f)))
    x += np.sin(2 * np.pi * f / 2 * t) * 0.45
    x = lowpass(x, 900, sr=sr, order=4) * 0.6 + lowpass(x, 2600, sr=sr, order=2) * np.minimum(t / 2.5, 1) * 0.35
    x *= attack(t, 0.28) * env_exp(t, 9.0, hold=6.0)
    return x


# MARK: Leads: unison saws, a sub, a filter envelope, drive, width, a synced delay and some room.


def saw_from_phase(phase, f):
    n = int(min(60, 16000 / max(f, 1)))
    k = np.arange(1, n + 1)[:, None]
    return (2 / np.pi) * np.sum(np.sin(k * phase[None, :]) * ((-1) ** (k + 1)) / k, axis=0)


def square_from_phase(phase, f):
    n = int(min(41, 16000 / max(f, 1)))
    k = np.arange(1, n + 1, 2)[:, None]
    return (4 / np.pi) * np.sum(np.sin(k * phase[None, :]) / k, axis=0)


def unison(f, t, detunes, phases, vib):
    """Detuned saws sharing one vibrato, each from its own start phase."""
    x = np.zeros_like(t)
    fi = f * 2 ** (vib / 12)
    for d, p0 in zip(detunes, phases):
        phase = 2 * np.pi * np.cumsum(fi * (1 + d)) / SR + p0
        x += saw_from_phase(phase, f)
    return x / len(detunes)


def delay_fx(x, seconds, feedback, mix, lp_hz, taps=6):
    """A feedback delay, each echo darker than the last."""
    d = int(seconds * SR)
    echo = np.zeros_like(x)
    tap = x.copy()
    for k in range(1, taps + 1):
        tap = lowpass(tap, lp_hz) * feedback
        if k * d >= len(x):
            break
        shifted = np.zeros_like(x)
        shifted[k * d:] = tap[: len(x) - k * d]
        echo += shifted
    return x + echo * mix


def room(x, seconds, mix, seed=7):
    """A short plate: exponentially decaying noise, darkened, convolved in."""
    r = np.random.default_rng(seed)
    tt = t_axis(seconds)
    ir = lowpass(r.normal(size=len(tt)), 4500) * np.exp(-tt / (seconds / 3.2))
    ir /= np.sqrt((ir ** 2).sum())
    return x + fftconvolve(x, ir)[: len(x)] * mix


def lead_house(n):
    """Undertow's lead: four saws spread wide, a sub square, a slow-opening filter, a dotted
    eighth of delay at 122 and a little room. Warm, not thin."""
    t = t_axis(3.2)
    f = midi_hz(n)
    vib = 0.12 * np.sin(2 * np.pi * 5.2 * t) * np.minimum(t / 0.35, 1)
    sides = []
    for detunes, phases in (([-0.0065, -0.002, 0.003, 0.0055], [0.0, 1.1, 2.3, 4.0]),
                            ([-0.0055, -0.003, 0.002, 0.0065], [2.9, 0.4, 5.1, 1.7])):
        x = unison(f, t, detunes, phases, vib)
        x += square_from_phase(2 * np.pi * np.cumsum(f / 2 * 2 ** (vib / 12)) / SR, f / 2) * 0.32
        cutoff = 520 + 2400 * np.exp(-t / 0.32) + 260 * (1 + np.sin(2 * np.pi * 0.45 * t - 1.3))
        y = resonant_sweep(x, cutoff, 2.4)
        y = saturate(y * 1.3, 1.5)
        y *= attack(t, 0.008) * env_exp(t, 0.55, hold=1.6)
        y = delay_fx(y, 60 / 122 * 0.75, 0.42, 0.38, 2800)
        y = room(y, 0.8, 0.11)
        sides.append(y)
    return np.stack(sides, axis=1)


def lead(n):
    """Nachtschicht's riff: two saws and a square with a snapping filter, driven, a dotted
    eighth of delay at 130. It cuts."""
    t = t_axis(2.4)
    f = midi_hz(n)
    vib = 0.08 * np.sin(2 * np.pi * 6.0 * t) * np.minimum(t / 0.4, 1)
    sides = []
    for detunes, phases in (([-0.005, 0.0, 0.004], [0.0, 2.0, 4.1]), ([-0.004, 0.0, 0.005], [3.1, 0.7, 5.5])):
        x = unison(f, t, detunes, phases, vib)
        x += square_from_phase(2 * np.pi * np.cumsum(f * 2 ** (vib / 12)) / SR + 1.0, f) * 0.45
        x += square_from_phase(2 * np.pi * np.cumsum(f / 2 * 2 ** (vib / 12)) / SR, f / 2) * 0.25
        cutoff = 420 + 3600 * np.exp(-t / 0.15) + 200 * np.exp(-t / 0.9)
        y = resonant_sweep(x, cutoff, 3.4)
        y = saturate(y * 1.8, 2.2)
        y *= attack(t, 0.004) * env_exp(t, 0.35, hold=1.2)
        y = delay_fx(y, 60 / 130 * 0.75, 0.36, 0.28, 3500)
        y = room(y, 0.5, 0.06)
        sides.append(y)
    return np.stack(sides, axis=1)


def rave(n):
    t = t_axis(0.8)
    f = midi_hz(n)
    x = sum(saw(f * (1 + d), t, harmonics=120) for d in (-0.012, -0.004, 0.005, 0.013))
    x += saw(f / 2, t, harmonics=60) * 0.3
    cutoff = 900 + 3800 * np.exp(-t / 0.14)
    y = resonant_sweep(x * 0.3, cutoff, 2.0)
    return saturate(y, 1.6) * attack(t, 0.003) * env_exp(t, 0.19, hold=0.04)


def pitched(key, render, roots, release, layers=None, sr=SR):
    zones = []
    for n in roots:
        if layers:
            for b, soft in enumerate(layers):
                vel = (b + 1) / len(layers)
                zones.append((n, vel, [(f"syn-{key}-{n}-{b}", render(n, soft))]))
        else:
            zones.append((n, 1.0, [(f"syn-{key}-{n}", render(n))]))
    register(key, release, zones, sr=sr)


def main():
    for p in list(OUT.glob("syn-*.wav")) + list(OUT.glob("syn-*.caf")):
        p.unlink()
    drum("kick909", kick909, 3, 1, release=0.03)
    drum("kickRumble", kick_rumble, 2, 1, release=0.03)
    drum("clap909", clap909, 3, 2, release=0.03)
    drum("hat909", hat909, 3, 3)
    drum("hatOpen909", hat_open, 2, 2, release=0.03)
    drum("ride909", ride909, 2, 1, release=0.05)
    drum("shaker", shaker, 2, 3)
    drum("rim909", rim909, 2, 1)
    drum("tomSyn", tom_syn, 2, 1, release=0.03)
    pitched("sub", sub_bass, range(28, 53, 2), 0.05)
    pitched("acid", acid, range(28, 53, 2), 0.04)
    pitched("stab", stab, range(40, 89, 2), 0.25, layers=[True, False])
    pitched("pad", pad, range(45, 82, 3), 0.6, sr=24000)
    pitched("lead", lead, range(55, 92, 2), 0.5)
    pitched("leadHouse", lead_house, range(55, 92, 2), 0.9)
    pitched("rave", rave, range(48, 85, 2), 0.08)

    manifest = json.loads((OUT / "instruments.json").read_text())
    for k in NAMES:
        manifest.pop(k, None)
    manifest.update(INSTRUMENTS)
    (OUT / "instruments.json").write_text(json.dumps(manifest, indent=1) + "\n")
    for p in FILES:
        subprocess.run(["afconvert", "-f", "caff", "-d", "alac", str(p), str(p.with_suffix(".caf"))], check=True)
        p.unlink()
    total = sum(p.stat().st_size for p in OUT.glob("syn-*.caf"))
    print(f"{len(list(OUT.glob('syn-*.caf')))} synth files, {total / 1e6:.1f} MB")


main()
