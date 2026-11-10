#!/usr/bin/env python3
"""A/B Gegenlicht in the app against its reference render (apps/takt/DUB-TECHNO.md §10; this is
gl-ab.py pointed at the third record, the first on the acid rack, `AcidRack`).

    V=<venv with numpy, scipy, numba, soundfile>/bin/python
    $V apps/takt/scripts/gegenlicht.py --keep <work>             # the reference's stems and master
    $V scripts/takt/gl-ab.py render <work> [stem …]            # app renders through a simulator (TAKT_SIM=<udid>, default booted)
    $V scripts/takt/gl-ab.py stems <work> [stem …]             # each app stem against the reference's
    $V scripts/takt/gl-ab.py master <work>                     # the app's master against <work>/master.wav

`render` writes <work>/app<rate>/<stem>.wav (before the master: `-RackSolo <stem>`) for every
stem, or the ones named, and master.wav. The app must be built and installed on that simulator.
`stems` prints, per stem, the level over the whole song and over bars 72–79 (app, reference,
difference), the lag of the best match and the residual of app − reference (a null: −40 dB is
the same signal to 1 %). `master` prints octave bands in the brief's six passages (the intro, the
acid's entry, the break, the fullest section, the line alone, the way out), the mean and the
peak. GL_SR=44100 is the
reference's own rate (nothing resampled on either side); at 48000 the reference is resampled
and noise-like stems match in level and spectrum, not sample for sample.
"""
import subprocess
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy import signal

STEMS = ["kick", "rumble", "acid", "acid_delay", "ping", "pad", "hats", "ride", "shaker", "clap", "rim", "toms", "crash", "noise",
         "riser", "hall", "room"]
import os

# GL_SR=44100: the reference's own rate: the app then plays the reference's own samples and
# nothing is resampled on either side.
SR = int(os.environ.get("GL_SR", "48000"))
SIM = os.environ.get("TAKT_SIM", "booted")
TEMPO = 128
BAR = 4 * 60 / TEMPO
FADE_BAR = 127  # the stems carry the master's fade from here
SECONDS = 248
APP_LEVEL = 10 ** (-8 / 20)  # the rack's master.level


def db(x):
    return 20 * np.log10(max(float(x), 1e-12))


def rms(x):
    return float(np.sqrt(np.mean(np.square(x)))) if x.size else 0.0


def ref48(path):
    x, sr = sf.read(path, dtype="float64")
    if sr != SR:
        assert (sr, SR) == (44100, 48000)
        x = signal.resample_poly(x, 160, 147, axis=0, window=("kaiser", 12.0))
    return x


def render(work, names):
    out = work / f"app{SR // 1000}"
    out.mkdir(parents=True, exist_ok=True)
    for name in names:
        wav = work / f"render-{name}.wav"
        wav.unlink(missing_ok=True)
        solo = [] if name == "master" else ["-RackSolo", name]
        r = subprocess.run(["xcrun", "simctl", "launch", "--console-pty", SIM, "com.bartdecrem.Takt", "-Silent", "1",
                            "-SampleRate", str(SR), "-Tempo", str(TEMPO), "-RenderTo", str(wav), "-RenderSeconds", str(SECONDS), *solo,
                            "-RenderScript", "0:band=song-gegenlicht,0:play"], capture_output=True, text=True, timeout=900)
        if not wav.exists():
            sys.exit(f"{name}: no render\n{r.stdout[-400:]}{r.stderr[-400:]}")
        x, _ = sf.read(wav, dtype="float32")
        sf.write(out / f"{name}.wav", x, SR, subtype="FLOAT")
        wav.unlink()
        print(f"rendered {name}: rms {db(rms(x)):.1f} dB, peak {db(np.abs(x).max()):.1f} dB", flush=True)


def lag_of(a, b, span=64):
    """How many samples `a` is behind `b`, by the cross-correlation of their mono sums."""
    # A minute from where the reference first sounds.
    first = int(np.argmax(np.abs(b).max(axis=1) > 1e-4))
    a, b = a[max(0, first - span):], b[max(0, first - span):]
    n = min(len(a), len(b), SR * 60)
    x, y = a[:n].mean(axis=1), b[:n].mean(axis=1)
    best, at = -1e30, 0
    for k in range(-span, span + 1):
        c = float(np.dot(x[span + k:n - span + k], y[span:n - span]))
        if c > best:
            best, at = c, k
    return at


def stems(work, names):
    print(f"{'stem':10s} {'app':>7s} {'ref':>7s} {'diff':>6s} | bars 72–79 {'app':>7s} {'ref':>7s} {'diff':>6s} | {'peak app':>8s} {'ref':>6s} | lag  null")
    for name in names:
        app, _ = sf.read(work / f"app{SR // 1000}" / f"{name}.wav", dtype="float64")
        ref = ref48(work / "stems" / f"{name}.wav")
        n = min(len(app), len(ref), int(FADE_BAR * BAR * SR))
        a, r = app[:n], ref[:n]
        s, e = int(72 * BAR * SR), int(80 * BAR * SR)
        lag = lag_of(a, r)
        k = max(0, lag)
        j = max(0, -lag)
        m = n - abs(lag)
        null = db(rms(a[k:k + m] - r[j:j + m]) / max(rms(r), 1e-12))
        print(f"{name:10s} {db(rms(a)):7.1f} {db(rms(r)):7.1f} {db(rms(a)) - db(rms(r)):+6.2f} |            "
              f"{db(rms(a[s:e])):7.1f} {db(rms(r[s:e])):7.1f} {db(rms(a[s:e])) - db(rms(r[s:e])):+6.2f} | "
              f"{db(np.abs(a).max()):8.1f} {db(np.abs(r).max()):6.1f} | {lag:+3d} {null:6.1f}")


def bands(x):
    out = []
    f, p = signal.welch(x.mean(axis=1), SR, nperseg=16384)
    for lo in (30, 60, 120, 240, 480, 960, 1920, 3840, 7680, 15360):
        sel = (f >= lo) & (f < min(lo * 2, 21000))
        out.append(10 * np.log10(max(float(p[sel].sum()), 1e-20)))
    return np.array(out)


def master(work):
    app, _ = sf.read(work / f"app{SR // 1000}" / "master.wav", dtype="float64")
    ref = ref48(work / "master.wav") * APP_LEVEL
    n = min(len(app), len(ref))
    app, ref = app[:n], ref[:n]
    print(f"mean {db(rms(app)):.2f} / {db(rms(ref)):.2f} dBFS (app / reference − 8 dB), peak {db(np.abs(app).max()):.2f} / {db(np.abs(ref).max()):.2f}, "
          f"lag {lag_of(app, ref):+d}, null {db(rms(app - ref) / rms(ref)):.1f} dB")
    print("octave bands from 30 Hz, app − reference (dB):")
    worst = 0.0
    for a, b in ((0, 8), (24, 32), (48, 56), (72, 80), (88, 92), (120, 128), (0, 127)):
        s, e = int(a * BAR * SR), int(b * BAR * SR)
        d = bands(app[s:e]) - bands(ref[s:e])
        worst = max(worst, float(np.abs(d[:9]).max()))
        print(f"  bars {a:3d}–{b - 1:3d}: " + " ".join(f"{v:+5.2f}" for v in d) + f"   rms {db(rms(app[s:e])) - db(rms(ref[s:e])):+.2f}")
    mid, side = app[:, 0] + app[:, 1], app[:, 0] - app[:, 1]
    print(f"worst band below 15 kHz: {worst:.2f} dB (the bar is ±0.8); side/mid {rms(side) / rms(mid):.3f} "
          f"(reference {rms(ref[:, 0] - ref[:, 1]) / rms(ref[:, 0] + ref[:, 1]):.3f})")


def main():
    cmd, work = sys.argv[1], Path(sys.argv[2])
    names = sys.argv[3:]
    if cmd == "render":
        render(work, names or STEMS + ["master"])
    elif cmd == "stems":
        stems(work, names or STEMS)
    elif cmd == "master":
        master(work)
    else:
        sys.exit(__doc__)


main()
