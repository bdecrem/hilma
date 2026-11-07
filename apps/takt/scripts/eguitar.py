#!/usr/bin/env python3
"""The electric guitar: Karoryfer's Emilyguitar (D. Smolken), an Epiphone Emily the Strange
solid body with flatwound 11s, recorded direct from both pickups with every knob on ten,
published CC0 ("royalty-free for all commercial and non-commercial use"). Clean DI on
purpose: the grit is the amp in the engine (`Audio/GuitarAmp.swift`, a band's `amp`), so a
chord distorts as one signal the way six strings into one amp do. Cut to
Takt/Sounds/egt-*.caf and registered in instruments.json as `eguitar` (the notes) and
`eguitarMute` (five muted strums, the chuck on the late eighth). Bart, 2026-11-07: "i want
tracks that have a real guitar, more gritty than steel guitar … use it for the chords".

    git clone --depth 1 https://github.com/sfzinstruments/karoryfer.emilyguitar.git <src>
    <venv with numpy, soundfile>/bin/python apps/takt/scripts/eguitar.py <src>

The set: 18 notes a minor third apart, Db2..D6, four velocity layers (p mp mf f) with three
round robins, mono 44.1 kHz 24-bit, 4.2 s a file; release noises; five muted strums. Two
round robins a layer are kept, the notes capped at 3.5 s (a solid body sustains; the sampler
loops the tail past that while a key is held). Layers 12 dB from the softest to the hardest
peak, so the amp's drive follows the hand.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

SRC = Path(sys.argv[1])
OUT = Path(__file__).resolve().parent.parent / "Takt/Sounds"
NORM = -6.0        # dBFS peak of the set (the hardest layer); the amp sets the loudness
LAYERS = ["p", "mp", "mf", "f"]
LAYER_DB = [-12.0, -8.0, -4.0, 0.0]
LAYER_VEL = [0.3, 0.55, 0.8, 1.0]
ROUND_ROBINS = 2
CAP = 3.5
RELEASE = 0.08
PC = {"c": 0, "d": 2, "e": 4, "f": 5, "g": 7, "a": 9, "b": 11}
# The muted strums, filed under four roots so none is pitched more than a few semitones.
MUTE_ROOTS = [43, 50, 57, 64]


def midi(name):
    m = re.fullmatch(r"([a-g])(b?)(\d)", name)
    return (int(m.group(3)) + 1) * 12 + PC[m.group(1)] - (1 if m.group(2) else 0)


def trim(x, sr, cap):
    """The piano's cut (scripts/sounds.py): onset trim + tail cut at -60 dB or the cap + fade."""
    env = np.abs(x).max(axis=1)
    peak = env.max()
    start = max(0, int(np.argmax(env > peak * 0.01)) - int(0.001 * sr))
    x = x[start:]
    w = int(0.02 * sr)
    n = len(x) // w
    rms = np.sqrt((x[: n * w] ** 2).mean(axis=1).reshape(n, w).mean(axis=1))
    above = np.nonzero(rms > peak * 0.001)[0]
    end = min(len(x), (above[-1] + 1) * w if len(above) else len(x), int(cap * sr))
    x = x[:end].copy()
    fade = min(int(0.04 * sr), len(x) // 4)
    x[-fade:] *= np.linspace(1, 0, fade)[:, None] ** 2
    return x


def read(path):
    x, sr = sf.read(path, dtype="float64")
    if x.ndim == 1:
        x = x[:, None]
    return x, sr


def main():
    for pat in ("egt-*", "egmute-*"):
        for p in list(OUT.glob(pat + ".wav")) + list(OUT.glob(pat + ".caf")):
            p.unlink()
    cut = []

    def write(name, x, sr):
        p = OUT / f"{name}.wav"
        sf.write(p, x, sr, subtype="PCM_16")
        cut.append(p)

    notes = sorted({f.name.split("_")[0] for f in (SRC / "notes").glob("*_f_rr1.wav")}, key=midi)
    top = 10 ** (NORM / 20)
    zones = []
    for name in notes:
        root = midi(name)
        for li, layer in enumerate(LAYERS):
            files = []
            for rr in range(1, ROUND_ROBINS + 1):
                x, sr = read(SRC / "notes" / f"{name}_{layer}_rr{rr}.wav")
                x = trim(x, sr, CAP)
                x *= top * 10 ** (LAYER_DB[li] / 20) / np.abs(x).max()
                fname = f"egt-{root}-{li + 1}-{rr}"
                write(fname, x, sr)
                files.append(fname)
            zones.append({"root": root, "vel": LAYER_VEL[li], "files": files})
    mutes = []
    for k in range(1, 6):
        x, sr = read(SRC / "noises" / f"muted{k}_rr1.wav")
        x = trim(x, sr, 0.6)
        x *= top * 10 ** (-3 / 20) / np.abs(x).max()
        write(f"egmute-{k}", x, sr)
        mutes.append(f"egmute-{k}")
    manifest = json.loads((OUT / "instruments.json").read_text())
    manifest["eguitar"] = {"release": RELEASE, "zones": zones}
    manifest["eguitarMute"] = {"release": 0.04, "touch": 0.6,
                               "zones": [{"root": r, "vel": 1.0, "files": mutes} for r in MUTE_ROOTS]}
    (OUT / "instruments.json").write_text(json.dumps(manifest, indent=1) + "\n")
    for p in cut:
        subprocess.run(["afconvert", "-f", "caff", "-d", "alac", str(p), str(p.with_suffix(".caf"))], check=True)
        p.unlink()
    size = sum(p.with_suffix(".caf").stat().st_size for p in cut)
    print(f"eguitar: {len(notes)} notes x {len(LAYERS)} layers x {ROUND_ROBINS} rr, {len(mutes)} muted strums; "
          f"{len(cut)} files, {size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
