#!/usr/bin/env python3
"""Hypnotist: minimal techno at 127 in A minor, 80 bars (2:31), from misc/sketches.py track 1
(clicky, dry, the hypnotic bleep), its voices cut by scripts/synths.py.

    python3 apps/takt/scripts/songs/hypnotist.py   -> Takt/Content/song-hypnotist.json

The sketch's 16-step patterns, bar for bar: kick on the quarters, the offbeat hat, the rim and
click syncopations, the rolling offbeat sub (A1, G1 every fourth bar), the bleep's six notes
with the octave jump at the end of every eighth bar, its filter opening and closing over
sixteen bars (velocity picks the layer). Stretched to a track: intro, the sub in, the bleep
in, a break with no kick, the full thing, out. Melody part: the bleep. Chords part: a dark
Am / G stab in the bleep's voice on the and of 2 (and the and of 4 later), which the sketch
doesn't have and the vibe allows. The band pumps to the kick (duck 0.7, 120 ms).
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import BAR, TPB, Song  # noqa: E402

s = Song("song-hypnotist", "Hypnotist", "Minimal techno", "A minor", 127, "pulse",
         "Minimal techno at 127. Clicks and rims, a rolling sub, one bleep that never lets go.", seed=127)
s.sounds = {
    "kick": {"kit": "kickMin", "gainDb": -15},
    "hat": {"kit": "hatMin", "gainDb": -27},
    "rim": {"kit": "rimMin", "gainDb": -21},
    "click": {"kit": "clickMin", "gainDb": -25},
    "xstick": {"kit": "rimMin", "gainDb": -23},
}
s.instruments = {"bass": "subMin", "keys": "stabMin", "horns": "bleep", "monitor": "piano"}
s.levels = {"bass": 0, "keys": 0, "horns": 3}
s.duck = {"release": 0.12, "channels": {"bass": 0.7, "keys": 0.7, "horns": 0.7}}
s.bars = 80
SECTIONS = [(0, "Intro"), (8, "Pulse"), (16, "Bleep"), (40, "Break"), (48, "Full"), (72, "Out")]
for b, name in SECTIONS:
    s.section(b, name)


def section(bar):
    return [n for b, n in SECTIONS if b <= bar][-1]


def bass_root(bar):
    return 33 if bar % 4 < 3 else 31


s.chords = ["Am" if bar % 4 < 3 else "G" for bar in range(s.bars)]

# MARK: Drums (the sketch's 16-step patterns, a 16th = 3 ticks)

RIM = [0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1]
CLICK = [0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0]
for bar in range(s.bars):
    o = bar * BAR
    sec = section(bar)
    kick = sec != "Break"
    for i in range(16):
        t = o + i * 3
        if i % 4 == 0 and kick:
            s.hit(t, "kick", 1.0, 0.02)
        if i % 4 == 2:
            s.hit(t, "hat", 0.6 if bar >= 1 else 0.3, 0.04)
        if bar >= 2 and i % 2 == 1 and not (sec == "Out" and bar >= 76):
            s.hit(t, "hat", 0.22, 0.04)
        if bar >= 1 and RIM[i]:
            s.hit(t, "rim", min(1.0, 0.8 + 0.4 * s.rng.random()), 0.0)
        if CLICK[i] and not (sec == "Out" and bar >= 78):
            s.hit(t, "click", 0.5, 0.05)

# MARK: Bass: the rolling offbeats

BASS = [0, 0, 1, 0, 0, 0, 1, 1, 0, 0, 1, 0, 0, 1, 0, 1]
for bar in range(s.bars):
    o = bar * BAR
    sec = section(bar)
    if sec == "Intro" or (sec == "Out" and bar >= 76):
        continue
    for i in range(16):
        if BASS[i]:
            s.note(s.bass, o + i * 3, bass_root(bar), 0.8, 3)

# MARK: Chords part: the dark stab on the and of 2 (and the and of 4 when it's full)

VOICING = {"Am": [(45, "root", 5), (48, "third", 3), (52, "fifth", 1)], "G": [(43, "root", 5), (47, "third", 3), (50, "fifth", 1)]}
chords = s.part("chords", "The stab", "stabMin", "keys", "stabMin")
for bar in range(s.bars):
    o = bar * BAR
    sec = section(bar)
    if sec in ("Intro", "Pulse") or (sec == "Out" and bar >= 76):
        continue
    v = VOICING[s.chords[bar]]
    s.pchord(chords, o + 18, v, 1, 5)
    if sec == "Full" or (sec == "Break" and bar % 2 == 1):
        s.pchord(chords, o + 42, v, 3, 4)
    if sec == "Full" and bar % 4 == 3:
        s.pchord(chords, o + 30, v, 2, 4)
s.chart_to_channel(chords, s.keys, lambda e: 0.85 if section(e["t"] // BAR) == "Full" else 0.5)

# MARK: Melody part: the bleep

SEQ = {0: 57, 9: 64, 15: 60, 24: 57, 30: 67, 39: 64}  # tick in the bar → note (A3 E4 C4 A3 G4 E4)
LEVEL = {0: 1, 9: 2, 15: 3, 24: 1, 30: 2, 39: 3}
melody = s.part("melody", "The bleep", "bleep", "horns", "bleep")
for bar in range(s.bars):
    o = bar * BAR
    sec = section(bar)
    if sec == "Intro" or (sec == "Out" and bar >= 76):
        continue
    for t, n in SEQ.items():
        if sec == "Pulse" and LEVEL[t] == 3:
            continue  # the first eight bars: the bones of the line
        up = 12 if (bar % 8 == 7 and t > 24) else 0
        s.pnote(melody, o + t, n + up, 4, LEVEL[t])


def bleep_velocity(e):
    # The filter opens and closes over sixteen bars: the layer follows.
    bar = e["t"] // BAR
    return round(0.2 + 0.8 * (0.5 + 0.5 * math.sin(2 * math.pi * bar / 16)), 3)


s.fingered(melody)
s.chart_to_channel(melody, s.horns, bleep_velocity, spread=0.0)

s.write()
