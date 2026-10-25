#!/usr/bin/env python3
"""Cut Takt's sampled instruments from the source sets that sounds-fetch.sh downloads.

    apps/takt/scripts/sounds-fetch.sh <src>
    python3 apps/takt/scripts/sounds.py <src>     # needs numpy + soundfile (a scratch venv)

Writes Takt/Sounds/*.caf (Apple Lossless, 16-bit) and Takt/Sounds/instruments.json, the
manifest the app loads: per instrument a release time and its zones, each zone a root note,
a velocity ceiling and its round-robin files.

Every file is trimmed to its onset (the first sample within 40 dB of the peak, minus 1 ms), so
a note fires on its frame; the tail is cut where it falls 60 dB under the peak (or at the
instrument's cap) with a short fade. Piano and sax roots come from the file names, checked
against a measured f0; the bass's are measured. Velocity layers are picked by measured
loudness, and the levels between layers are kept (an instrument is normalized as a whole, not per file).
"""
import json
import re
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

SRC = Path(sys.argv[1])
OUT = Path(__file__).resolve().parent.parent / "Takt/Sounds"
PC = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}
NAMES = ["C", "Cs", "D", "Ds", "E", "F", "Fs", "G", "Gs", "A", "As", "B"]


def load(path, mono=False):
    x, sr = sf.read(path, always_2d=True, dtype="float64")
    if mono:
        x = x.mean(axis=1, keepdims=True)
    return x, sr


def trim(x, sr, cap):
    """Onset trim + tail cut + fade. cap: maximum seconds."""
    env = np.abs(x).max(axis=1)
    peak = env.max()
    start = max(0, int(np.argmax(env > peak * 0.01)) - int(0.001 * sr))
    x = x[start:]
    # RMS in 20 ms windows; cut where it stays below -60 dB of the peak.
    w = int(0.02 * sr)
    n = len(x) // w
    rms = np.sqrt((x[: n * w] ** 2).mean(axis=1).reshape(n, w).mean(axis=1))
    above = np.nonzero(rms > peak * 0.001)[0]
    end = min(len(x), (above[-1] + 1) * w if len(above) else len(x), int(cap * sr))
    x = x[:end].copy()
    fade = min(int(0.04 * sr), len(x) // 4)
    x[-fade:] *= np.linspace(1, 0, fade)[:, None] ** 2
    return x


def loudness(x):
    """Peak RMS over 30 ms windows of the first 300 ms: how hard the note was played."""
    m = x.mean(axis=1)[: int(0.3 * 48000)]
    w = 1440
    n = max(1, len(m) // w)
    return float(np.sqrt((m[: n * w] ** 2).reshape(n, w).mean(axis=1)).max())


def f0(x, sr, lo=30, hi=1200):
    """Fundamental by autocorrelation (YIN's difference function) on a steady slice."""
    m = x.mean(axis=1)
    a = int(0.08 * sr)
    seg = m[a : a + int(0.25 * sr)]
    if len(seg) < sr // 10:
        seg = m[: int(0.25 * sr)]
    seg = seg - seg.mean()
    tmin, tmax = int(sr / hi), int(sr / lo)
    n = len(seg) - tmax
    d = np.array([np.sum((seg[:n] - seg[t : t + n]) ** 2) for t in range(1, tmax)])
    cmnd = d * np.arange(1, tmax) / np.maximum(np.cumsum(d), 1e-12)
    cand = np.nonzero(cmnd[tmin:] < 0.15)[0]
    t = (cand[0] + tmin) if len(cand) else int(np.argmin(cmnd[tmin:]) + tmin)
    while t + 1 < len(cmnd) and cmnd[t + 1] < cmnd[t]:
        t += 1
    # Parabolic refinement.
    if 0 < t < len(cmnd) - 1:
        y0, y1, y2 = cmnd[t - 1], cmnd[t], cmnd[t + 1]
        t = t + 0.5 * (y0 - y2) / max(y0 - 2 * y1 + y2, 1e-12)
    return sr / (t + 1)


def midi_of(hz):
    return 69 + 12 * np.log2(hz / 440)


INSTRUMENTS = {}


def instrument(key, release, files, norm=-3.0):
    """files: list of (zone root, velocity ceiling, [(name, x, sr)]). One gain for all."""
    peak = max(np.abs(x).max() for _, _, rr in files for _, x, _ in rr)
    g = 10 ** (norm / 20) / peak
    zones = []
    for root, vel, rr in files:
        names = []
        for name, x, sr in rr:
            p = OUT / f"{name}.wav"
            sf.write(p, (x * g).astype(np.float32), sr, subtype="PCM_16")
            names.append(name)
        zones.append({"root": int(root), "vel": round(float(vel), 3), "files": names})
    INSTRUMENTS[key] = {"release": release, "zones": zones}


def layers(items, n):
    """Pick n of the items (dicts with 'loud') spread evenly across their loudness."""
    items = sorted(items, key=lambda i: i["loud"])
    if len(items) <= n:
        return items
    idx = np.round(np.linspace(len(items) * 0.15, len(items) - 1, n)).astype(int)
    return [items[i] for i in idx]


def piano():
    zones = []
    for p in sorted((SRC / "piano").glob("Player_vl*_rr1_*.wav")):
        m = re.search(r"_vl(\d)_rr1_([A-G]#?)(-?\d)\.wav$", p.name)
        vl, named = int(m.group(1)), (int(m.group(3)) + 2) * 12 + PC[m.group(2)]
        if not 31 <= named <= 96:
            continue
        x, sr = load(p)
        root = round(midi_of(f0(x, sr, 25, 2500)))
        # The names are the keys (the set's PitchValueConversionChart); f0 only checks them.
        if (root - named) % 12:
            print(f"  piano {p.name}: named {named}, measured {root}")
        root = named
        cap = 7.0 if root < 52 else 5.0 if root < 72 else 3.5
        x = trim(x, sr, cap)
        zones.append((root, 0.55 if vl == 1 else 1.0, [(f"pno-{root}-{vl}", x, sr)]))
    zones.sort(key=lambda z: (z[0], z[1]))
    instrument("piano", 0.18, zones)
    print(f"piano: {len(zones)} zones, roots {zones[0][0]}..{zones[-1][0]}")


def bass():
    d = SRC / "bass/FingerBassYR SFZ+WAV-20190930/samples/finger"
    zones = []
    for p in sorted(d.glob("*.wav")):
        x, sr = load(p, mono=True)
        root = round(midi_of(f0(x, sr, 30, 400)))
        x = trim(x, sr, 2.5)
        zones.append((root, 1.0, [(f"bass-{root}", x, sr)]))
    zones.sort(key=lambda z: (z[0], z[1]))
    instrument("bass", 0.06, zones)
    print(f"bass: roots {[z[0] for z in zones]}")


def sax_root(p, x, sr):
    """The name's key ((octave + 2) * 12, like the piano's); f0 only checks it."""
    m = re.search(r"_([A-G]#?)(\d)_", p.name)
    named = (int(m.group(2)) + 2) * 12 + PC[m.group(1)]
    measured = midi_of(f0(x, sr, 80, 1600))
    if abs(measured - named) > 0.5 and abs(abs(measured - named) - 12) > 0.5:
        print(f"  sax {p.name}: named {named}, measured {measured:.1f}")
    return named


def sax():
    zones = []
    groups = {}
    for p in sorted((SRC / "sax").glob("BrettTenor_Staccato_*.wav")):
        x, sr = load(p, mono=True)
        root = sax_root(p, x, sr)
        groups.setdefault(root, []).append({"x": trim(x, sr, 1.2), "sr": sr, "loud": loudness(x), "src": p.name})
    for root, items in sorted(groups.items()):
        # Two round robins per root, soft and hard if there are four.
        items = sorted(items, key=lambda i: i["loud"])
        if len(items) >= 2:
            zones.append((root, 0.6, [(f"sax-{root}-s", items[0]["x"], items[0]["sr"])]))
        zones.append((root, 1.0, [(f"sax-{root}-h", items[-1]["x"], items[-1]["sr"])]))
    instrument("sax", 0.08, zones)
    print(f"sax staccato: roots {sorted(groups)}")
    # The held notes (non-vibrato, loud layer), for long tones.
    held = []
    for p in sorted((SRC / "sax").glob("BrettTenor_NV_*_vl3_*.wav")):
        x, sr = load(p, mono=True)
        root = sax_root(p, x, sr)
        held.append((root, 1.0, [(f"saxl-{root}", trim(x, sr, 2.5), sr)]))
    held.sort(key=lambda z: (z[0], z[1]))
    instrument("saxLong", 0.15, held)
    print(f"sax held: roots {[z[0] for z in held]}")


def kit_piece(key, folder, n, rr, cap, mono=True, release=0.02, files=None):
    paths = files or sorted(folder.glob("*.wav"))
    items = []
    for p in paths:
        x, sr = load(p, mono=mono)
        items.append({"x": trim(x, sr, cap), "sr": sr, "loud": loudness(x)})
    items.sort(key=lambda i: i["loud"])
    # n layers of rr round robins: split the loudness order into n bands, take rr from each.
    bands = np.array_split(np.arange(len(items))[int(len(items) * 0.1):], n)
    zones = []
    for b, band in enumerate(bands):
        pick = band[np.round(np.linspace(0, len(band) - 1, min(rr, len(band)))).astype(int)]
        vel = (b + 1) / n
        zones.append((0, vel, [(f"{key}-{b}{chr(97 + r)}", items[i]["x"], items[i]["sr"]) for r, i in enumerate(pick)]))
    instrument(key, release, zones, norm=-3.0)
    print(f"{key}: {n} layers x {rr}")


def drums():
    k = SRC / "drums/MuldjordKit SFZ+WAV-20201018/samples"
    kit_piece("kick", k / "KdrumR", 5, 2, 0.9)
    kit_piece("snare", k / "Snare1", 6, 3, 1.0)
    kit_piece("xstick", k / "SnareRest1", 3, 2, 0.6)
    kit_piece("hat", k / "HihatClosed", 5, 3, 0.45, mono=False)
    kit_piece("hatOpen", k / "HihatOpen", 3, 2, 1.1, mono=False)
    kit_piece("ride", k / "RideR", 5, 2, 4.0, mono=False, release=0.05)
    kit_piece("rideBell", k / "RideRBell", 2, 2, 3.0, mono=False, release=0.05)
    kit_piece("crash", k / "CrashR", 2, 2, 5.0, mono=False, release=0.08)
    kit_piece("tomHi", k / "Tom2", 3, 2, 1.6)
    kit_piece("tomLo", k / "Tom4", 3, 2, 2.0)
    kit_piece("hatFoot", None, 1, 2, 0.4, mono=False,
              files=[SRC / "hh/HiHat_Close_rr1_Mid.wav", SRC / "hh/HiHat_Close_rr2_Mid.wav"])


def main():
    for p in list(OUT.glob("*.wav")) + list(OUT.glob("*.caf")):
        p.unlink()
    piano()
    bass()
    sax()
    drums()
    (OUT / "instruments.json").write_text(json.dumps(INSTRUMENTS, indent=1) + "\n")
    # ALAC in CAF: lossless, about half the size of the WAVs.
    import subprocess
    for p in sorted(OUT.glob("*.wav")):
        subprocess.run(["afconvert", "-f", "caff", "-d", "alac", str(p), str(p.with_suffix(".caf"))], check=True)
        p.unlink()
    total = sum(p.stat().st_size for p in OUT.glob("*.caf"))
    print(f"{len(list(OUT.glob('*.caf')))} files, {total / 1e6:.1f} MB")


main()
