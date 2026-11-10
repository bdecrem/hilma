#!/usr/bin/env python3
"""Gegenlicht (backlight): techno in A minor at 128, 128 bars and the tail (4:07). The third
record Claude rendered in Python for Takt and the first that is not dub techno: one acid line, a
kick and its rumble, three clocks (4, 3 and 5 sixteenths) running against each other. Bart,
2026-11-10, on hearing it: "this is FANTASTIC". The record is `misc/gegenlicht_reference.py`
(the brief `misc/GEGENLICHT.md`); this is its song file.

    python3 apps/takt/scripts/songs/gegenlicht.py   -> Takt/Content/song-gegenlicht.json

Nothing here is written by ear. `scripts/gegenlicht.py` runs the reference, which logs every event
it places, and writes that log (`gegenlicht-events.json`) with the gains, each file's scale, the
pad's phases and the lanes read out of the reference's source. This script turns it into the band:

- drums: each hit at its own time (`late`), at its own gain (`g`), on the reference's one-shot,
  into its bus of the console (`AcidRack`): the kick into the kick bus (its frame is still the
  duck's), the toms and the pings each with their own pan (`p`);
- the acid line (horns): the console's 303, a note each, an accent at velocity 1, the gate the
  reference's to the sample (`hold`); a note that starts while the gate is open slides, as in
  the record (asserted below);
- the pad (keys): the console's gated saws, a note for every run of bars a pitch is on;
- `acidRack`: every lane, gain and setting the reference's own.

The parts, by the takt-chart skill (LEVELING.md, CHARTING.md):

- melody, "The acid": the record's line, every note, in its own octave (E2 to A3), and a line
  of the part's own where the record has no acid (bars 0–23 and 120–127: the sparse motif's
  accents, the whole sparse motif as the acid comes in). Home is A2 B2
  C3 D3 E3 under the right hand (the thumb on A2), where the sparse motif and most of motif A
  live; the notes that leave it (G2 and E2 under it, G3 and A3 over it) come in on the top
  rungs (`from`). The 1 of every two-bar motif and its answer on step 18 (both accents) are the
  anchors; the second accent and the notes on the beat the groove; the rest the 303's pushes and
  slides.
- chords, "The pad": the pad's chords as the record holds them, a hit a bar (A3 E4 under bar 32;
  then A3 E4 B4 · A3 F4 C5 · A3 E4 B4 · G3 D4 A4, four bars each; A3 E4 B4 from 88), the shape
  1 3 5 all song. The bar a chord arrives on is the anchor, the third bar of it the groove, the
  others the pushes.
"""
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import BAR, Song  # noqa: E402

D = json.loads((Path(__file__).resolve().parent / "gegenlicht-events.json").read_text())
G, K, LANES = D["gains"], D["scale"], D["lanes"]
TEMPO = D["tempo"]
RSR = D["sr"]
TICK = 60 / TEMPO / 12  # seconds
BARS = D["bars"]
BAR_S = TICK * BAR
TAIL_BARS = math.ceil(D["tail"] / BAR_S)

s = Song("song-gegenlicht", "Gegenlicht", "Techno", "A minor", int(TEMPO), "backlight",
         "Techno at 128, four minutes. One acid line on white keys, a kick and its rumble, three clocks against each other.",
         seed=1280)
s.human = 0
s.bars = BARS + TAIL_BARS
SECTIONS = [(0, "Light"), (8, "Rumble"), (16, "Toms"), (24, "Acid"), (32, "Clap"), (40, "Rim"), (48, "Break"), (56, "Motif B"),
            (64, "Ride"), (72, "Shaker"), (88, "The line alone"), (92, "Return"), (104, "Thinning"), (112, "Fading"), (120, "Out")]
for b, name in SECTIONS:
    s.section(b, name)

PC = D["padChords"]


def pad_notes(bar):
    """The reference's `pad_notes`; the last bar's chord holds through the tail."""
    bar = min(bar, BARS - 1)
    if bar < 32:
        return tuple(PC["intro"])
    if bar < 88:
        return tuple(PC["cycle"][((bar - 32) // 4) % 4])
    return tuple(PC["end"])


CHORD_NAME = {(57, 64): "A5", (57, 64, 71): "Asus2", (57, 65, 72): "F/A", (55, 62, 69): "Gsus2"}
s.chords = [CHORD_NAME[pad_notes(b)] for b in range(s.bars)]


def db(x):
    return round(20 * math.log10(x), 3)


def when(sec, ahead=0):
    """A time in seconds as (tick, late): the tick at or before it, and how much later than that
    tick it is. An event on the grid goes a tick early too, so the renderer places it by
    rounding its exact time, as the reference did."""
    x = sec / TICK
    t = math.floor(x) - ahead
    if x - t < 0.01:
        t -= 1
    t = max(0, t)
    return t, round(x - t, 5)


# MARK: Drums: every sound into a bus of the console (a rack bus has no fader of its own).

s.sounds = {
    # Into the kick bus at the reference's units: the bus filters it, levels it, × 0.66, centre.
    "kick": {"kit": "kickGL", "gainDb": db(1 / K["kickGL"]), "bus": "kick"},
    "ride": {"kit": "glRide", "gainDb": db(G["ride"] / K["glRide"]), "bus": "ride"},
    "crash": {"kit": "glCrash", "gainDb": db(G["crash"] / K["glCrash"]), "bus": "crash"},
    "clap": {"kit": "glClap", "gainDb": db(G["clap"] / K["glClap"]), "bus": "clap"},
    "rim": {"kit": "glRim", "gainDb": db(G["rim"] / K["glRim"]), "bus": "rim"},
    "xstick": {"kit": "rimMin", "gainDb": -27},  # the count-in's click only
}
for j in range(3):
    s.sounds[f"chh{j}"] = {"kit": f"glChh{j}", "gainDb": db(G["hats"] / K[f"glChh{j}"]), "bus": "hats"}
    s.sounds[f"shk{j}"] = {"kit": f"glShk{j}", "gainDb": db(G["shaker"] / K[f"glShk{j}"]), "bus": "shaker"}
for j in range(2):
    s.sounds[f"ohh{j}"] = {"kit": f"glOhh{j}", "gainDb": db(G["hats"] / K[f"glOhh{j}"]), "bus": "hats"}
for m in (52, 55, 57):
    s.sounds[f"tom{m}"] = {"kit": f"glTom{m}", "gainDb": db(G["toms"] / K[f"glTom{m}"]), "bus": "toms"}
PINGS = sorted({round(e[2] * 100) for e in D["events"] if e[0] == "ping"})
for v in PINGS:
    # At the reference's units: the ping bus filters and echoes them before its gain.
    s.sounds[f"ping{v:03d}"] = {"kit": f"glPing{v:03d}", "gainDb": db(1 / K[f"glPing{v:03d}"]), "bus": "ping"}
RISERS = sorted({round(e[1] / BAR_S) for e in D["events"] if e[0] == "riser"})
for b in RISERS:
    s.sounds[f"riser{b}"] = {"kit": f"glRiser{b}", "gainDb": db(G["riser"] / K[f"glRiser{b}"]), "bus": "riser"}


def hit(sec, sound, g=1.0, p=None):
    t, late = when(sec)
    e = {"t": t, "s": sound, "v": 1.0, "late": late}
    if g != 1.0:
        e["g"] = round(g, 6)
    if p is not None:
        e["p"] = round(p, 6)
    s.drums.append(e)


ACID = []
for e in D["events"]:
    kind, sec = e[0], e[1]
    if kind == "kick":
        hit(sec, "kick")
    elif kind in ("hatc", "hato", "shaker"):
        hit(sec, {"hatc": "chh", "hato": "ohh", "shaker": "shk"}[kind] + str(e[3]), e[2])
    elif kind in ("ride", "clap", "rim", "crash"):
        hit(sec, kind, e[2])
    elif kind == "tom":
        hit(sec, f"tom{e[2]}", e[3], e[4])
    elif kind == "ping":
        hit(sec, f"ping{round(e[2] * 100):03d}", e[4], e[3])
    elif kind == "riser":
        hit(sec, f"riser{round(sec / BAR_S)}", e[3])
    elif kind == "acid":
        ACID.append((sec, e[2], e[3], e[4], e[5]))  # time, midi, gate in samples, accent, slide

# MARK: The acid line (horns): a note each, the gate to the sample.

# A note slides in the record when it is marked to and the gate is still open; the console
# slides whenever the gate is open, so the two must be the same thing.
for (a, _, ln, _, _), (b, _, _, _, slide) in zip(ACID, ACID[1:]):
    open_ = round(b * RSR) < round(a * RSR) + ln
    assert open_ == bool(slide), ("a note slides exactly when the gate is open", a, b)
for sec, note, ln, acc, slide in ACID:
    t, late = when(sec)
    hold = (ln + 0.5) / (RSR * TICK)  # ticks; the renderer truncates it to the reference's samples
    s.horns.append({"t": t, "n": note, "v": 1.0 if acc else 0.6, "len": math.ceil(hold), "late": late, "hold": round(hold, 6)})

# MARK: The pad (keys): a note for every run of bars a pitch is on.

for m in sorted({n for b in range(BARS) for n in pad_notes(b)}):
    b = 0
    while b < s.bars:
        if m not in pad_notes(b):
            b += 1
            continue
        e = b
        while e < s.bars and m in pad_notes(e):
            e += 1
        t, late = when(b * BAR_S)
        s.keys.append({"t": t, "n": m, "v": 1.0, "len": (e - b) * BAR, "late": late})
        b = e

s.instruments = {"bass": "rackPad", "keys": "rackPad", "horns": "rackAcid", "monitor": "rackAcid"}
s.levels = {"keys": 0.0, "horns": 0.0}
# The reference's two sidechains: 0 → 1 over 2 ms, held to 30 ms, e^(−t/90 ms), 460 ms long;
# the rumble's held to 100 ms, e^(−t/60 ms). Both on every kick at full depth.
s.duck = {"release": 0.09, "attack": 0.002, "hold": 0.03, "length": 0.46, "channels": {},
          "second": {"attack": 0.002, "hold": 0.10, "release": 0.06, "length": 0.46}}

# MARK: The console

# The master's fade: half a cosine from the last bar to the end of the tail.
end_bar = (BARS * BAR_S + D["tail"]) / BAR_S
FADE = [[round(BARS - 1 + (end_bar - BARS + 1) * i / 128, 6), round(0.5 * (1 + math.cos(math.pi * i / 128)), 8)] for i in range(129)]
pad_phases = [x for m in sorted(int(k) for k in D["pad"]) for x in D["pad"][str(m)]]
s.acid_rack = {
    "lanes": {**LANES, "fade": [[0, 1.0]] + FADE},
    "buses": [
        {"name": "kick"},
        {"name": "ping"},
        {"name": "hats", "duck": 0.12, "room": 0.3},
        {"name": "ride", "duck": 0.15, "hall": 0.2},
        {"name": "shaker", "room": 0.4},
        {"name": "clap", "hall": 0.3, "room": 0.8},
        {"name": "rim", "hall": 0.35, "room": 0.6},
        {"name": "toms", "hall": 0.25, "room": 0.6},
        {"name": "crash", "duck": 0.3, "hall": 0.5},
        {"name": "riser", "hall": 0.8},
    ],
    "kick": {"bus": "kick", "q": 0.8, "gain": G["kick"]},
    "rumble": {"ir": "gl-ir-rumble", "block": 256, "taps": [[0, 0.6], [2, 0.45], [3, 0.7]], "highpass": 34, "lowpass": 105,
               "drive": 3.2, "norm": G["rumble_norm"], "smooth": 260, "gain": G["rumble"]},
    "acid": {"start": 110, "glide": 0.038, "attack": 0.002, "decay": 0.30, "sustain": 0.55, "release": 0.012,
             "accentLevel": 0.4, "accentEnv": 0.45, "osc": 0.8, "lfoDepth": 0.06, "lfoBars": 5, "min": 60, "max": 8000,
             "q2": 0.7, "ratio2": 1.25, "max2": 9000, "highpass": 75, "gain": G["acid"], "duck": 0.32, "hall": 0.55,
             "accentVelocity": 0.9},
    "acidEcho": {"beats": 0.75, "feedback": 0.42, "lowpass": 3600, "highpass": 320, "drive": 1.6, "wobble": [[0.001, 0.21]],
                 "level": G["acid_delay_return"], "duck": 0.4, "hall": 0.5},
    "sideBars": 0.5, "sideWindow": 400 / RSR,
    "ping": {"bus": "ping", "q": 1.2, "gain": G["ping"], "duck": 0.2, "hall": 0.8,
             "echo": {"beats": 0.5, "feedback": 0.5, "lowpass": 5000, "highpass": 400, "drive": 1.5, "wobble": [],
                      "level": G["ping_delay_mix"], "duck": 0, "hall": 0}},
    "pad": {"notes": sorted(int(k) for k in D["pad"]), "phases": pad_phases, "left": [-7, 4], "right": [7, -3], "smooth": 1 / 0.9,
            "q": 0.9, "rightScale": 1.06, "lfoDepth": 0.22, "lfoBars": 7, "lfoPhase": 0.6, "highpass": 170, "gain": G["pad"],
            "duck": 0.6, "hall": 0.9},
    "hall": {"ir": "gl-ir-hall", "block": 1024, "level": G["hall_return"], "duck": 0.5},
    "room": {"ir": "gl-ir-room", "block": 256, "level": G["room_return"]},
    "noise": {"kit": "glNoise", "gain": G["noise"] / K["glNoise"], "duck": 0.4},
    "master": {"highpass": 25, "drive": G["master_pregain"], "post": G["master_post"], "scale": G["final_scale"],
               "level": round(10 ** (-8 / 20), 4), "limit": G["limiter_threshold"], "limitRelease": 0.12},
}

# MARK: Melody part: the acid line, every note

# Weight and floor by the note's step in its two-bar motif (the motif from its notes): the two
# accents on 0 and 18 and the A2 (or D3) on 12 are the anchors; the notes that leave home (A2–E3) wait for the top rungs.
SPARSE = {0: (1, None), 6: (2, None), 7: (3, None), 12: (1, None), 18: (1, None), 24: (2, None), 25: (3, None), 28: (3, None)}
MOTIF_A = {0: (1, None), 3: (3, None), 6: (2, None), 7: (3, None), 10: (3, None), 12: (1, None), 14: (3, 6), 15: (3, None),
           18: (1, None), 22: (3, None), 24: (2, None), 25: (3, None), 28: (2, None), 30: (3, 7)}
MOTIF_B = {0: (1, None), 3: (3, None), 6: (2, None), 7: (3, 6), 10: (3, None), 12: (1, None), 14: (3, None), 15: (3, None),
           18: (1, None), 22: (3, None), 24: (3, 6), 25: (3, 6), 28: (2, None), 30: (3, None)}
melody = s.part("melody", "The acid", "rackAcid", "horns", "rackAcid")
ACCENT = {(round(sec / TICK), note) for sec, note, _, acc, _ in ACID if acc}
motif_notes = {}
for sec, note, ln, acc, slide in ACID:
    tick = round(sec / TICK)
    bar, step = divmod(round(sec / (TICK * 3)), 16)
    start = bar - bar % 2
    motif_notes.setdefault(start, []).append((tick, (bar - start) * 16 + step, note, ln))
for start, notes in sorted(motif_notes.items()):
    steps = {st for _, st, _, _ in notes}
    table = SPARSE if steps == set(SPARSE) else MOTIF_A if 30 in steps and any(n == 40 for _, _, n, _ in notes) else MOTIF_B
    for tick, st, note, ln in notes:
        lv, tier = table[st]
        # The gate in whole ticks, rounded up: what the key holds is what the record's gate holds.
        s.pnote(melody, tick, note, math.ceil(ln / RSR / TICK - 1e-6), lv, tier=tier)
        # A note the level leaves out is played for you at this velocity: the accent's.
        melody[-1]["v"] = 1.0 if (tick, note) in ACCENT else 0.6

# The part's own line where the record has no acid (bars 0–23, 120–127), so there is always
# something to play (Bart, 2026-11-09, on Halbschatten: "at any level there should always be
# notes to play"): the sparse motif's two accents (A2 on the 1, E3 on step 18) in the first 16
# bars and the last 8, the whole sparse motif in bars 16–23 as the line comes in. The band's
# channel stays the record; a note of this line a level leaves out is played for you on the
# 303, like any other.
STEP = 3  # ticks
SKELETON = [(0, 45, 5, 1, True), (18, 52, 8, 1, True)]
SPARSE_LINE = [(0, 45, 5, 1, True), (6, 52, 3, 2, False), (7, 50, 6, 3, False), (12, 45, 5, 1, False), (18, 52, 8, 1, True),
               (24, 48, 3, 2, False), (25, 47, 6, 3, False), (28, 45, 5, 3, False)]
for start in list(range(0, 24, 2)) + list(range(120, 128, 2)):
    for st, note, ln, lv, acc in (SPARSE_LINE if 16 <= start < 24 else SKELETON):
        s.pnote(melody, start * BAR + st * STEP, note, ln, lv)
        melody[-1]["v"] = 1.0 if acc else 0.6
s.fingered(melody)

# MARK: Chords part: the pad, a hit a bar

FINGERS = {2: (1, 3), 3: (1, 3, 5)}
ROLES = {(57, 64): ("root", "fifth"), (57, 64, 71): ("root", "fifth", "ninth"), (57, 65, 72): ("third", "root", "fifth"),
         (55, 62, 69): ("root", "fifth", "ninth")}
chords = s.part("chords", "The pad", "rackPad", "keys", "rackPad")
for bar in range(BARS):
    notes = pad_notes(bar)
    # The bar the chord arrives on (every four from bar 32, every four before it too) is the
    # anchor, the third bar of the four the groove, the others the pushes.
    lv = {0: 1, 2: 2}.get(bar % 4, 3)
    voicing = [(n, r, f) for n, r, f in zip(notes, ROLES[notes], FINGERS[len(notes)])]
    s.pchord(chords, bar * BAR, voicing, lv, BAR)

s.write()
