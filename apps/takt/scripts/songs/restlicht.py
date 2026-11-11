#!/usr/bin/env python3
"""Restlicht (residual light): melancholic Detroit electro in D dorian at 124, 120 bars and the
tail (3:58). The fourth record Claude rendered in Python for Takt and the first on the electro
rack: one two-bar bass riff whose filter lane is the story, an 808-shaped beat with the kick on
steps 0, 6 and 10, stacked fifths with no third, a whistle that visits twice. The record is
`misc/restlicht_reference.py` (the brief `misc/RESTLICHT.md`); this is its song file.

    python3 apps/takt/scripts/songs/restlicht.py   -> Takt/Content/song-restlicht.json

Nothing here is written by ear. `scripts/restlicht.py` runs the reference, which logs every event
it places, and writes that log (`restlicht-events.json`) with the gains, each file's scale, the
pad's phases and the lanes read out of the reference's source. This script turns it into the band:

- drums: each hit at its own time (`late`), at its own gain (`g`), on the reference's one-shot,
  into its bus of the console (`ElectroRack`); the kick's frame is the duck's, the ghost kick's
  is not (its kit is not a kick… kit); the toms each with their own pan (`p`);
- the bass riff (horns): the console's bass voice, a note each, an accent at velocity 1, the
  gate the reference's to the sample (`hold`); a note slides when it starts while the gate is
  still open, which in the record is exactly the B2 the C3 before it is tied into (asserted);
- the whistle (bass channel): the console's whistle, a note each, the gate to the sample;
- the pad (keys): the console's gated saws, a note for every run of bars a pitch is on;
- `electroRack`: every lane, gain and setting the reference's own.

The parts, by the takt-chart skill (LEVELING.md, CHARTING.md rule 21):

- melody, "The riff": the record's bass line, every note, in its own octave (C2 to C3), and
  the D2 on the 1 of bars 4–7, where the kick is in and the bass is not yet. One hand position
  all song: D2 under the thumb, F2, G2, A2, and C3 under the pinky, the thumb reaching down
  to C2. The rungs are places in the two-bar riff (`from`): the accent on the 1 and the F2 on
  the kick's "and" of 2 in the second bar; the second bar's 1; the F2 in the first bar; the
  climb A2 C3; the D2 after the F; then the record's sixteenths and the tied B2.
- chords, "The fifths": the pad's chords as the record holds them, a hit a bar: D3 A3, then
  D3 A3 E4, the top note up to G4 and back, and from bar 56 the whole hand down a step (C3 G3
  D4) one bar in four. The left hand holds the fifth (5 and 2), the thumb takes the note on
  top; the G4 is an eleventh over the D3, so it is the record's to play below Hard.
"""
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import BAR, Song  # noqa: E402

D = json.loads((Path(__file__).resolve().parent / "restlicht-events.json").read_text())
G, K, LANES = D["gains"], D["scale"], D["lanes"]
TEMPO = D["tempo"]
RSR = D["sr"]
TICK = 60 / TEMPO / 12  # seconds
BARS = D["bars"]
BAR_S = TICK * BAR
TAIL_BARS = math.ceil(D["tail"] / BAR_S)

s = Song("song-restlicht", "Restlicht", "Electro", "D dorian", int(TEMPO), "afterglow",
         "Electro at 124, four minutes. One bass riff on white keys, its filter opening and closing; fifths with no third; a whistle that visits twice.",
         seed=1240)
s.human = 0
s.bars = BARS + TAIL_BARS
SECTIONS = [(0, "Empty room"), (4, "Kick"), (8, "Riff"), (16, "Full riff"), (32, "One finger"), (40, "Shaker"), (48, "Break"),
            (56, "A step down"), (64, "Whistle"), (80, "Floor"), (88, "No bass"), (92, "Return"), (96, "Whistle again"),
            (104, "Thinning"), (112, "Fifths"), (116, "Out")]
for b, name in SECTIONS:
    s.section(b, name)


def pad_notes(bar):
    """The reference's `pad_notes`; the last bar's chord holds through the tail."""
    return tuple(D["padBars"][min(bar, BARS - 1)])


CHORD_NAME = {(50, 57): "D5", (50, 57, 64): "Dsus2", (50, 57, 67): "Dsus4", (48, 55, 62): "Csus2"}
s.chords = [CHORD_NAME[pad_notes(b)] for b in range(s.bars)]


def db(x):
    return round(20 * math.log10(x), 3)


def when(sec):
    """A time in seconds as (tick, late): the tick at or before it, and how much later than that
    tick it is. An event on the grid goes a tick early too, so the renderer places it by
    rounding its exact time, as the reference did."""
    x = sec / TICK
    t = math.floor(x)
    if x - t < 0.01:
        t -= 1
    t = max(0, t)
    return t, round(x - t, 5)


# MARK: Drums: every sound into a bus of the console (a rack bus has no fader of its own).

s.sounds = {
    "kick": {"kit": "kickRL", "gainDb": db(G["kick"] / K["kickRL"]), "bus": "kick"},
    "ghost": {"kit": "rlGhost", "gainDb": db(G["kick"] / K["rlGhost"]), "bus": "kick"},
    "rim": {"kit": "rlRim", "gainDb": db(G["rim"] / K["rlRim"]), "bus": "rim"},
    "xstick": {"kit": "rimMin", "gainDb": -27},  # the count-in's click only
}
for j in range(2):
    s.sounds[f"snare{j}"] = {"kit": f"rlSnare{j}", "gainDb": db(G["snare"] / K[f"rlSnare{j}"]), "bus": "snare"}
    s.sounds[f"ohh{j}"] = {"kit": f"rlOhh{j}", "gainDb": db(G["hats"] / K[f"rlOhh{j}"]), "bus": "hats"}
for j in range(3):
    s.sounds[f"chh{j}"] = {"kit": f"rlChh{j}", "gainDb": db(G["hats"] / K[f"rlChh{j}"]), "bus": "hats"}
    s.sounds[f"shk{j}"] = {"kit": f"rlShk{j}", "gainDb": db(G["shaker"] / K[f"rlShk{j}"]), "bus": "shaker"}
for m in (45, 50):
    s.sounds[f"tom{m}"] = {"kit": f"rlTom{m}", "gainDb": db(G["toms"] / K[f"rlTom{m}"]), "bus": "toms"}


def hit(sec, sound, g=1.0, p=None):
    t, late = when(sec)
    e = {"t": t, "s": sound, "v": 1.0, "late": late}
    if g != 1.0:
        e["g"] = round(g, 6)
    if p is not None:
        e["p"] = round(p, 6)
    s.drums.append(e)


BASS, LEAD = [], []
for e in D["events"]:
    kind, sec = e[0], e[1]
    if kind == "kick":
        hit(sec, "ghost" if e[3] else "kick", e[2])
    elif kind in ("snare", "hatc", "hato", "shaker"):
        hit(sec, {"snare": "snare", "hatc": "chh", "hato": "ohh", "shaker": "shk"}[kind] + str(e[3]), e[2])
    elif kind == "rim":
        hit(sec, "rim", e[2])
    elif kind == "tom":
        hit(sec, f"tom{e[2]}", e[3], e[4])
    elif kind == "bass":
        BASS.append((sec, e[2], e[3], e[4], e[5]))  # time, midi, gate in samples, accent, slide
    elif kind == "lead":
        LEAD.append((sec, e[2], e[3]))  # time, midi, gate in samples


def hold(ln):
    """A gate of `ln` samples in ticks; the renderer truncates it to the reference's samples."""
    return (ln + 0.5) / (RSR * TICK)


# MARK: The bass riff (horns): a note each, the gate to the sample.

# A note slides in the record when it is marked to and the gate is still open; the console
# slides when the gate is still open at the note's frame (one that starts on the frame the gate
# ends does not: 29 of the record's notes do), so the two must be the same thing.
for (a, _, ln, _, _), (b, _, _, _, slide) in zip(BASS, BASS[1:]):
    open_ = round(b * RSR) < round(a * RSR) + ln
    assert open_ == bool(slide), ("a note slides exactly when the gate is open", a, b)
for sec, note, ln, acc, slide in BASS:
    t, late = when(sec)
    h = hold(ln)
    s.horns.append({"t": t, "n": note, "v": 1.0 if acc else 0.6, "len": math.ceil(h), "late": late, "hold": round(h, 6)})

# MARK: The whistle (the bass channel): a note each; every note jumps and re-attacks.

for sec, note, ln in LEAD:
    t, late = when(sec)
    h = hold(ln)
    s.bass.append({"t": t, "n": int(note), "v": 0.6, "len": math.ceil(h), "late": late, "hold": round(h, 6)})

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

s.instruments = {"bass": "rackLead", "keys": "rackPad", "horns": "rackAcid", "monitor": "rackAcid"}
s.levels = {"bass": 0.0, "keys": 0.0, "horns": 0.0}
# The reference's sidechain: 0 → 1 over 2 ms, held to 40 ms, e^(−t/120 ms), half a second long,
# on every kick at full depth whatever its gain (the ghost fires none).
s.duck = {"release": 0.12, "attack": 0.002, "hold": 0.04, "length": 0.5, "channels": {}}

# MARK: The console

# The master's fade: half a cosine from the last bar to the end of the tail.
end_bar = (BARS * BAR_S + D["tail"]) / BAR_S
FADE = [[round(BARS - 1 + (end_bar - BARS + 1) * i / 128, 6), round(0.5 * (1 + math.cos(math.pi * i / 128)), 8)] for i in range(129)]
pad_phases = [x for m in sorted(int(k) for k in D["pad"]) for x in D["pad"][str(m)]]
s.electro_rack = {
    "lanes": {**LANES, "fade": [[0, 1.0]] + FADE},
    "buses": [
        {"name": "kick"},
        {"name": "snare", "hall": 0.16, "room": 0.7},
        {"name": "hats", "room": 0.3},
        {"name": "shaker", "room": 0.4},
        {"name": "rim", "hall": 0.3, "room": 0.5},
        {"name": "toms", "hall": 0.3, "room": 0.5},
    ],
    "bass": {"start": 110, "glide": 0.038, "attack": 0.002, "decay": 0.30, "sustain": 0.55, "release": 0.012,
             "accentLevel": 0.4, "accentEnv": 0.45, "saw": 0.7, "square": 0.45, "phases": [0.0, 0.25, 0.75], "min": 60, "max": 6000,
             "q2": 0.7, "ratio2": 1.3, "max2": 7000, "highpass": 38, "gain": G["bass"], "duck": 0.4, "hall": 0.05,
             "accentVelocity": 0.9},
    "lead": {"start": 110, "attack": 0.002, "decay": 0.30, "sustain": 0.55, "release": 0.012, "breath": 14, "glide": 0.05,
             "vibratoRate": 5.1, "vibratoDepth": 0.0035, "vibratoGate": 0.3, "vibratoSmooth": 1.5,
             "harmonics": [[1, 1.0, 0.0], [2, 0.22, 0.4], [3, 0.06, 0.0]], "lowpass": 2600, "gain": G["lead"], "pan": -0.08,
             "hall": 0.75, "echo": 0.55},
    "echo": {"beats": 0.75, "feedback": 0.5, "lowpass": 3000, "highpass": 350, "drive": 1.5, "wobble": [[0.0012, 0.19], [0.0004, 2.7]],
             "level": G["echo_return"], "duck": 0.2, "hall": 0.5},
    "echoBus": "rim", "echoBusSend": 1.0, "echoLaneBus": "snare",
    "sideBars": 0.25, "sideWindow": 400 / RSR,
    "pad": {"notes": sorted(int(k) for k in D["pad"]), "phases": pad_phases, "left": [-8, 5], "right": [8, -4], "smooth": 1 / 0.8,
            "q": 0.9, "rightScale": 1.05, "lfoDepth": 0.2, "lfoBars": 6, "lfoPhase": 1.3, "highpass": 160, "gain": G["pad"],
            "duck": 0.3, "hall": 0.9},
    "hall": {"ir": "rl-ir-hall", "block": 1024, "level": G["hall_return"], "duck": 0.3},
    "room": {"ir": "rl-ir-room", "block": 256, "level": G["room_return"]},
    "noise": {"kit": "rlNoise", "gain": G["noise"] / K["rlNoise"], "duck": 0.0},
    "master": {"highpass": 25, "drive": G["master_pregain"], "post": G["master_post"], "scale": G["final_scale"],
               "level": round(10 ** (-8 / 20), 4), "limit": G["limiter_threshold"], "limitRelease": 0.12},
}

# MARK: Melody part: the riff, every note

# Weight and floor by the note's step in its two-bar riff. The accent on the 1 and the F2 on
# the kick's "and" of 2 in the second bar are the anchors (two keys, a bar apart); the second
# bar's 1 joins on Easy, the first bar's F2 on Easy+, the climb A2 C3 on Medium, the D2 after
# the F on the rung over it, and Hard is the record: its sixteenths, the low C2 and the B2 the
# C3 is tied into.
RUNGS = {0: (1, None), 22: (1, None), 16: (1, 3), 6: (2, 4), 27: (2, 5), 30: (2, 5), 9: (3, 6), 3: (3, 6), 19: (3, 6),
         11: (3, 7), 13: (3, 7), 15: (3, 7), 25: (3, 7), 31: (3, 7)}
melody = s.part("melody", "The riff", "rackAcid", "horns", "rackAcid")
STEP = 3  # ticks
for sec, note, ln, acc, slide in BASS:
    tick = round(sec / TICK)
    bar, step = divmod(round(sec / (TICK * STEP)), 16)
    lv, tier = RUNGS[(bar % 2) * 16 + step]
    # The gate in whole ticks, rounded up: what the key holds is what the record's gate holds.
    s.pnote(melody, tick, note, math.ceil(ln / RSR / TICK - 1e-6), lv, tier=tier)
    # A note the level leaves out is played for you at this velocity: the accent's.
    melody[-1]["v"] = 1.0 if acc else 0.6
# The part's own notes where the kick is in and the riff is not yet (bars 4–7): its accent, the
# D2 on the 1, so the hand is on the riff's first key when the riff starts (Bart, 2026-11-09, on
# Halbschatten: "at any level there should always be notes to play"). The record's own rests
# stay rests: the empty room before the kick (bars 0–3), the floor without the riff (88–91) and
# the way out (116–119), four bars each.
for bar in range(4, 8):
    s.pnote(melody, bar * BAR, 38, 5, 1, tier=None if bar % 2 == 0 else 3)
    melody[-1]["v"] = 1.0
assert {e["n"] for e in melody} == {36, 38, 41, 43, 45, 47, 48}, "the riff stays on C2 D2 F2 G2 A2 B2 C3"
s.fingered(melody)

# MARK: Chords part: the pad, a hit a bar

# The left hand: the pinky on the root, the index on the fifth, the thumb on the note on top.
# The G4 over D3 A3 is an eleventh from the pinky: the record's to play (and the other hand's
# on Hard), so it carries no finger and comes in on the top rung.
FINGERS = (5, 2, 1)
ROLES = {(50, 57): ("root", "fifth"), (50, 57, 64): ("root", "fifth", "ninth"), (50, 57, 67): ("root", "fifth", "ninth"),
         (48, 55, 62): ("root", "fifth", "ninth")}
chords = s.part("chords", "The fifths", "rackPad", "keys", "rackPad")
for bar in range(BARS):
    notes = pad_notes(bar)
    cycle = 56 <= bar < 104
    # The bar a chord arrives on is the anchor: every fourth bar while a chord holds four, and
    # in the cycle (a chord a bar from 56) its first bar and the bar the hand drops a step. The
    # third bar of the four is the groove, the others the pushes.
    lv = 1 if bar % 4 == 0 or (cycle and bar % 4 == 3) else 2 if bar % 4 == 2 else 3
    for n, role, f in zip(notes, ROLES[notes], FINGERS):
        wide = n == 67
        s.pnote(chords, bar * BAR, n, BAR, lv, None if wide else f, role, tier=7 if wide else None)

s.write()
