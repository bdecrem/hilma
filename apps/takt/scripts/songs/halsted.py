#!/usr/bin/env python3
"""Halsted: a Chicago boogie shuffle in A at 148, seven choruses (2:16), the full band with
the electric guitar through the amp and a rolling piano. Bart, 2026-11-07: "make a high
energy blues track that uses our new guitar and also has a keys track". Named for the street
the South Side clubs ran along; the music is ours (Elmore James's drive, Johnnie Johnson's
piano, Hound Dog Taylor's grit).

    python3 apps/takt/scripts/songs/halsted.py   -> Takt/Content/song-halsted.json

The guitar plays the riff alone for two bars and the band crashes in. Choruses: Head (the
riff), Verse (held notes and answers, the space a singer would take), Piano (the piano solos
in triplets over the guitar's chug), Stop time (the band hits the 1 for eight bars and the
guitar fires blues-scale runs), Guitar (the solo: rakes and triplet hammers on the ride),
Head, Out (the riff and one big stop). Not in the catalog or charted to BLUES.md yet.

Chords part: the piano (keys channel): a four-note voicing on every beat and its shuffle
eighth, the 1 weight 1, the other beats 2, the eighths 3. Melody part: the guitar (horns
channel, `eguitar` through `amp.horns`), single notes; the record doubles the riff's notes
with a fifth (a power-chord grind) on the channel only.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import BAR, TPB, Song  # noqa: E402

FORM = ["A7", "D7", "A7", "A7", "D7", "D7", "A7", "A7", "E7", "D7", "A7", "E7"]
NAMES = ["Head", "Verse", "Piano", "Stop time", "Guitar", "Head", "Out"]
HEADS, VERSE, PIANO, STOP, SOLO, OUT = (0, 5, 6), 1, 2, 3, 4, 6
s = Song("song-halsted", "Halsted", "Chicago boogie", "A", 148, "amp",
         "The loud one with a band. An electric riff, a rolling piano, a stop-time chorus.", seed=148)
s.sounds = {
    "kick": {"kit": "kick", "gainDb": -3},
    "snare": {"kit": "snare", "gainDb": -5},
    "hat": {"kit": "hat", "gainDb": -14},
    "hatOpen": {"kit": "hatOpen", "gainDb": -16},
    "hatFoot": {"kit": "hatFoot", "gainDb": -15},
    "ride": {"kit": "ride", "gainDb": -13},
    "rideBell": {"kit": "rideBell", "gainDb": -15},
    "crash": {"kit": "crash", "gainDb": -13},
    "tomHi": {"kit": "tomHi", "gainDb": -8},
    "tomLo": {"kit": "tomLo", "gainDb": -7},
    "xstick": {"kit": "xstick", "gainDb": -8},
}
s.instruments = {"bass": "bass", "keys": "piano", "horns": "eguitar", "monitor": "piano"}
s.levels = {"keys": -5.5, "bass": -1.5, "horns": -1.5}
s.amp = {"horns": {"drive": 22, "bias": 0.2, "tight": 130, "mid": 5, "tone": 6000, "presence": 5, "level": -9, "room": 0.22}}
s.bars = 12 * len(NAMES)
s.chords = [FORM[b % 12] for b in range(s.bars)]
s.chords[-1] = "A7"
for c, name in enumerate(NAMES):
    s.section(c * 12, name)
LAST = s.bars - 1
SHIFT = {"A7": 0, "D7": 5, "E7": 7}


def chord_at(bar):
    return FORM[bar % 12]


def stopped(bar):
    return bar // 12 == STOP and bar % 12 < 8


def intro(bar):
    """The first two bars: the guitar alone with the hat counting."""
    return bar < 2


# MARK: Drums

FILLS = [
    [(36, "snare", 0.6), (40, "snare", 0.72), (44, "snare", 0.9)],
    [(24, "snare", 0.6), (32, "tomHi", 0.8), (36, "tomHi", 0.75), (40, "tomLo", 0.88), (44, "tomLo", 0.95)],
    [(24, "snare", 0.55), (28, "snare", 0.6), (32, "snare", 0.68), (36, "snare", 0.76), (40, "snare", 0.86), (44, "snare", 0.96)],
]
for bar in range(s.bars):
    o = bar * BAR
    c, b = divmod(bar, 12)
    if bar == LAST:
        s.hit(o, "kick", 1.0)
        s.hit(o, "snare", 1.0)
        s.hit(o, "crash", 1.0)
        continue
    if intro(bar):
        for beat in range(4):
            s.hit(o + beat * TPB, "hatFoot", 0.6)
        if bar == 1:
            for t, v in [(24, 0.6), (32, 0.7), (36, 0.8), (40, 0.9), (44, 1.0)]:
                s.hit(o + t, "snare", v)
        continue
    if stopped(bar):
        s.hit(o, "kick", 1.0)
        s.hit(o, "snare", 0.95)
        s.hit(o, "crash", 0.85)
        if b == 7:
            for t, sound, v in FILLS[1]:
                s.hit(o + t, sound, v)
        continue
    fill = FILLS[c % 3] if b == 11 or (b == 7 and c in (SOLO, OUT)) else None
    fill_from = fill[0][0] if fill else BAR
    ride = c in (PIANO, SOLO, OUT)
    s.hit(o, "kick", 1.0)
    s.hit(o + 24, "kick", 0.9)
    s.hit(o + 20, "kick", 0.5)
    s.hit(o + 44, "kick", 0.45)
    if b % 4 == 0 or bar == 2:
        s.hit(o, "crash", 0.8 if b == 0 or bar == 2 else 0.6)
    for t in (12, 36):
        if t < fill_from:
            s.hit(o + t, "snare", 0.95, 0.04)
    for t in (8, 20, 32):
        if t < fill_from and s.rng.random() < 0.5:
            s.hit(o + t, "snare", 0.18, 0.05)
    for beat in range(4):
        t = beat * TPB
        if t >= fill_from:
            break
        if ride:
            s.hit(o + t, "rideBell" if beat in (0, 2) and c == OUT else "ride", 0.7 if beat in (0, 2) else 0.58)
            s.hit(o + t + 8, "ride", 0.45)
            if beat in (1, 3):
                s.hit(o + t, "hatFoot", 0.55)
        else:
            s.hit(o + t, "hat", 0.66 if beat in (1, 3) else 0.55)
            s.hit(o + t + 8, "hat", 0.4)
    if b in (3, 7) and not ride:
        s.hit(o + 44, "hatOpen", 0.55)
    if fill:
        for t, sound, v in fill:
            s.hit(o + t, sound, v)

# MARK: Bass: the boogie walk, the shuffle on every beat.

UP = {"A7": [33, 37, 40, 42], "D7": [38, 42, 45, 47], "E7": [40, 44, 47, 49]}       # R 3 5 6
DOWN = {"A7": [43, 42, 40, 37], "D7": [48, 47, 45, 42], "E7": [50, 49, 47, 44]}     # b7 6 5 3
for bar in range(s.bars):
    o = bar * BAR
    ch, b = chord_at(bar), bar % 12
    if intro(bar):
        continue
    if bar == LAST:
        s.note(s.bass, o, 33, 1.0, 40)
        continue
    if stopped(bar):
        s.note(s.bass, o, UP[ch][0], 1.0, 10)
        continue
    if b == 11:
        for i, n in enumerate([40, 39, 38, 37]):
            s.note(s.bass, o + i * TPB, n, 0.9, 8)
            s.note(s.bass, o + i * TPB + 8, n, 0.6, 3)
        continue
    line = UP[ch] if bar % 2 == 0 else DOWN[ch]
    for i, n in enumerate(line):
        s.note(s.bass, o + i * TPB, n, 0.92 if i in (0, 2) else 0.8, 7)
        s.note(s.bass, o + i * TPB + 8, n, 0.6, 3)

# MARK: Chords part: the piano, a voicing on every beat and its shuffle eighth.

VOICING = {  # (note, role, finger)
    "A7": [(55, "seventh", 5), (61, "third", 3), (64, "fifth", 2), (69, "root", 1)],   # G C# E A
    "D7": [(57, "fifth", 5), (60, "seventh", 4), (62, "root", 3), (66, "third", 1)],   # A C D F#
    "E7": [(56, "third", 5), (59, "fifth", 4), (62, "seventh", 2), (64, "root", 1)],   # G# B D E
}
chords = s.part("chords", "Boogie piano", "piano", "keys", "piano")
for bar in range(s.bars):
    o = bar * BAR
    ch, b = chord_at(bar), bar % 12
    if intro(bar):
        continue
    if bar == LAST:
        s.pchord(chords, o, VOICING["A7"], 1, 44)
        continue
    if stopped(bar):
        s.pchord(chords, o, VOICING[ch], 1, 10)
        continue
    for beat in range(4):
        s.pchord(chords, o + beat * TPB, VOICING[ch], 1 if beat == 0 else 2, 6)
        s.pchord(chords, o + beat * TPB + 8, VOICING[ch], 3, 3)
s.chart_to_channel(chords, s.keys, lambda e: 0.82 if e["t"] % BAR == 0 else 0.72 if e["t"] % TPB == 0 else 0.55)

# The piano's solo chorus: right-hand triplets over the comping, on the channel only.
A4, C5, Cs5, D5, Eb5, E5, G5, A5, C6 = 69, 72, 73, 74, 75, 76, 79, 81, 84
PIANO_SOLO = {
    "A7": [(A5, E5), (G5, E5), (A5, C5)],
    "D7": [(A5, D5), (G5, D5), (A5, C5)],
    "E7": [(G5, E5), (A5, E5), (C6, A5)],
}
for b in range(12):
    bar = PIANO * 12 + b
    o = bar * BAR
    hi, lo = PIANO_SOLO[chord_at(bar)][b % 3]
    for t in range(0, BAR, 4):
        s.note(s.keys, o + t, hi if (t // 4) % 2 == 0 else lo, 0.62 if t % TPB == 0 else 0.5, 4)

# MARK: Melody part: the guitar.


def tr(line, k):
    return [(t, n + k, ln, lv) for t, n, ln, lv in line]


B3, A3, C4, Cs4, D4, Eb4, E4, Fs4, G4 = 59, 57, 60, 61, 62, 63, 64, 66, 67
RIFF = [
    [(0, A3, 8, 1), (8, A3, 4, 3), (12, C4, 6, 2), (20, Cs4, 4, 3), (24, E4, 8, 2), (32, E4, 4, 3), (36, G4, 6, 2), (44, E4, 4, 3)],
    # The C♯ is the main note and the low A its ornament, so a level without ornaments walks C up to
    # C♯ in one hand position (A4 G4 C4 A3 then E4 a beat apart is a hand jump inside a beat).
    [(0, A4, 12, 1), (12, G4, 6, 2), (20, E4, 4, 3), (24, C4, 6, 2), (32, Cs4, 4, 2), (36, A3, 12, 3)],
]
TURN = [(0, E4, 8, 1), (8, D4, 4, 3), (12, Cs4, 8, 2), (20, C4, 4, 3), (24, B3, 12, 2), (36, Eb4, 6, 3), (44, E4, 4, 3)]
# The verse: a held note a singer's line would sit under, then an answer on 3 and 4.
# The answer lands on the "and" of 3 and holds, so the hand has a beat and a half to move down to the
# riff or the turnaround (a fourth down off the thumb inside a beat is no hand's move).
ANSWER = [(24, C5, 4, 3), (28, A4, 4, 3), (32, A4, 12, 2)]
HOLD = {"A7": E5, "D7": D5, "E7": E5}
# The stop-time runs: down the blues scale in triplets, landing on the root.
RUNS = [
    [(t, n, 4, 3 if i else 1) for i, (t, n) in enumerate(zip(range(0, 36, 4), [A5, G5, E5, Eb5, D5, C5, A4, G4, E4]))] + [(36, A4, 12, 2)],
    [(t, n, 4, 3 if i else 1) for i, (t, n) in enumerate(zip(range(0, 36, 4), [C5, D5, Eb5, E5, G5, A5, C6, A5, G5]))] + [(36, A5, 12, 2)],
    # The third bar of each four starts a step lower, so Beginner's anchors there are two keys.
    [(t, n, 4, 3 if i else 1) for i, (t, n) in enumerate(zip(range(0, 36, 4), [G5, E5, Eb5, D5, C5, A4, G4, E4, G4]))] + [(36, A4, 12, 2)],
]


def figure(top, land2, land1):
    return [(t, top, 4, 1 if t == 0 else 3) for t in range(0, 24, 4)] + [(24, land2, 12, 2), (36, land1, 12, 2)]


def rake(top):
    return [(0, top - 1, 2, 3), (2, top, 22, 1), (24, top - 3, 6, 2), (32, top - 5, 4, 3), (36, top - 8, 12, 2)]


SOLO_LINE = {
    "A7": [figure(A5, G5, E5), rake(A5)],
    "D7": [figure(A5, G5, D5), rake(A5)],
    "E7": [figure(G5, E5, D5), rake(A5)],
}

melody = s.part("melody", "Electric guitar", "piano", "horns", "eguitar")
for bar in range(s.bars):
    o = bar * BAR
    c, b = divmod(bar, 12)
    ch = chord_at(bar)
    k = SHIFT[ch]
    if bar == LAST:
        line = [(0, A4 - 1, 2, 3), (2, A4, 42, 1)]
    elif b == 11:
        line = TURN
    elif c in HEADS or c == OUT or c == PIANO:
        line = tr(RIFF[bar % 2], k)
    elif c == VERSE:
        line = [(0, HOLD[ch], 20, 1)] + tr(ANSWER, k) if b % 2 == 0 else tr(RIFF[1], k)
    elif c == STOP:
        line = RUNS[(0, 1, 2, 1)[b % 4]] if b < 8 else tr(RIFF[bar % 2], k)
    else:
        line = SOLO_LINE[ch][b % 2]
    for t, n, ln, lv in line:
        # One anchor every two bars: at 148 a bar is 1.62 s, and an anchor a bar (0.62 a second)
        # put Easy at 0.88, over BLUES.md's band. The odd bar's anchor plays as a main note.
        if lv == 1 and bar % 2 == 1 and bar != LAST:
            lv = 2
        s.pnote(melody, o + t, n, ln, lv)
s.fingered(melody)
s.chart_to_channel(melody, s.horns, lambda e: 1.0 if e["lv"] == 1 else 0.9 if e["lv"] == 2 else 0.82)
# The grind: the riff's notes doubled a fifth up on the record (head, piano and out choruses).
for e in list(melody):
    c = e["t"] // BAR // 12
    if (c in HEADS or c in (PIANO, OUT)) and e["n"] < 69 and e["len"] >= 4:
        s.note(s.horns, e["t"], e["n"] + 7, 0.85, e["len"])
s.horns.sort(key=lambda e: e["t"])

s.write()
