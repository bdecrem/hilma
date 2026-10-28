#!/usr/bin/env python3
"""Abyss: dub techno at 117, D minor drifting to C minor, 72 bars (2:28), from misc/sketches.py
track 3 (the Basic Channel stab into the chamber), its voices cut by scripts/synths.py.

    python3 apps/takt/scripts/songs/abyss.py   -> Takt/Content/song-abyss.json

The sketch bar for bar: the kick, the offbeat hat, the stab on the 16ths 2, 7 and (odd bars)
10, Dm9 for four bars and Cm9 for four, the sub on 1 and 3, the hiss. Stretched to a track:
intro, deep, the drift, the abyss with no kick, deep again, out.

The sound follows misc/TRACKS_README.md "Fixing the dub techno sound": the stab is dry, short
and bright (four detuned saws through a resonant lowpass), its filter breathing over sixteen
bars (velocity picks one of five layers, 600 Hz to 3.6 kHz); the echo is the engine's dub send
(`dub`, Takt/Audio/DubChamber.swift): a dotted-eighth ping-pong whose repeats are highpassed,
lowpassed and saturated inside the loop, the time wobbling like tape, into a reverb with the
low end cut from its input. Kick and sub stay mono and dry (the sub an octave up from the
sketch's, D2 and C2, so a laptop plays it), the hats crisp, only the stab, the lead and your
keys duck, a little. Chords part: the stab. Melody part: a hollow dub lead, a four-bar phrase
of long notes and offbeat answers that the delay repeats, which the sketch doesn't have.
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
    "hat": {"kit": "hatDub", "gainDb": -26},
    "roomtone": {"kit": "roomtone", "gainDb": -16},
    "xstick": {"kit": "rimMin", "gainDb": -28},
}
s.instruments = {"bass": "subDub", "keys": "dubStab", "horns": "dubLead", "monitor": "piano"}
s.levels = {"bass": -6, "keys": 1, "horns": -6}
s.duck = {"depth": 0.3, "release": 0.25, "channels": ["keys", "horns"]}
s.dub = {"sends": {"keys": 0.8, "horns": 0.5}, "beats": 0.75, "feedback": 0.62, "highpass": 350, "lowpass": 2500,
         "drive": 1.6, "wobble": 0.003, "wobbleRate": 0.5, "echo": 0.75, "reverb": 0.35, "decay": 3.5,
         "reverbHighpass": 250, "duck": 0.3}
s.bars = 72
SECTIONS = [(0, "Intro"), (8, "Deep"), (24, "Drift"), (40, "Abyss"), (48, "Deep again"), (68, "Out")]
for b, name in SECTIONS:
    s.section(b, name)


def section(bar):
    return [n for b, n in SECTIONS if b <= bar][-1]


def chord_at(bar):
    return "Dm9" if (bar // 4) % 2 == 0 else "Cm9"


s.chords = [chord_at(b) for b in range(s.bars)]
# (note, role, finger): root, third, fifth, seventh, ninth from the bottom up.
STACK = ["root", "third", "fifth", "seventh", "ninth"]
VOICING = {c: [(n, r, 5 - i) for i, (n, r) in enumerate(zip(ns, STACK))] for c, ns in {
    "Dm9": [50, 53, 57, 60, 64],
    "Cm9": [48, 51, 55, 58, 62],
}.items()}
SUB = {"Dm9": 38, "Cm9": 36}

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
            s.hit(t, "hat", 0.3, 0.04)

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
    return round(0.25 + 0.75 * (0.5 - 0.5 * math.cos(2 * math.pi * bar / 16)), 3)


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

# A four-bar phrase on Dm9 (A C A, G F, E F A, C D), the same a step down on Cm9: long notes on
# the ones, the answers on the offbeats where the delay has room to repeat them.
LEAD_D = {
    0: [(0, 69, 18, 1), (24, 72, 12, 2), (36, 69, 12, 3)],
    1: [(12, 67, 12, 2), (24, 65, 24, 1)],
    2: [(0, 64, 18, 1), (24, 65, 12, 3), (36, 69, 12, 2)],
    3: [(0, 72, 36, 1), (42, 74, 6, 3)],
}
LEAD = {"Dm9": LEAD_D, "Cm9": {b: [(t, n - 2, ln, lv) for t, n, ln, lv in ph] for b, ph in LEAD_D.items()}}
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
        if (sec == "Deep" and bar < 16 and lv > 1) or (sec == "Abyss" and lv > 2):
            continue  # the first eight bars and the break: the long tones alone
        s.pnote(melody, o + t, n, ln, lv)
s.fingered(melody)
s.chart_to_channel(melody, s.horns, lambda e: 0.75, spread=0.03)

s.write()
