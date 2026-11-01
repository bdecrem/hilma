#!/usr/bin/env python3
"""Dockery: a Delta blues in A at 96, one player with a guitar and a foot on the floor, four
choruses (2:00). Old-school pure blues, the Robert Johnson shape (Bart, 2026-11-01: "super old
school blues… just a guy and an acoustic guitar", Cross Road Blues and the crossroads legend).
Named for Dockery Farms, the Mississippi plantation where Charley Patton, Son House and
Howlin' Wolf played; the music is ours, the shape is theirs.

    python3 apps/takt/scripts/songs/dockery.py   -> Takt/Content/song-dockery.json

No band. The guitar is Karoryfer's Shinyguitar, an archtop played hard into a microphone
(scripts/guitar.py; 0.1 (71), it was a piano before). The thumb is the Delta thumb: the root on
every beat, the chord chick on the late eighth of the shuffle (boom-chick), on the 2 and the 4
a dead-string chick (the band plays `guitarMute` there), the alternating bass on the IV and the
V, the chromatic turnaround. The lead is the voice and the bottleneck: each chorus opens in
stop time (the big chord slammed on the 1, then two bars of the voice alone over the thumb),
then it drives. The slide licks are grace notes into the fifth and the flat third pushed to
the major; the third chorus takes the line up an octave with the slide's tremolo. The foot is
a kick drum on every beat with the heel's chick, and knocks on the guitar's body on the
backbeat once it drives; a bass doubles the thumb an octave down (Bart: "make it hit harder",
"make it dirty"). Everything plays hot: the hardest layer of the set is the dirt.

Chords part: the thumb and the chick (roles for every note: the thumb is the root, the chick
the fifth, the root and the third, the turnaround walks root, seventh, sixth, fifth). Melody
part: the voice, on the horns channel, the same guitar. Your keys play the guitar on both. Not charted against BLUES.md yet (Bart: "without any charts"); the
weights are honest so the levels fall out playable.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import BAR, TPB, Song  # noqa: E402

FORM = ["A7", "A7", "A7", "A7", "D7", "D7", "A7", "A7", "E7", "D7", "A7", "E7"]
s = Song("song-dockery", "Dockery", "Delta blues", "A", 96, "crossroads",
         "A Delta blues in A. One piano, a foot on the floor, and the voice alone in the stops.", seed=1936)
s.sounds = {
    "kick": {"kit": "kick", "gainDb": -3},
    "hatFoot": {"kit": "hatFoot", "gainDb": -9},
    "knock": {"kit": "guitarPerc", "gainDb": -6},
    "xstick": {"kit": "xstick", "gainDb": -4},  # the count-in's click only (BandRenderer wants one)
}
s.instruments = {"bass": "bass", "keys": "guitar", "horns": "guitar", "monitor": "guitar"}
s.levels = {"keys": 2.0, "bass": -1.0, "horns": 2.0}
CHORUSES = 4
s.bars = 12 * CHORUSES
s.chords = [FORM[b % 12] for b in range(s.bars)]
s.chords[-1] = "A"
for c, name in enumerate(["Crossroads", "Verse", "Slide", "Last verse"]):
    s.section(c * 12, name)
SLIDE = 2


def chord_at(bar):
    return FORM[bar % 12]


def stop(bar):
    """The stop-time bars: the first two of every chorus, the voice alone over the thumb."""
    return bar % 12 < 2


# MARK: The foot (and, once the hands drive, the slap)

# A heavy foot: the kick on every beat, hard on the 1 and the 3, the triplet push into the 3;
# the heel's chick on 2 and 4. Once the stop is over, a cross-stick slap on the backbeat, the
# one-man-band way (Bart, 2026-11-01: "needs some more dirt… make it hit harder").
for bar in range(s.bars):
    o = bar * BAR
    if bar == s.bars - 1:
        s.hit(o, "kick", 1.0)
        continue
    for beat in range(4):
        s.hit(o + beat * TPB, "kick", 0.95 if beat in (0, 2) else 0.7, 0.05)
        if beat in (1, 3):
            s.hit(o + beat * TPB, "hatFoot", 0.5, 0.06)
            if not stop(bar):
                s.hit(o + beat * TPB, "knock", 0.85, 0.05)
    if not stop(bar):
        s.hit(o + 20, "kick", 0.45, 0.05)

# MARK: Chords part: the left hand.

# The thumb (root) and the alternate, the chick above it.
THUMB = {"A7": 45, "D7": 50, "E7": 52}        # A2 D3 E3
ALT = {"A7": 40, "D7": 45, "E7": 47}          # E2 A2 B2: the fifth under, the Delta alternation
CHICK = {  # (note, role, finger): the chord on the middle strings, the fifth, the root, the third
    "A7": [(52, "fifth", 3), (57, "root", 2), (61, "third", 1)],
    "D7": [(57, "fifth", 3), (62, "root", 2), (66, "third", 1)],
    "E7": [(59, "fifth", 3), (64, "root", 2), (68, "third", 1)],
}
# The slammed chord at the top of the chorus: the open strings and the seventh.
SLAM = [(45, "root", 5), (52, "fifth", 4), (57, "root", 3), (61, "third", 2), (67, "seventh", 1)]
TURN = [(57, "root", 1), (55, "seventh", 2), (54, "sixth", 3), (52, "fifth", 4)]   # A G F# E, over the thumb

chords = s.part("chords", "The thumb", "guitar", "keys", "guitar")
for bar in range(s.bars):
    o = bar * BAR
    ch = chord_at(bar)
    b = bar % 12
    if bar == s.bars - 1:
        s.pchord(chords, o, SLAM, 1, 44)
        continue
    if stop(bar):
        if b == 0:
            s.pchord(chords, o, SLAM, 1, 22)
            s.pnote(chords, o + 24, THUMB[ch], 12, 2, 5, "root")
            s.pnote(chords, o + 36, THUMB[ch], 12, 2, 5, "root")
        else:
            for beat in range(4):
                s.pnote(chords, o + beat * TPB, THUMB[ch], 12, 1 if beat in (0, 2) else 2, 5, "root")
        continue
    if b == 10:
        # The turnaround: the thumb holds the A, the chromatic walk comes down over it.
        for beat in range(4):
            s.pnote(chords, o + beat * TPB, THUMB[ch], 12, 1 if beat == 0 else 2, 5, "root")
            n, role, f = TURN[beat]
            s.pnote(chords, o + beat * TPB + 8, n, 4, 3 if beat else 2, f, role)
        continue
    if b == 11:
        # E7 on the 1 and the 3, the chick between, the pickup back to the top.
        for beat in range(4):
            s.pnote(chords, o + beat * TPB, THUMB[ch] if beat < 2 else ALT[ch] if beat == 2 else THUMB[ch], 12,
                    1 if beat == 0 else 2, 5, "root" if beat != 2 else "fifth")
            if beat < 3:
                s.pchord(chords, o + beat * TPB + 8, CHICK[ch], 3, 4)
        continue
    alternate = ch != "A7"
    for beat in range(4):
        thumb = ALT[ch] if alternate and beat in (1, 3) else THUMB[ch]
        s.pnote(chords, o + beat * TPB, thumb, 12, 1 if beat in (0, 2) else 2, 5,
                "fifth" if alternate and beat in (1, 3) else "root")
        s.pchord(chords, o + beat * TPB + 8, CHICK[ch], 3, 4)
s.chart_to_channel(chords, s.keys, lambda e: 0.98 if e["lv"] == 1 and e["len"] >= 20 else 0.86 if e["lv"] == 1 else 0.78 if e["lv"] == 2 else 0.7)
# The chick on the 2 and the 4 is a dead-string slap on the record (the chart keeps the chord).
for e in s.keys:
    if e["t"] % BAR in (20, 44) and e["len"] == 4:
        e["i"] = "guitarMute"

# The bass doubles the thumb an octave down (the boom under the boom-chick), the slam's root too.
for e in chords:
    if e.get("r") in ("root", "fifth") and e["n"] <= 52 and e["len"] >= 12:
        s.note(s.bass, e["t"], e["n"] - 12, 0.8 if e["lv"] == 1 else 0.66, min(e["len"], 12))

# MARK: Melody part: the voice and the bottleneck, the right hand.

G3, A3, C4, Cs4, D4, Eb4, E4, G4, A4, C5, Cs5, D5, Eb5, E5, G5, A5 = 55, 57, 60, 61, 62, 63, 64, 67, 69, 72, 73, 74, 75, 76, 79, 81

# (tick, note, length, level) per bar of the chorus. One anchor (1) a bar, the note the line
# lands on; the voice's passing notes (2); the slide's grace notes and pushes (3).
VOICE = {
    # Stop time: the voice alone. "I went down to the crossroads": a line that falls to the root.
    0: [(24, E5, 8, 2), (32, Eb5, 4, 3), (36, D5, 12, 1)],
    1: [(0, C5, 12, 2), (12, A4, 24, 1), (40, G4, 8, 3)],
    # The answer: the bottleneck, grace into the fifth, the flat third pushed up.
    2: [(0, Eb4, 4, 3), (4, E4, 20, 1), (24, C4, 8, 2), (32, Cs4, 4, 3), (36, A3, 12, 2)],
    3: [(0, A3, 24, 1), (32, G3, 4, 3), (36, A3, 12, 2)],
    # The IV: the voice again, higher.
    4: [(0, D5, 12, 1), (12, C5, 12, 2), (24, A4, 8, 2), (32, G4, 4, 3), (36, A4, 12, 2)],
    5: [(0, C5, 8, 2), (8, A4, 4, 3), (12, G4, 24, 1), (36, E4, 12, 2)],
    6: [(0, Eb4, 4, 3), (4, E4, 20, 1), (24, G4, 12, 2), (36, A4, 12, 2)],
    7: [(0, A4, 36, 1), (40, G4, 8, 3)],
    # The V and the IV: the line that tells the story, then the turnaround lick.
    8: [(0, E5, 12, 1), (12, D5, 12, 2), (24, C5, 8, 2), (32, A4, 4, 3), (36, C5, 12, 2)],
    9: [(0, D5, 12, 1), (12, C5, 12, 2), (24, A4, 24, 2)],
    10: [(0, Cs5, 4, 3), (4, D5, 8, 2), (12, C5, 12, 2), (24, A4, 24, 1)],
    11: [(0, E4, 12, 1), (12, G4, 8, 2), (20, A4, 4, 3), (24, C5, 12, 2), (36, D5, 12, 3)],
}

melody = s.part("melody", "The voice", "guitar", "horns", "guitar")
for c in range(CHORUSES):
    for b in range(12):
        bar = c * 12 + b
        o = bar * BAR
        if bar == s.bars - 1:
            s.pnote(melody, o, A4, 44, 1)
            continue
        up = 12 if c == SLIDE else 0
        for t, n, ln, lv in VOICE[b]:
            s.pnote(melody, o + t, n + up, ln, lv)
s.fingered(melody)
s.chart_to_channel(melody, s.horns, lambda e: 0.95 if e["lv"] == 1 else 0.86 if e["lv"] == 2 else 0.74)

# The slide's tremolo: on the slide chorus the record shakes every held note (the band's
# channel only; the chart keeps the one note so the player holds it).
tremolo = []
for e in s.horns:
    bar = e["t"] // BAR
    if bar // 12 == SLIDE and e["len"] >= 12:
        for k in range(1, e["len"] // 4):
            tremolo.append({"t": e["t"] + 4 * k, "n": e["n"], "v": round(e["v"] * (0.55 if k % 2 else 0.4), 3), "len": 4})
        e["len"] = 4
s.horns.extend(tremolo)

s.write()
