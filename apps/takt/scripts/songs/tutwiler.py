#!/usr/bin/env python3
"""Tutwiler: a Delta stomp in G at 132, six choruses (2:11). The loudest, fastest of the
old-school tracks, after Son House's drive and Bukka White's train: the thumb pounding every
beat, the chord slapped on the backbeat, the slide raking up to the high G and hammering
triplets. Named for the Tutwiler station where W.C. Handy heard a man play slide with a knife
in 1903; the music is ours. Same guitar and foot as Dockery and Friars Point
(scripts/guitar.py, Karoryfer's Shinyguitar), played hot.

    python3 apps/takt/scripts/songs/tutwiler.py   -> Takt/Content/song-tutwiler.json

Choruses: Head, Verse, Stomp (stop time: the band hits the 1 for eight bars and the slide
talks alone, then the drive comes back), Slide (the triplet figure every bar), Shout (slide
figures and the voice trading bars), Out (one big slam). Not charted to BLUES.md yet and not
in the catalog: 2026-11-07, Bart asked for the audio only.

Chords part: the thumb (root and fifth alternating, a note a beat), the strum on 2 and 4
(weight 1 on the 2, 2 on the 4), a dead-string slap on every late eighth (the record's only).
Melody part: the slide, on the horns channel, the same guitar.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import BAR, TPB, Song  # noqa: E402

FORM = ["G7", "G7", "G7", "G7", "C7", "C7", "G7", "G7", "D7", "C7", "G7", "D7"]
s = Song("song-tutwiler", "Tutwiler", "Delta stomp", "G", 132, "triplets",
         "The loud one. The thumb pounding every beat, the slide raking the high G, the foot going.", seed=1903)
s.sounds = {
    "kick": {"kit": "kick", "gainDb": -5},
    "hatFoot": {"kit": "hatFoot", "gainDb": -11},
    "knock": {"kit": "guitarPerc", "gainDb": -8},
    "xstick": {"kit": "xstick", "gainDb": -4},  # the count-in's click only
}
s.instruments = {"bass": "bass", "keys": "guitar", "horns": "guitar", "monitor": "guitar"}
s.levels = {"keys": -2.0, "bass": -5.0, "horns": -1.5}
NAMES = ["Head", "Verse", "Stomp", "Slide", "Shout", "Out"]
CHORUSES = len(NAMES)
STOMP, SLIDE, SHOUT = 2, 3, 4
s.bars = 12 * CHORUSES
s.chords = [FORM[b % 12] for b in range(s.bars)]
s.chords[-1] = "G"
for c, name in enumerate(NAMES):
    s.section(c * 12, name)


def stopped(bar):
    """The stomp chorus's first eight bars: the band on the 1 only."""
    return bar // 12 == STOMP and bar % 12 < 8


# MARK: The foot

for bar in range(s.bars):
    o = bar * BAR
    if bar == s.bars - 1:
        s.hit(o, "kick", 1.0)
        s.hit(o, "knock", 1.0)
        continue
    if stopped(bar):
        s.hit(o, "kick", 1.0, 0.03)
        s.hit(o, "knock", 0.95, 0.03)
        continue
    for beat in range(4):
        s.hit(o + beat * TPB, "kick", 0.98 if beat in (0, 2) else 0.8, 0.04)
        if beat in (1, 3):
            s.hit(o + beat * TPB, "hatFoot", 0.6, 0.06)
            s.hit(o + beat * TPB, "knock", 0.95, 0.04)
    # The push into the next bar, and into the 3 once the song is going.
    s.hit(o + 44, "kick", 0.55, 0.05)
    if bar >= 12:
        s.hit(o + 20, "kick", 0.45, 0.05)

# MARK: Chords part: the thumb, the strum, the slap.

THUMB = {  # root and the fifth under it, alternating a beat apart
    "G7": [(43, "root"), (50, "fifth")],
    "C7": [(48, "root"), (43, "fifth")],
    "D7": [(50, "root"), (45, "fifth")],
}
STRUM = {  # (note, role, finger)
    "G7": [(55, "root", 3), (59, "third", 2), (65, "seventh", 1)],
    "C7": [(55, "fifth", 3), (58, "seventh", 2), (64, "third", 1)],
    "D7": [(54, "third", 3), (60, "seventh", 2), (62, "root", 1)],
}
SLAM = [(43, "root", 5), (50, "fifth", 4), (55, "root", 3), (59, "third", 2), (65, "seventh", 1)]

chords = s.part("chords", "Thumb and strum", "piano", "keys", "guitar")
for bar in range(s.bars):
    o = bar * BAR
    ch = FORM[bar % 12]
    b = bar % 12
    if bar == s.bars - 1:
        s.pchord(chords, o, SLAM, 1, 44)
        continue
    if stopped(bar):
        s.pchord(chords, o, SLAM, 1, 18)
        continue
    if b == 11:
        # The turnaround: the thumb walks D down to G's door, the strum on the 2 and the 4.
        for beat, (n, role) in enumerate([(50, "root"), (49, "seventh"), (48, "seventh"), (45, "fifth")]):
            s.pnote(chords, o + beat * TPB, n, 10, 3, 5, role)
        s.pchord(chords, o + TPB, STRUM["D7"], 1, 8)
        s.pchord(chords, o + 3 * TPB, STRUM["D7"], 2, 8)
        continue
    for beat in range(4):
        n, role = THUMB[ch][beat % 2]
        s.pnote(chords, o + beat * TPB, n, 10, 3, 5, role)
        if beat in (1, 3):
            s.pchord(chords, o + beat * TPB, STRUM[ch], 1 if beat == 1 else 2, 8)
        s.pchord(chords, o + beat * TPB + 8, STRUM[ch], 3, 3)
s.chart_to_channel(chords, s.keys, lambda e: 1.0 if e["len"] >= 18 else 0.95 if e["lv"] == 1 else 0.88 if e["lv"] == 2
                   else 0.8 if e["len"] == 3 else 0.9)
# Every late-eighth chord is a dead-string slap on the record.
for e in s.keys:
    if e["t"] % TPB == 8 and e["len"] == 3:
        e["i"] = "guitarMute"
# The bass under the thumb, an octave down.
for e in chords:
    if e["n"] <= 50 and (e["len"] == 10 or e["len"] >= 18):
        s.note(s.bass, e["t"], e["n"] - 12, 0.85, 10 if e["len"] == 10 else 18)

# MARK: Melody part: the slide.

G4, A4, Bb4, B4, C5, D5, E5, F5, Fs5, G5, Gs5, A5 = 67, 69, 70, 71, 72, 74, 76, 77, 78, 79, 80, 81


def rake(top, under=None):
    """The slide raking up into the top note: a grace a half step under."""
    return [(0, (under or top - 1), 2, 3), (2, top, 10, 1)]


def figure(top, land2, land1):
    """The triplet hammer: the top note six times over two beats, the step, the landing."""
    return [(t, top, 4, 3 if t else 1) for t in range(0, 24, 4)] + [(24, land2, 12, 2), (36, land1, 12, 2)]


HEAD = {
    0: rake(G5, Fs5) + [(12, G5, 4, 3), (16, G5, 4, 3), (20, G5, 4, 3), (24, F5, 6, 2), (30, D5, 6, 2), (36, Bb4, 6, 2), (42, G4, 6, 3)],
    1: [(0, G4, 12, 1), (12, Bb4, 6, 3), (18, B4, 6, 3), (24, D5, 24, 2)],
    2: rake(G5, Fs5) + [(12, G5, 4, 3), (16, G5, 4, 3), (20, G5, 4, 3), (24, F5, 6, 2), (30, D5, 6, 2), (36, Bb4, 6, 2), (42, G4, 6, 3)],
    3: [(0, G4, 30, 1), (36, F5, 4, 3), (40, Fs5, 8, 3)],
    4: rake(G5, Fs5) + [(12, E5, 6, 2), (18, C5, 6, 2), (24, Bb4, 12, 2), (36, G4, 12, 3)],
    5: [(0, C5, 12, 1), (12, Bb4, 6, 3), (18, A4, 6, 3), (24, G4, 24, 2)],
    6: rake(G5, Fs5) + [(12, G5, 4, 3), (16, G5, 4, 3), (20, G5, 4, 3), (24, F5, 6, 2), (30, D5, 6, 2), (36, Bb4, 6, 2), (42, G4, 6, 3)],
    7: [(0, G4, 24, 1), (24, Bb4, 8, 2), (32, B4, 4, 3), (36, D5, 12, 2)],
    8: rake(A5, Gs5) + [(12, Fs5, 6, 2), (18, D5, 6, 2), (24, C5, 12, 2), (36, A4, 12, 3)],
    9: [(0, G5, 12, 1), (12, E5, 12, 2), (24, C5, 24, 2)],
    10: [(0, D5, 8, 2), (8, Bb4, 4, 3), (12, G4, 12, 1), (24, D5, 8, 2), (32, Bb4, 4, 3), (36, G4, 12, 2)],
    11: [(0, G5, 6, 2), (6, Fs5, 6, 3), (12, F5, 6, 2), (18, E5, 6, 3), (24, D5, 24, 1)],
}
SLIDE_LINE = {
    0: figure(G5, F5, D5), 1: figure(G5, D5, Bb4), 2: figure(G5, F5, D5), 3: figure(A5, G5, F5),
    4: figure(G5, E5, C5), 5: figure(G5, E5, Bb4), 6: figure(G5, F5, D5), 7: figure(G5, D5, B4),
    8: figure(A5, Fs5, D5), 9: figure(G5, E5, C5), 10: figure(G5, F5, D5), 11: HEAD[11],
}

melody = s.part("melody", "The slide", "piano", "horns", "guitar")
for c in range(CHORUSES):
    for b in range(12):
        bar = c * 12 + b
        o = bar * BAR
        if bar == s.bars - 1:
            s.pnote(melody, o, Fs5, 2, 3)
            s.pnote(melody, o + 2, G5, 42, 1)
            continue
        if c == SLIDE:
            line = SLIDE_LINE[b]
        elif c == SHOUT:
            line = SLIDE_LINE[b] if b % 2 == 0 else HEAD[b]
        else:
            line = HEAD[b]
        for t, n, ln, lv in line:
            s.pnote(melody, o + t, n, ln, lv)
s.fingered(melody)
s.chart_to_channel(melody, s.horns, lambda e: 1.0 if e["lv"] == 1 else 0.92 if e["lv"] == 2 else 0.86)

s.write()
