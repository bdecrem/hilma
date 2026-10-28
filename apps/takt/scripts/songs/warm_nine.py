#!/usr/bin/env python3
"""Warm Nine: deep house at 121 in F minor, 76 bars (2:31), from misc/sketches.py track 2
(swung hats, warm ninth chords, a bassline), its voices cut by scripts/synths.py.

    python3 apps/takt/scripts/songs/warm_nine.py   -> Takt/Content/song-warm-nine.json

Fm9 · E♭maj9 · D♭maj7 · Cm7, a bar each, the Rhodes pushing its stabs on the 16th before the
beat, the bass on root, octave and fifth, the clap and the hats, the vinyl crackle. The
sketch's 16% swing is below the tick grid (a 16th is three ticks), so the hats sit straight
and the pushed stabs carry the feel. Stretched to a track: intro, the bass in, the hook, a
lift with no kick, the hook again, out; the Rhodes brightens at the hook (velocity picks the
layer). Chords part: the stabs. Melody part: a Rhodes top line an octave up, which the
sketch doesn't have, written to float over the changes. The band pumps to the kick (0.5, 200 ms).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import BAR, TPB, Song  # noqa: E402

s = Song("song-warm-nine", "Warm Nine", "Deep house", "F minor", 121, "nine",
         "Deep house at 121. Ninth chords pushed ahead of the beat, a bass that walks root, octave, fifth, crackle on top.", seed=121)
s.sounds = {
    "kick": {"kit": "kickDH", "gainDb": -15},
    "clap": {"kit": "clapDH", "gainDb": -21},
    "hat": {"kit": "hatDH", "gainDb": -28},
    "hatOpen": {"kit": "hatOpenDH", "gainDb": -28},
    "crackle": {"kit": "crackle", "gainDb": -17},
    "xstick": {"kit": "rimMin", "gainDb": -25},
}
s.instruments = {"bass": "bassDH", "keys": "rhodes", "horns": "rhodes", "monitor": "piano"}
s.levels = {"bass": 1, "keys": -13, "horns": 1}
s.duck = {"depth": 0.5, "release": 0.2, "channels": ["bass", "keys", "horns"]}
s.bars = 76
SECTIONS = [(0, "Intro"), (8, "Groove"), (24, "Hook"), (40, "Lift"), (48, "Hook again"), (68, "Out")]
for b, name in SECTIONS:
    s.section(b, name)


def section(bar):
    return [n for b, n in SECTIONS if b <= bar][-1]


PROG = ["Fm9", "E♭maj9", "D♭maj7", "Cm7"]
s.chords = [PROG[b % 4] for b in range(s.bars)]
# (note, level by role, finger): root 1, fifth and seventh 2, third and ninth 3.
VOICING = {
    "Fm9": [(53, 1, 5), (56, 3, 4), (60, 2, 3), (63, 2, 2), (67, 3, 1)],
    "E♭maj9": [(51, 1, 5), (55, 3, 4), (58, 2, 3), (62, 2, 2), (65, 3, 1)],
    "D♭maj7": [(49, 1, 5), (53, 3, 4), (56, 2, 3), (60, 2, 2), (63, 3, 1)],
    "Cm7": [(48, 1, 5), (51, 3, 4), (55, 2, 3), (58, 2, 2), (62, 3, 1)],
}
ROOT = {"Fm9": 29, "E♭maj9": 27, "D♭maj7": 25, "Cm7": 24}

# MARK: Drums

for bar in range(s.bars):
    o = bar * BAR
    sec = section(bar)
    kick = sec != "Lift"
    if bar % 8 == 0:
        s.hit(o, "crackle", 1.0, 0.0)
    for i in range(16):
        t = o + i * 3
        if i % 4 == 0 and kick:
            s.hit(t, "kick", 1.0, 0.02)
        if bar >= 1 and i in (4, 12) and sec != "Lift" and not (sec == "Out" and bar >= 72):
            s.hit(t, "clap", 0.9, 0.04)
        if i % 4 == 2:
            s.hit(t, "hatOpen", 0.6 if bar >= 2 else 0.3, 0.04)
        if bar >= 1 and i % 2 == 1 and not (sec == "Out" and bar >= 72):
            s.hit(t, "hat", 0.4 + 0.3 * s.rng.random(), 0.0)
        if bar >= 2 and i % 4 == 0 and s.rng.random() < 0.3:
            s.hit(t, "hat", 0.25, 0.03)

# MARK: Bass: root, octave, fifth

RHYTHM = [(0, 6, 0), (9, 3, 12), (18, 6, 0), (30, 3, 7), (36, 9, 0)]  # tick, length, interval
for bar in range(s.bars):
    o = bar * BAR
    sec = section(bar)
    if sec in ("Intro", "Lift") or (sec == "Out" and bar >= 72):
        continue
    r = ROOT[s.chords[bar]]
    for t, ln, iv in RHYTHM:
        s.note(s.bass, o + t, r + iv, 0.85 if iv == 0 else 0.7, ln)

# MARK: Chords part: the pushed stabs

chords = s.part("chords", "Rhodes stabs", "rhodes", "keys", "rhodes")
for bar in range(s.bars):
    o = bar * BAR
    sec = section(bar)
    if sec == "Out" and bar >= 72:
        continue
    v = VOICING[s.chords[bar]]
    if sec == "Lift":
        s.pchord(chords, o, v, 1, 44)
        s.pchord(chords, o + 33, v, 3, 12)
        continue
    s.pchord(chords, o, v, 1, 9)
    s.pchord(chords, o + 9, v, 3, 6)
    s.pchord(chords, o + 24, v, 2, 6)
    s.pchord(chords, o + 33, v, 3, 12)


def rhodes_velocity(e):
    bright = (e["t"] // BAR) >= 24
    return 0.8 if bright else 0.45


s.chart_to_channel(chords, s.keys, rhodes_velocity, spread=0.03)

# MARK: Melody part: the top line, an octave up on the same Rhodes

Eb4, F4, G4, Ab4, Bb4, C5, D5, Eb5 = 63, 65, 67, 68, 70, 72, 74, 75
LINE_A = {
    0: [(0, C5, 12, 1), (18, Ab4, 6, 3), (24, G4, 12, 2), (36, F4, 12, 1)],
    1: [(0, G4, 18, 1), (24, Bb4, 12, 2), (36, D5, 12, 3)],
    2: [(0, C5, 24, 1), (24, Ab4, 12, 2), (36, F4, 12, 3)],
    3: [(0, Eb4, 12, 1), (12, D5 - 12, 12, 3), (24, G4, 24, 1)],
}
LINE_B = {
    0: [(0, Ab4, 12, 1), (12, Bb4, 12, 2), (24, C5, 24, 1)],
    1: [(0, Bb4, 24, 1), (24, G4, 12, 2), (36, F4, 12, 3)],
    2: [(0, Ab4, 18, 1), (18, F4, 6, 3), (24, Eb4, 24, 2)],
    3: [(0, G4, 36, 1), (36, Bb4, 12, 3)],
}
CALL = {0: [(0, C5, 24, 1)], 2: [(0, Ab4, 24, 1), (24, G4, 24, 2)]}
LIFT = {0: [(0, C5, 48, 1)], 1: [(0, Bb4, 48, 2)], 2: [(0, Ab4, 48, 1)], 3: [(0, G4, 36, 1), (36, Bb4, 12, 3)]}

melody = s.part("melody", "The top line", "rhodes", "horns", "rhodes")
for bar in range(s.bars):
    o = bar * BAR
    sec = section(bar)
    if sec == "Intro":
        continue
    if sec == "Groove":
        phrases = CALL
    elif sec == "Lift":
        phrases = LIFT
    elif sec == "Out":
        phrases = {0: [(0, C5, 48, 1)], 2: [(0, Ab4, 48, 1)]} if bar < 72 else {}
    else:
        phrases = LINE_A if (bar // 4) % 2 == 0 else LINE_B
    for t, n, ln, lv in phrases.get(bar % 4, []):
        s.pnote(melody, o + t, n, ln, lv)
s.fingered(melody)
s.chart_to_channel(melody, s.horns, lambda e: 0.82 if e["lv"] == 1 else 0.7, spread=0.03)

s.write()
