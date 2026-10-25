#!/usr/bin/env python3
"""Author the A1 band: a 12-bar blues shuffle in C, written as data the app plays.

    python3 apps/takt/scripts/band.py      -> Takt/Content/band-blues-C.json

Time is in ticks, 12 per beat (a triplet eighth = 4 ticks, the shuffle's late eighth = tick 8),
48 per bar, 576 per 12-bar loop; `t` is the tick within the loop. Notes are MIDI numbers with
C4 = 60. Drums name a one-shot from Takt/Sounds; `gainDb` per sound is the drum mix (every
one-shot in Takt/Sounds is normalized to -3 dBFS peak).
"""
import json
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "Takt/Content/band-blues-C.json"

TPB, BAR = 12, 48
FORM = ["C", "C", "C", "C", "F", "F", "C", "C", "G", "F", "C", "G"]
PC = {"C": 0, "F": 5, "G": 7}

# Bass roots in the sub register (C2, F1, G1): the 202 sub one-shots are G1, A1 and C2.
BASS_ROOT = {"C": 36, "F": 29, "G": 31}
# Rootless voicings around middle C: C9 (E Bb D), F13 (Eb A D), G13 (F B E).
KEYS = {"C": [52, 58, 62], "F": [51, 57, 62], "G": [53, 59, 64]}
# Horns: 3rd and b7, an octave up.
HORNS = {"C": [64, 70], "F": [63, 69], "G": [65, 71]}

SOUNDS = {
    "kick": {"file": "kick", "gainDb": -6},
    "snare": {"file": "snare", "gainDb": -10},
    "rimshot": {"file": "rimshot", "gainDb": -12},
    "ch": {"file": "ch", "gainDb": -21},
    "oh": {"file": "oh", "gainDb": -19},
    "ride": {"file": "ride", "gainDb": -15},
}
# The 202 sub, by root note; the app plays the nearest one, repitched.
SUBS = [{"file": "sub-G1", "root": 31}, {"file": "sub-A1", "root": 33}, {"file": "sub-C2", "root": 36}]


def drums():
    ev = []
    for b in range(12):
        o = b * BAR
        # Kick on 1 and 3, a ghost on the last triplet of 4 every other bar.
        ev += [{"t": o, "s": "kick", "v": 1.0}, {"t": o + 24, "s": "kick", "v": 0.85}]
        if b % 2 == 1:
            ev.append({"t": o + 44, "s": "kick", "v": 0.45})
        # Snare on 2 and 4.
        ev += [{"t": o + 12, "s": "snare", "v": 0.9}, {"t": o + 36, "s": "snare", "v": 0.95}]
        # Ride shuffle: every beat and its late eighth.
        for beat in range(4):
            ev.append({"t": o + beat * TPB, "s": "ride", "v": 0.9 if beat % 2 == 0 else 0.8})
            ev.append({"t": o + beat * TPB + 8, "s": "ride", "v": 0.55})
        # Foot hat on 2 and 4.
        ev += [{"t": o + 12, "s": "ch", "v": 0.7}, {"t": o + 36, "s": "ch", "v": 0.7}]
    # Turnaround: open hat into the top of the form.
    ev.append({"t": 11 * BAR + 44, "s": "oh", "v": 0.6})
    return ev


def bass():
    ev = []
    for b, chord in enumerate(FORM):
        o, r = b * BAR, BASS_ROOT[chord]
        # R, 3, 5, 6 on the beats, the 5 again on the last triplet of 4.
        for t, iv, v in [(0, 0, 0.95), (12, 4, 0.8), (24, 7, 0.9), (36, 9, 0.8), (44, 7, 0.6)]:
            ev.append({"t": o + t, "n": r + iv, "v": v, "len": 8 if t == 44 else 10})
    return ev


def keys():
    ev = []
    for b, chord in enumerate(FORM):
        o = b * BAR
        hits = [(20, 3, 0.7), (44, 3, 0.75)]
        if b % 4 == 0:
            hits.insert(0, (0, 18, 0.6))
        for t, ln, v in hits:
            ev += [{"t": o + t, "n": n, "v": v, "len": ln} for n in KEYS[chord]]
    return ev


def horns():
    ev = []
    for b, chord in enumerate(FORM):
        o = b * BAR
        if b in (0, 4, 8):
            hits = [(0, 6, 0.85), (8, 3, 0.7)]
        elif b in (3, 7, 11):
            hits = [(36, 3, 0.7), (44, 3, 0.8)]
        else:
            continue
        for t, ln, v in hits:
            ev += [{"t": o + t, "n": n, "v": v, "len": ln} for n in HORNS[chord]]
    return ev


band = {
    "name": "Blues shuffle in C",
    "ticksPerBeat": TPB,
    "beatsPerBar": 4,
    "bars": 12,
    "form": FORM,
    "sounds": SOUNDS,
    "subs": SUBS,
    "channels": {
        "drums": sorted(drums(), key=lambda e: e["t"]),
        "bass": sorted(bass(), key=lambda e: e["t"]),
        "keys": sorted(keys(), key=lambda e: e["t"]),
        "horns": sorted(horns(), key=lambda e: e["t"]),
    },
}
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(band, indent=1) + "\n")
print(OUT, {k: len(v) for k, v in band["channels"].items()})
