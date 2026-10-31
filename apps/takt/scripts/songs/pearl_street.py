#!/usr/bin/env python3
"""Pearl Street: a Texas shuffle in E at 112, five choruses (2:09), the lesson band's kit.

    python3 apps/takt/scripts/songs/pearl_street.py   -> Takt/Content/song-pearl-street.json

The heavy shuffle: kick on 1 and 3 with the shuffle push, the snare fat on 2 and 4, the hat
riding the triplet, a boogie bass doubling every beat (R R 3 3 5 5 6 6, then down the other
way), the piano stabbing the 1 and chanking the "a" of 2 and the 3. Quick four in bar 2.
Choruses: the head with the cross-stick; the head again with the snare in; a stop-time
chorus (the band hits the 1 and lays out for eight bars while the sax talks, then falls back
in); the sax solo on the ride; the out chorus with the fills and the stop.

Chords part: the piano's stab-and-chank (four-note dominant voicings, roles for every note).
Melody part: the sax line, one anchor a bar (BLUES.md), the stop-time answers on the
weight-2 notes, the pickups and the turnaround licks on weight 3.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import BAR, TPB, Song  # noqa: E402

FORM = ["E7", "A7", "E7", "E7", "A7", "A7", "E7", "E7", "B7", "A7", "E7", "B7"]
s = Song("song-pearl-street", "Pearl Street", "Texas shuffle", "E", 112, "boots",
         "A Texas shuffle in E. A boogie bass, a fat backbeat, and a stop-time chorus where the sax talks.", seed=112)
s.sounds = {
    "kick": {"kit": "kick", "gainDb": -1},
    "snare": {"kit": "snare", "gainDb": -3},
    "xstick": {"kit": "xstick", "gainDb": -5},
    "hat": {"kit": "hat", "gainDb": -12},
    "hatOpen": {"kit": "hatOpen", "gainDb": -14},
    "hatFoot": {"kit": "hatFoot", "gainDb": -12},
    "ride": {"kit": "ride", "gainDb": -11},
    "rideBell": {"kit": "rideBell", "gainDb": -12},
    "crash": {"kit": "crash", "gainDb": -12},
    "tomHi": {"kit": "tomHi", "gainDb": -6},
    "tomLo": {"kit": "tomLo", "gainDb": -5},
}
s.instruments = {"bass": "bass", "keys": "piano", "horns": "sax", "monitor": "piano"}
CHORUSES = 5
s.bars = 12 * CHORUSES
s.chords = [FORM[b % 12] for b in range(s.bars)]
s.chords[-1] = "E"
for c, name in enumerate(["Head", "Snare in", "Stop time", "Sax solo", "Out chorus"]):
    s.section(c * 12, name)

STOP = 2  # the stop-time chorus
SOLO = 3


def chord_at(bar):
    return FORM[bar % 12]


def stop_time(bar):
    """Bars where the band hits the 1 and lays out: the first eight of the stop-time chorus."""
    return bar // 12 == STOP and bar % 12 < 8


# Bass notes (E1 = 28): the boogie line per chord, up then down.
ROOT = {"E7": 28, "A7": 33, "B7": 35}
UP = {"E7": [28, 32, 35, 37], "A7": [33, 37, 40, 42], "B7": [35, 39, 42, 44]}      # R 3 5 6
DOWN = {"E7": [38, 37, 35, 32], "A7": [43, 42, 40, 37], "B7": [45, 44, 42, 39]}    # b7 6 5 3

# MARK: Drums

FILLS = {
    1: [(36, "snare", 0.5), (40, "snare", 0.62), (44, "snare", 0.82)],
    2: [(24, "snare", 0.55), (32, "snare", 0.6), (36, "tomHi", 0.78), (40, "tomHi", 0.7), (44, "tomLo", 0.88)],
    3: [(32, "snare", 0.5), (36, "snare", 0.62), (40, "snare", 0.74), (44, "snare", 0.88)],
    4: [(24, "snare", 0.7), (28, "snare", 0.55), (32, "tomHi", 0.8), (36, "tomHi", 0.75), (40, "tomLo", 0.85), (44, "tomLo", 0.95)],
}

for c in range(CHORUSES):
    for b in range(12):
        bar = c * 12 + b
        o = bar * BAR
        if bar == s.bars - 1:
            # The stop: the big one on the 1, the answer on the "a" of 2 and the 3.
            s.hit(o, "kick", 1.0)
            s.hit(o, "crash", 0.95)
            s.hit(o + 20, "kick", 0.7)
            s.hit(o + 24, "kick", 0.9)
            s.hit(o + 24, "snare", 0.95)
            s.hit(o + 24, "crash", 0.75)
            continue
        if stop_time(bar):
            # The band hits the 1 together and lays out.
            s.hit(o, "kick", 1.0)
            s.hit(o, "snare", 0.9)
            s.hit(o, "crash" if b % 4 == 0 else "ride", 0.8)
            if b == 7:
                for t, v in [(24, 0.5), (32, 0.6), (36, 0.7), (40, 0.8), (44, 0.9)]:
                    s.hit(o + t, "snare", v)  # the fill back in
            continue
        fill = FILLS.get(c) if b == 11 else None
        fill_from = fill[0][0] if fill else BAR
        back = "xstick" if c == 0 else "snare"
        ride = c == SOLO or c == 4
        # Kick: 1 and 3, the shuffle push into 3 and into the next bar.
        s.hit(o, "kick", 0.95)
        s.hit(o + 24, "kick", 0.82)
        s.hit(o + 20, "kick", 0.42)
        if c >= 1 and b % 2 == 1:
            s.hit(o + 44, "kick", 0.4)
        if b == 0:
            s.hit(o, "crash", 0.6 + 0.08 * c)
        for t in (12, 36):
            if t < fill_from:
                s.hit(o + t, back, 0.92 if t == 36 else 0.88, 0.04)
        if back == "snare":
            for t in (8, 32):
                if t < fill_from and s.rng.random() < 0.55:
                    s.hit(o + t, "snare", 0.16, 0.04)
        for beat in range(4):
            t = beat * TPB
            if t >= fill_from:
                break
            if ride:
                s.hit(o + t, "ride", 0.62 if beat in (0, 2) else 0.5)
                s.hit(o + t + 8, "ride", 0.4)
                if beat in (1, 3):
                    s.hit(o + t, "hatFoot", 0.5)
            else:
                s.hit(o + t, "hat", 0.6 if beat in (0, 2) else 0.46)
                s.hit(o + t + 8, "hat", 0.34)
            if c == 4 and beat == 0:
                s.hit(o + t, "rideBell", 0.5)
        if c >= 1 and b in (3, 7) and not ride:
            s.hit(o + 44, "hatOpen", 0.5)  # the open hat into the change
        if fill:
            for t, sound, v in fill:
                s.hit(o + t, sound, v)

# MARK: Bass: the boogie, two notes a beat on the shuffle.

for bar in range(s.bars):
    o = bar * BAR
    ch = chord_at(bar)
    b = bar % 12
    if bar == s.bars - 1:
        s.note(s.bass, o, ROOT["E7"], 0.95, 20)
        s.note(s.bass, o + 24, ROOT["E7"], 0.8, 16)
        continue
    if stop_time(bar):
        s.note(s.bass, o, ROOT[ch], 0.95, 12)
        if b == 7:
            # Walking back in: B A G# F#, into E.
            for i, n in enumerate([35, 33, 32, 30]):
                s.note(s.bass, o + 24 + i * 6, n, 0.7, 5)
        continue
    if b == 11:
        # The turnaround: B7 walking down into E.
        for i, (t, n) in enumerate([(0, 35), (12, 34), (24, 33), (36, 32)]):
            s.note(s.bass, o + t, n, 0.85 - 0.05 * i, 10)
        s.note(s.bass, o + 44, 27, 0.55, 4)
        continue
    line = UP[ch] if b in (0, 2, 4, 6, 8, 10) or b == 1 else DOWN[ch]
    if b == 9:
        line = DOWN[ch]
    for i, n in enumerate(line):
        s.note(s.bass, o + i * TPB, n, 0.88 if i in (0, 2) else 0.74, 7)
        s.note(s.bass, o + i * TPB + 8, n, 0.58, 3)

# MARK: Chords part: the piano's stab on the 1, the chank on the "a" of 2 and on the 3.

VOICING = {  # (note, role, finger), smooth from one chord to the next, the bass has the root
    "E7": [(56, "third", 5), (59, "fifth", 3), (62, "seventh", 2), (64, "root", 1)],   # G# B D E
    "A7": [(55, "seventh", 5), (57, "root", 4), (61, "third", 2), (64, "fifth", 1)],   # G A C# E
    "B7": [(57, "seventh", 5), (59, "root", 4), (63, "third", 2), (66, "fifth", 1)],   # A B D# F#
}
chords = s.part("chords", "Stab and chank", "piano", "keys", "piano")
for bar in range(s.bars):
    o = bar * BAR
    ch = chord_at(bar)
    c = bar // 12
    b = bar % 12
    if bar == s.bars - 1:
        s.pchord(chords, o, VOICING["E7"], 1, 20)
        s.pchord(chords, o + 24, VOICING["E7"], 2, 20)
        continue
    if stop_time(bar):
        s.pchord(chords, o, VOICING[ch], 1, 16)
        continue
    # The 1 (weight 1), the "a" of 2 and the 3 (2), the push into the next bar (3).
    s.pchord(chords, o, VOICING[ch], 1, 16)
    s.pchord(chords, o + 20, VOICING[ch], 2, 4)
    s.pchord(chords, o + 24, VOICING[ch], 2, 10)
    if c >= 1 and b != 11:
        s.pchord(chords, o + 44, VOICING[chord_at(bar + 1)], 3, 4)
s.chart_to_channel(chords, s.keys, lambda e: 0.6 if e["t"] % BAR == 0 else 0.5 if e["t"] % BAR == 24 else 0.42)

# MARK: Melody part: the sax.

B3, D4, E4, Fs4, G4, Gs4, A4, Bb4, B4 = 59, 62, 64, 66, 67, 68, 69, 70, 71
D5, E5, Fs5, G5, A5, B5 = 74, 76, 78, 79, 81, 83

# The head: (tick, note, length, level) per bar; one anchor (1) a bar, the bar's landing note.
HEAD = {
    0: [(0, E4, 12, 1), (12, G4, 8, 2), (20, A4, 4, 3), (24, B4, 20, 2)],
    1: [(0, A4, 8, 2), (8, G4, 4, 3), (12, E4, 24, 1), (44, D4, 4, 3)],
    2: [(0, E4, 12, 1), (12, G4, 8, 2), (20, A4, 4, 3), (24, B4, 12, 2), (36, D5, 12, 2)],
    3: [(0, B4, 24, 1), (24, A4, 8, 3), (32, G4, 4, 3), (36, E4, 12, 2)],
    4: [(0, A4, 12, 1), (12, G4, 8, 2), (20, E4, 4, 3), (24, G4, 20, 2)],
    5: [(0, A4, 8, 2), (8, Bb4, 4, 3), (12, B4, 24, 1), (44, A4, 4, 3)],
    6: [(0, E5, 12, 1), (12, D5, 8, 2), (20, B4, 4, 3), (24, A4, 20, 2)],
    7: [(0, G4, 12, 2), (12, E4, 24, 1), (44, D4, 4, 3)],
    8: [(0, Fs5, 12, 1), (12, E5, 8, 2), (20, D5, 4, 3), (24, B4, 20, 2)],
    9: [(0, A4, 12, 1), (12, G4, 12, 2), (24, E4, 24, 2)],
    10: [(0, E4, 12, 2), (12, G4, 8, 3), (20, Gs4, 4, 3), (24, B4, 12, 1), (36, D5, 12, 3)],
    11: [(0, B4, 24, 1), (24, A4, 8, 3), (32, Gs4, 4, 3), (36, Fs4, 12, 2)],
}
# Stop time: the sax talks in the space after each hit (bars 0–7), then the head's last four.
TALK = {
    0: [(0, E5, 12, 1), (18, D5, 6, 2), (24, B4, 20, 2)],
    1: [(0, A4, 12, 1), (18, B4, 6, 3), (24, A4, 8, 2), (32, G4, 16, 2)],
    2: [(0, E5, 12, 1), (18, G5, 6, 3), (24, E5, 20, 2)],
    3: [(0, D5, 12, 1), (18, B4, 6, 2), (24, A4, 8, 3), (32, G4, 4, 3), (36, E4, 12, 2)],
    4: [(0, A5, 12, 1), (18, G5, 6, 2), (24, E5, 20, 2)],
    5: [(0, A4, 12, 1), (18, Bb4, 6, 3), (24, B4, 20, 2)],
    6: [(0, E5, 12, 1), (18, D5, 6, 2), (24, B4, 8, 2), (32, A4, 4, 3), (36, G4, 12, 2)],
    7: [(0, E4, 36, 1)],
}
# The solo: the same bones, higher, busier.
SOLO_LINE = {
    0: [(0, E5, 8, 1), (8, G5, 4, 3), (12, A5, 12, 2), (24, G5, 8, 2), (32, E5, 4, 3), (36, D5, 12, 2)],
    1: [(0, E5, 12, 2), (12, D5, 8, 3), (20, B4, 4, 3), (24, A4, 24, 1)],
    2: [(0, E5, 8, 1), (8, G5, 4, 3), (12, A5, 8, 2), (20, Bb4 + 12, 4, 3), (24, B5, 24, 2)],
    3: [(0, A5, 12, 2), (12, G5, 12, 2), (24, E5, 24, 1)],
    4: [(0, A5, 8, 1), (8, G5, 4, 3), (12, E5, 12, 2), (24, G5, 8, 2), (32, A5, 4, 3), (36, G5, 12, 2)],
    5: [(0, E5, 12, 2), (12, D5, 12, 2), (24, B4, 24, 1)],
    6: [(0, E5, 8, 1), (8, G5, 4, 3), (12, A5, 4, 3), (16, B5, 8, 2), (24, A5, 8, 2), (32, G5, 4, 3), (36, E5, 12, 2)],
    7: [(0, D5, 12, 2), (12, B4, 36, 1)],
    8: [(0, Fs5, 8, 1), (8, A5, 4, 3), (12, B5, 12, 2), (24, A5, 12, 2), (36, Fs5, 12, 3)],
    9: [(0, A5, 12, 2), (12, G5, 12, 2), (24, E5, 24, 1)],
    10: [(0, E5, 8, 1), (8, G5, 4, 3), (12, Gs4 + 12, 4, 3), (16, B5, 8, 2), (24, A5, 12, 2), (36, G5, 12, 3)],
    11: [(0, B4, 24, 1), (24, A4, 8, 3), (32, Gs4, 4, 3), (36, Fs4, 12, 2)],
}

melody = s.part("melody", "The sax line", "piano", "horns", "sax")
for c in range(CHORUSES):
    for b in range(12):
        bar = c * 12 + b
        o = bar * BAR
        if bar == s.bars - 1:
            s.pnote(melody, o, E4, 20, 1)
            s.pnote(melody, o + 24, E4, 20, 2)
            continue
        if c == STOP and b < 8:
            phrases = TALK
        elif c == SOLO:
            phrases = SOLO_LINE
        else:
            phrases = HEAD
        for t, n, ln, lv in phrases[b]:
            s.pnote(melody, o + t, n, ln, lv)
s.fingered(melody)
s.chart_to_channel(melody, s.horns, lambda e: 0.82 if e["lv"] == 1 else 0.7, inst=None)
for e in s.horns:
    if e["len"] >= 12:
        e["i"] = "saxLong"

s.write()
