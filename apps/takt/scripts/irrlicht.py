#!/usr/bin/env python3
"""Irrlicht's sounds and events, cut from the reference render itself (the takt-electronic
skill; `streulicht.py` for the sixth record, the second on the moog rack).

    <venv with numpy, scipy, numba, soundfile>/bin/python apps/takt/scripts/irrlicht.py [--keep <dir>] [--verify <master>]

`misc/irrlicht_reference.py` is the record (`misc/IRRLICHT.md` the brief). It logs itself: with a
stems dir it writes `parts/` (every one-shot, the hat's noise buffer, both impulses, the shadow
bus whole, gains.json, drift.json and events.json, every event at its sample), and the log draws
nothing from the random stream, so nothing is patched here. `--verify` checks the master against
`misc/irrlicht/reference.flac`: at most 1 LSB on at most one sample in ten thousand.

It writes

- `Takt/Sounds/il-*.caf`: every sound at 48 kHz and as it is at 44.1 (`…-44`, instruments
  `…@44`): the kick at the centre, the claps and the open hats with their pans (the open hats
  with their bus's 10.5 kHz lowpass baked in), the two toms mono (a pan per hit), the closed
  hat's six seconds of noise, mono (every closed hat a slice of it), the noise bed's first 32 s;
- `Takt/Sounds/il-shadow-44.caf`: the shadow (a voice on B1 through a frequency shifter, which no
  key plays) as the reference baked it, before its gain and duck, from the bar it comes in to the
  one it leaves, at 44.1 kHz only (the console reads it at the song's position and resamples it
  at 48; it is lowpassed at 3.2 kHz). The script's shifter is an FFT Hilbert transform over the
  whole song, which no live voice can null;
- `Takt/Sounds/il-ir-{hall,room}-{44,48}.wav`: the impulses, float;
- `Takt/Sounds/il-drift.json`: the five slow wanders, each a unit curve at 100 Hz and its depth;
- `scripts/songs/irrlicht-events.json`: every event with its time in seconds, the resolved
  gains, each file's scale, the pad's phases, where the shadow's file starts and every lane, read
  out of the reference's source, for `songs/irrlicht.py`.

`--keep <dir>` leaves the reference's stems and parts there (the A/B: scripts/takt/il-ab.py).
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
REF = REPO / "misc/irrlicht_reference.py"
FLAC = REPO / "misc/irrlicht/reference.flac"
OUT = HERE.parent / "Takt/Sounds"
EVENTS = HERE / "songs/irrlicht-events.json"
SR = 48000
PEAK = 0.89


def run_reference(work, verify):
    ns = {"__name__": "irrlicht_reference", "__file__": str(REF)}
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
    that holds it. A lane through `np.exp` is a log lane (its values are logs); a lane through
    `coef` is one of time constants in seconds. The line's gate, the hats' level and decay and
    the open hat's level are not here: they are in the events."""
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
        "bassDecay": grab("b_adec = coef(auto("),       # seconds
        "bassSustain": grab("b_sus = auto("),
        "bassEnvelope": grab("b_fdec = coef(auto("),    # seconds
        "bassBase": grab("b_base = np.exp(auto("),      # log
        "bassAmount": grab("b_amt = auto("),
        "bassResonance": grab("b_res = auto("),
        "bassSend": grab("e_send = auto("),
        "bassFeedback": grab("    fb = auto("),
        "bassHall": grab("h_bass = auto("),
        "leadBase": grab("v_base = auto("),
        "leadLevel": grab("lead = hp(np.tanh(1.3 * y * amp * 1.4) / 1.3, 200) * auto("),
        "padCutoff": grab("pad_fc = auto("),
        "padLevel": grab("pad *= auto("),
        "noise": grab("noise = (bed * auto("),
    }


FILES = []
INSTRUMENTS = {}
SCALE = {}
SHADOW = {}


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
    work = keep or Path(tempfile.mkdtemp(prefix="irrlicht-"))
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
    # "kick", so the renderer ducks on it.
    register_group([("kickIL", 0.03, "il-kick", pan(part("kick"), 0.0))])
    register_group([(f"ilClap{i}", 0.05, f"il-clap-{i}", pan(part(f"clap_{i}"), 0.05)) for i in range(2)])
    # The open hats with their pan and their bus's lowpass (a filter on the sum is the sum of
    # the filtered hits).
    register_group([(f"ilOhh{i}", 0.05, f"il-ohh-{i}", lp(tail(pan(part(f"hat_open_{i}"), -0.2)), 10500)) for i in range(2)])
    # The toms mono: a pan per hit.
    register_group([(f"ilTom{m}", 0.05, f"il-tom-{m}", part(f"tom_{m}")) for m in (47, 54)])
    # The closed hat's noise, mono, whole: a hit plays a slice of it under its own envelope.
    register_group([("ilHatNoise", 0.05, "il-hat-noise", part("hat_noise"))])
    # The noise bed's first 32 s, and its first sample again at the end (the rack reads frames
    # 0 … count − 2 and wraps). The reference draws all 256 s, so the loop is not the record's
    # noise after 32 s.
    bed = part("noise_bed_first_32s")
    register_group([("ilNoise", 0.2, "il-noise", np.concatenate([bed, bed[:, :1]], axis=1))])

    # The shadow, as baked, from the first bar it sounds in to the last sample it sounds, at
    # 44.1 kHz (both keys name the one file), one sample of silence after it.
    shadow = part("shadow_bus")
    loud = np.nonzero(np.abs(shadow).max(axis=0) > 0)[0]
    bar_samples = ns["BAR"] * rsr
    first_bar = int(loud[0] // bar_samples)
    start = int(round(first_bar * bar_samples))
    assert np.abs(shadow[:, :start]).max() == 0, "the shadow is silent before its first bar"
    clip = np.concatenate([shadow[:, start:loud[-1] + 1], np.zeros((2, 1))], axis=1)
    k = PEAK / np.abs(clip).max()
    write("il-shadow-44", clip * k, 44100)
    INSTRUMENTS["ilShadow"] = {"release": 0.05, "zones": [{"root": 0, "vel": 1.0, "files": ["il-shadow-44"]}]}
    INSTRUMENTS["ilShadow@44"] = INSTRUMENTS["ilShadow"]
    SCALE["ilShadow"] = float(k)
    SHADOW["from"] = start / bar_samples
    print(f"shadow: bars {start / bar_samples:.3f} to {(loud[-1] + 1) / bar_samples:.2f}, {clip.shape[1] / rsr:.1f} s")

    # The five drifts: the curves the reference drew, rounded as its own log rounds them.
    drift = json.loads((parts / "drift.json").read_text())["curves"]
    (OUT / "il-drift.json").write_text(json.dumps({k: {"cents": v["cents"], "rate": v["rate_hz"], "curve": v["unit_curve"]} for k, v in drift.items()},
                                                  separators=(",", ":")) + "\n")

    # The impulses, float, at both rates.
    for name in ("hall", "room"):
        ir = part(f"ir_{name}")
        lead = int(np.argmax(np.abs(ir).max(axis=0) > 0))
        sf.write(OUT / f"il-ir-{name}-44.wav", ir.T.astype(np.float32), 44100, subtype="FLOAT")
        ir48 = np.concatenate([np.zeros((ir.shape[0], round(lead * 160 / 147))), up(ir[:, lead:]) * (147 / 160)], axis=1)
        sf.write(OUT / f"il-ir-{name}-48.wav", ir48.T.astype(np.float32), 48000, subtype="FLOAT")
        print(f"ir {name}: {ir.shape[1] / 44100:.2f} s, {ir.shape[0]} channels, {lead} samples of predelay at 44.1 kHz")

    manifest = json.loads((OUT / "instruments.json").read_text())
    for key in [k for k in manifest if (k.startswith("il") and k[2:3].isupper()) or k.startswith("kickIL")]:
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
        "lanes": lanes(nbars), "pad": pad, "shadowFrom": SHADOW["from"],
        "padBars": [list(ns["pad_notes"](b)) for b in range(nbars)],
        "events": events,
    }, separators=(",", ":")).replace("],[", "],\n[") + "\n")
    total = sum(p.stat().st_size for p in OUT.glob("il-*"))
    print(f"{len(events)} events, {len(list(OUT.glob('il-*')))} files, {total / 1e6:.1f} MB; stems and parts in {work}")


main()
