#!/usr/bin/env python3
"""Slow Burn: a slow blues in G at 68, 12/8 feel, four choruses (2:49), the lesson band's kit.

    python3 apps/takt/scripts/songs/slow_burn.py          -> Takt/Content/song-slow-burn.json
    python3 apps/takt/scripts/songs/slow_burn.py --short  -> Takt/Content/song-slow-burn-short.json

Slow Burn Short (2026-10-30) is the same song once round: one chorus (12 bars, 42 s, 45 with
the stop ringing) played the way the second chorus of the long one is (snare in, the head with
its ornaments), ending on the stop.

Chorus 1 cross-stick and hat, the head on the sax; 2 the snare comes in, the head again with
ornaments; 3 the ride, the sax solo; 4 everything, the head, and a stop on the last bar.
Chords part: the piano's comping (four-note dominant voicings; easy is the root on the 1,
medium the shell on 1 and 3, hard the whole thing with the pushes). Melody part: the sax line.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import BAR, TPB, Song  # noqa: E402

FORM = ["G7", "G7", "G7", "G7", "C7", "C7", "G7", "G7", "D7", "C7", "G7", "D7"]
SHORT = "--short" in sys.argv
if SHORT:
    s = Song("song-slow-burn-short", "Slow Burn Short", "Slow blues", "G", 68, "river",
             "The slow one in G, once round. Twelve bars and the stop.", seed=68)
else:
    s = Song("song-slow-burn", "Slow Burn", "Slow blues", "G", 68, "river",
             "A slow one in G. Twelve bars, four times round, the band leaning back.", seed=68)
s.sounds = {
    "kick": {"kit": "kick", "gainDb": -1},
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
CHORUSES = 1 if SHORT else 4
s.bars = 12 * CHORUSES
s.chords = [FORM[b % 12] for b in range(s.bars)]
s.chords[-1] = "G"
for c, name in enumerate(["Head", "Second time", "Sax solo", "Out chorus"][:CHORUSES]):
    s.section(c * 12, name)


def feel(c):
    """The arrangement a chorus is played with: the short one plays like the second time round."""
    return 1 if SHORT else c

ROOT = {"G7": 31, "C7": 36, "D7": 38}
FIFTH = {"G7": 38, "C7": 31, "D7": 33}
THIRD = {"G7": 35, "C7": 40, "D7": 30}
SIXTH = {"G7": 40, "C7": 33, "D7": 35}


def chord_at(bar):
    return FORM[bar % 12]


# MARK: Drums

FILLS = {
    0: [(36, "snare", 0.45), (40, "snare", 0.6), (44, "snare", 0.8)],
    1: [(24, "snare", 0.5), (32, "snare", 0.6), (36, "tomHi", 0.75), (40, "tomHi", 0.7), (44, "tomLo", 0.85)],
    2: [(24, "snare", 0.4), (28, "snare", 0.45), (32, "snare", 0.5), (36, "snare", 0.6), (40, "snare", 0.72), (44, "snare", 0.85)],
}

for c in range(CHORUSES):
    for b in range(12):
        bar = c * 12 + b
        o = bar * BAR
        last = b == 11
        final = bar == s.bars - 1
        if final:
            # The stop: crash and kick on the 1, then nothing.
            s.hit(o, "kick", 1.0)
            s.hit(o, "crash", 0.95)
            s.hit(o + 36, "kick", 0.5)
            s.hit(o + 36, "crash", 0.6)
            continue
        a = feel(c)
        fill = FILLS.get(a) if last else None
        fill_from = fill[0][0] if fill else BAR
        back = "xstick" if a == 0 else "snare"
        ride = a >= 2
        s.hit(o, "kick", 0.95)
        s.hit(o + 24, "kick", 0.75)
        if a >= 1 and b % 2 == 0:
            s.hit(o + 20, "kick", 0.4)  # the triplet push into 3
        if b == 0:
            s.hit(o, "crash", 0.55 + 0.12 * a)
        for t in (12, 36):
            if t < fill_from:
                s.hit(o + t, back, 0.85 if t == 12 else 0.92, 0.05)
        if back == "snare":
            for t in (8, 32):
                if t < fill_from and s.rng.random() < 0.6:
                    s.hit(o + t, "snare", 0.14, 0.04)
        for beat in range(4):
            t = beat * TPB
            if t >= fill_from:
                break
            if ride:
                s.hit(o + t, "ride", 0.6 if beat in (0, 2) else 0.45)
                s.hit(o + t + 8, "ride", 0.35)
                if a == 3:
                    s.hit(o + t + 4, "ride", 0.2)
                if beat in (1, 3):
                    s.hit(o + t, "hatFoot", 0.5)
            else:
                s.hit(o + t, "hat", 0.55 if beat in (0, 2) else 0.42)
                s.hit(o + t + 8, "hat", 0.3)
            if a == 3 and beat == 0:
                s.hit(o + t, "rideBell", 0.5)
        if fill:
            for t, sound, v in fill:
                s.hit(o + t, sound, v)

# MARK: Bass

for bar in range(s.bars):
    o = bar * BAR
    ch = chord_at(bar)
    nxt = chord_at(bar + 1) if bar + 1 < s.bars else "G7"
    c = bar // 12
    a = feel(c)
    if bar == s.bars - 1:
        s.note(s.bass, o, ROOT["G7"], 0.95, 36)
        continue
    if bar % 12 == 11 and c < CHORUSES - 1:
        # The turnaround: D7 walking down into G.
        for i, (t, n) in enumerate([(0, 38), (12, 37), (24, 36), (36, 35)]):
            s.note(s.bass, o + t, n, 0.8 - 0.05 * i, 10)
        s.note(s.bass, o + 44, 30, 0.6, 4)
        continue
    s.note(s.bass, o, ROOT[ch], 0.9, 20)
    if a >= 2:
        s.note(s.bass, o + 20, THIRD[ch], 0.55, 4)
    s.note(s.bass, o + 24, FIFTH[ch], 0.75, 14)
    if a >= 1:
        s.note(s.bass, o + 36, SIXTH[ch], 0.6, 8)
    # The last triplet eighth walks a half step into the next root.
    approach = ROOT[nxt] - 1 if nxt != ch else FIFTH[ch]
    s.note(s.bass, o + 44, approach, 0.6, 4)

# MARK: Chords part (the piano's comping)

# Four-note voicings close to middle C, smooth from one chord to the next; the bass has the
# root, so the voicing's root is the lowest note.
VOICING = {"G7": [55, 59, 62, 65], "C7": [55, 58, 60, 64], "D7": [54, 57, 60, 62]}
ROLE = {
    "G7": {55: "root", 59: "third", 62: "fifth", 65: "seventh"},
    "C7": {60: "root", 64: "third", 55: "fifth", 58: "seventh"},
    "D7": {62: "root", 54: "third", 57: "fifth", 60: "seventh"},
}
FINGER = {"G7": {55: 5, 59: 3, 62: 2, 65: 1}, "C7": {55: 5, 58: 3, 60: 2, 64: 1}, "D7": {54: 5, 57: 3, 60: 2, 62: 1}}

chords = s.part("chords", "Comping", "piano", "keys", "piano")
for bar in range(s.bars):
    o = bar * BAR
    ch = chord_at(bar)
    a = feel(bar // 12)
    if bar == s.bars - 1:
        # The last chord: the whole voicing, held.
        for n in VOICING["G7"]:
            s.pnote(chords, o, n, 40, 1, FINGER["G7"][n], ROLE["G7"][n])
        continue
    # Hits: the 1 (weight 1), the 3 and from the second chorus the 4 (2), the pushes on the
    # last triplet of 2 and of 4 (3).
    hits = [(0, 1, 20), (24, 2, 16)]
    if a >= 1:
        hits = [(0, 1, 20), (24, 2, 12), (36, 2, 8), (20, 3, 4), (44, 3, 4)]
    else:
        hits += [(44, 3, 4)]
    for t, hit_level, ln in hits:
        for n in VOICING[ch]:
            s.pnote(chords, o + t, n, ln, hit_level, FINGER[ch][n], ROLE[ch][n])
s.chart_to_channel(chords, s.keys, lambda e: 0.62 if e["t"] % BAR == 0 else 0.5 if e["t"] % BAR == 24 else 0.42)

# MARK: Melody part (the sax)

G3, Bb3, C4, Db4, D4, E4, F4, Fs4 = 55, 58, 60, 61, 62, 64, 65, 66
G4, Bb4, C5, Db5, D5, F5, G5 = 67, 70, 72, 73, 74, 77, 79

# The head: phrases per bar as (tick, note, length, level).
HEAD = {
    0: [(0, G4, 20, 1), (24, F4, 8, 2), (32, D4, 8, 3), (36, Bb3, 12, 2)],
    1: [(0, G3, 36, 1)],
    2: [(0, G4, 8, 2), (8, Bb4, 8, 3), (12, C5, 24, 1), (36, Bb4, 8, 3), (44, G4, 4, 3)],
    3: [(0, G4, 24, 1), (24, D4, 24, 2)],
    4: [(0, C5, 16, 1), (16, Bb4, 8, 3), (24, G4, 12, 2), (36, F4, 12, 3)],
    5: [(0, E4, 24, 1), (24, D4, 24, 2)],
    6: [(0, G4, 12, 1), (12, Bb4, 12, 2), (24, C5, 24, 1)],
    7: [(0, Bb4, 16, 2), (16, G4, 8, 3), (24, D4, 24, 1)],
    8: [(0, D5, 24, 1), (24, C5, 12, 2), (36, Bb4, 12, 3)],
    9: [(0, C5, 24, 1), (24, Bb4, 12, 2), (36, G4, 12, 3)],
    10: [(0, G4, 24, 1), (24, F4, 8, 3), (32, D4, 16, 2)],
    11: [(0, D4, 24, 1), (24, F4, 12, 3), (36, Fs4, 12, 3)],
}
# The solo: higher, busier, the same bones.
SOLO = {
    0: [(0, G5, 12, 1), (12, F5, 8, 2), (20, D5, 4, 3), (24, Bb4, 12, 2), (36, G4, 12, 1)],
    1: [(0, Bb4, 8, 3), (8, G4, 4, 3), (12, F4, 24, 1), (36, D4, 12, 2)],
    2: [(0, G4, 8, 2), (8, Bb4, 8, 3), (16, C5, 8, 3), (24, Db5, 8, 3), (32, D5, 16, 1)],
    3: [(0, D5, 12, 1), (12, C5, 12, 2), (24, Bb4, 12, 2), (36, G4, 12, 3)],
    4: [(0, C5, 20, 1), (24, Bb4, 8, 3), (32, C5, 4, 3), (36, Bb4, 12, 2)],
    5: [(0, G4, 24, 1), (24, E4, 12, 2), (36, F4, 12, 3)],
    6: [(0, D4, 8, 2), (8, F4, 8, 3), (16, G4, 8, 3), (24, Bb4, 12, 1), (36, G4, 12, 2)],
    7: [(0, G4, 36, 1), (36, F4, 12, 3)],
    8: [(0, D5, 16, 1), (16, C5, 8, 3), (24, D5, 8, 2), (32, C5, 8, 3), (40, Bb4, 8, 3)],
    9: [(0, C5, 16, 1), (16, Bb4, 8, 3), (24, G4, 12, 2), (36, F4, 12, 3)],
    10: [(0, D4, 12, 1), (12, F4, 12, 2), (24, G4, 24, 1)],
    11: [(0, F4, 12, 2), (12, D4, 12, 1), (24, Bb3, 12, 3), (36, Fs4, 12, 3)],
}

melody = s.part("melody", "The sax line", "piano", "horns", "sax")
for c in range(CHORUSES):
    a = feel(c)
    phrases = SOLO if a == 2 else HEAD
    for b in range(12):
        bar = c * 12 + b
        o = bar * BAR
        if bar == s.bars - 1:
            s.pnote(melody, o, G4, 40, 1)
            continue
        for t, n, ln, lv in phrases[b]:
            s.pnote(melody, o + t, n, ln, lv)
        if a in (1, 3) and b in (1, 5):
            # The second and fourth time round, a grace note into the next phrase (hard).
            s.pnote(melody, o + 44, F4 if b == 1 else Bb4, 4, 3)
s.fingered(melody)
s.chart_to_channel(melody, s.horns, lambda e: 0.8 if e["lv"] == 1 else 0.68, inst=None)
# Long sax tones use the held sample.
for e in s.horns:
    if e["len"] >= 12:
        e["i"] = "saxLong"

s.write()
