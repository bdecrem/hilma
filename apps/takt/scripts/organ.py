#!/usr/bin/env python3
"""The organ for your keys (Settings → Sound → Your instrument): FreePats' "Percussive organ
emulation", a Hammond with percussion through a Leslie, rendered from the setBfree tonewheel
emulator by the Strix SoundFont Team and published CC0. Cut to Takt/Sounds/org-*.caf (stereo,
the Leslie's two sides) and registered in instruments.json as `organ`.

    apps/takt/scripts/sounds-fetch.sh <src>          # downloads organ/ with the rest
    <venv with numpy, soundfile>/bin/python apps/takt/scripts/organ.py <src>

The set is 16 notes a major third apart, C2..G#6, each a left and a right file sharing a loop
end but not a loop start (each side was looped on its own). The sampler loops one stereo
buffer, so the loop here is cut again: the end is the set's, the start is the point in the
steady part where the signal before it best matches the signal before the end, both sides at
once (the seam in phase, the Leslie near the same place in its turn); the sampler crossfades
the seam over 200 ms. The level is set by `NORM`, the
peak of the whole set, so that a held note sits where the piano's attack does (measured in the
offline render, see CLAUDE.md 0.1 (66)). `touch` is how much velocity moves the level: an
organ has none; a little is left so a soft touch reads.

The synthesized tonewheel organ of 0.1 (65) (Organ.swift) is gone: Bart, 2026-11-01, "it's
TERRIBLE. sounds like the dumbest instrument ever made".
"""
import json
import re
import subprocess
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

SRC = Path(sys.argv[1]) / "organ"
OUT = Path(__file__).resolve().parent.parent / "Takt/Sounds"
NORM = -14.0   # dBFS peak of the set: a held note at the piano attack's RMS (see CLAUDE.md 0.1 (66))
RELEASE = 0.06
TOUCH = 0.35
PC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def midi(name):
    m = re.fullmatch(r"([A-G])([#b]?)(-?\d)", name)
    n = PC[m.group(1)] + (1 if m.group(2) == "#" else -1 if m.group(2) == "b" else 0)
    return (int(m.group(3)) + 1) * 12 + n   # SFZ: C4 = 60


def regions(sfz):
    out, cur = [], None
    for line in sfz.read_text().splitlines():
        line = line.split("//")[0].strip()
        if line == "<region>":
            cur = {}
            out.append(cur)
        elif cur is not None and "=" in line:
            k, v = line.split("=", 1)
            cur[k.strip()] = v.strip()
    return out


def main():
    sfz = next(SRC.glob("PercussiveOrgan*/*.sfz"))
    regs = regions(sfz)
    notes = {}
    for r in regs:
        side = "L" if r["pan"].startswith("-") else "R"
        notes.setdefault(midi(r["pitch_keycenter"]), {})[side] = (sfz.parent / r["sample"], int(r["loop_start"]), int(r["loop_end"]))
    for p in list(OUT.glob("org-*.wav")) + list(OUT.glob("org-*.caf")):
        p.unlink()
    cut = []
    for root in sorted(notes):
        (pl, sl, el), (pr, sr_, er) = notes[root]["L"], notes[root]["R"]
        l, sr = sf.read(pl, dtype="float64")
        r, sr2 = sf.read(pr, dtype="float64")
        assert sr == sr2 and l.ndim == 1 and r.ndim == 1
        n = min(len(l), len(r), el, er)
        x = np.stack([l[:n], r[:n]], axis=1)
        # Onset: the first sample within 40 dB of the peak, a millisecond early.
        env = np.abs(x).max(axis=1)
        start = max(0, int(np.argmax(env > env.max() * 0.01)) - int(0.001 * sr))
        x = x[start:]
        end = n - start
        # The loop start: anywhere in the steady part (from a second in, leaving the loop at
        # least 1.2 s), at the point where the 60 ms before it best match the 60 ms before the
        # end on both sides: the seam is then in phase, with the Leslie near the same place in
        # its turn. Measured, not computed from the pitch: a tonewheel's gear ratio is a few
        # cents off the tempered one, and over three seconds that is most of a period.
        w = int(0.06 * sr)
        tail = x[end - w:end]
        tail = (tail - tail.mean(axis=0)) / (tail.std(axis=0) + 1e-9)

        def match(c):
            seg = x[c - w:c]
            seg = (seg - seg.mean(axis=0)) / (seg.std(axis=0) + 1e-9)
            return float((seg * tail).mean(axis=0).sum() / 2)

        lo, hi = int(1.0 * sr), end - int(1.2 * sr)
        coarse = max(range(lo, hi, 4), key=match)
        loop_start = max(range(coarse - 8, coarse + 9), key=match)
        seam = match(loop_start)
        cut.append((root, x, sr, loop_start, end, seam))
    peak = max(np.abs(x).max() for _, x, *_ in cut)
    g = 10 ** (NORM / 20) / peak
    zones = []
    for root, x, sr, ls, le, seam in cut:
        name = f"org-{root}"
        sf.write(OUT / f"{name}.wav", (x * g).astype(np.float32), sr, subtype="PCM_16")
        zones.append({"root": root, "vel": 1.0, "files": [name], "loop": [ls, le]})
        rms = 20 * np.log10(np.sqrt((x[sr:2 * sr] ** 2).mean()) * g)
        print(f"{name}: {len(x) / sr:4.2f} s, loop {ls / sr:4.2f}..{le / sr:4.2f} s ({(le - ls) / sr:4.2f}), seam r={seam:5.2f}, steady {rms:6.1f} dBFS")
    manifest = json.loads((OUT / "instruments.json").read_text())
    manifest["organ"] = {"release": RELEASE, "touch": TOUCH, "zones": zones}
    (OUT / "instruments.json").write_text(json.dumps(manifest, indent=1) + "\n")
    for p in sorted(OUT.glob("org-*.wav")):
        subprocess.run(["afconvert", "-f", "caff", "-d", "alac", str(p), str(p.with_suffix(".caf"))], check=True)
        p.unlink()
    total = sum(p.stat().st_size for p in OUT.glob("org-*.caf"))
    print(f"organ: {len(zones)} zones, {total / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
