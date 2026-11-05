#!/usr/bin/env python3
"""Maxwell Street: Chicago blues in A at 80, the Delta plugged in, four choruses (2:24). The
Muddy Waters shape (Bart, 2026-11-01: "He took the Delta sound north and plugged it in",
Hoochie Coochie Man, Mannish Boy): eight bars of stop time on the one chord, the band slamming
a riff in unison and laying out while the voice talks, then four bars of release where the
whole band swings; a shuffle chorus in the middle where the riff turns into the drive. Named
for the Sunday market where the Chicago players plugged in; the riff is ours (a blues-scale
walk-up, root, flat third, fourth, flat fifth, fifth), not Willie Dixon's.

    python3 apps/takt/scripts/songs/maxwell_street.py          -> Takt/Content/song-maxwell-street.json
    python3 apps/takt/scripts/songs/maxwell_street.py --five   -> Takt/Content/song-maxwell-street-five.json

`--five` is **Maxwell Street II**, the song of the map's Level 2 (A minor pentatonic;
the plan wants an A on its melody at Medium): the same record with the horn on A C D E G only.
The riff walks up A C D E without the flat fifth, the bass in unison with it; the release's
riff shapes on the E and the D become E G A and D E G A, and the solo's chromatic steps go.
Every note of the part, every level, is one of the five.

12/8 feel at 80 (the late eighth on tick 8, the triplet on 4). The form is the stop-time
12-bar: A7 for eight bars, then E7 D7 A7 E7. Choruses: Stop time (the riff, the voice on the
sax, cross-stick); Stop time again (the snare in, the voice answers higher); Shuffle (the
whole band drives, the riff every bar under a ride, the sax solo, the piano's tremolo);
Out (stop time, the last bar one big stop on the 1).

Chords part: the piano (Otis Spann's chair): the A7 slam with the riff and the stab on its
landing in the stop-time bars, the 1 and the 3 with the triplet chank in the release and the
shuffle; roles for every note. Melody part: the sax, which is the horn in a Chicago band: the
riff in unison with the bass (the thing to play), the voice's answers in the gaps, the solo on
the shuffle. Not charted against BLUES.md yet (Bart: "without any charts"); the weights are
honest so the levels fall out playable.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import BAR, TPB, Song  # noqa: E402

FIVE = "--five" in sys.argv

FORM = ["A7"] * 8 + ["E7", "D7", "A7", "E7"]
if FIVE:
    s = Song("song-maxwell-street-five", "Maxwell Street II", "Chicago blues", "A", 80, "stoptime",
             "Chicago blues in A, the horn on five notes: A C D E G. Level 2's song.", seed=1954)
else:
    s = Song("song-maxwell-street", "Maxwell Street", "Chicago blues", "A", 80, "stoptime",
             "Chicago blues in A. Eight bars of stop time, the band slamming the riff, the voice in the gaps, then it swings.", seed=1954)
s.sounds = {
    "kick": {"kit": "kick", "gainDb": -2},
    "snare": {"kit": "snare", "gainDb": -4},
    "xstick": {"kit": "xstick", "gainDb": -5},
    "hat": {"kit": "hat", "gainDb": -13},
    "hatOpen": {"kit": "hatOpen", "gainDb": -15},
    "hatFoot": {"kit": "hatFoot", "gainDb": -12},
    "ride": {"kit": "ride", "gainDb": -11},
    "rideBell": {"kit": "rideBell", "gainDb": -12},
    "crash": {"kit": "crash", "gainDb": -13},
    "tomHi": {"kit": "tomHi", "gainDb": -6},
    "tomLo": {"kit": "tomLo", "gainDb": -5},
}
s.instruments = {"bass": "bass", "keys": "piano", "horns": "sax", "monitor": "piano"}
s.levels = {"keys": -2.0, "bass": 0.0, "horns": -1.0}
CHORUSES = 4
s.bars = 12 * CHORUSES
s.chords = [FORM[b % 12] for b in range(s.bars)]
s.chords[-1] = "A"
for c, name in enumerate(["Stop time", "Snare in", "Shuffle", "Out"]):
    s.section(c * 12, name)
SHUFFLE = 2


def chord_at(bar):
    return FORM[bar % 12]


def stop_time(bar):
    """The stop-time bars: the first eight of every chorus but the shuffle's."""
    return bar // 12 != SHUFFLE and bar % 12 < 8


def riff_bar(bar):
    """In stop time the riff takes the even bars; the odd ones are the voice's."""
    return stop_time(bar) and bar % 2 == 0


# The riff, bass register (A1 = 33): A C D Eb E, the E held into beat 3. (tick, note, len)
RIFF = [(0, 33, 8), (8, 36, 4), (12, 38, 8), (20, 39, 4), (24, 40, 12)]
if FIVE:
    RIFF = [(0, 33, 8), (8, 36, 4), (12, 38, 12), (24, 40, 12)]  # A C D E, no flat fifth
# The release's walking shuffle bass: a note a beat.
WALK = {"E7": [40, 44, 47, 50], "D7": [38, 42, 45, 48], "A7": [33, 37, 40, 42]}
ROOT = {"A7": 33, "D7": 38, "E7": 40}

# MARK: Drums

FILLS = {
    0: [(36, "snare", 0.55), (40, "snare", 0.62), (44, "snare", 0.8)],
    1: [(24, "snare", 0.55), (32, "tomHi", 0.7), (36, "tomHi", 0.72), (40, "tomLo", 0.8), (44, "tomLo", 0.9)],
    2: [(32, "snare", 0.55), (36, "snare", 0.65), (40, "tomLo", 0.75), (44, "snare", 0.9)],
}

for c in range(CHORUSES):
    for b in range(12):
        bar = c * 12 + b
        o = bar * BAR
        if bar == s.bars - 1:
            # The big stop: the riff's landing is the end.
            s.hit(o, "kick", 1.0)
            s.hit(o, "crash", 0.95)
            s.hit(o + 24, "kick", 0.9)
            s.hit(o + 24, "snare", 0.95)
            s.hit(o + 24, "crash", 0.8)
            continue
        if stop_time(bar):
            if riff_bar(bar):
                # The drums play the riff with the band: the 1, the push, the landing on 3.
                s.hit(o, "kick", 0.95)
                if b == 0:
                    s.hit(o, "crash", 0.7)
                s.hit(o + 12, "kick", 0.6)
                s.hit(o + 20, "kick", 0.5)
                s.hit(o + 24, "kick", 0.9)
                s.hit(o + 24, "snare" if c >= 1 else "xstick", 0.9)
                s.hit(o + 24, "crash" if c >= 1 else "ride", 0.55)
            else:
                # The gap: the foot keeps time, nothing else.
                s.hit(o + 12, "hatFoot", 0.4)
                s.hit(o + 36, "hatFoot", 0.4)
                if b == 7:
                    for t, v in [(24, 0.5), (32, 0.6), (36, 0.7), (40, 0.8), (44, 0.9)]:
                        s.hit(o + t, "snare", v)  # the fill into the release
            continue
        # The shuffle: the release bars and the shuffle chorus.
        fill = FILLS.get(c) if b == 11 else None
        fill_from = fill[0][0] if fill else BAR
        ride = c == SHUFFLE
        s.hit(o, "kick", 0.95)
        s.hit(o + 24, "kick", 0.82)
        s.hit(o + 20, "kick", 0.42)
        if b % 2 == 1:
            s.hit(o + 44, "kick", 0.38)
        if b == 0 or (b == 8 and c != SHUFFLE):
            s.hit(o, "crash", 0.65)
        for t in (12, 36):
            if t < fill_from:
                s.hit(o + t, "snare", 0.92 if t == 36 else 0.88, 0.04)
        for t in (8, 32):
            if t < fill_from and s.rng.random() < 0.5:
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
                if beat == 0 and b % 4 == 0:
                    s.hit(o + t, "rideBell", 0.5)
            else:
                s.hit(o + t, "hat", 0.6 if beat in (0, 2) else 0.46)
                s.hit(o + t + 8, "hat", 0.34)
        if not ride and b == 9:
            s.hit(o + 44, "hatOpen", 0.5)
        if fill:
            for t, sound, v in fill:
                s.hit(o + t, sound, v)

# MARK: Bass: the riff, then the walk.

for bar in range(s.bars):
    o = bar * BAR
    ch = chord_at(bar)
    b = bar % 12
    c = bar // 12
    if bar == s.bars - 1:
        for t, n, ln in RIFF:
            s.note(s.bass, o + t, n, 0.95 if t in (0, 24) else 0.8, ln if t != 24 else 20)
        continue
    if stop_time(bar):
        if riff_bar(bar):
            for t, n, ln in RIFF:
                s.note(s.bass, o + t, n, 0.95 if t in (0, 24) else 0.8, ln)
        continue
    if c == SHUFFLE and b < 8:
        # The drive: the riff every bar, the E walking back down on 4.
        for t, n, ln in RIFF:
            s.note(s.bass, o + t, n, 0.92 if t in (0, 24) else 0.76, ln)
        s.note(s.bass, o + 36, 36 if b % 2 else 38, 0.7, 12)
        continue
    if b == 11:
        # The turnaround: E, the walk down to the top.
        for i, (t, n) in enumerate([(0, 40), (12, 39), (24, 38), (36, 36)]):
            s.note(s.bass, o + t, n, 0.85 - 0.04 * i, 10)
        continue
    for i, n in enumerate(WALK[ch]):
        s.note(s.bass, o + i * TPB, n, 0.88 if i in (0, 2) else 0.74, 10)

# MARK: Chords part: the piano.

VOICING = {  # (note, role, finger): close, the C# over the riff's C natural (the Chicago rub)
    "A7": [(55, "seventh", 5), (57, "root", 4), (61, "third", 2), (64, "fifth", 1)],   # G A C# E
    "D7": [(57, "root", 5), (60, "seventh", 3), (62, "fifth", 2), (66, "third", 1)],   # A C D F#
    "E7": [(56, "third", 5), (59, "fifth", 3), (62, "seventh", 2), (64, "root", 1)],   # G# B D E
}
chords = s.part("chords", "Spann's chair", "piano", "keys", "piano")
for bar in range(s.bars):
    o = bar * BAR
    ch = chord_at(bar)
    b = bar % 12
    c = bar // 12
    if bar == s.bars - 1:
        s.pchord(chords, o, VOICING["A7"], 1, 22)
        s.pchord(chords, o + 24, VOICING["A7"], 1, 20)
        continue
    if stop_time(bar):
        if riff_bar(bar):
            # The slam with the riff, the stab on its landing.
            s.pchord(chords, o, VOICING[ch], 1, 10)
            s.pchord(chords, o + 24, VOICING[ch], 2, 12)
        continue
    # The shuffle: the 1 (1), the 3 (2), the triplet chank on the "a" of 2 and 4 (3).
    s.pchord(chords, o, VOICING[ch], 1, 10)
    s.pchord(chords, o + 24, VOICING[ch], 2, 10)
    s.pchord(chords, o + 20, VOICING[ch], 3, 4)
    s.pchord(chords, o + 44, VOICING[chord_at(bar + 1) if b != 11 else ch], 3, 4)
s.chart_to_channel(chords, s.keys, lambda e: 0.68 if e["t"] % BAR == 0 else 0.52 if e["t"] % BAR == 24 else 0.4)

# Spann's tremolo on the shuffle chorus: the record shakes the chord's top two notes on the
# held 1 and 3 (the band's channel only; the chart keeps the one chord).
tremolo = []
for e in s.keys:
    bar = e["t"] // BAR
    if bar // 12 == SHUFFLE and bar % 12 < 8 and e["t"] % BAR in (0, 24) and e["n"] >= 61:
        for k in (1, 2):
            tremolo.append({"t": e["t"] + 4 * k, "n": e["n"], "v": round(e["v"] * 0.5, 3), "len": 4})
s.keys.extend(tremolo)

# MARK: Melody part: the sax, the riff and the voice.

A3, C4, D4, Eb4, E4, G4, A4, Bb4, B4, C5, Cs5, D5, Eb5, E5, G5, A5 = 57, 60, 62, 63, 64, 67, 69, 70, 71, 72, 73, 74, 75, 76, 79, 81
F4, Ab4 = 65, 68

# The riff on the horn, an octave over the bass: (tick, note, len, level).
HORN_RIFF = [(0, A3, 8, 1), (8, C4, 4, 2), (12, D4, 8, 2), (20, Eb4, 4, 3), (24, E4, 12, 1)]
# The voice's answers in the gaps, four of them a chorus; the second chorus answers higher.
ANSWERS = [
    [(0, E4, 8, 2), (8, G4, 4, 3), (12, A4, 24, 1), (40, G4, 8, 3)],
    [(0, A4, 12, 2), (12, G4, 8, 2), (20, E4, 4, 3), (24, D4, 24, 1)],
    [(0, C5, 8, 2), (8, A4, 4, 3), (12, G4, 12, 2), (24, E4, 24, 1)],
    [(0, A4, 24, 1), (24, G4, 8, 2), (32, E4, 4, 3), (36, D4, 12, 2)],
]
HIGH = [
    [(0, A4, 8, 2), (8, C5, 4, 3), (12, D5, 24, 1), (40, C5, 8, 3)],
    [(0, E5, 12, 2), (12, D5, 8, 2), (20, C5, 4, 3), (24, A4, 24, 1)],
    [(0, G5, 8, 2), (8, E5, 4, 3), (12, D5, 12, 2), (24, C5, 24, 1)],
    [(0, A4, 12, 1), (12, C5, 8, 2), (20, Cs5, 4, 3), (24, D5, 24, 2)],
]
if FIVE:
    HORN_RIFF = [(0, A3, 8, 1), (8, C4, 4, 2), (12, D4, 12, 2), (24, E4, 12, 1)]
    HIGH[3] = [(0, A4, 12, 1), (12, C5, 12, 2), (24, D5, 24, 2)]
# The release (bars 8–11): the riff shape on the E and the D, then the turnaround.
RELEASE = {
    8: [(0, E4, 8, 1), (8, G4, 4, 2), (12, A4, 8, 2), (20, Bb4, 4, 3), (24, B4, 24, 1)],
    9: [(0, D4, 8, 1), (8, F4, 4, 2), (12, G4, 8, 2), (20, Ab4, 4, 3), (24, A4, 24, 1)],
    10: [(0, C5, 8, 2), (8, A4, 4, 3), (12, G4, 12, 2), (24, E4, 24, 1)],
    11: [(0, A3, 24, 1), (24, C4, 8, 2), (32, 61, 4, 3), (36, D4, 12, 2)],
}
# The solo on the shuffle: anchors a bar, the riff's shape turned around.
SOLO = {
    0: [(0, A4, 12, 1), (12, C5, 8, 2), (20, D5, 4, 3), (24, E5, 24, 2)],
    1: [(0, E5, 8, 2), (8, Eb5, 4, 3), (12, D5, 12, 2), (24, C5, 24, 1)],
    2: [(0, A4, 24, 1), (24, C5, 8, 2), (32, D5, 4, 3), (36, E5, 12, 2)],
    3: [(0, G5, 12, 1), (12, E5, 12, 2), (24, D5, 24, 2)],
    4: [(0, A5, 12, 1), (12, G5, 8, 2), (20, E5, 4, 3), (24, D5, 12, 2), (36, C5, 12, 2)],
    5: [(0, A4, 36, 1), (40, C5, 8, 3)],
    6: [(0, D5, 8, 2), (8, Eb5, 4, 3), (12, E5, 12, 1), (24, G5, 12, 2), (36, E5, 12, 2)],
    7: [(0, D5, 12, 2), (12, C5, 12, 2), (24, A4, 24, 1)],
}
if FIVE:
    # The release on the five notes: E G A landing on the G (the blue third of E7), D E G A,
    # and the turnaround walking up A C D E.
    RELEASE[8] = [(0, E4, 8, 1), (8, G4, 4, 2), (12, A4, 12, 2), (24, G4, 24, 1)]
    RELEASE[9] = [(0, D4, 8, 1), (8, E4, 4, 2), (12, G4, 12, 2), (24, A4, 24, 1)]
    RELEASE[11] = [(0, A3, 24, 1), (24, C4, 8, 2), (32, D4, 4, 3), (36, E4, 12, 2)]
    SOLO[1] = [(0, E5, 12, 2), (12, D5, 12, 2), (24, C5, 24, 1)]
    SOLO[6] = [(0, D5, 12, 2), (12, E5, 12, 1), (24, G5, 12, 2), (36, E5, 12, 2)]

melody = s.part("melody", "Five notes" if FIVE else "The horn", "piano", "horns", "sax")
for c in range(CHORUSES):
    for b in range(12):
        bar = c * 12 + b
        o = bar * BAR
        if bar == s.bars - 1:
            for t, n, ln, lv in HORN_RIFF:
                s.pnote(melody, o + t, n, ln if t != 24 else 20, lv)
            continue
        if stop_time(bar):
            phrase = HORN_RIFF if riff_bar(bar) else (HIGH if c == 1 else ANSWERS)[b // 2]
        elif c == SHUFFLE and b < 8:
            phrase = SOLO[b]
        else:
            phrase = RELEASE[b]
        for t, n, ln, lv in phrase:
            s.pnote(melody, o + t, n, ln, lv)
if FIVE:
    assert all(e["n"] % 12 in (9, 0, 2, 4, 7) for e in melody), "a note outside A C D E G in the five-note line"
s.fingered(melody)
s.chart_to_channel(melody, s.horns, lambda e: 0.84 if e["lv"] == 1 else 0.7, inst=None)
for e in s.horns:
    if e["len"] >= 12:
        e["i"] = "saxLong"

s.write()
