#!/usr/bin/env python3
"""Friars Point: a Delta boogie in E at 116, the loud fast Robert Johnson (I Believe I'll Dust
My Broom, Sweet Home Chicago), five choruses (2:04). The same guitar and foot as Dockery
(scripts/guitar.py, Karoryfer's Shinyguitar), played harder and quicker. Named for the river
town Johnson sings of in Traveling Riverside Blues; the music is ours, the shape is his.

    python3 apps/takt/scripts/songs/friars_point.py   -> Takt/Content/song-friars-point.json

The thumb walks the boogie on the low strings, a note a beat (root, fifth, sixth, seventh
and back), the chord chick on every late eighth of the shuffle (the dead strings on the
record, the chord in the chart). The slide answers in the treble: the triplet figure on the
high strings, hammered for two beats, landing on the chord's note, then the voice in the
next bar. A slide chorus in the middle keeps the triplets going; the out chorus ends on one
big stop. The foot is the kick on every beat with the heel's chick and a knock on the body on
the backbeat; a bass doubles the thumb an octave down. Everything plays hot.

Chords part: the thumb and the chick (roles for every note: root, fifth, sixth, seventh for
the walk; the chick is the fifth, the root and the third). Melody part: the slide and the
voice, on the horns channel, the same guitar. Your keys play the piano (or the Rhodes or the
organ from Settings) on both parts; the record's guitar plays what your part leaves out.
Charted to BLUES.md (0.1 (73)): the blues melody patch (Easy = tier 2, a chorus-long phrase, no
borrowing); the chords ladder needed nothing. Beginner on the melody is every other anchor (at
116 the bar is 2.07 s, under Beginner's 2.4 s gap), so Easy is 2.3 times Beginner; the sheet
notes it.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import BAR, TPB, Song  # noqa: E402

FORM = ["E7", "E7", "E7", "E7", "A7", "A7", "E7", "E7", "B7", "A7", "E7", "B7"]
s = Song("song-friars-point", "Friars Point", "Delta boogie", "E", 116, "triplets",
         "The fast one. A boogie thumb on the low strings, the slide hammering triplets up top, the foot going.", seed=1937)
s.sounds = {
    "kick": {"kit": "kick", "gainDb": -2},
    "hatFoot": {"kit": "hatFoot", "gainDb": -8},
    "knock": {"kit": "guitarPerc", "gainDb": -5},
    "xstick": {"kit": "xstick", "gainDb": -4},  # the count-in's click only
}
s.instruments = {"bass": "bass", "keys": "guitar", "horns": "guitar", "monitor": "guitar"}
s.levels = {"keys": 2.0, "bass": -1.0, "horns": 2.0}
CHORUSES = 5
s.bars = 12 * CHORUSES
s.chords = [FORM[b % 12] for b in range(s.bars)]
s.chords[-1] = "E"
for c, name in enumerate(["Head", "Verse", "Slide", "Verse", "Out"]):
    s.section(c * 12, name)
SLIDE = 2


def chord_at(bar):
    return FORM[bar % 12]


# MARK: The foot

for bar in range(s.bars):
    o = bar * BAR
    if bar == s.bars - 1:
        s.hit(o, "kick", 1.0)
        s.hit(o, "knock", 1.0)
        continue
    for beat in range(4):
        s.hit(o + beat * TPB, "kick", 0.95 if beat in (0, 2) else 0.72, 0.05)
        if beat in (1, 3):
            s.hit(o + beat * TPB, "hatFoot", 0.5, 0.06)
            s.hit(o + beat * TPB, "knock", 0.9, 0.05)
    s.hit(o + 20, "kick", 0.4, 0.05)

# MARK: Chords part: the thumb's boogie and the chick.

# The walk, a note a beat: root, fifth, sixth, seventh on the odd bars, back down on the even.
WALK = {  # (note, role)
    "E7": [(40, "root"), (47, "fifth"), (49, "sixth"), (50, "seventh")],
    "A7": [(45, "root"), (52, "fifth"), (54, "sixth"), (55, "seventh")],
    "B7": [(47, "root"), (54, "fifth"), (56, "sixth"), (57, "seventh")],
}
CHICK = {  # (note, role, finger): the chord on the middle strings
    "E7": [(59, "fifth", 3), (64, "root", 2), (68, "third", 1)],
    "A7": [(57, "fifth", 3), (62, "root", 2), (66, "third", 1)],
    "B7": [(59, "fifth", 3), (63, "third", 2), (66, "fifth", 1)],
}
SLAM = [(40, "root", 5), (47, "fifth", 4), (52, "root", 3), (56, "third", 2), (62, "seventh", 1)]

chords = s.part("chords", "The boogie thumb", "piano", "keys", "guitar")
for bar in range(s.bars):
    o = bar * BAR
    ch = chord_at(bar)
    b = bar % 12
    if bar == s.bars - 1:
        s.pchord(chords, o, SLAM, 1, 44)
        continue
    if b == 11:
        # The turnaround: B down to the E, the thumb alone.
        for beat, (n, role) in enumerate([(47, "root"), (46, "seventh"), (45, "sixth"), (44, "fifth")]):
            s.pnote(chords, o + beat * TPB, n, 12, 1 if beat == 0 else 2, 5, role)
        continue
    walk = WALK[ch] if b % 2 == 0 else [WALK[ch][0], WALK[ch][3], WALK[ch][2], WALK[ch][1]]
    for beat, (n, role) in enumerate(walk):
        s.pnote(chords, o + beat * TPB, n, 12, 1 if beat in (0, 2) else 2, 5, role)
        s.pchord(chords, o + beat * TPB + 8, CHICK[ch], 3, 4)
s.chart_to_channel(chords, s.keys, lambda e: 1.0 if e["len"] >= 40 else 0.9 if e["lv"] == 1 else 0.82 if e["lv"] == 2 else 0.74)
# Every chick is a dead-string slap on the record (the chart keeps the chord).
for e in s.keys:
    if e["t"] % TPB == 8 and e["len"] == 4:
        e["i"] = "guitarMute"
# The bass under the thumb, an octave down.
for e in chords:
    if e["len"] >= 12 and e["n"] <= 50:
        s.note(s.bass, e["t"], e["n"] - 12, 0.82 if e["lv"] == 1 else 0.7, 12)

# MARK: Melody part: the slide's triplets and the voice.

E4, Fs4, G4, Gs4, A4, B4, Cs5, D5, Ds5, E5, Fs5, G5, Gs5, B5 = 64, 66, 67, 68, 69, 71, 73, 74, 75, 76, 78, 79, 80, 83


def figure(top, land2, land1):
    """The slide figure: the high note hammered in triplets for two beats (3), the step on
    beat 3 (2), the landing on beat 4 (1)."""
    return [(t, top, 4, 3) for t in range(0, 24, 4)] + [(24, land2, 12, 2), (36, land1, 12, 1)]


HEAD = {
    0: figure(E5, D5, B4),
    1: [(0, B4, 12, 2), (12, Gs4, 6, 3), (18, G4, 6, 3), (24, E4, 24, 1)],
    2: figure(E5, D5, B4),
    3: [(0, E4, 36, 1), (40, D5, 8, 3)],
    4: figure(Cs5, B4, A4),
    5: [(0, A4, 12, 2), (12, G4, 12, 2), (24, E4, 24, 1)],
    6: figure(E5, D5, B4),
    7: [(0, E4, 24, 1), (24, G4, 8, 2), (32, Gs4, 4, 3), (36, B4, 12, 2)],
    8: figure(Fs5, Ds5, B4),
    9: [(0, A4, 12, 1), (12, G4, 12, 2), (24, E4, 24, 2)],
    10: [(0, E5, 12, 2), (12, D5, 12, 2), (24, B4, 24, 1)],
    11: [(0, E4, 8, 2), (8, Fs4, 4, 3), (12, G4, 8, 2), (20, Gs4, 4, 3), (24, B4, 12, 1), (36, D5, 12, 3)],
}
# The slide chorus: the figure in every bar, the landings walking the changes.
SLIDE_LINE = {
    0: figure(E5, D5, B4), 1: figure(E5, B4, Gs4), 2: figure(E5, D5, B4), 3: figure(G5, E5, D5),
    4: figure(Cs5, B4, A4), 5: figure(Cs5, A4, G4), 6: figure(E5, D5, B4), 7: figure(E5, B4, E4 + 12),
    8: figure(Fs5, Ds5, B4), 9: figure(Cs5, B4, A4), 10: figure(E5, D5, B4),
    11: [(0, E5, 8, 2), (8, D5, 4, 3), (12, B4, 8, 2), (20, Gs4, 4, 3), (24, E4, 24, 1)],
}

melody = s.part("melody", "The slide", "piano", "horns", "guitar")
for c in range(CHORUSES):
    for b in range(12):
        bar = c * 12 + b
        o = bar * BAR
        if bar == s.bars - 1:
            s.pnote(melody, o, E5, 44, 1)
            continue
        for t, n, ln, lv in (SLIDE_LINE if c == SLIDE else HEAD)[b]:
            s.pnote(melody, o + t, n, ln, lv)
s.fingered(melody)
s.chart_to_channel(melody, s.horns, lambda e: 0.96 if e["lv"] == 1 else 0.9 if e["lv"] == 2 else 0.86)

s.write()
