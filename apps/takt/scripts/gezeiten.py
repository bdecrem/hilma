#!/usr/bin/env python3
"""Gezeiten's sounds and events, cut from the reference render itself (the takt-electronic
skill; this is `halbschatten.py` for the second record on the system).

    <venv with numpy, scipy, numba, soundfile>/bin/python apps/takt/scripts/gezeiten.py [--keep <dir>] [--verify <master.wav>]

`misc/gezeiten_reference.py` is the record: this script runs it, so nothing here is a
re-synthesis. It patches the reference's source in memory to log every event as it is placed
(its sample, its round robin, its velocity after the humanizing: the same random stream, so the
logged render is the reference bit for bit; `--verify` checks it against a master the reference
wrote on its own), then writes

- `Takt/Sounds/gz-*.caf`: the one-shots that are this record's own, at 48 kHz and as they are at
  44.1 (`…-44`, instruments `…@44`): the kick (it lands on E1), the rim, the toms per pan, every
  bass note with the bass bus's 520 Hz lowpass, the six raw stab buffers (Em11, Dm11, Am11, two
  variants each), the one riser, and the 16 s noise tile (the reference repeats the tile, so the
  rack's loop is the reference's noise to the sample);
- nothing for the hats, the shaker, the clap and the two reverb impulses: the reference makes
  them with Halbschatten's functions and seeds, so they are Halbschatten's samples (checked here
  against its files' scale: `hsChh…`, `hsOhh…`, `hsShk…`, `hsClap`, `hs-ir-hall`, `hs-ir-room`);
- `scripts/songs/gezeiten-events.json`: every event with its time in seconds, the resolved
  gains, the pad's start phases, each file's scale and the mix's own numbers, for
  `songs/gezeiten.py`.

`--keep <dir>` leaves the reference's stems and parts there (the A/B: scripts/takt/gz-ab.py).
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
REF = REPO / "misc/gezeiten_reference.py"
OUT = HERE.parent / "Takt/Sounds"
EVENTS = HERE / "songs/gezeiten-events.json"
HALB = HERE / "songs/halbschatten-events.json"
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
    rep("            raw = stabs[ch][rng.integers(2)]", "            _j = int(rng.integers(2)); raw = stabs[ch][_j]")
    rep("            v = vel * (1 + 0.07 * rng.standard_normal())\n",
        "            v = vel * (1 + 0.07 * rng.standard_normal())\n            EV.append(('stab', s, ch, _j, float(v), float(tau), bar, step))\n")
    rep("add(hats, pan(chh[rng.integers(3)], 0.18), p, v)",
        "_j = int(rng.integers(3)); add(hats, pan(chh[_j], 0.18), p, v); EV.append(('chh', p, _j, float(v)))", 2)
    rep("add(hats, pan(ohh[rng.integers(2)], -0.15), p, v)",
        "_j = int(rng.integers(2)); add(hats, pan(ohh[_j], -0.15), p, v); EV.append(('ohh', p, _j, float(v)))")
    rep("                add(shaker, pan(shk[rng.integers(3)], 0.4), p, SH_VEL[st % 4] * (1 + 0.12 * rng.standard_normal()) * min(1.0, (bar - 56 + st / 16) / 4 + 0.25))",
        "                _j = int(rng.integers(3)); _v = SH_VEL[st % 4] * (1 + 0.12 * rng.standard_normal()) * min(1.0, (bar - 56 + st / 16) / 4 + 0.25); "
        "add(shaker, pan(shk[_j], 0.4), p, _v); EV.append(('shk', p, _j, float(_v)))")
    rep("            add(claps, pan(clap1, 0.0), pos(bar, 8, jitter=0.001), 0.9)",
        "            _p = pos(bar, 8, jitter=0.001); add(claps, pan(clap1, 0.0), _p, 0.9); EV.append(('clap', _p, 0.9))")
    rep("                add(rims, pan(rim1, 0.35), pos(bar, st, swing=SW, jitter=0.001), v)",
        "                _p = pos(bar, st, swing=SW, jitter=0.001); add(rims, pan(rim1, 0.35), _p, v); EV.append(('rim', _p, float(v)))")
    rep("                add(perc, pan(toms[m], -0.3 if i % 2 == 0 else 0.3), pos(bar, st, swing=SW, jitter=0.002),\n"
        "                    v * (1 + 0.1 * rng.standard_normal()))",
        "                _p = pos(bar, st, swing=SW, jitter=0.002); _v = v * (1 + 0.1 * rng.standard_normal()); "
        "add(perc, pan(toms[m], -0.3 if i % 2 == 0 else 0.3), _p, _v); EV.append(('tom', _p, m + TRANSPOSE, i % 2, float(_v)))")
    rep("            add(lead, fm_pluck(m, BELL_LEN[st] * STEP, vel), pos(bar, st, swing=SW * 0.5, jitter=0.003))",
        "            _p = pos(bar, st, swing=SW * 0.5, jitter=0.003); add(lead, fm_pluck(m, BELL_LEN[st] * STEP, vel), _p); "
        "EV.append(('lead', _p, m + TRANSPOSE, BELL_LEN[st], float(vel), bar, st))")
    rep("        add(riser, riser1, pos(a), g)", "        _p = pos(a); add(riser, riser1, _p, g); EV.append(('riser', _p, g))")
    rep("        padL += g * (saw_blep(N, f * 2 ** (-6 / 1200), rng.random(), SR) + saw_blep(N, f * 2 ** (3 / 1200), rng.random(), SR))",
        "        padL += g * (saw_blep(N, f * 2 ** (-6 / 1200), _ph(), SR) + saw_blep(N, f * 2 ** (3 / 1200), _ph(), SR))")
    rep("        padR += g * (saw_blep(N, f * 2 ** (6 / 1200), rng.random(), SR) + saw_blep(N, f * 2 ** (-2 / 1200), rng.random(), SR))",
        "        padR += g * (saw_blep(N, f * 2 ** (6 / 1200), _ph(), SR) + saw_blep(N, f * 2 ** (-2 / 1200), _ph(), SR))")
    # numba's on-disk cache wants an importable module; this source only exists in memory.
    rep("@njit(cache=True)", "@njit", 4)
    src = src.replace("\ndef render(stems_dir=None):", "\nEV = []\nPAD = []\n\n\ndef _ph():\n    x = rng.random()\n    PAD.append(float(x))\n    return x\n\n\ndef render(stems_dir=None):")
    return src


def run_reference(work, verify):
    ns = {"__name__": "gezeiten_reference", "__file__": str(REF)}
    exec(compile(patched_source(), str(REF), "exec"), ns)
    mix = ns["render"](str(work / "stems"))
    rng = ns["rng"]
    dither = (rng.random(mix.shape) - rng.random(mix.shape)) / 32768.0
    master = np.clip((mix + dither).T * 32767, -32768, 32767).astype(np.int16)
    if verify:
        ref, _ = sf.read(verify, dtype="int16")
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


def register_group(entries, ups=None):
    """entries: [(key, release, [(root, [(file, samples at 44.1 kHz)])])], one scale across them
    (kept in SCALE[key]: file = the reference's sample × scale). Each instrument is written
    twice: at 48 kHz (`key`, the devices' rate) and as the reference's own samples at 44.1 kHz
    (`key@44`, files `…-44`), which the renderer picks when the output runs at 44.1 kHz.
    `ups`: a name's own 48 kHz version, where plain resampling is not it (the noise's loop)."""
    ups = dict(ups or {})
    for _, _, zones in entries:
        for _, rr in zones:
            for name, x in rr:
                ups.setdefault(name, up(x))
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


def register(key, release, zones, ups=None):
    register_group([(key, release, zones)], ups)


# Halbschatten's kit, where the reference makes the very same sample (its function, its seed, its
# pan): our part × Halbschatten's scale must be its file.
SHARED = [("hsChh%d" % i, "hs-chh-%d" % i, "hat_closed_%d" % i, 0.18, 12500) for i in range(3)] \
    + [("hsOhh%d" % i, "hs-ohh-%d" % i, "hat_open_%d" % i, -0.15, 12500) for i in range(2)] \
    + [("hsShk%d" % i, "hs-shk-%d" % i, "shaker_%d" % i, 0.4, None) for i in range(3)] \
    + [("hsClap", "hs-clap", "clap", 0.0, None)]


def caf(name):
    """A committed .caf as float samples, (channels, n)."""
    with tempfile.TemporaryDirectory() as d:
        wav = Path(d) / "x.wav"
        subprocess.run(["afconvert", "-f", "WAVE", "-d", "LEI16", str(OUT / f"{name}.caf"), str(wav)], check=True)
        x, sr = sf.read(wav, dtype="float64")
    return (x.T if x.ndim == 2 else x), sr


def main():
    keep = Path(sys.argv[sys.argv.index("--keep") + 1]) if "--keep" in sys.argv else None
    verify = sys.argv[sys.argv.index("--verify") + 1] if "--verify" in sys.argv else None
    work = keep or Path(tempfile.mkdtemp(prefix="gezeiten-"))
    work.mkdir(parents=True, exist_ok=True)
    ns = run_reference(work, verify)
    parts = work / "parts"
    rsr, STEP, BARS = ns["SR"], ns["STEP"], ns["BAR"]
    pan, lp = ns["pan"], ns["lp"]

    def part(name):
        x, sr = sf.read(parts / f"{name}.wav", dtype="float64")
        assert sr == rsr
        return x.T if x.ndim == 2 else x

    def tail(x, seconds=0.01):
        return np.concatenate([x, np.zeros(x.shape[:-1] + (int(seconds * rsr),))], axis=-1)

    # What is Halbschatten's: the same samples, so the same files.
    halb = json.loads(HALB.read_text())["scale"]
    for key, file, name, p, lowpass in SHARED:
        x = pan(part(name), p)
        if lowpass:
            x = lp(tail(x), lowpass)
        have, sr = caf(file + "-44")
        assert sr == 44100 and have.shape == x.shape, (file, have.shape, x.shape)
        worst = float(np.abs(have - x * halb[key]).max())
        assert worst < 2.5 / 32768, (file, worst)
        SCALE[key] = halb[key]
    for name in ("hall", "room"):
        ir = part(f"ir_{name}")
        have, sr = sf.read(OUT / f"hs-ir-{name}-44.wav", dtype="float64")
        assert sr == 44100 and have.T.shape == ir.shape and float(np.abs(have.T - ir).max()) < 1e-6, name
    print(f"{len(SHARED)} one-shots and both impulses are Halbschatten's files")

    # The kick: a kit named kick… ducks (BandRenderer).
    register("kickGZ", 0.03, [(0, [("gz-kick", part("kick"))])])
    register("gzRim", 0.05, [(0, [("gz-rim", pan(part("rim"), 0.35))])])
    toms = sorted({(e[2], e[3]) for e in ns["EV"] if e[0] == "tom"})
    for m, side in toms:
        register(f"gzTom{m}{'LR'[side]}", 0.05, [(0, [(f"gz-tom-{m}-{'lr'[side]}", pan(part(f"tom_{m}"), -0.3 if side == 0 else 0.3))])])
    # The bass: every (length, pitch) the line plays, the bus's 520 Hz lowpass in the note.
    bass = {}
    for e in ns["EV"]:
        if e[0] == "bass":
            bass.setdefault(e[3], set()).add(e[2])
    register_group([(f"gzBass{int(ln * 10)}", 0.05,
                     [(m, [(f"gz-bass-{int(ln * 10)}-{m}", lp(tail(ns["bass_note"](m - ns["TRANSPOSE"], ln * STEP, 1.0), 0.05), 520))])
                      for m in sorted(ms)]) for ln, ms in sorted(bass.items())])
    # The raw stab buffers, one instrument per variant, a zone per chord (its lowest note). The
    # renderer sends an instrument named hsStab… into the rack's stab bus.
    roots = {name: ns["CH"][k][0] for k, name in ns["CH_NAME"].items()}
    register_group([(f"hsStabGz{j}", 0.05, [(root, [(f"gz-stab-{c.lower()}-{j}", part(f"stab_raw_{c}_{j}"))]) for c, root in roots.items()])
                    for j in range(2)])
    # The riser: the sweep and the two bars of wash after it, one sample played at four gains.
    register("gzRiser", 0.2, [(0, [("gz-riser", part("riser_one"))])])
    # The noise tile, and its first sample again at the end: the rack reads frames 0 … count − 2
    # and wraps, so the loop is the tile, as the reference repeats it. At 48 kHz the tile is
    # resampled as a loop (its own ends around it), so the seam is the loop's there too.
    tile = part("noise_tile")
    pad_ = 2048
    around = up(np.concatenate([tile[:, -pad_:], tile, tile[:, :pad_]], axis=1))
    lead48 = round(pad_ * 160 / 147)
    n48 = round(tile.shape[1] * 160 / 147)
    assert n48 * 147 == tile.shape[1] * 160
    tile48 = around[:, lead48:lead48 + n48 + 1]
    register("gzNoise", 0.2, [(0, [("gz-noise", np.concatenate([tile, tile[:, :1]], axis=1))])], ups={"gz-noise": tile48})

    manifest = json.loads((OUT / "instruments.json").read_text())
    for key in [k for k in manifest if k.startswith("gz") or k.startswith("kickGZ") or k.startswith("hsStabGz")]:
        manifest.pop(key)
    manifest.update(INSTRUMENTS)
    (OUT / "instruments.json").write_text(json.dumps(manifest, indent=1) + "\n")
    for p in FILES:
        subprocess.run(["afconvert", "-f", "caff", "-d", "alac", str(p), str(p.with_suffix(".caf"))], check=True)
        p.unlink()

    gains = json.loads((parts / "gains.json").read_text())
    events = [[e[0], e[1] / rsr] + list(e[2:]) for e in ns["EV"]]
    mix = {k: ns[k] for k in ("STAB_ENV", "STAB_ENV_TIME", "ECHO_RETURN", "LEAD_DB", "LEAD_ECHO_RETURN", "LEAD_HALL", "SW", "ECHO_STEPS",
                              "ECHO_LP", "ECHO_HP", "LEAD_ECHO_STEPS", "LEAD_ECHO_FB", "STAB_LFO_BARS", "PAD_NOTES")}
    EVENTS.write_text(json.dumps({
        "tempo": ns["BPM"], "bars": ns["NBARS"], "tail": ns["TAIL"], "gains": gains, "scale": SCALE, "mix": mix,
        "lanes": {k: [list(p) for p in v] for k, v in ns["LANES"].items()},
        "chords": {name: ns["CH"][k] for k, name in ns["CH_NAME"].items()},
        "pad": ns["PAD"], "events": events,
    }, separators=(",", ":")).replace("],[", "],\n[") + "\n")
    total = sum(p.stat().st_size for p in OUT.glob("gz-*"))
    print(f"{len(events)} events, {len(list(OUT.glob('gz-*')))} files, {total / 1e6:.1f} MB; stems and parts in {work}")


main()
