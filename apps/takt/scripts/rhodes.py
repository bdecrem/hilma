#!/usr/bin/env python3
"""The Rhodes for your keys (Settings → Sound → Your instrument → Rhodes): Jeff Learman's
jRhodes3d, his 1977 Rhodes Mark I Stage 73 recorded from the harp connector, 65 full-length
mono samples in five velocity layers, every fourth white key F1..C7. Cut like the piano
(scripts/sounds.py: onset trim, tail cut at -60 dB or the cap, 40 ms fade; the sampler loops
the tail with the measured decay) to Takt/Sounds/rho-<root>-<layer>.caf and registered in
instruments.json as `rhodes73`.

    git clone https://github.com/sfzinstruments/jlearman.jRhodes3d <src>/rhodes   (or the zip)
    <venv with numpy, soundfile>/bin/python apps/takt/scripts/rhodes.py <src>

License (the set's LICENSE file): the samples are CC BY-NC 4.0 when distributed in an
application; "to use the samples in a commercial product, please contact me and I will be
happy to grant a license" (jjlearman@gmail.com). Takt is a free TestFlight build today; a
commercial license is needed before it is sold. See Takt/Licenses/README.md.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

import numpy as np
import soundfile as sf



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


SRC = Path(sys.argv[1]) / "rhodes"
OUT = Path(__file__).resolve().parent.parent / "Takt/Sounds"
NORM = -6.0    # dBFS peak of the set: a G3 at 0.8 near the piano's (CLAUDE.md 0.1 (67))
RELEASE = 0.3
# The files are recorded at one level and the SFZ leaves the dynamics to the player's velocity
# curve; here they are baked in, a layer's gain the velocity at the centre of its SFZ group
# (-14.5 dB for the softest, 1..47, to -0.5 dB for the hardest, 112..127), and the sampler's
# own touch does the rest. Layers are numbered here from the groups, 1 the softest; the set's
# file names count the other way (`_5.flac` is the softest).
PC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def midi(name):
    m = re.fullmatch(r"([A-G])([#b]?)(-?\d)", name)
    return (int(m.group(3)) + 1) * 12 + PC[m.group(1)] + (1 if m.group(2) == "#" else -1 if m.group(2) == "b" else 0)


def loop(x, sr):
    """The sustain loop, like the sampler's own tail loop (Voices.swift, 0.1 (64)) but with the
    seam chosen: the end is before the cutter's fade, the start the point 0.6..1.3 s earlier
    where the 40 ms before it best match the 40 ms before the end (in phase, so the crossfade
    doesn't cancel); the decay is the loop's last 100 ms over its first 100 ms. None: too short."""
    if len(x) < 1.5 * sr:
        return None
    m = x.mean(axis=1)
    end = len(m) - int(0.04 * sr) - 2
    w = int(0.04 * sr)
    tail = m[end - w:end]
    tail = (tail - tail.mean()) / (tail.std() + 1e-9)

    def match(c):
        seg = m[c - w:c]
        seg = (seg - seg.mean()) / (seg.std() + 1e-9)
        return float((seg * tail).mean())

    # The longest loop (up to 1.3 s) whose seam is within 0.02 of the best: a tine's beat
    # against its tonebar repeats less often that way.
    lo, hi = max(w, end - int(1.3 * sr)), end - int(0.6 * sr)
    cands = list(range(lo, hi, 4))
    rs = [match(c) for c in cands]
    best = max(rs)
    coarse = next(c for c, r in zip(cands, rs) if r >= best - 0.02)
    start = max(range(max(lo, coarse - 8), min(hi, coarse + 9)), key=match)
    h = int(0.1 * sr)
    rms = lambda a, b: np.sqrt((m[a:b] ** 2).mean()) + 1e-12
    decay = float(min(1, max(0.05, rms(end - h, end) / rms(start, start + h))))
    return start, end, match(start), decay


def main():
    sfz = next(SRC.glob("**/_jRhodes3d-mono-no-xfade-flac.sfz"))
    lovel, hivel, layer = 1, 127, 0
    regions = []
    for line in sfz.read_text().splitlines():
        line = line.split("//")[0].strip()
        if line.startswith("<group>"):
            kv = dict(re.findall(r"(\w+)=(\S+)", line))
            lovel, hivel = int(kv.get("lovel", 1)), int(kv.get("hivel", 127))
            layer += 1
        elif line.startswith("<region>"):
            kv = dict(re.findall(r"(\w+)=(\S+)", line))
            regions.append((midi(kv["pitch_keycenter"]), lovel, hivel, layer, kv["sample"]))
    for p in list(OUT.glob("rho-*.wav")) + list(OUT.glob("rho-*.caf")):
        p.unlink()
    cut, zones, loops = {}, {}, {}
    for root, lv, hv, layer, sample in regions:
        name = f"rho-{root}-{layer}"
        if name not in cut:
            x, sr = sf.read(sfz.parent / sample, always_2d=True, dtype="float64")
            cap = 7.0 if root < 52 else 5.0 if root < 72 else 3.5
            x = trim(x, sr, cap) * ((lv + hv) / 2 / 127)
            cut[name] = (x, sr, len(x) / sr)
            loops[name] = loop(x, sr)
        zones.setdefault((root, round(hv / 127, 3)), []).append(name)
    peak = max(np.abs(x).max() for x, _, _ in cut.values())
    g = 10 ** (NORM / 20) / peak
    for name, (x, sr, full) in sorted(cut.items()):
        sf.write(OUT / f"{name}.wav", (x * g).astype(np.float32), sr, subtype="PCM_16")
        if name.endswith("-5") or name.startswith("rho-55"):
            lp = loops[name]
            print(f"{name}: {len(x) / sr:4.2f} s kept, peak {20 * np.log10(np.abs(x).max() * g):5.1f} dBFS, "
                  + (f"loop {lp[0] / sr:4.2f}..{lp[1] / sr:4.2f} s, seam r={lp[2]:4.2f}, decay {20 * np.log10(lp[3]):5.1f} dB a pass" if lp else "no loop"))
    manifest = json.loads((OUT / "instruments.json").read_text())
    zs = []
    for (root, vel), files in sorted(zones.items()):
        for f in sorted(set(files)):
            z = {"root": root, "vel": vel, "files": [f]}
            if loops[f]:
                z["loop"] = [loops[f][0], loops[f][1]]
                z["loopDecay"] = round(loops[f][3], 4)
            zs.append(z)
    manifest["rhodes73"] = {"release": RELEASE, "zones": zs}
    (OUT / "instruments.json").write_text(json.dumps(manifest, indent=1) + "\n")
    for p in sorted(OUT.glob("rho-*.wav")):
        subprocess.run(["afconvert", "-f", "caff", "-d", "alac", str(p), str(p.with_suffix(".caf"))], check=True)
        p.unlink()
    total = sum(p.stat().st_size for p in OUT.glob("rho-*.caf"))
    print(f"rhodes73: {len(zones)} zones ({len(cut)} files), roots {min(r for r, _ in zones)}..{max(r for r, _ in zones)}, {total / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
