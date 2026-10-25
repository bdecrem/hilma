#!/usr/bin/env python3
"""Author the A1 band: a Chicago blues shuffle in C, four choruses long, as data the app plays.

    python3 apps/takt/scripts/band.py      -> Takt/Content/band-blues-C.json

Time is in ticks, 12 per beat (a triplet eighth = 4 ticks, the shuffle's late eighth = tick 8),
48 per bar, 576 per chorus; `t` is the tick within the 4-chorus loop. Notes are MIDI numbers
with C4 = 60. Drums name a sound, which names a kit piece of Takt/Sounds/instruments.json
(scripts/sounds.py) and its level; the pitched channels play the instruments in `instruments`.

The arrangement grows over the four choruses, so the loop never sounds like a loop:
  1  cross-stick and closed hat, piano stabs, the sax on the downbeats of each change
  2  snare backbeat, piano licks between the stabs, sax riffs answer the piano
  3  ride and hat foot, piano triplets in the high register (Otis Spann), sax riffs
  4  ride, everything, a bigger fill into the top
Every chorus ends on a different drum fill and the bass walks the turnaround into C.
Velocities are humanized from a fixed seed; timing stays on the grid (the lesson's clock).
"""
import json
import random
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "Takt/Content/band-blues-C.json"

TPB, BAR = 12, 48
FORM = ["C", "C", "C", "C", "F", "F", "C", "C", "G", "F", "C", "G"]
CHORUS = len(FORM) * BAR
CHORUSES = 4
rng = random.Random(12)

# Bass roots: C2, F1, G1 (the finger bass is sampled E1..D#2, so lines sit low).
ROOT = {"C": 36, "F": 29, "G": 31}
# Right-hand dominant voicings, 3 and b7 inside (C7: E G Bb C; F7: Eb F A C; G7: F G B D).
VOICING = {"C": [64, 67, 70, 72], "F": [63, 65, 69, 72], "G": [65, 67, 71, 74]}
# Two tenors: the 3rd and the b7, low in the horn.
HORN = {"C": [52, 58], "F": [57, 63], "G": [59, 65]}

SOUNDS = {
    "kick": {"kit": "kick", "gainDb": -1},
    "snare": {"kit": "snare", "gainDb": -4},
    "xstick": {"kit": "xstick", "gainDb": -5},
    "hat": {"kit": "hat", "gainDb": -13},
    "hatOpen": {"kit": "hatOpen", "gainDb": -15},
    "hatFoot": {"kit": "hatFoot", "gainDb": -12},
    "ride": {"kit": "ride", "gainDb": -11},
    "crash": {"kit": "crash", "gainDb": -12},
    "tomHi": {"kit": "tomHi", "gainDb": -6},
    "tomLo": {"kit": "tomLo", "gainDb": -5},
}
INSTRUMENTS = {"bass": "bass", "keys": "piano", "horns": "sax", "monitor": "piano"}


def hum(v, spread=0.06):
    return round(min(1.0, max(0.05, v + rng.uniform(-spread, spread))), 3)


def hit(ev, t, s, v, spread=0.06):
    ev.append({"t": t, "s": s, "v": hum(v, spread)})


def note(ev, t, n, v, ln, inst=None):
    e = {"t": t, "n": n, "v": hum(v, 0.05), "len": ln}
    if inst:
        e["i"] = inst
    ev.append(e)


def chord(ev, t, notes, v, ln, inst=None):
    for n in notes:
        note(ev, t, n, v, ln, inst)


# MARK: Drums

FILLS = {
    # Into chorus 2: a snare triplet on 4.
    0: [(36, "snare", 0.45), (40, "snare", 0.6), (44, "snare", 0.8)],
    # Into chorus 3: snare, then down the toms.
    1: [(24, "snare", 0.5), (32, "snare", 0.6), (36, "tomHi", 0.75), (40, "tomHi", 0.7), (44, "tomLo", 0.85)],
    # Into chorus 4: triplets from beat 3, crescendo.
    2: [(24, "snare", 0.35), (28, "snare", 0.42), (32, "snare", 0.5), (36, "snare", 0.6), (40, "snare", 0.72), (44, "snare", 0.85)],
    # Into the top of the loop: the big one, two beats of triplets around the kit.
    3: [(24, "snare", 0.7), (28, "snare", 0.55), (32, "tomHi", 0.8), (36, "tomHi", 0.75), (40, "tomLo", 0.85), (44, "tomLo", 0.95)],
}


def drums():
    ev = []
    for c in range(CHORUSES):
        for b in range(12):
            o = c * CHORUS + b * BAR
            last = b == 11
            fill = FILLS[c] if last else []
            fill_from = fill[0][0] if fill else BAR
            ride = c >= 2
            back = "xstick" if c == 0 and b < 8 else "snare"
            # Kick: 1 and 3, feathered on 2 and 4; a pickup into 3 every other bar from chorus 2.
            hit(ev, o, "kick", 0.95)
            hit(ev, o + 24, "kick", 0.78)
            for t in (12, 36):
                if t < fill_from:
                    hit(ev, o + t, "kick", 0.28, 0.04)
            if c >= 1 and b % 2 == 1 and not last:
                hit(ev, o + 20, "kick", 0.45)
            # Crash on the top of every chorus.
            if b == 0:
                hit(ev, o, "crash", 0.8 if c else 0.6)
            # Backbeat on 2 and 4, ghosts on the late eighth before each.
            for t in (12, 36):
                if t < fill_from:
                    hit(ev, o + t, back, 0.88 if t == 12 else 0.95, 0.05)
            if back == "snare":
                for t in (8, 32):
                    if t < fill_from and rng.random() < 0.7:
                        hit(ev, o + t, "snare", 0.16, 0.05)
                if rng.random() < 0.35 and 44 < fill_from:
                    hit(ev, o + 44, "snare", 0.14, 0.04)
            # The shuffle: hat (choruses 1-2) or ride (3-4) on every beat and its late eighth.
            for beat in range(4):
                t = beat * TPB
                if t >= fill_from and beat == 3:
                    break
                cymbal = "ride" if ride else "hat"
                accent = 0.82 if beat % 2 == 1 else 0.7
                hit(ev, o + t, cymbal, accent)
                hit(ev, o + t + 8, cymbal, 0.42 if ride else 0.38)
            if ride:
                for t in (12, 36):
                    hit(ev, o + t, "hatFoot", 0.8, 0.05)
            # Bar 4 and bar 8: an open hat on the last late eighth, closed on the 1 after.
            if b in (3, 7) and not ride:
                hit(ev, o + 44, "hatOpen", 0.55)
            for t, s, v in fill:
                hit(ev, o + t, s, v, 0.04)
    return ev


# MARK: Bass

UP = [0, 4, 7, 9]      # R 3 5 6
DOWN = [10, 9, 7, 4]   # b7 6 5 3


def bass():
    ev = []
    for c in range(CHORUSES):
        for b, ch in enumerate(FORM):
            o = c * CHORUS + b * BAR
            r = ROOT[ch]
            if b == 11:
                # Turnaround on G: G B D, then Db into the C.
                line = [r, r + 4, r + 7, 37]
            else:
                # Bars on one chord alternate up and down from where the chord arrived.
                line = [r + i for i in (UP if (b - first_of_run(b)) % 2 == 0 else DOWN)]
            for beat, n in enumerate(line):
                t = o + beat * TPB
                note(ev, t, n, 0.92 if beat % 2 == 0 else 0.82, 7)
                # The shuffle's late eighth: the same note, lighter (not under the Db pickup).
                if not (b == 11 and beat == 3):
                    note(ev, t + 8, n, 0.6, 3)
    return ev


def first_of_run(b):
    while b > 0 and FORM[b - 1] == FORM[b]:
        b -= 1
    return b


# MARK: Piano

def stabs(ev, o, ch, v=0.6):
    """The shuffle comp: the late eighth of 1 into 2, and of 3 into 4, short."""
    vo = VOICING[ch]
    chord(ev, o + 8, vo[1:], v * 0.75, 3)
    chord(ev, o + 12, vo, v, 5)
    chord(ev, o + 32, vo[1:], v * 0.75, 3)
    chord(ev, o + 36, vo, v, 5)


def lick_b3(ev, o, ch, v=0.62):
    """Beats 3-4: the minor third bent into the major, up the chord, the b7 rung."""
    r = {"C": 60, "F": 65, "G": 67}[ch]
    seq = [(24, r + 3, 2), (26, r + 4, 6), (32, r + 7, 4), (36, r + 10, 4), (40, r + 12, 4), (44, r + 10, 6)]
    for t, n, ln in seq:
        note(ev, o + t, n, v, ln)


def triplets(ev, o, ch, v=0.4):
    """Every triplet of the bar, high and soft, accents on the beats (Otis Spann's right hand)."""
    vo = [n + 12 for n in VOICING[ch][1:]]
    for k in range(12):
        chord(ev, o + k * 4, vo, v + (0.14 if k % 3 == 0 else 0), 3)


def turnaround(ev, o):
    """Bar 11 over C: C on top, the line under it walking down Bb A Ab G; bar 12 on G."""
    for beat, low in enumerate([70, 69, 68, 67]):
        chord(ev, o + beat * TPB, [low - 6, low, 72], 0.62, 8)
    g = o + BAR
    chord(ev, g, VOICING["G"], 0.7, 10)
    for t, n in [(24, 67), (28, 69), (32, 71), (36, 74), (40, 72), (44, 71)]:
        note(ev, g + t, n, 0.58, 4)


def keys():
    ev = []
    for c in range(CHORUSES):
        for b, ch in enumerate(FORM):
            o = c * CHORUS + b * BAR
            if b == 10:
                turnaround(ev, o)
                continue
            if b == 11:
                continue
            if c == 2 and b < 10:
                triplets(ev, o, ch)
                continue
            # A held chord on the top of every change, then the comp.
            if b == 0 or FORM[b - 1] != ch:
                chord(ev, o, VOICING[ch], 0.55, 10)
            if c >= 1 and b in (3, 7):
                chord(ev, o + 8, VOICING[ch][1:], 0.45, 3)
                chord(ev, o + 12, VOICING[ch], 0.58, 5)
                lick_b3(ev, o, ch)
            else:
                stabs(ev, o, ch, 0.58 if c != 3 else 0.66)
    return ev


# MARK: Horns

def riff(ev, o, ch, v=0.75):
    """A two-tenor shuffle riff, beats 2-4: the 5, the b7, the octave, then a held 3rd and b7."""
    r = {"C": 48, "F": 53, "G": 55}[ch]
    for t, n in [(8, r + 7), (12, r + 10), (20, r + 12)]:
        note(ev, o + t, n, v, 3)
        note(ev, o + t, n - 5, v * 0.85, 3)
    for n in HORN[ch]:
        note(ev, o + 32, n + 12 if n < 55 else n, v * 0.9, 14, "saxLong")


def horns():
    ev = []
    for c in range(CHORUSES):
        for b, ch in enumerate(FORM):
            o = c * CHORUS + b * BAR
            if c < 1:
                # Chorus 1: a stab on the top of each change, a pickup into the next.
                if b in (0, 4, 8):
                    chord(ev, o, HORN[ch], 0.85, 5)
                    chord(ev, o + 8, HORN[ch], 0.65, 3)
                if b in (3, 7):
                    chord(ev, o + 44, HORN[FORM[b + 1]], 0.75, 3)
            else:
                if b in (0, 2, 4, 6, 8):
                    riff(ev, o, ch, 0.72 if c < 3 else 0.82)
                if b == 10:
                    # The turnaround: long tones under the piano's line.
                    chord(ev, o, [n + 12 if n < 55 else n for n in HORN["C"]], 0.6, 40, "saxLong")
                if b == 11:
                    chord(ev, o, HORN["G"], 0.85, 5)
                    chord(ev, o + 44, [n + 12 if n < 55 else n for n in HORN["C"]][:1], 0.7, 3)
    return ev


band = {
    "name": "Chicago shuffle in C",
    "ticksPerBeat": TPB,
    "beatsPerBar": 4,
    "bars": 12 * CHORUSES,
    "form": FORM,
    "sounds": SOUNDS,
    "instruments": INSTRUMENTS,
    "channels": {
        "drums": sorted(drums(), key=lambda e: e["t"]),
        "bass": sorted(bass(), key=lambda e: e["t"]),
        "keys": sorted(keys(), key=lambda e: e["t"]),
        "horns": sorted(horns(), key=lambda e: e["t"]),
    },
}
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(band, indent=None, separators=(",", ":")).replace("},{", "},\n{") + "\n")
print(OUT, {k: len(v) for k, v in band["channels"].items()})
