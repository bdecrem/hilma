#!/usr/bin/env python3
"""Abyss: dub techno at 117, D minor drifting to C minor, 72 bars (2:28), from misc/sketches.py
track 3 (the Basic Channel stab into the chamber), its voices cut by scripts/synths.py.

    python3 apps/takt/scripts/songs/abyss.py   -> Takt/Content/song-abyss.json

The sketch bar for bar: the kick, the offbeat hat, the stab on the 16ths 2, 7 and (odd bars)
10, Dm9 for four bars and Cm9 for four, the filter breathing over eight bars (velocity picks
the layer: dark, mid, bright), the sub on 1 and 3, the hiss and rumble. The dub chamber (the
feedback delays and the long reverb) is baked into the stab. Stretched to a track: intro,
deep, the drift, the abyss with no kick, deep again, out. Chords part: the stab. Melody part:
a hollow dub lead in long tones on the chord's ninth, fifth and seventh, which the sketch
doesn't have, written to drift the way the stab does. The band pumps to the kick (0.45, 250 ms).
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import BAR, TPB, Song  # noqa: E402

s = Song("song-abyss", "Abyss", "Dub techno", "D minor", 117, "abyss",
         "Dub techno at 117. One chord stab into the chamber, breathing, drifting from D to C and back.", seed=117)
s.sounds = {
    "kick": {"kit": "kickDub", "gainDb": -16},
    "hat": {"kit": "hatDub", "gainDb": -29},
    "roomtone": {"kit": "roomtone", "gainDb": -16},
    "xstick": {"kit": "rimMin", "gainDb": -28},
}
s.instruments = {"bass": "subDub", "keys": "dubStab", "horns": "dubLead", "monitor": "piano"}
s.levels = {"bass": -4, "keys": -8, "horns": -5}
s.duck = {"depth": 0.45, "release": 0.25, "channels": ["bass", "keys", "horns"]}
s.bars = 72
SECTIONS = [(0, "Intro"), (8, "Deep"), (24, "Drift"), (40, "Abyss"), (48, "Deep again"), (68, "Out")]
for b, name in SECTIONS:
    s.section(b, name)


def section(bar):
    return [n for b, n in SECTIONS if b <= bar][-1]


def chord_at(bar):
    return "Dm9" if (bar // 4) % 2 == 0 else "Cm9"


s.chords = [chord_at(b) for b in range(s.bars)]
# (note, level by role, finger): root 1, fifth and seventh 2, third and ninth 3.
VOICING = {
    "Dm9": [(50, 1, 5), (53, 3, 4), (57, 2, 3), (60, 2, 2), (64, 3, 1)],
    "Cm9": [(48, 1, 5), (51, 3, 4), (55, 2, 3), (58, 2, 2), (62, 3, 1)],
}
SUB = {"Dm9": 26, "Cm9": 24}

# MARK: Drums and the room

for bar in range(s.bars):
    o = bar * BAR
    sec = section(bar)
    kick = sec != "Abyss"
    if bar % 8 == 0:
        s.hit(o, "roomtone", 1.0, 0.0)
    for i in range(16):
        t = o + i * 3
        if i % 4 == 0 and kick:
            s.hit(t, "kick", 1.0, 0.02)
        if i % 4 == 2:
            s.hit(t, "hat", 0.5 if bar >= 1 else 0.2, 0.04)
        if bar >= 8 and i % 2 == 1 and sec not in ("Abyss", "Out"):
            s.hit(t, "hat", 0.18, 0.03)

# MARK: Sub on 1 and 3

for bar in range(s.bars):
    o = bar * BAR
    sec = section(bar)
    if sec in ("Intro", "Abyss") or (sec == "Out" and bar >= 70):
        continue
    for t in (0, 24):
        s.note(s.bass, o + t, SUB[chord_at(bar)], 0.8, 22)

# MARK: Chords part: the stab, breathing


def breath(bar):
    return round(0.3 + 0.7 * (0.5 - 0.5 * math.cos(2 * math.pi * bar / 8)), 3)


chords = s.part("chords", "The stab", "dubStab", "keys", "dubStab")
for bar in range(s.bars):
    o = bar * BAR
    sec = section(bar)
    if sec == "Out" and bar >= 70:
        continue
    v = VOICING[chord_at(bar)]
    s.pchord(chords, o + 6, v, 1, 30)
    s.pchord(chords, o + 21, v, 2, 20)
    if bar % 2 == 1:
        s.pchord(chords, o + 30, v, 3, 14)
s.chart_to_channel(chords, s.keys, lambda e: breath(e["t"] // BAR), spread=0.0)

# MARK: Melody part: long tones in the chamber

LEAD = {
    "Dm9": {0: [(0, 69, 36, 1)], 1: [(24, 72, 24, 1)], 2: [(0, 69, 48, 1)], 3: [(12, 65, 12, 3), (24, 67, 24, 1)]},
    "Cm9": {0: [(0, 67, 36, 1)], 1: [(24, 70, 24, 1)], 2: [(0, 67, 48, 1)], 3: [(12, 63, 12, 3), (24, 65, 24, 1)]},
}
melody = s.part("melody", "The dub lead", "dubLead", "horns", "dubLead")
for bar in range(s.bars):
    o = bar * BAR
    sec = section(bar)
    if sec == "Intro":
        continue
    if sec == "Out":
        if bar == 68:
            s.pnote(melody, o, 69, 96, 1)
        continue
    phrases = LEAD[chord_at(bar)]
    for t, n, ln, lv in phrases.get(bar % 4, []):
        if sec == "Deep" and (lv > 1 or bar % 4 in (1, 3)):
            continue  # the first sixteen bars: the long tones alone
        s.pnote(melody, o + t, n, ln, lv)
s.fingered(melody)
s.chart_to_channel(melody, s.horns, lambda e: 0.75, spread=0.03)

s.write()
