#!/usr/bin/env python3
"""Restlicht's sounds and events, cut from the reference render itself (the takt-electronic
skill; `gegenlicht.py` for the fourth record, the first on the electro rack).

    <venv with numpy, scipy, numba, soundfile>/bin/python apps/takt/scripts/restlicht.py [--keep <dir>] [--verify <master>]

`misc/restlicht_reference.py` is the record (`misc/RESTLICHT.md` the brief). It logs itself:
with a stems dir it writes `parts/` (every one-shot, both impulses, gains.json and events.json,
every event at its sample), and the log draws nothing from the random stream, so nothing is
patched here. `--verify` checks the master against `misc/restlicht/reference.flac` (or any
master the reference wrote): this Mac's numpy/scipy/numba round a few hundred samples of
twenty-one million a bit differently, so the bar is at most 1 LSB on at most one sample in ten
thousand.

It writes

- `Takt/Sounds/rl-*.caf`: every one-shot at 48 kHz and as it is at 44.1 (`…-44`, instruments
  `…@44`): the kick and the ghost kick at the centre (the ghost under a name that does not start
  with "kick": the renderer ducks on a kick… kit, and the reference's ghost does not fire the
  duck), the snares at the centre, the hats with their pans and the hat bus's 12.5 kHz lowpass
  baked in, the shakers and the rim with their pans, the two toms mono (each hit has its own
  pan), and the noise bed's first 32 s (the rack loops it);
- `Takt/Sounds/rl-ir-{hall,room}-{44,48}.wav`: the impulses, float (the 48 kHz ones × 147/160,
  so the same curve holds the same energy);
- `scripts/songs/restlicht-events.json`: every event with its time in seconds, the resolved
  gains, each file's scale, the pad's phases and every lane, read out of the reference's source
  (so a lane is written once, there), for `songs/restlicht.py`.

`--keep <dir>` leaves the reference's stems and parts there (the A/B: scripts/takt/rl-ab.py).
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
REF = REPO / "misc/restlicht_reference.py"
FLAC = REPO / "misc/restlicht/reference.flac"
OUT = HERE.parent / "Takt/Sounds"
EVENTS = HERE / "songs/restlicht-events.json"
SR = 48000
PEAK = 0.89


def run_reference(work, verify):
    ns = {"__name__": "restlicht_reference", "__file__": str(REF)}
    exec(compile(REF.read_text(), str(REF), "exec"), ns)
    mix = ns["render"](str(work / "stems"))
    rng = ns["rng"]
    dither = (rng.random(mix.shape) - rng.random(mix.shape)) / 32768.0
    master = np.clip((mix + dither).T * 32767, -32768, 32767).astype(np.int16)
    if verify and Path(verify).exists():
        ref, _ = sf.read(verify, dtype="int16")
        assert ref.shape == master.shape, (ref.shape, master.shape)
        d = np.abs(ref.astype(np.int32) - master.astype(np.int32))
        assert d.max() <= 1 and (d > 0).mean() < 1e-4, ("the render is not the reference", int(d.max()), float((d > 0).mean()))
        print(f"the render is the reference: {int((d > 0).sum())} of {d.size} samples one LSB apart")
    else:
        print(f"not verified: no master at {verify} (the handoff's reference.flac is not in git)")
    sf.write(work / "master.wav", master, 44100, subtype="PCM_16")
    return ns


def lanes(nbars):
    """Every lane, as the reference writes it: the list inside its `auto(...)` call, by the line
    that holds it. A lane through `np.exp` is a log lane (its values are logs). The hat level
    and the shaker's fade are not here: they are in the events' gains."""
    src = REF.read_text()
    ns = {"np": np, "NBARS": nbars}

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
        "bassTau": grab("ftau = auto("),
        "bassBase": grab("b_base = np.exp(auto("),      # log
        "bassAmount": grab("b_amt = auto("),
        "bassQ": grab("b_q = auto("),
        "bassDrive": grab("b_drive = auto("),
        "leadLevel": grab("lead = lp(lead, 2600) * auto("),
        "echoFeedback": grab("fb = auto("),
        "snareSend": grab("sn_send = auto("),
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


def register_group(entries):
    """entries: [(key, release, file, samples at 44.1 kHz)], one scale across them (SCALE[key]:
    file = the reference's sample × scale), at 48 kHz (`key`) and 44.1 (`key@44`)."""
    ups = {name: up(x) for _, _, name, x in entries}
    k = min(PEAK / max(np.abs(x).max() for x in ups.values()), 0.99 / max(np.abs(x).max() for _, _, _, x in entries))
    for key, release, name, x in entries:
        for suffix, rate in (("", SR), ("-44", 44100)):
            write(name + suffix, (ups[name] if rate == SR else x) * k, rate)
            INSTRUMENTS[key + ("@44" if suffix else "")] = {"release": release, "zones": [{"root": 0, "vel": 1.0, "files": [name + suffix]}]}
        SCALE[key] = float(k)


def main():
    keep = Path(sys.argv[sys.argv.index("--keep") + 1]) if "--keep" in sys.argv else None
    verify = sys.argv[sys.argv.index("--verify") + 1] if "--verify" in sys.argv else str(FLAC)
    work = keep or Path(tempfile.mkdtemp(prefix="restlicht-"))
    work.mkdir(parents=True, exist_ok=True)
    ns = run_reference(work, verify)
    parts = work / "parts"
    rsr = ns["SR"]
    pan, lp = ns["pan"], ns["lp"]

    def part(name):
        x, sr = sf.read(parts / f"{name}.wav", dtype="float64")
        assert sr == rsr
        return x.T if x.ndim == 2 else x

    def tail(x, seconds=0.01):
        return np.concatenate([x, np.zeros(x.shape[:-1] + (int(seconds * rsr),))], axis=-1)

    # The kick at the centre (−3 dB a side, the reference's pan law); its name starts with
    # "kick", so the renderer ducks on it. The ghost (the short one-shot on step 15 of every
    # fourth bar) shares its bus and its scale and does not: `rlGhost`.
    register_group([("kickRL", 0.03, "rl-kick", pan(part("kick"), 0.0)), ("rlGhost", 0.03, "rl-ghost", pan(part("kick_ghost"), 0.0))])
    register_group([(f"rlSnare{i}", 0.05, f"rl-snare-{i}", pan(part(f"snare_{i}"), 0.0)) for i in range(2)])
    # The hats with their pans and the hat bus's lowpass (a filter on the sum is the sum of the
    # filtered hits); one scale for the five, as they share a bus.
    register_group([(f"rlChh{i}", 0.05, f"rl-chh-{i}", lp(tail(pan(part(f"hat_closed_{i}"), 0.2)), 12500)) for i in range(3)]
                   + [(f"rlOhh{i}", 0.05, f"rl-ohh-{i}", lp(tail(pan(part(f"hat_open_{i}"), -0.15)), 12500)) for i in range(2)])
    register_group([(f"rlShk{i}", 0.05, f"rl-shk-{i}", pan(part(f"shaker_{i}"), -0.4)) for i in range(3)])
    register_group([("rlRim", 0.05, "rl-rim", pan(part("rim"), 0.35))])
    # The toms mono: a pan per hit (the hit's `p`).
    register_group([(f"rlTom{m}", 0.05, f"rl-tom-{m}", part(f"tom_{m}")) for m in (45, 50)])
    # The noise bed's first 32 s, and its first sample again at the end (the rack reads frames
    # 0 … count − 2 and wraps). The reference draws all 238 s, so the loop is not the record's
    # noise after 32 s (Halbschatten's and Gegenlicht's case, not Gezeiten's).
    bed = part("noise_bed_first_32s")
    register_group([("rlNoise", 0.2, "rl-noise", np.concatenate([bed, bed[:, :1]], axis=1))])

    # The impulses, float, at both rates.
    for name in ("hall", "room"):
        ir = part(f"ir_{name}")
        lead = int(np.argmax(np.abs(ir).max(axis=0) > 0))
        sf.write(OUT / f"rl-ir-{name}-44.wav", ir.T.astype(np.float32), 44100, subtype="FLOAT")
        ir48 = np.concatenate([np.zeros((ir.shape[0], round(lead * 160 / 147))), up(ir[:, lead:]) * (147 / 160)], axis=1)
        sf.write(OUT / f"rl-ir-{name}-48.wav", ir48.T.astype(np.float32), 48000, subtype="FLOAT")
        print(f"ir {name}: {ir.shape[1] / 44100:.2f} s, {ir.shape[0]} channels, {lead} samples of predelay at 44.1 kHz")

    manifest = json.loads((OUT / "instruments.json").read_text())
    for key in [k for k in manifest if k.startswith("rl") or k.startswith("kickRL")]:
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
    nbars = log["bars"]
    EVENTS.write_text(json.dumps({
        "tempo": log["tempo"], "bars": nbars, "tail": log["tail"], "sr": rsr, "gains": gains, "scale": SCALE,
        "lanes": lanes(nbars), "pad": pad,
        "padBars": [list(ns["pad_notes"](b)) for b in range(nbars)],
        "events": events,
    }, separators=(",", ":")).replace("],[", "],\n[") + "\n")
    total = sum(p.stat().st_size for p in OUT.glob("rl-*"))
    print(f"{len(events)} events, {len(list(OUT.glob('rl-*')))} files, {total / 1e6:.1f} MB; stems and parts in {work}")


main()
