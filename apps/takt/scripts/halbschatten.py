#!/usr/bin/env python3
"""Halbschatten's sounds and events, cut from the reference render itself.

    <venv with numpy, scipy, numba, soundfile>/bin/python apps/takt/scripts/halbschatten.py [--keep <dir>]

`misc/halbschatten_reference.py` is the record (misc/HALBSCHATTEN.md): this script runs it, so
nothing here is a re-synthesis. It patches the reference's source in memory to log every event
as it is placed (its sample, its round robin, its velocity after the humanizing: the same
random stream, so the logged render is the reference bit for bit), then writes

- `Takt/Sounds/hs-*.caf`: the reference's own one-shots, at 48 kHz and as they are at 44.1 (`…-44`,
  instruments `…@44`: the renderer takes the set at its output's rate) (the kick, the hats with
  their pan and the hat bus's 12.5 kHz lowpass baked in, shaker, clap, rim, toms per pan, every
  bass note with the bass bus's 520 Hz lowpass, the twelve raw stab buffers, the four risers
  cut from the riser bus, 32 s of the noise bed) and `instruments.json` entries for them;
- `Takt/Sounds/hs-ir-{hall,room}-{44,48}.wav`: the two reverb impulses, float, at both rates
  the engine runs at;
- `scripts/songs/halbschatten-events.json`: every event with its time in seconds, the
  resolved gains, the pad's start phases and each file's scale, for `songs/halbschatten.py`.

`--keep <dir>` leaves the reference's stems and parts there (the A/B: scripts/takt/halb-ab.py).
"""
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy import signal

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent.parent
REF = REPO / "misc/halbschatten_reference.py"
OUT = HERE.parent / "Takt/Sounds"
EVENTS = HERE / "songs/halbschatten-events.json"
SR = 48000
PEAK = 0.89

# MARK: The reference, logging its events


def patched_source():
    src = REF.read_text()

    def rep(a, b, count=1):
        nonlocal src
        assert src.count(a) == count, (a, src.count(a))
        src = src.replace(a, b)

    rep("                add(kick, kick1, p)\n", "                add(kick, kick1, p)\n                EV.append(('kick', p))\n")
    rep("                add(bass, bass_note(m, ln * STEP, vel), pos(bar, step))",
        "                _p = pos(bar, step); add(bass, bass_note(m, ln * STEP, vel), _p); EV.append(('bass', _p, m + TRANSPOSE, ln, vel))")
    rep("            raw = stabs[ch][rng.integers(4)]", "            _j = int(rng.integers(4)); raw = stabs[ch][_j]")
    rep("            v = vel * (1 + 0.07 * rng.standard_normal())\n",
        "            v = vel * (1 + 0.07 * rng.standard_normal())\n            EV.append(('stab', s, ch, _j, float(v), float(tau), bar, step))\n")
    rep("add(hats, pan(chh[rng.integers(3)], 0.18), p, v)",
        "_j = int(rng.integers(3)); add(hats, pan(chh[_j], 0.18), p, v); EV.append(('chh', p, _j, float(v)))", 2)
    rep("add(hats, pan(ohh[rng.integers(2)], -0.15), p, v)",
        "_j = int(rng.integers(2)); add(hats, pan(ohh[_j], -0.15), p, v); EV.append(('ohh', p, _j, float(v)))")
    rep("                add(shaker, pan(shk[rng.integers(3)], 0.4), p, SH_VEL[st % 4] * (1 + 0.12 * rng.standard_normal()) * min(1.0, (bar - 64 + st / 16) / 4 + 0.25))",
        "                _j = int(rng.integers(3)); _v = SH_VEL[st % 4] * (1 + 0.12 * rng.standard_normal()) * min(1.0, (bar - 64 + st / 16) / 4 + 0.25); "
        "add(shaker, pan(shk[_j], 0.4), p, _v); EV.append(('shk', p, _j, float(_v)))")
    rep("                add(claps, pan(clap1, 0.0), pos(bar, st, jitter=0.001), 0.9)",
        "                _p = pos(bar, st, jitter=0.001); add(claps, pan(clap1, 0.0), _p, 0.9); EV.append(('clap', _p, 0.9))")
    rep("                add(rims, pan(rim1, 0.35), pos(bar, st, swing=SW, jitter=0.001), v)",
        "                _p = pos(bar, st, swing=SW, jitter=0.001); add(rims, pan(rim1, 0.35), _p, v); EV.append(('rim', _p, float(v)))")
    rep("                add(perc, pan(toms[m], -0.3 if i % 2 == 0 else 0.3), pos(bar, st, swing=SW, jitter=0.002),\n"
        "                    v * (1 + 0.1 * rng.standard_normal()))",
        "                _p = pos(bar, st, swing=SW, jitter=0.002); _v = v * (1 + 0.1 * rng.standard_normal()); "
        "add(perc, pan(toms[m], -0.3 if i % 2 == 0 else 0.3), _p, _v); EV.append(('tom', _p, m + TRANSPOSE, i % 2, float(_v)))")
    rep("                add(lead, fm_pluck(m, ln * STEP, 0.8 + 0.15 * rng.random()), pos(start + i, st, jitter=0.003))",
        "                _vel = 0.8 + 0.15 * rng.random(); _p = pos(start + i, st, jitter=0.003); add(lead, fm_pluck(m, ln * STEP, _vel), _p); "
        "EV.append(('lead', _p, m + TRANSPOSE, ln, float(_vel), start + i, st))")
    rep("        padL += g * (saw_blep(N, f * 2 ** (-6 / 1200), rng.random(), SR) + saw_blep(N, f * 2 ** (3 / 1200), rng.random(), SR))",
        "        padL += g * (saw_blep(N, f * 2 ** (-6 / 1200), _ph(), SR) + saw_blep(N, f * 2 ** (3 / 1200), _ph(), SR))")
    rep("        padR += g * (saw_blep(N, f * 2 ** (6 / 1200), rng.random(), SR) + saw_blep(N, f * 2 ** (-2 / 1200), rng.random(), SR))",
        "        padR += g * (saw_blep(N, f * 2 ** (6 / 1200), _ph(), SR) + saw_blep(N, f * 2 ** (-2 / 1200), _ph(), SR))")
    # numba's on-disk cache wants an importable module; this source only exists in memory.
    rep("@njit(cache=True)", "@njit", 4)
    src = src.replace("\ndef render(stems_dir=None):", "\nEV = []\nPAD = []\n\n\ndef _ph():\n    x = rng.random()\n    PAD.append(float(x))\n    return x\n\n\ndef render(stems_dir=None):")
    return src


def run_reference(work):
    ns = {"__name__": "halbschatten_reference", "__file__": str(REF)}
    exec(compile(patched_source(), str(REF), "exec"), ns)
    mix = ns["render"](str(work / "stems"))
    rng = ns["rng"]
    dither = (rng.random(mix.shape) - rng.random(mix.shape)) / 32768.0
    master = np.clip((mix + dither).T * 32767, -32768, 32767).astype(np.int16)
    flac = REPO / "misc/halbschatten/reference.flac"
    if flac.exists():
        ref, _ = sf.read(flac, dtype="int16")
        assert ref.shape == master.shape and np.array_equal(ref, master), "the logged render is not the reference"
        print("the logged render is the reference, bit for bit")
    sf.write(work / "master.wav", master, 44100, subtype="PCM_16")
    return ns


# MARK: Files

FILES = []
INSTRUMENTS = {}
SCALE = {}


def up(x):
    """44.1 → 48 kHz, along the last axis."""
    return signal.resample_poly(x, 160, 147, axis=-1, window=("kaiser", 12.0))


def write(name, x, sr=SR):
    """x: (n,) mono or (2, n) stereo, float, already scaled."""
    assert np.abs(x).max() <= 1.0, (name, np.abs(x).max())
    p = OUT / f"{name}.wav"
    sf.write(p, (x.T if x.ndim == 2 else x).astype(np.float32), sr, subtype="PCM_16")
    FILES.append(p)


def register_group(entries):
    """entries: [(key, release, [(root, [(file, samples at 44.1 kHz)])])], one scale across them
    (kept in SCALE[key]: file = the reference's sample × scale). Each instrument is written
    twice: at 48 kHz (`key`, the devices' rate) and as the reference's own samples at 44.1 kHz
    (`key@44`, files `…-44`), which the renderer picks when the output runs at 44.1 kHz (this
    iMac's speakers do): the sampler's linear interpolation between rates costs the top octave
    1.4 dB, and the reference's own samples cost nothing."""
    ups = {(name): up(x) for _, _, zones in entries for _, rr in zones for name, x in rr}
    k = min(PEAK / max(np.abs(x).max() for x in ups.values()),
            0.99 / max(np.abs(x).max() for _, _, zones in entries for _, rr in zones for _, x in rr))
    for key, release, zones in entries:
        for suffix, rate in (("", SR), ("-44", 44100)):
            out = []
            for root, rr in zones:
                for name, x in rr:
                    write(name + suffix, (ups[name] if rate == SR else x) * k, rate)
                out.append({"root": int(root), "vel": 1.0, "files": [name + suffix for name, _ in rr]})
            INSTRUMENTS[key + ("@44" if suffix else "")] = {"release": release, "zones": out}
        SCALE[key] = float(k)


def register(key, release, zones):
    register_group([(key, release, zones)])


def main():
    keep = Path(sys.argv[sys.argv.index("--keep") + 1]) if "--keep" in sys.argv else None
    work = keep or Path(tempfile.mkdtemp(prefix="halbschatten-"))
    work.mkdir(parents=True, exist_ok=True)
    ns = run_reference(work)
    parts = work / "parts"
    rsr, STEP, BARS = ns["SR"], ns["STEP"], ns["BAR"]
    pan, lp, pos = ns["pan"], ns["lp"], ns["pos"]

    def part(name):
        x, sr = sf.read(parts / f"{name}.wav", dtype="float64")
        assert sr == rsr
        return x.T if x.ndim == 2 else x

    def tail(x, seconds=0.01):
        return np.concatenate([x, np.zeros(x.shape[:-1] + (int(seconds * rsr),))], axis=-1)

    # The kick: a kit named kick… ducks (BandRenderer).
    register("kickHS", 0.03, [(0, [("hs-kick", part("kick"))])])
    # Hats: the pan and the hat bus's lowpass are the sample's.
    for i in range(3):
        register(f"hsChh{i}", 0.05, [(0, [(f"hs-chh-{i}", lp(tail(pan(part(f"hat_closed_{i}"), 0.18)), 12500))])])
    for i in range(2):
        register(f"hsOhh{i}", 0.05, [(0, [(f"hs-ohh-{i}", lp(tail(pan(part(f"hat_open_{i}"), -0.15)), 12500))])])
    for i in range(3):
        register(f"hsShk{i}", 0.05, [(0, [(f"hs-shk-{i}", pan(part(f"shaker_{i}"), 0.4))])])
    register("hsClap", 0.05, [(0, [("hs-clap", pan(part("clap"), 0.0))])])
    register("hsRim", 0.05, [(0, [("hs-rim", pan(part("rim"), 0.35))])])
    for m, side in ((55, 0), (53, 1), (50, 1), (53, 0)):
        register(f"hsTom{m}{'LR'[side]}", 0.05, [(0, [(f"hs-tom-{m}-{'lr'[side]}", pan(part(f"tom_{m}"), -0.3 if side == 0 else 0.3))])])
    # The bass: every (length, pitch) the line plays, the bus's 520 Hz lowpass in the note.
    bass = {}
    for e in ns["EV"]:
        if e[0] == "bass":
            bass.setdefault(e[3], set()).add(e[2])
    register_group([(f"hsBass{int(ln * 10)}", 0.05,
                     [(m, [(f"hs-bass-{int(ln * 10)}-{m}", lp(tail(ns["bass_note"](m - ns["TRANSPOSE"], ln * STEP, 1.0), 0.05), 520))])
                      for m in sorted(ms)]) for ln, ms in bass.items()])
    # The raw stab buffers, one instrument per variant, a zone per chord root (sounding).
    roots = {"Gm9": 55, "Cm9": 48, "Dm9": 50}
    register_group([(f"hsStab{j}", 0.05, [(root, [(f"hs-stab-{c.lower()}-{j}", part(f"stab_raw_{c}_{j}"))]) for c, root in roots.items()])
                    for j in range(4)])
    # The risers, cut from the riser bus: the sweep and the two bars of wash after it.
    riser = part("riser")
    spans = [riser[:, pos(a):pos(b) + int(BARS * 2 * rsr)] for a, b in ((14, 16), (30, 32), (52, 56), (86, 88))]
    register_group([(f"hsRiser{i}", 0.2, [(0, [(f"hs-riser-{i}", x)])]) for i, x in enumerate(spans)])
    # The noise bed's first 32 s (the rack loops it).
    register("hsNoise", 0.2, [(0, [("hs-noise", part("noise_bed_first_32s"))])])

    # The impulses, float, at both rates. The leading silence (the predelay) stays: the
    # convolver trims one block of it for its own latency.
    for name in ("hall", "room"):
        ir = part(f"ir_{name}")
        lead = int(np.argmax(np.abs(ir).max(axis=0) > 0))
        sf.write(OUT / f"hs-ir-{name}-44.wav", ir.T.astype(np.float32), 44100, subtype="FLOAT")
        # An impulse at a higher rate has more samples under the same curve: × 147/160 keeps the
        # convolution's gain (without it the hall and the room read +0.74 dB at 48 kHz).
        ir48 = np.concatenate([np.zeros((2, round(lead * 160 / 147))), up(ir[:, lead:]) * (147 / 160)], axis=1)
        sf.write(OUT / f"hs-ir-{name}-48.wav", ir48.T.astype(np.float32), 48000, subtype="FLOAT")
        print(f"ir {name}: {ir.shape[1] / 44100:.2f} s, {lead} samples of predelay at 44.1 kHz")

    manifest = json.loads((OUT / "instruments.json").read_text())
    # Not Gezeiten's raw stab buffers (hsStabGz…: the renderer sends any hsStab… into the rack).
    for key in [k for k in manifest if (k.startswith("hs") and not k.startswith("hsStabGz")) or k.startswith("kickHS")]:
        manifest.pop(key)
    manifest.update(INSTRUMENTS)
    (OUT / "instruments.json").write_text(json.dumps(manifest, indent=1) + "\n")
    for p in FILES:
        subprocess.run(["afconvert", "-f", "caff", "-d", "alac", str(p), str(p.with_suffix(".caf"))], check=True)
        p.unlink()

    gains = json.loads((parts / "gains.json").read_text())
    events = [[e[0], e[1] / rsr] + list(e[2:]) for e in ns["EV"]]
    EVENTS.write_text(json.dumps({
        "tempo": ns["BPM"], "bars": ns["NBARS"], "tail": ns["TAIL"], "gains": gains, "scale": SCALE,
        "pad": ns["PAD"], "events": events,
    }, separators=(",", ":")).replace("],[", "],\n[") + "\n")
    total = sum(p.stat().st_size for p in OUT.glob("hs-*"))
    print(f"{len(events)} events, {len(list(OUT.glob('hs-*')))} files, {total / 1e6:.1f} MB; stems and parts in {work}")


main()
