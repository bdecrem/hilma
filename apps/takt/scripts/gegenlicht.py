#!/usr/bin/env python3
"""Gegenlicht's sounds and events, cut from the reference render itself (the takt-electronic
skill; `gezeiten.py` for the third record, the first on the acid rack).

    <venv with numpy, scipy, numba, soundfile>/bin/python apps/takt/scripts/gegenlicht.py [--keep <dir>] [--verify <master>]

`misc/gegenlicht_reference.py` is the record (`misc/GEGENLICHT.md` the brief). It logs itself:
with a stems dir it writes `parts/` (every one-shot, the three impulses, gains.json and
events.json, every event at its sample), and the log draws nothing from the random stream, so
nothing is patched here. `--verify` checks the master against `misc/gegenlicht/reference.flac`
(or any master the reference wrote): this Mac's numpy/scipy/numba round one sample in twenty
million a bit differently, so the bar is at most 1 LSB on at most one sample in a million.

It writes

- `Takt/Sounds/gl-*.caf`: every one-shot at 48 kHz and as it is at 44.1 (`…-44`, instruments
  `…@44`): the kick (mono, it goes into the rack's kick bus), the hats with their pans and the
  hat bus's 13 kHz lowpass baked in, the ride, the shaker, the clap and the rim with theirs, the
  crash (already stereo), the three toms with the tom bus's 110 Hz highpass (mono: each hit has
  its own pan), the six pings (mono, one per velocity, the same), the five risers (stereo), and
  the noise bed's first 32 s (the rack loops it);
- `Takt/Sounds/gl-ir-{hall,room,rumble}-{44,48}.wav`: the impulses, float (the 48 kHz ones ×
  147/160, so the same curve holds the same energy);
- `scripts/songs/gegenlicht-events.json`: every event with its time in seconds, the resolved
  gains, each file's scale, the pad's phases and every lane, read out of the reference's source
  (so a lane is written once, there), for `songs/gegenlicht.py`.

`--keep <dir>` leaves the reference's stems and parts there (the A/B: scripts/takt/gl-ab.py).
"""
import ast
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy import signal

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent.parent
REF = REPO / "misc/gegenlicht_reference.py"
FLAC = REPO / "misc/gegenlicht/reference.flac"
OUT = HERE.parent / "Takt/Sounds"
EVENTS = HERE / "songs/gegenlicht-events.json"
SR = 48000
PEAK = 0.89


def run_reference(work, verify):
    ns = {"__name__": "gegenlicht_reference", "__file__": str(REF)}
    exec(compile(REF.read_text(), str(REF), "exec"), ns)
    mix = ns["render"](str(work / "stems"))
    rng = ns["rng"]
    dither = (rng.random(mix.shape) - rng.random(mix.shape)) / 32768.0
    master = np.clip((mix + dither).T * 32767, -32768, 32767).astype(np.int16)
    if verify:
        ref, _ = sf.read(verify, dtype="int16")
        assert ref.shape == master.shape, (ref.shape, master.shape)
        d = np.abs(ref.astype(np.int32) - master.astype(np.int32))
        assert d.max() <= 1 and (d > 0).mean() < 1e-6, ("the render is not the reference", int(d.max()), float((d > 0).mean()))
        print(f"the render is the reference: {int((d > 0).sum())} of {d.size} samples one LSB apart")
    sf.write(work / "master.wav", master, 44100, subtype="PCM_16")
    return ns


def lanes():
    """Every lane, as the reference writes it: the list inside its `auto(...)` call, by the line
    that holds it. A lane through `np.exp` is a log lane (its values are logs)."""
    src = REF.read_text()
    ns = {"np": np, "NBARS": 128}

    def grab(prefix):
        i = src.index(prefix)
        j = src.index("auto(", i) + len("auto(")
        depth, k = 0, j
        while True:
            c = src[k]
            depth += c == "["
            depth -= c == "]"
            k += 1
            if depth == 0:
                break
        return [[float(a), float(b)] for a, b in eval(src[j:k], ns)]

    return {
        "kickCutoff": grab("kfc = np.exp(auto("),       # log
        "kickGain": grab("kick *= auto("),
        "rumble": grab("rum *= auto("),
        "acidTau": grab("ftau = auto("),
        "acidBase": grab("a_base = np.exp(auto("),      # log
        "acidAmount": grab("a_amt = auto("),
        "acidQ": grab("a_q = auto("),
        "acidDrive": grab("a_drive = auto("),
        "acidFeedback": grab("fb = auto("),
        "pingCutoff": grab("pfc = np.exp(auto("),       # log
        "padCutoff": grab("pad_fc = auto("),
        "padLevel": grab("pad *= auto("),
        "noise": grab("noise = (bed * auto("),
    }


FILES = []
INSTRUMENTS = {}
SCALE = {}


def up(x):
    """44.1 → 48 kHz, along the last axis."""
    return signal.resample_poly(x, 160, 147, axis=-1, window=("kaiser", 12.0))


def write(name, x, sr=SR):
    assert np.abs(x).max() <= 1.0, (name, np.abs(x).max())
    p = OUT / f"{name}.wav"
    sf.write(p, (x.T if x.ndim == 2 else x).astype(np.float32), sr, subtype="PCM_16")
    FILES.append(p)


def register_group(entries, ups=None):
    """entries: [(key, release, [(root, [(file, samples at 44.1 kHz)])])], one scale across them
    (SCALE[key]: file = the reference's sample × scale), at 48 kHz (`key`) and 44.1 (`key@44`)."""
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


def register(key, release, x, ups=None):
    name = "gl-" + re.sub(r"(?<!^)(?=[A-Z0-9])", "-", key[2:]).lower()
    register_group([(key, release, [(0, [(name, x)])])], {name: ups} if ups is not None else None)


def main():
    keep = Path(sys.argv[sys.argv.index("--keep") + 1]) if "--keep" in sys.argv else None
    verify = sys.argv[sys.argv.index("--verify") + 1] if "--verify" in sys.argv else str(FLAC)
    work = keep or Path(tempfile.mkdtemp(prefix="gegenlicht-"))
    work.mkdir(parents=True, exist_ok=True)
    ns = run_reference(work, verify)
    parts = work / "parts"
    rsr = ns["SR"]
    pan, lp, hp = ns["pan"], ns["lp"], ns["hp"]

    def part(name):
        x, sr = sf.read(parts / f"{name}.wav", dtype="float64")
        assert sr == rsr
        return x.T if x.ndim == 2 else x

    def tail(x, seconds=0.01):
        return np.concatenate([x, np.zeros(x.shape[:-1] + (int(seconds * rsr),))], axis=-1)

    # The kick, mono: the rack's kick bus filters it, levels it and pans it to the centre. Its
    # name starts with "kick": the renderer ducks on a kick… kit.
    register_group([("kickGL", 0.03, [(0, [("gl-kick", part("kick"))])])])
    # The hats with their pans and the hat bus's lowpass (a filter on the sum is the sum of the
    # filtered hits); one scale for the five, as they share a bus.
    hats = [(f"glChh{i}", f"gl-chh-{i}", lp(tail(pan(part(f"hat_closed_{i}"), 0.2)), 13000)) for i in range(3)] \
        + [(f"glOhh{i}", f"gl-ohh-{i}", lp(tail(pan(part(f"hat_open_{i}"), -0.12)), 13000)) for i in range(2)]
    register_group([(k, 0.05, [(0, [(f, x)])]) for k, f, x in hats])
    register("glRide", 0.1, pan(part("ride"), 0.3))
    register("glCrash", 0.3, part("crash"))
    register_group([(f"glShk{i}", 0.05, [(0, [(f"gl-shk-{i}", pan(part(f"shaker_{i}"), -0.4))])]) for i in range(3)])
    register("glClap", 0.05, pan(part("clap"), 0.0))
    register("glRim", 0.05, pan(part("rim"), 0.4))
    # Toms and pings: mono, a pan per hit (the hit's `p`). The toms with the tom bus's highpass.
    register_group([(f"glTom{m}", 0.05, [(0, [(f"gl-tom-{m}", hp(tail(part(f"tom_{m}")), 110))])]) for m in (52, 55, 57)])
    pings = sorted(int(p.stem.split("_")[1]) for p in parts.glob("ping_*.wav"))
    register_group([(f"glPing{v:03d}", 0.05, [(0, [(f"gl-ping-{v:03d}", part(f"ping_{v:03d}"))])]) for v in pings])
    risers = sorted(int(p.stem[len("riser_bar"):]) for p in parts.glob("riser_bar*.wav"))
    register_group([(f"glRiser{b}", 0.2, [(0, [(f"gl-riser-{b}", part(f"riser_bar{b}"))])]) for b in risers])
    # The noise bed's first 32 s, and its first sample again at the end (the rack reads frames
    # 0 … count − 2 and wraps). The reference draws all 247 s, so the loop is not the record's
    # noise after 32 s (Halbschatten's case, not Gezeiten's).
    bed = part("noise_bed_first_32s")
    register("glNoise", 0.2, np.concatenate([bed, bed[:, :1]], axis=1))

    # The impulses, float, at both rates.
    for name in ("hall", "room", "rumble"):
        ir = part(f"ir_{name}")
        ir = ir if ir.ndim == 2 else ir[None, :]
        lead = int(np.argmax(np.abs(ir).max(axis=0) > 0))
        sf.write(OUT / f"gl-ir-{name}-44.wav", ir.T.astype(np.float32), 44100, subtype="FLOAT")
        ir48 = np.concatenate([np.zeros((ir.shape[0], round(lead * 160 / 147))), up(ir[:, lead:]) * (147 / 160)], axis=1)
        sf.write(OUT / f"gl-ir-{name}-48.wav", ir48.T.astype(np.float32), 48000, subtype="FLOAT")
        print(f"ir {name}: {ir.shape[1] / 44100:.2f} s, {ir.shape[0]} channel(s), {lead} samples of predelay at 44.1 kHz")

    manifest = json.loads((OUT / "instruments.json").read_text())
    for key in [k for k in manifest if k.startswith("gl") or k.startswith("kickGL")]:
        manifest.pop(key)
    manifest.update(INSTRUMENTS)
    (OUT / "instruments.json").write_text(json.dumps(manifest, indent=1) + "\n")
    for p in FILES:
        subprocess.run(["afconvert", "-f", "caff", "-d", "alac", str(p), str(p.with_suffix(".caf"))], check=True)
        p.unlink()

    gains = json.loads((parts / "gains.json").read_text())
    log = json.loads((parts / "events.json").read_text())
    events = []
    for kind, evs in log["events"].items():
        if kind == "pad":
            continue
        for e in evs:
            events.append([kind, e[0] / rsr] + e[1:])
    events.sort(key=lambda e: e[1])
    pad = {str(e[0]): e[1:] for e in log["events"]["pad"]}
    EVENTS.write_text(json.dumps({
        "tempo": log["tempo"], "bars": log["bars"], "tail": log["tail"], "sr": rsr, "gains": gains, "scale": SCALE,
        "lanes": lanes(), "pad": pad,
        "padChords": {"intro": [57, 64], "cycle": [list(c) for c in ns["PAD_CYCLE"]], "end": [57, 64, 71]},
        "events": events,
    }, separators=(",", ":")).replace("],[", "],\n[") + "\n")
    total = sum(p.stat().st_size for p in OUT.glob("gl-*"))
    print(f"{len(events)} events, {len(list(OUT.glob('gl-*')))} files, {total / 1e6:.1f} MB; stems and parts in {work}")


main()
