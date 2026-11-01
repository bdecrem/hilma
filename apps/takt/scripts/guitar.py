#!/usr/bin/env python3
"""The guitar: Karoryfer's Shinyguitar (D. Smolken), an archtop played acoustic and sampled
through a microphone, published CC0 ("royalty-free for all commercial and non-commercial
use"). The 1930s blues guitar was a steel-strung archtop or flattop played hard into one
microphone; this is that sound. Cut to Takt/Sounds/gtr-*.caf and registered in
instruments.json as `guitar` (the notes), `guitarMute` (the dead strings, one a string, for
the Delta thumb's chick), `guitarPerc` (knocks on the body). For Dockery (0.1 (71), Bart,
2026-11-01: "try the sampled steel string guitar - add it to dockery - make it dirty").

    apps/takt/scripts/sounds-fetch.sh <src>          # clones guitar/karoryfer.shinyguitar
    <venv with numpy, soundfile>/bin/python apps/takt/scripts/guitar.py <src>

The set: 16 notes a minor third apart, E2..C6, four velocity layers (vl1 the softest) with
four round robins each, mono 44.1 kHz 24-bit, seven seconds a file; release noises; six dead
strings; muted strums; body knocks. Two round robins a layer are kept, the notes capped at
2.8 s (the piano's cut: onset trim, tail at -60 dB or the cap, a fade). The layers' levels
are set here, 12 dB from the softest to the hardest (the files span 19, and the sampler's own
touch adds its share); `NORM` is the set's peak.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

SRC = Path(sys.argv[1]) / "guitar" / "karoryfer.shinyguitar" / "Samples" / "acoustic"
OUT = Path(__file__).resolve().parent.parent / "Takt/Sounds"
NORM = -3.0        # dBFS peak of the set (the hardest layer): hot, the way the record was cut
LAYER_DB = [-12.0, -8.0, -4.0, 0.0]   # the four layers' peaks against NORM
LAYER_VEL = [0.3, 0.55, 0.8, 1.0]      # the velocity each layer covers up to
ROUND_ROBINS = 2
CAP = 2.8
RELEASE = 0.12
PC = {"c": 0, "d": 2, "e": 4, "f": 5, "g": 7, "a": 9, "b": 11}
# The dead strings, mute_string1 the high E: the pitch each one is filed under.
STRINGS = {1: 64, 2: 59, 3: 55, 4: 50, 5: 45, 6: 40}


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
    fade = min(int(0.25 * sr), len(x) // 4)
    x[-fade:] *= np.linspace(1, 0, fade)[:, None] ** 2
    return x


def read(path):
    x, sr = sf.read(path, dtype="float64")
    if x.ndim == 1:
        x = x[:, None]
    return x, sr


def write(name, x, sr, cut):
    p = OUT / f"{name}.wav"
    sf.write(p, x, sr, subtype="PCM_16")
    cut.append(p)


def main():
    for pat in ("gtr-*", "gmute-*", "gperc-*"):
        for p in list(OUT.glob(pat + ".wav")) + list(OUT.glob(pat + ".caf")):
            p.unlink()
    cut = []
    notes = sorted({f.name.split("_")[0] for f in SRC.glob("*_vl1_rr1_1.wav")}, key=midi)
    zones = []
    top = 10 ** (NORM / 20)
    for name in notes:
        root = midi(name)
        for li in range(4):
            files = []
            for rr in range(1, ROUND_ROBINS + 1):
                x, sr = read(SRC / f"{name}_vl{li + 1}_rr{rr}_1.wav")
                x = trim(x, sr, CAP)
                x *= top * 10 ** (LAYER_DB[li] / 20) / np.abs(x).max()
                fname = f"gtr-{root}-{li + 1}-{rr}"
                write(fname, x, sr, cut)
                files.append(fname)
            zones.append({"root": root, "vel": LAYER_VEL[li], "files": files})
    mutes = []
    for string, root in sorted(STRINGS.items(), key=lambda kv: kv[1]):
        files = []
        for rr in (1, 2):
            x, sr = read(SRC / f"mute_string{string}_rr{rr}_1.wav")
            x = trim(x, sr, 0.8)
            x *= top * 10 ** (-4 / 20) / np.abs(x).max()
            fname = f"gmute-{root}-{rr}"
            write(fname, x, sr, cut)
            files.append(fname)
        mutes.append({"root": root, "vel": 1.0, "files": files})
    percs = []
    for k in range(1, 5):
        x, sr = read(SRC / f"perc_{k}_rr1_1.wav")
        x = trim(x, sr, 0.8)
        x *= top / np.abs(x).max()
        write(f"gperc-{k}", x, sr, cut)
        percs.append(f"gperc-{k}")
    manifest = json.loads((OUT / "instruments.json").read_text())
    manifest["guitar"] = {"release": RELEASE, "zones": zones}
    manifest["guitarMute"] = {"release": 0.05, "touch": 0.6, "zones": mutes}
    manifest["guitarPerc"] = {"release": 0.05, "zones": [{"root": 0, "vel": 1.0, "files": percs}]}
    (OUT / "instruments.json").write_text(json.dumps(manifest, indent=1) + "\n")
    for p in cut:
        subprocess.run(["afconvert", "-f", "caff", "-d", "alac", str(p), str(p.with_suffix(".caf"))], check=True)
        p.unlink()
    size = sum(p.with_suffix(".caf").stat().st_size for p in cut)
    print(f"guitar: {len(notes)} notes x 4 layers x {ROUND_ROBINS} rr, {len(mutes)} dead strings, {len(percs)} knocks; "
          f"{len(cut)} files, {size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
