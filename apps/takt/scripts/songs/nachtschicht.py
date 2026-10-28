#!/usr/bin/env python3
"""Nachtschicht: techno in A minor at 130, 80 bars (2:28), the rumble kick, acid bass, rave
stabs and the lead of scripts/synths.py.

    python3 apps/takt/scripts/songs/nachtschicht.py   -> Takt/Content/song-nachtschicht.json

Am for six bars, G for two. Intro (the kick builds, hats), Pulse (the acid line, stabs),
Break (no kick: stabs held, the lead over them), Peak (everything, the riff), Drop-out (kick
and bass), Peak again, Out. Chords part: the rave stabs (easy the root on the 1, medium root and
fifth, hard the whole syncopated pattern). Melody part: the riff. Your keys play the stab or
the lead.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import BAR, TPB, Song  # noqa: E402

s = Song("song-nachtschicht", "Nachtschicht", "Techno", "A minor", 130, "nacht",
         "Techno at 130. A rumbling kick, a rolling acid line, stabs that cut, a riff on top.", seed=130)
s.sounds = {
    "kick": {"kit": "kickRumble", "gainDb": -16},
    "clap": {"kit": "clap909", "gainDb": -24},
    "xstick": {"kit": "rim909", "gainDb": -26},
    "hat": {"kit": "hat909", "gainDb": -29},
    "hatOpen": {"kit": "hatOpen909", "gainDb": -32},
    "ride": {"kit": "ride909", "gainDb": -33},
    "shaker": {"kit": "shaker", "gainDb": -34},
    "tom": {"kit": "tomSyn", "gainDb": -21},
}
s.instruments = {"bass": "acid", "keys": "rave", "horns": "lead", "monitor": "piano"}
# Solo renders against the blues band: the kick and the acid line a touch over it, the stabs
# and the lead at it.
s.levels = {"bass": -1, "keys": -10, "horns": -7}
s.bars = 80
SECTIONS = [(0, "Intro"), (8, "Pulse"), (24, "Break"), (32, "Peak"), (56, "Drop-out"), (64, "Peak again"), (76, "Out")]
for b, name in SECTIONS:
    s.section(b, name)


def section(bar):
    return [n for b, n in SECTIONS if b <= bar][-1]


PROG = ["Am", "Am", "Am", "Am", "Am", "Am", "G", "G"]
s.chords = [PROG[b % 8] for b in range(s.bars)]
ROOT = {"Am": 33, "G": 31}
VOICING = {
    "Am": [(57, 1, 5), (60, 3, 3), (64, 2, 1), (67, 3, 1)],   # A C E (G)
    "G": [(55, 1, 5), (59, 3, 3), (62, 2, 1), (65, 3, 1)],    # G B D (F)
}


def chord_at(bar):
    return PROG[bar % 8]


# MARK: Drums

for bar in range(s.bars):
    o = bar * BAR
    sec = section(bar)
    peak = sec in ("Peak", "Peak again")
    kick = sec != "Break" and not (sec == "Intro" and bar < 2 and False)
    if kick:
        for beat in range(4):
            v = 1.0 if beat == 0 else 0.93
            if sec == "Intro":
                v *= 0.75 + 0.03 * bar
            s.hit(o + beat * TPB, "kick", min(1.0, v), 0.02)
    if sec in ("Pulse", "Peak", "Peak again") and not (sec == "Pulse" and bar < 12):
        for t in (12, 36):
            s.hit(o + t, "clap", 0.72, 0.04)
    # Offbeat hats, 16ths under them at the peak, an open hat on the and of 4.
    for beat in range(4):
        t = beat * TPB
        if sec != "Intro" or bar >= 2:
            s.hit(o + t + 6, "hat", 0.55, 0.04)
        if peak or sec == "Pulse" and bar >= 16:
            for k in (3, 9):
                s.hit(o + t + k, "hat", 0.22, 0.04)
    if sec != "Intro" and sec != "Break":
        s.hit(o + 42, "hatOpen", 0.4 if peak else 0.3)
    if peak:
        for beat in range(4):
            s.hit(o + beat * TPB, "ride", 0.26, 0.03)
        for k in range(16):
            if k % 2 == 1:
                s.hit(o + k * 3, "shaker", 0.22, 0.04)
    if sec == "Pulse" and bar % 4 == 3:
        s.hit(o + 30, "xstick", 0.5)
        s.hit(o + 45, "xstick", 0.4)
    if bar in (31, 63):
        for k in range(16):
            s.hit(o + k * 3, "tom" if k % 2 == 0 else "clap", 0.4 + 0.035 * k)
    if bar in (23,):
        for k in range(4):
            s.hit(o + 36 + k * 3, "clap", 0.5 + 0.1 * k)
    if bar in (32, 64):
        s.hit(o, "hatOpen", 0.85)

# MARK: Bass: the acid line, rolling 16ths, octave jumps on the accents.

PATTERN = [0, 12, 0, 0, 0, 12, 0, 3, 0, 12, 0, 0, -2, 0, 12, 0]  # semitones over the root, a 16th each
for bar in range(s.bars):
    o = bar * BAR
    sec = section(bar)
    if sec == "Break" or (sec == "Intro" and bar < 4):
        continue
    r = ROOT[chord_at(bar)]
    for k, d in enumerate(PATTERN):
        if sec == "Intro" and k % 2 == 1:
            continue
        v = 0.9 if d == 12 else 0.72 if k % 4 == 0 else 0.6
        s.note(s.bass, o + k * 3, r + d, v, 2)

# MARK: Chords part: the stabs.

chords = s.part("chords", "Rave stabs", "rave", "keys", "rave")
for bar in range(s.bars):
    o = bar * BAR
    sec = section(bar)
    if sec == "Intro" and bar < 4:
        continue
    v = VOICING[chord_at(bar)]
    if sec == "Break":
        s.pchord(chords, o, v, 1, 40)
        if bar % 2 == 1:
            s.pchord(chords, o + 36, v, 3, 8)
        continue
    if sec == "Drop-out":
        if bar % 2 == 0:
            s.pchord(chords, o + 18, v, 1, 6)
        continue
    s.pchord(chords, o, v, 1, 5)
    s.pchord(chords, o + 18, v, 2, 5)
    s.pchord(chords, o + 30, v, 3, 5)
    s.pchord(chords, o + 42, v, 3, 4)
    if sec in ("Peak", "Peak again") and bar % 4 == 3:
        s.pchord(chords, o + 9, v, 3, 3)
s.chart_to_channel(chords, s.keys, lambda e: 0.75 if e["t"] % BAR == 0 else 0.6)

# MARK: Melody part: the riff.

G4, A4, C5, D5, E5, G5, A5 = 67, 69, 72, 74, 76, 79, 81
RIFF = {
    0: [(0, A4, 6, 1), (6, A4, 6, 3), (12, C5, 12, 1), (24, A4, 12, 2), (36, G4, 12, 1)],
    1: [(0, A4, 12, 1), (12, E5, 12, 2), (24, D5, 12, 3), (36, C5, 12, 1)],
    2: [(0, A4, 6, 1), (6, A4, 6, 3), (12, C5, 12, 1), (24, A4, 12, 2), (36, G4, 12, 1)],
    3: [(0, A4, 12, 1), (12, E5, 6, 2), (18, G5, 6, 3), (24, E5, 12, 1), (36, D5, 12, 3)],
    4: [(0, A4, 6, 1), (6, A4, 6, 3), (12, C5, 12, 1), (24, A4, 12, 2), (36, G4, 12, 1)],
    5: [(0, A4, 12, 1), (12, E5, 12, 2), (24, D5, 12, 3), (36, C5, 12, 1)],
    6: [(0, G4, 12, 1), (12, G4, 6, 3), (18, A4, 6, 3), (24, D5, 12, 1), (36, C5, 12, 2)],
    7: [(0, G4, 24, 1), (24, A4, 12, 2), (36, C5, 12, 3)],
}
PULSE = {  # a motif every other bar in the pulse
    0: [(0, A4, 24, 1), (24, C5, 24, 2)],
    2: [(0, E5, 24, 1), (24, D5, 24, 2)],
    4: [(0, A4, 24, 1), (24, G4, 24, 2)],
    6: [(0, G4, 36, 1), (36, A4, 12, 3)],
}
melody = s.part("melody", "The riff", "lead", "horns", "lead")
for bar in range(s.bars):
    o = bar * BAR
    sec = section(bar)
    if sec == "Intro" or sec == "Drop-out":
        continue
    if sec == "Pulse":
        for t, n, ln, lv in PULSE.get(bar % 8, []):
            s.pnote(melody, o + t, n, ln, lv)
    elif sec == "Break":
        n = E5 if chord_at(bar) == "Am" else D5
        if bar % 2 == 0:
            s.pnote(melody, o, n, 84, 1)
        else:
            s.pnote(melody, o + 36, n + 3 if n == E5 else E5, 12, 3)
    elif sec == "Out":
        if bar < 78:
            s.pnote(melody, o, A4, 48, 1)
    else:
        for t, n, ln, lv in RIFF[bar % 8]:
            s.pnote(melody, o + t, n, ln, lv)
s.chart_to_channel(melody, s.horns, lambda e: 0.8 if e["lv"] == 1 else 0.68)

s.write()
