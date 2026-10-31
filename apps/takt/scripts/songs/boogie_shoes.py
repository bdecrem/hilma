#!/usr/bin/env python3
"""Boogie Shoes: a jump blues in C at 120, shuffle, six choruses (2:24), the lesson band's kit.

    python3 apps/takt/scripts/songs/boogie_shoes.py   -> Takt/Content/song-boogie-shoes.json

Walking bass (R 3 5 6 | b7 6 5 3), the piano chanking sixth and seventh chords on 2 and 4,
the sax on the riff. Choruses: head with cross-stick; the riff with the snare in; the shout
(ride, the riff an octave up with answers); the piano takes a solo; the head; the out chorus
with the fills, a stop on the last bar. Chords part: the chanks on 2 and 4 (easy the root,
medium root and fifth, hard the voicing and the pushes). Melody part: the riff, and the piano
solo in chorus 4. Since 0.1 (60) the riff carries one anchor (weight 1) a bar, the note the
bar lands on, so Easy is the bones of the riff (BLUES.md); the other riff notes are weight 2.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import BAR, TPB, Song  # noqa: E402

FORM = ["C", "C", "C", "C", "F", "F", "C", "C", "G", "F", "C", "G"]
s = Song("song-boogie-shoes", "Boogie Shoes", "Jump blues", "C", 120, "boogie",
         "A jump blues in C. Walking bass, chanks on two and four, a riff you'll be humming.", seed=120)
s.sounds = {
    "kick": {"kit": "kick", "gainDb": -2},
    "snare": {"kit": "snare", "gainDb": -4},
    "xstick": {"kit": "xstick", "gainDb": -5},
    "hat": {"kit": "hat", "gainDb": -13},
    "hatOpen": {"kit": "hatOpen", "gainDb": -15},
    "hatFoot": {"kit": "hatFoot", "gainDb": -12},
    "ride": {"kit": "ride", "gainDb": -11},
    "rideBell": {"kit": "rideBell", "gainDb": -12},
    "crash": {"kit": "crash", "gainDb": -12},
    "tomHi": {"kit": "tomHi", "gainDb": -6},
    "tomLo": {"kit": "tomLo", "gainDb": -5},
}
s.instruments = {"bass": "bass", "keys": "piano", "horns": "sax", "monitor": "piano"}
CHORUSES = 6
s.bars = 12 * CHORUSES
s.chords = [FORM[b % 12] for b in range(s.bars)]
s.chords[-1] = "C"
for c, name in enumerate(["Head", "The riff", "Shout chorus", "Piano solo", "Head again", "Out chorus"]):
    s.section(c * 12, name)


def chord_at(bar):
    return FORM[bar % 12]


# MARK: Drums

FILLS = {
    1: [(36, "snare", 0.5), (40, "snare", 0.6), (44, "snare", 0.8)],
    2: [(24, "snare", 0.5), (32, "snare", 0.6), (36, "tomHi", 0.75), (40, "tomHi", 0.7), (44, "tomLo", 0.85)],
    3: [(32, "snare", 0.5), (36, "snare", 0.6), (40, "snare", 0.72), (44, "snare", 0.85)],
    4: [(24, "snare", 0.7), (28, "snare", 0.55), (32, "tomHi", 0.8), (36, "tomHi", 0.75), (40, "tomLo", 0.85), (44, "tomLo", 0.95)],
}

for c in range(CHORUSES):
    for b in range(12):
        bar = c * 12 + b
        o = bar * BAR
        last = b == 11
        if bar == s.bars - 1:
            s.hit(o, "kick", 1.0)
            s.hit(o, "crash", 0.95)
            s.hit(o + 24, "kick", 0.8)
            s.hit(o + 24, "snare", 0.9)
            s.hit(o + 24, "crash", 0.7)
            continue
        fill = FILLS.get(c) if last else None
        fill_from = fill[0][0] if fill else BAR
        back = "xstick" if c == 0 else "snare"
        ride = c in (2, 3, 5)
        # Four on the floor, lightly, the walking bass does the rest.
        for beat in range(4):
            t = beat * TPB
            if t < fill_from:
                s.hit(o + t, "kick", 0.8 if beat in (0, 2) else 0.55)
        if b == 0:
            s.hit(o, "crash", 0.6 + 0.08 * c)
        for t in (12, 36):
            if t < fill_from:
                s.hit(o + t, back, 0.9 if t == 36 else 0.84, 0.05)
        if back == "snare" and c >= 2:
            for t in (8, 32):
                if t < fill_from and s.rng.random() < 0.5:
                    s.hit(o + t, "snare", 0.15, 0.04)
        for beat in range(4):
            t = beat * TPB
            if t >= fill_from:
                break
            if ride:
                s.hit(o + t, "ride", 0.62 if beat in (0, 2) else 0.5)
                s.hit(o + t + 8, "ride", 0.38)
                if beat in (1, 3):
                    s.hit(o + t, "hatFoot", 0.5)
            else:
                s.hit(o + t, "hat", 0.58 if beat in (0, 2) else 0.45)
                s.hit(o + t + 8, "hat", 0.32)
            if c == 5 and beat == 0:
                s.hit(o + t, "rideBell", 0.5)
        if fill:
            for t, sound, v in fill:
                s.hit(o + t, sound, v)

# MARK: Bass: R 3 5 6 | b7 6 5 3, walking, the turnaround into C.

LINE = {
    "C": ([36, 40, 43, 45], [46, 45, 43, 40]),
    "F": ([29, 33, 36, 38], [39, 38, 36, 33]),
    "G": ([31, 35, 38, 40], [41, 40, 38, 35]),
}
for bar in range(s.bars):
    o = bar * BAR
    ch = chord_at(bar)
    b = bar % 12
    if bar == s.bars - 1:
        s.note(s.bass, o, 36, 0.95, 20)
        s.note(s.bass, o + 24, 36, 0.8, 12)
        continue
    if b == 11:
        walk = [31, 35, 38, 41]  # G B D F, into C
    elif b in (4, 6, 8, 9, 10):
        # The second bar of a pair comes down; single bars of a chord go up.
        walk = LINE[ch][0] if b in (4, 8, 9) else LINE[ch][1] if b == 6 else LINE[ch][0]
    else:
        walk = LINE[ch][0] if b % 2 == 0 else LINE[ch][1]
    for i, n in enumerate(walk):
        s.note(s.bass, o + i * TPB, n, 0.85 if i in (0, 2) else 0.72, 10)

# MARK: Chords part: the chanks on 2 and 4.

VOICING = {  # (note, role, finger)
    "C": [(60, "root", 5), (64, "third", 3), (67, "fifth", 2), (69, "sixth", 1)],     # C6: C E G A
    "F": [(60, "fifth", 5), (63, "seventh", 3), (65, "root", 2), (69, "third", 1)],  # F7: C Eb F A
    "G": [(59, "third", 5), (62, "fifth", 3), (65, "seventh", 2), (67, "root", 1)],  # G7: B D F G
}
chords = s.part("chords", "The chanks", "piano", "keys", "piano")
for bar in range(s.bars):
    o = bar * BAR
    ch = chord_at(bar)
    c = bar // 12
    if bar == s.bars - 1:
        s.pchord(chords, o, VOICING["C"], 1, 20)
        s.pchord(chords, o + 24, VOICING["C"], 2, 20)
        continue
    s.pchord(chords, o + 12, VOICING[ch], 1, 8)
    s.pchord(chords, o + 36, VOICING[ch], 1, 8)
    if c >= 2 and bar % 12 != 11:
        # The push: the chord on the last shuffle eighth into the next bar.
        s.pchord(chords, o + 44, VOICING[chord_at(bar + 1)], 3, 4)
s.chart_to_channel(chords, s.keys, lambda e: 0.58 if e["t"] % BAR in (12, 36) else 0.45)

# MARK: Melody part: the riff.

C4, Eb4, E4, F4, Fs4, G4, Bb4, B4 = 60, 63, 64, 65, 66, 67, 70, 71
C5, D5, Eb5, F5, G5, Bb5, C6 = 72, 74, 75, 77, 79, 82, 84

RIFF = {  # (tick, note, length, level) per bar of the form; one anchor (1) a bar, see BLUES.md
    0: [(0, G4, 8, 1), (8, Bb4, 4, 3), (12, C5, 12, 2), (24, Bb4, 8, 2), (32, G4, 4, 3), (36, F4, 12, 2)],
    1: [(0, Eb4, 12, 2), (12, C4, 24, 1), (44, G4, 4, 3)],
    2: [(0, G4, 8, 1), (8, Bb4, 4, 3), (12, C5, 12, 2), (24, Bb4, 8, 2), (32, G4, 4, 3), (36, F4, 12, 2)],
    3: [(0, Eb4, 12, 2), (12, C4, 24, 1), (36, Eb4, 4, 3), (40, E4, 4, 3), (44, F4, 4, 3)],
    4: [(0, C5, 8, 1), (8, Eb5, 4, 3), (12, F5, 12, 2), (24, Eb5, 8, 2), (32, C5, 4, 3), (36, Bb4, 12, 2)],
    5: [(0, F4, 12, 2), (12, C4, 24, 1), (44, G4, 4, 3)],
    6: [(0, G4, 8, 1), (8, Bb4, 4, 3), (12, C5, 12, 2), (24, Bb4, 8, 2), (32, G4, 4, 3), (36, F4, 12, 2)],
    7: [(0, Eb4, 12, 2), (12, C4, 24, 1), (36, G4, 12, 3)],
    8: [(0, D5, 12, 1), (12, C5, 12, 2), (24, Bb4, 12, 2), (36, G4, 12, 3)],
    9: [(0, F4, 12, 2), (12, Eb4, 12, 2), (24, C4, 24, 1)],
    10: [(0, C4, 12, 1), (12, E4, 12, 2), (24, G4, 12, 2), (36, Bb4, 12, 3)],
    11: [(0, G4, 24, 1), (24, Fs4, 12, 3), (36, G4, 12, 2)],
}
SOLO = {  # the piano, chorus 4: the same shapes, higher, busier
    0: [(0, G5, 8, 1), (8, Bb5, 4, 3), (12, C6, 12, 2), (24, Bb5, 8, 2), (32, G5, 4, 3), (36, Eb5, 12, 2)],
    1: [(0, C5, 12, 2), (12, Eb5, 8, 3), (20, C5, 4, 3), (24, G4, 24, 1)],
    2: [(0, G4, 8, 2), (8, Bb4, 8, 3), (16, C5, 8, 2), (24, Eb5, 8, 3), (32, E5 := 76, 8, 3), (40, G5, 8, 1)],
    3: [(0, G5, 24, 1), (24, F5, 12, 2), (36, Eb5, 12, 3)],
    4: [(0, F5, 8, 1), (8, Eb5, 4, 3), (12, C5, 12, 2), (24, Eb5, 8, 2), (32, F5, 4, 3), (36, Eb5, 12, 2)],
    5: [(0, C5, 12, 2), (12, Bb4, 12, 2), (24, G4, 24, 1)],
    6: [(0, C5, 8, 2), (8, Eb5, 4, 3), (12, E5, 4, 3), (16, G5, 8, 1), (24, Bb5, 8, 2), (32, G5, 4, 3), (36, Eb5, 12, 2)],
    7: [(0, C5, 36, 1), (36, Bb4, 12, 3)],
    8: [(0, D5, 8, 2), (8, F5, 4, 3), (12, G5, 12, 1), (24, F5, 12, 2), (36, D5, 12, 3)],
    9: [(0, F5, 12, 2), (12, Eb5, 12, 2), (24, C5, 24, 1)],
    10: [(0, G4, 8, 2), (8, Bb4, 4, 3), (12, C5, 8, 2), (20, Eb5, 4, 3), (24, E5, 12, 2), (36, G5, 12, 1)],
    11: [(0, G5, 24, 1), (24, Fs4 + 12, 12, 3), (36, G5, 12, 2)],
}

melody = s.part("melody", "The riff", "piano", "horns", "sax")
for c in range(CHORUSES):
    for b in range(12):
        bar = c * 12 + b
        o = bar * BAR
        if bar == s.bars - 1:
            s.pnote(melody, o, C5, 20, 1)
            s.pnote(melody, o + 24, C5, 20, 2)
            continue
        phrases = SOLO if c == 3 else RIFF
        for t, n, ln, lv in phrases[b]:
            # The shout chorus takes the riff up an octave.
            s.pnote(melody, o + t, n + 12 if (c == 2 and phrases is RIFF and n < 72) else n, ln, lv)
s.fingered(melody)
s.chart_to_channel(melody, s.horns, lambda e: 0.82 if e["lv"] == 1 else 0.7)
for e in s.horns:
    bar = e["t"] // BAR
    if 36 <= bar < 48:
        e["i"] = "piano"  # the piano solo
    elif e["len"] >= 12:
        e["i"] = "saxLong"

s.write()
