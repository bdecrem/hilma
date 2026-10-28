#!/usr/bin/env python3
"""Undertow: deep house in A minor at 122, 72 bars (2:22), the 909-style kit and the synths of
scripts/synths.py.

    python3 apps/takt/scripts/songs/undertow.py   -> Takt/Content/song-undertow.json

Am · F · Dm · Em, two bars each. Intro (kick, hats), Groove (sub, stabs), Lift (no kick: pads,
stabs held), Drop (everything, the lead), Deep (bass and lead, chords out), Drop again, Out.
Chords part: the Rhodes stabs (easy the root on the 1, medium root and fifth on the 1 and the
and of 2, hard the sevenths and the whole pattern). Melody part: the lead hook, with a sparser
call in the groove. Your keys play the record's stab or lead.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import BAR, TPB, Song  # noqa: E402

s = Song("song-undertow", "Undertow", "Deep house", "A minor", 122, "undertow",
         "Deep house in A minor. A Rhodes under water, a sub that breathes, a hook that floats.", seed=122)
s.sounds = {
    "kick": {"kit": "kick909", "gainDb": -13},
    "clap": {"kit": "clap909", "gainDb": -19},
    "xstick": {"kit": "rim909", "gainDb": -24},
    "hat": {"kit": "hat909", "gainDb": -27},
    "hatOpen": {"kit": "hatOpen909", "gainDb": -28},
    "ride": {"kit": "ride909", "gainDb": -29},
    "shaker": {"kit": "shaker", "gainDb": -29},
    "tom": {"kit": "tomSyn", "gainDb": -19},
}
s.instruments = {"bass": "sub", "keys": "stab", "horns": "lead", "monitor": "piano"}
# Solo renders against the blues band (drums -28, bass -29, keys -30, horns -28.5 dBFS RMS):
# the kick and bass a touch over it, the stabs and the lead at it.
s.levels = {"bass": -2, "keys": -13, "horns": -8}
s.bars = 72
SECTIONS = [(0, "Intro"), (4, "Groove"), (20, "Lift"), (28, "Drop"), (44, "Deep"), (52, "Drop again"), (68, "Out")]
for b, name in SECTIONS:
    s.section(b, name)


def section(bar):
    return [n for b, n in SECTIONS if b <= bar][-1]


PROG = ["Am", "Am", "F", "F", "Dm", "Dm", "Em", "Em"]
s.chords = [PROG[b % 8] for b in range(s.bars)]
ROOT = {"Am": 33, "F": 29, "Dm": 38, "Em": 40}  # sub roots A1 F1 D2 E2
# Triads around middle C with the seventh on top for hard: (note, level by role, finger).
VOICING = {
    "Am": [(57, 1, 5), (60, 3, 3), (64, 2, 1), (67, 3, 1)],   # A C E (G)
    "F": [(53, 1, 5), (57, 3, 3), (60, 2, 1), (64, 3, 1)],    # F A C (E)
    "Dm": [(50, 1, 5), (53, 3, 3), (57, 2, 1), (60, 3, 1)],   # D F A (C)
    "Em": [(52, 1, 5), (55, 3, 3), (59, 2, 1), (62, 3, 1)],   # E G B (D)
}
PAD = {"Am": [45, 52, 57, 60], "F": [41, 48, 53, 57], "Dm": [38, 50, 53, 57], "Em": [40, 47, 52, 55]}


def chord_at(bar):
    return PROG[bar % 8]


# MARK: Drums

for bar in range(s.bars):
    o = bar * BAR
    sec = section(bar)
    kick = sec not in ("Lift",) and not (sec == "Out" and bar >= 70)
    full = sec in ("Drop", "Drop again")
    if kick:
        for beat in range(4):
            s.hit(o + beat * TPB, "kick", 0.95 if beat == 0 else 0.88, 0.03)
    if sec not in ("Intro", "Lift", "Out") or (sec == "Intro" and bar >= 2):
        for t in (12, 36):
            s.hit(o + t, "clap", 0.78 if sec != "Deep" else 0.6, 0.04)
    # Hats: offbeat open hats, closed 16ths underneath (lighter in the lift).
    for beat in range(4):
        t = beat * TPB
        s.hit(o + t + 6, "hatOpen", 0.45 if full else 0.35, 0.04)
        for k in (0, 3, 9):
            if sec != "Intro" or bar >= 1:
                s.hit(o + t + k, "hat", 0.42 if k == 0 else 0.26, 0.04)
    if full or sec == "Deep":
        for k in range(16):
            s.hit(o + k * 3, "shaker", 0.42 if k % 4 == 0 else 0.28 if k % 2 == 0 else 0.2, 0.05)
    if full:
        for beat in range(4):
            s.hit(o + beat * TPB, "ride", 0.3, 0.03)
    if sec == "Groove" and bar % 2 == 1:
        s.hit(o + 42, "xstick", 0.5)
    # Into the drops: a tom roll over the last bar.
    if bar in (27, 51):
        for k in range(8):
            s.hit(o + 24 + k * 3, "tom", 0.45 + 0.06 * k)
    if bar in (28, 52):
        s.hit(o, "hatOpen", 0.8)

# MARK: Bass: the sub, pumping.

for bar in range(s.bars):
    o = bar * BAR
    sec = section(bar)
    if sec in ("Intro", "Lift") or (sec == "Out" and bar >= 70):
        continue
    r = ROOT[chord_at(bar)]
    s.note(s.bass, o, r, 0.9, 16)
    s.note(s.bass, o + 18, r, 0.75, 6)
    s.note(s.bass, o + 30, r + 12, 0.6, 6)
    s.note(s.bass, o + 42, r, 0.7, 5)
    if sec in ("Drop", "Drop again", "Deep") and bar % 2 == 1:
        s.note(s.bass, o + 36, r + 7 if chord_at(bar) != "Em" else r + 5, 0.62, 5)

# MARK: Chords part: the stabs. Pads on the same channel, under them.

chords = s.part("chords", "Rhodes stabs", "stab", "keys", "stab")
for bar in range(s.bars):
    o = bar * BAR
    sec = section(bar)
    if sec == "Intro" or (sec == "Out" and bar >= 70):
        continue
    v = VOICING[chord_at(bar)]
    if sec == "Lift":
        s.pchord(chords, o, v, 1, 44)
        continue
    s.pchord(chords, o, v, 1, 12)
    s.pchord(chords, o + 18, v, 2, 10)
    s.pchord(chords, o + 30, v, 3, 10)
    if bar % 2 == 1:
        s.pchord(chords, o + 42, VOICING[chord_at(bar + 1)], 3, 6)
    else:
        s.pchord(chords, o + 42, v, 3, 6)
s.chart_to_channel(chords, s.keys, lambda e: 0.7 if e["t"] % BAR == 0 else 0.55 if e["t"] % BAR == 18 else 0.45)
for bar in range(s.bars):
    o = bar * BAR
    sec = section(bar)
    if sec in ("Lift", "Drop", "Drop again") and bar % 2 == 0:
        for n in PAD[chord_at(bar)]:
            s.note(s.keys, o, n, 0.5 if sec == "Lift" else 0.36, 94, "pad")

# MARK: Melody part: the lead hook.

A4, C5, D5, E5, G4, B4, E4, G5 = 69, 72, 74, 76, 67, 71, 64, 79
HOOK = {  # two bars over Am/F, two over Dm/Em
    0: [(0, E5, 18, 1), (18, D5, 6, 3), (24, C5, 12, 2), (36, A4, 12, 1)],
    1: [(0, G4, 24, 1), (24, A4, 12, 2), (36, C5, 12, 3)],
    2: [(0, E5, 18, 1), (18, G5, 6, 3), (24, E5, 12, 2), (36, C5, 12, 1)],
    3: [(0, A4, 24, 1), (24, G4, 12, 2), (36, E4, 12, 3)],
    4: [(0, D5, 18, 1), (18, E5, 6, 3), (24, C5, 12, 2), (36, A4, 12, 1)],
    5: [(0, A4, 24, 1), (24, C5, 12, 2), (36, D5, 12, 3)],
    6: [(0, B4, 24, 1), (24, G4, 12, 2), (36, E4, 12, 3)],
    7: [(0, E5, 36, 1), (36, D5, 12, 3)],
}
CALL = {  # the groove: a sparser call, every other bar
    0: [(0, E5, 24, 1), (24, C5, 24, 2)],
    2: [(0, C5, 24, 1), (24, A4, 24, 2)],
    4: [(0, D5, 24, 1), (24, A4, 24, 2)],
    6: [(0, B4, 36, 1), (36, G4, 12, 3)],
}
melody = s.part("melody", "The hook", "lead", "horns", "lead")
for bar in range(s.bars):
    o = bar * BAR
    sec = section(bar)
    if sec == "Intro":
        continue
    if sec == "Groove":
        for t, n, ln, lv in CALL.get(bar % 8, []):
            s.pnote(melody, o + t, n, ln, lv)
    elif sec == "Lift":
        # Long tones over the pads.
        n = {"Am": E5, "F": C5, "Dm": D5, "Em": B4}[chord_at(bar)]
        if bar % 2 == 0:
            s.pnote(melody, o, n, 84, 1)
        else:
            s.pnote(melody, o + 36, n - 2 if n != B4 else G4, 12, 3)
    elif sec == "Out":
        if bar == 68:
            s.pnote(melody, o, E5, 48, 1)
        elif bar == 69:
            s.pnote(melody, o, A4, 48, 1)
    else:
        for t, n, ln, lv in HOOK[bar % 8]:
            s.pnote(melody, o + t, n, ln, lv)
s.chart_to_channel(melody, s.horns, lambda e: 0.78 if e["lv"] == 1 else 0.66)

s.write()
