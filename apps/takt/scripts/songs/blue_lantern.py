#!/usr/bin/env python3
"""Blue Lantern: a minor blues in D at 84, straight eighths over a sixteenth hat, four choruses
(2:17), a Rhodes comping, the sax on the line.

    python3 apps/takt/scripts/songs/blue_lantern.py           -> Takt/Content/song-blue-lantern.json
    python3 apps/takt/scripts/songs/blue_lantern.py --white   -> Takt/Content/song-blue-lantern-white.json

`--white` is **Blue Lantern II**, the song of the map's Level 1 (white keys: A natural
minor, C major; the plan wants an A on its melody at Medium): the same record with a line of
its own, one riff in one hand. Every odd bar is the riff bar, D5 on the 1 held, F4 on the "and"
of 3 (with the kick); every even bar holds one note on the 1 that follows the chord: A over the
Dm7 (C the second time, the seventh), G over the Gm7, E then B over the A7s of the turnaround,
back to D. The hand never moves: the thumb on F4 (reaching down to E), 2 on G, 3 on A, 4 on C
(reaching down to B), 5 on D. Easy+ is exactly that, 72 notes (2026-11-05: Bart found the
sax line's 120 "too hard" as Medium, and asked for simpler patterns that repeat more often; it
had 24 different bars; 2026-11-06 he asked for that chart to become "EZ-2" and for a Medium a
little harder). Medium (tier 6: `from` 6 on the notes) is the riff with three figures that
move the hand, a thumb under in each: the climb C5 D5 E5 F5 in eighths off the B4 of the
turnaround's last bar (bars 12 and 24, into the second chorus and into the solo) and the run
F4 to D5 in eighths off the E4 of bar 34 (the solo's A7); 86 notes. Hard (tier 7: `from` 7) adds the passing C between
the D and the F, and in the solo chorus two pickup eighths into every riff but the run's (120).
Every note of the part, every level, is a white key, and Easy+ already plays all seven.

The slow-funk minor blues (the thrill-is-gone feel): kick on the 1 and the "and" of 3, the snare
on 2 and 4, the hat in sixteenths with the eighths accented, an open hat into the 1 every other
bar. The bass sits on the root and answers on the seventh and the fifth. Form: Dm7 four bars,
Gm7 two, Dm7 two, Bb7 A7 Dm7 A7. Choruses: the head (cross-stick, the Rhodes sparse); the head
with the snare in; the sax solo on the ride; the out chorus, ending on the Dm with the Rhodes
held.

Chords part: the Rhodes comping (minor-seventh voicings, the 1, the "and" of 2 and the 4, the
push). Melody part: the sax line in D minor, one anchor a bar (BLUES.md), its answers on
weight 2, the turns and pickups on weight 3.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import BAR, TPB, Song  # noqa: E402

WHITE = "--white" in sys.argv

FORM = ["Dm7", "Dm7", "Dm7", "Dm7", "Gm7", "Gm7", "Dm7", "Dm7", "Bb7", "A7", "Dm7", "A7"]
if WHITE:
    s = Song("song-blue-lantern-white", "Blue Lantern II", "Minor blues", "Dm", 84, "lantern",
             "The minor blues in D, one riff in one hand on the white keys. Level 1's song.", seed=84)
else:
    s = Song("song-blue-lantern", "Blue Lantern", "Minor blues", "Dm", 84, "lantern",
             "A minor blues in D. Rhodes, a sixteenth hat, the sax taking its time.", seed=84)
s.sounds = {
    "kick": {"kit": "kick", "gainDb": -5},
    "snare": {"kit": "snare", "gainDb": -7},
    "xstick": {"kit": "xstick", "gainDb": -5},
    "hat": {"kit": "hat", "gainDb": -19},
    "hatOpen": {"kit": "hatOpen", "gainDb": -19},
    "hatFoot": {"kit": "hatFoot", "gainDb": -12},
    "ride": {"kit": "ride", "gainDb": -11},
    "rideBell": {"kit": "rideBell", "gainDb": -12},
    "crash": {"kit": "crash", "gainDb": -15},
    "tomHi": {"kit": "tomHi", "gainDb": -6},
    "tomLo": {"kit": "tomLo", "gainDb": -5},
}
s.instruments = {"bass": "bass", "keys": "rhodes", "horns": "sax", "monitor": "rhodes"}
s.levels = {"keys": -4.0, "bass": -5.0, "horns": -3.5}
CHORUSES = 4
s.bars = 12 * CHORUSES
s.chords = [FORM[b % 12] for b in range(s.bars)]
s.chords[-1] = "Dm"
for c, name in enumerate(["Head", "Snare in", "Sax solo", "Out chorus"]):
    s.section(c * 12, name)

SOLO = 2


def chord_at(bar):
    return FORM[bar % 12]


# Bass (E1 = 28): root, the seventh and the fifth of each chord.
ROOT = {"Dm7": 38, "Gm7": 31, "Bb7": 34, "A7": 33}
SEVENTH = {"Dm7": 36, "Gm7": 41, "Bb7": 44, "A7": 43}
FIFTH = {"Dm7": 33, "Gm7": 38, "Bb7": 41, "A7": 40}

# MARK: Drums

FILLS = {
    1: [(36, "snare", 0.5), (39, "snare", 0.55), (42, "snare", 0.65), (45, "snare", 0.8)],
    2: [(30, "snare", 0.5), (36, "tomHi", 0.75), (39, "tomHi", 0.7), (42, "tomLo", 0.8), (45, "tomLo", 0.9)],
    3: [(24, "snare", 0.6), (30, "snare", 0.55), (36, "tomHi", 0.8), (42, "tomLo", 0.9)],
}

for c in range(CHORUSES):
    for b in range(12):
        bar = c * 12 + b
        o = bar * BAR
        if bar == s.bars - 1:
            s.hit(o, "kick", 1.0)
            s.hit(o, "crash", 0.9)
            s.hit(o + 30, "kick", 0.6)
            continue
        fill = FILLS.get(c) if b == 11 else None
        fill_from = fill[0][0] if fill else BAR
        back = "xstick" if c == 0 else "snare"
        ride = c == SOLO
        # Kick: the 1 and the "and" of 3; from the second chorus a sixteenth before the 1.
        s.hit(o, "kick", 0.95)
        s.hit(o + 30, "kick", 0.78)
        if c >= 1 and b % 2 == 1 and fill is None:
            s.hit(o + 45, "kick", 0.4)
        if b == 0:
            s.hit(o, "crash", 0.5 + 0.1 * c)
        for t in (12, 36):
            if t < fill_from:
                s.hit(o + t, back, 0.9 if t == 36 else 0.86, 0.04)
        if back == "snare":
            for t in (21, 33):
                if t < fill_from and s.rng.random() < 0.5:
                    s.hit(o + t, "snare", 0.15, 0.04)
        for i in range(16):
            t = i * 3
            if t >= fill_from:
                break
            eighth = i % 2 == 0
            beat = i % 4 == 0
            if ride:
                if eighth:
                    s.hit(o + t, "ride", 0.6 if beat else 0.42)
                if i % 4 == 2:
                    s.hit(o + t, "hatFoot", 0.45)
            else:
                open_hat = c >= 1 and b % 2 == 0 and i == 15
                s.hit(o + t, "hatOpen" if open_hat else "hat", 0.58 if beat else 0.42 if eighth else 0.24, 0.04)
        if fill:
            for t, sound, v in fill:
                s.hit(o + t, sound, v)

# MARK: Bass

for bar in range(s.bars):
    o = bar * BAR
    ch = chord_at(bar)
    b = bar % 12
    c = bar // 12
    if bar == s.bars - 1:
        s.note(s.bass, o, ROOT["Dm7"], 0.95, 40)
        continue
    if b == 11:
        # The turnaround: A, the C# under it, back up to the D.
        s.note(s.bass, o, ROOT["A7"], 0.9, 18)
        s.note(s.bass, o + 18, 40, 0.6, 6)
        s.note(s.bass, o + 24, 37, 0.75, 12)
        s.note(s.bass, o + 36, 33, 0.65, 6)
        s.note(s.bass, o + 42, 36, 0.6, 6)
        continue
    s.note(s.bass, o, ROOT[ch], 0.92, 18)
    s.note(s.bass, o + 18, SEVENTH[ch], 0.55, 6)
    s.note(s.bass, o + 24, ROOT[ch], 0.7, 6)
    s.note(s.bass, o + 30, FIFTH[ch], 0.62, 12)
    if c >= 1:
        nxt = chord_at(bar + 1)
        s.note(s.bass, o + 42, ROOT[nxt] - 1 if nxt != ch else FIFTH[ch], 0.55, 6)

# MARK: Chords part: the Rhodes comping.

VOICING = {  # (note, role, finger), close voicings around middle C
    "Dm7": [(57, "fifth", 5), (60, "seventh", 3), (62, "root", 2), (65, "third", 1)],   # A C D F
    "Gm7": [(58, "third", 5), (62, "fifth", 3), (65, "seventh", 2), (67, "root", 1)],   # Bb D F G
    "Bb7": [(58, "root", 5), (62, "third", 3), (65, "fifth", 2), (68, "seventh", 1)],   # Bb D F Ab
    "A7": [(57, "root", 5), (61, "third", 3), (64, "fifth", 2), (67, "seventh", 1)],    # A C# E G
}
chords = s.part("chords", "Rhodes comping", "rhodes", "keys", "rhodes")
for bar in range(s.bars):
    o = bar * BAR
    ch = chord_at(bar)
    c = bar // 12
    b = bar % 12
    if bar == s.bars - 1:
        s.pchord(chords, o, VOICING["Dm7"], 1, 44)
        continue
    # The 1 (weight 1), the "and" of 2 and the 4 (2), the push into the next bar (3).
    s.pchord(chords, o, VOICING[ch], 1, 16)
    if c >= 1 or b % 2 == 1:
        s.pchord(chords, o + 18, VOICING[ch], 2, 5)
    s.pchord(chords, o + 36, VOICING[ch], 2, 8)
    if c >= 1 and b != 11 and b % 2 == 1:
        s.pchord(chords, o + 45, VOICING[chord_at(bar + 1)], 3, 3)
s.chart_to_channel(chords, s.keys, lambda e: 0.58 if e["t"] % BAR == 0 else 0.46 if e["t"] % BAR == 36 else 0.4)

# MARK: Melody part: the sax, D minor.

A3, C4, D4, E4, F4, G4, Gs4, A4, B4, C5 = 57, 60, 62, 64, 65, 67, 68, 69, 71, 72
D5, E5, F5, G5, Gs5, A5, C6 = 74, 76, 77, 79, 80, 81, 84

# One anchor (1) a bar, the note the bar sits on; the answers (2); the turns and pickups (3).
HEAD = {
    0: [(0, D5, 24, 1), (24, C5, 12, 2), (42, A4, 6, 3)],
    1: [(0, F4, 30, 1), (36, G4, 6, 3), (42, A4, 6, 3)],
    2: [(0, C5, 18, 2), (18, D5, 30, 1)],
    3: [(0, A4, 24, 1), (24, G4, 6, 3), (30, F4, 18, 2)],
    4: [(0, G4, 12, 2), (12, F4, 36, 1)],
    5: [(0, G4, 18, 1), (18, A4, 6, 3), (24, Gs4, 6, 3), (30, G4, 18, 2)],
    6: [(0, F4, 24, 1), (24, D4, 24, 2)],
    7: [(0, D4, 36, 1), (42, C5, 6, 3)],
    8: [(0, D5, 24, 1), (24, C5, 12, 2), (36, A4, 12, 2)],
    9: [(0, C5, 12, 2), (12, A4, 36, 1)],
    10: [(0, F4, 18, 2), (18, D4, 30, 1)],
    11: [(0, C4, 24, 1), (24, D4, 6, 3), (30, F4, 6, 3), (36, A4, 12, 2)],
}
SOLO_LINE = {
    0: [(0, A5, 12, 1), (12, G5, 6, 3), (18, F5, 6, 2), (24, D5, 24, 2)],
    1: [(0, F5, 12, 2), (12, D5, 36, 1)],
    2: [(0, C5, 6, 3), (6, D5, 6, 3), (12, F5, 12, 2), (24, G5, 24, 1)],
    3: [(0, A5, 24, 1), (24, Gs5, 6, 3), (30, G5, 18, 2)],
    4: [(0, G5, 12, 1), (12, F5, 12, 2), (24, D5, 24, 2)],
    5: [(0, G5, 6, 3), (6, A5, 6, 3), (12, G5, 12, 2), (24, F5, 24, 1)],
    6: [(0, D5, 36, 1), (36, C5, 12, 2)],
    7: [(0, A4, 24, 1), (24, C5, 12, 2), (36, D5, 12, 3)],
    8: [(0, F5, 12, 1), (12, D5, 12, 2), (24, C5, 24, 2)],
    9: [(0, A4, 12, 2), (12, C5, 36, 1)],
    10: [(0, D5, 24, 1), (24, F5, 6, 3), (30, D5, 18, 2)],
    11: [(0, C5, 24, 1), (24, Gs4, 6, 3), (30, A4, 18, 2)],
}

# Blue Lantern II: one riff in one hand (the module's docstring). Each note is (tick, key,
# length, weight, from): `from` is the lowest tier the note is on at all (None: every tier).
# The riff bar: D5 on the 1 (1), the passing C5 on the "and" of 2 (3, Hard only), F4 on the
# "and" of 3 with the kick (2). The bar after it holds one note on the 1 (1), the chord's:
# LANDING by bar of the form. In the solo chorus that note lets go on the 4 for two pickup
# eighths into the riff (3, Hard only). FIGURES, by (chorus, bar of the form), from Medium up
# (tier 6): the landing note holds until the figure starts, then eighths that move the hand.
RIFF = [(0, D5, 18, 1, None), (18, C5, 12, 3, 7), (30, F4, 18, 2, None)]
LANDING = {1: A4, 3: C5, 5: G4, 7: A4, 9: E4, 11: B4}
PICKUP = [(36, A4, 6, 3, 7), (42, C5, 6, 3, 7)]
CLIMB = [(24, C5, 6, 3, 6), (30, D5, 6, 3, 6), (36, E5, 6, 3, 6), (42, F5, 6, 3, 6)]
RUN = [(12, F4, 6, 3, 6), (18, G4, 6, 3, 6), (24, A4, 6, 3, 6), (30, B4, 6, 3, 6), (36, C5, 6, 3, 6), (42, D5, 6, 3, 6)]
FIGURES = {(0, 11): CLIMB, (1, 11): CLIMB, (SOLO, 9): RUN}  # bars 12, 24 and 34 (bar 48 is the final D5)

melody = s.part("melody", "White keys" if WHITE else "The sax line", "rhodes", "horns", "sax")
for c in range(CHORUSES):
    for b in range(12):
        bar = c * 12 + b
        o = bar * BAR
        if bar == s.bars - 1:
            s.pnote(melody, o, D5, 44, 1)
            continue
        if WHITE:
            if b % 2 == 0:
                for t, n, ln, lv, frm in RIFF:
                    s.pnote(melody, o + t, n, ln, lv, tier=frm)
            else:
                figure = FIGURES.get((c, b))
                hold = figure[0][0] if figure else (36 if c == SOLO else 48)
                s.pnote(melody, o, LANDING[b], hold, 1)
                for t, n, ln, lv, frm in figure or (PICKUP if c == SOLO else []):
                    s.pnote(melody, o + t, n, ln, lv, tier=frm)
            continue
        phrases = SOLO_LINE if c == SOLO else HEAD
        for t, n, ln, lv in phrases[b]:
            s.pnote(melody, o + t, n, ln, lv)
        if c in (1, 3) and b in (3, 7):
            s.pnote(melody, o + 45, C5 if b == 3 else A4, 3, 3)  # a pickup into the next phrase
if WHITE:
    assert all(e["n"] % 12 in (0, 2, 4, 5, 7, 9, 11) for e in melody), "a black key in the white-key line"
    assert {e["n"] % 12 for e in melody if e["lv"] <= 2} == {0, 2, 4, 5, 7, 9, 11}, "Easy+ wants all seven white keys"
    assert sum(1 for e in melody if e.get("from") == 6) == 14, "the three figures, 14 notes from Medium up"
    assert sum(1 for e in melody if e.get("from") == 7) == 34, "the passing Cs and the pickups, 34 notes on Hard only"
s.fingered(melody)
s.chart_to_channel(melody, s.horns, lambda e: 0.8 if e["lv"] == 1 else 0.66, inst=None)
for e in s.horns:
    if e["len"] >= 12:
        e["i"] = "saxLong"

s.write()
