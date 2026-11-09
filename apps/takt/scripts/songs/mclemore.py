#!/usr/bin/env python3
"""McLemore: a Memphis soul blues in F at 96, straight eighths, five choruses (2:30), the
electric guitar and the piano trading. Bart, 2026-11-09: "an awesome new blues track that has
both guitar (not the steel one - the regular one) and piano". Named for the avenue in Memphis
where Stax cut its records; the music is ours (Albert King's sting over the MG's pocket, the
riff in unison the way that band slammed one).

    python3 apps/takt/scripts/songs/mclemore.py   -> Takt/Content/song-mclemore.json

The riff is one bar, F minor pentatonic in an arch (F, then A♭ B♭ C B♭ A♭ in eighths from the
"and" of 2), answered in the next bar: the bass and the guitar play it in unison, the piano
stabs its accents (the 1, the "and" of 2, the 3). Over the IV and the V the riff keeps its shape
on the same five keys (B♭ C E♭ C B♭ A♭; C B♭ C E♭ C B♭), so the whole tune sits under one hand:
F4 under the thumb, E♭5 under the pinky.

Choruses, one thing each: Head (the guitar and the piano alone on the riff for two bars, then
the band; the guitar answers itself), Verse (the piano's left hand takes the riff, the guitar
sings a line a singer would, the piano's right hand answers in the gaps), Piano (the piano
solos over the guitar's riff, on the ride), Guitar (four bars of breaks, the band hitting the
1 and the guitar alone, then the solo: stings and repeated notes), Out (everybody on the riff,
the bell, one stop).

Chords part: the piano (keys channel). The 1 weight 1; the 3, and the 4 of the answer bars,
weight 2; the pushes (the "and" of 2 with the riff, the "and" of 4 into the next bar) weight
3. So Easy is the 1 and the 3, Medium adds the 4 of every other bar (a rhythm step, the open
item of BLUES.md §6), Hard the pushes. Melody part: the guitar (horns channel, `eguitar`
through `amp.horns`), single notes; one anchor a bar, on the 1. Every anchor and every main
note is one of the five keys of the box; the peaks above it (F5, A♭5) carry `from` tiers, so
the hand stays in one position below Medium. The record doubles the riff an octave down and
puts a fourth under the held stings and a slide from the fret below into them (the channel
only). Levels from renders: -23.4 dBFS mean, the peak -1.3.

Charted by the takt-chart skill the same day (BLUES.md's McLemore columns): the blues melody
patch with Easy+ named tier 3 and Medium's `space` 1.3 (at 96 the 3 is 1.25 s from the next
downbeat, so the ladder's 1.2 borrowed one ornament back into every riff bar); the chords Easy
on tier 2 and Easy+ on tier 3. Three answer bars a chorus carry a second anchor on the 3 (the
answer's main note), so Easy is the bones and the answers and Beginner the bones alone.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import BAR, TPB, Song  # noqa: E402

FORM = ["F7", "F7", "F7", "F7", "Bb7", "Bb7", "F7", "F7", "C7", "Bb7", "F7", "C7"]
NAMES = ["Head", "Verse", "Piano", "Guitar", "Out"]
HEAD, VERSE, PIANO, SOLO, OUT = range(5)
s = Song("song-mclemore", "McLemore", "Memphis blues", "F", 96, "duo",
         "The guitar and the piano trading. One riff in unison, stings, a piano chorus, the breaks.", seed=926)
s.sounds = {
    "kick": {"kit": "kick", "gainDb": -3},
    "snare": {"kit": "snare", "gainDb": -5},
    "hat": {"kit": "hat", "gainDb": -14},
    "hatOpen": {"kit": "hatOpen", "gainDb": -16},
    "hatFoot": {"kit": "hatFoot", "gainDb": -13},
    "ride": {"kit": "ride", "gainDb": -12},
    "rideBell": {"kit": "rideBell", "gainDb": -14},
    "crash": {"kit": "crash", "gainDb": -13},
    "tomHi": {"kit": "tomHi", "gainDb": -7},
    "tomLo": {"kit": "tomLo", "gainDb": -6},
    "xstick": {"kit": "xstick", "gainDb": -6},
}
s.instruments = {"bass": "bass", "keys": "piano", "horns": "eguitar", "monitor": "piano"}
s.levels = {"keys": -2.0, "bass": 1.0, "horns": -1.5}
# Albert King's amp, not Elmore's: less gain than Halsted, more bite on top.
s.amp = {"horns": {"drive": 16, "bias": 0.22, "tight": 120, "mid": 5, "tone": 6500, "presence": 6, "level": -9, "room": 0.25}}
s.bars = 12 * len(NAMES)
s.chords = [FORM[b % 12] for b in range(s.bars)]
s.chords[-1] = "F7"
for c, name in enumerate(NAMES):
    s.section(c * 12, name)
LAST = s.bars - 1
E = 6  # an eighth


def chord_at(bar):
    return FORM[bar % 12]


def kind(bar):
    """A: a riff bar. B: the landing and its answer. T: the turnaround."""
    b = bar % 12
    return "T" if b == 11 else "A" if b in (0, 2, 4, 6, 8, 9) else "B"


def intro(bar):
    """The first two bars: the guitar and the piano alone on the riff."""
    return bar < 2


def broken(bar):
    """The breaks at the top of the guitar chorus: the band hits the 1 and lays out."""
    return bar // 12 == SOLO and bar % 12 < 4


# MARK: Drums: Al Jackson's pocket. The kick with the riff, the snare fat on 2 and 4.

FILLS = [
    [(36, "snare", 0.7), (39, "snare", 0.55), (42, "snare", 0.85), (45, "snare", 0.95)],
    [(24, "snare", 0.6), (30, "snare", 0.7), (36, "tomHi", 0.8), (42, "tomLo", 0.9)],
    [(24, "tomHi", 0.7), (27, "tomHi", 0.6), (30, "tomHi", 0.75), (36, "tomLo", 0.85), (39, "tomLo", 0.7), (42, "snare", 0.95)],
    [(24, "snare", 0.55), (27, "snare", 0.5), (30, "snare", 0.65), (33, "snare", 0.6), (36, "snare", 0.78), (39, "snare", 0.72), (42, "snare", 0.9), (45, "snare", 1.0)],
    [(36, "snare", 0.8), (42, "tomLo", 0.9)],
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
            for t, sound, v in FILLS[3]:
                s.hit(o + t, sound, v)
        continue
    if broken(bar):
        s.hit(o, "kick", 1.0)
        s.hit(o, "snare", 0.95)
        s.hit(o, "crash", 0.9 if b == 0 else 0.7)
        for beat in (1, 3):
            s.hit(o + beat * TPB, "hatFoot", 0.5)
        if b == 3:
            for t, sound, v in FILLS[2]:
                s.hit(o + t, sound, v)
        continue
    fill = FILLS[3] if bar == LAST - 1 else FILLS[c] if b == 11 else FILLS[4] if b == 7 and c in (PIANO, OUT) else None
    fill_from = fill[0][0] if fill else BAR
    ride = c in (PIANO, OUT)
    quiet = c == VERSE
    s.hit(o, "kick", 1.0 if not quiet else 0.9)
    if kind(bar) == "A":
        s.hit(o + 18, "kick", 0.62)
        s.hit(o + 24, "kick", 0.88)
    else:
        s.hit(o + 24, "kick", 0.85)
        if not quiet:
            s.hit(o + 30, "kick", 0.5)
        if 42 < fill_from:
            s.hit(o + 42, "kick", 0.55)
    if b == 0 or (bar == 2) or (b in (4, 8) and c in (PIANO, SOLO, OUT)):
        s.hit(o, "crash", 0.85 if b == 0 or bar == 2 else 0.6)
    for t in (12, 36):
        if t < fill_from:
            s.hit(o + t, "snare", 0.82 if quiet else 0.96, 0.04)
    if not quiet:
        for t in (21, 45):
            if t < fill_from and s.rng.random() < 0.55:
                s.hit(o + t, "snare", 0.16, 0.04)
    for i in range(8):
        t = i * E
        if t >= fill_from:
            break
        on = i % 2 == 0
        if ride:
            if on:
                s.hit(o + t, "rideBell" if c == OUT and i in (0, 4) else "ride", 0.66 if i in (0, 4) else 0.56)
                if i in (2, 6):
                    s.hit(o + t, "hatFoot", 0.5)
            else:
                s.hit(o + t, "ride", 0.4)
        elif i == 7 and b % 4 == 3 and not quiet:
            s.hit(o + t, "hatOpen", 0.55)
        else:
            s.hit(o + t, "hat", (0.5 if on else 0.3) if quiet else (0.62 if on else 0.4))
    if fill:
        for t, sound, v in fill:
            s.hit(o + t, sound, v)

# MARK: Bass: the riff, low (F1, B♭1, C2), in unison with the guitar.

F1, G1, Ab1, Bb1, C2, Eb2 = 29, 31, 32, 34, 36, 39
ROOT = {"F7": F1, "Bb7": Bb1, "C7": C2}
FIFTH = {"F7": C2, "Bb7": F1, "C7": G1}
BASS_RIFF = {
    "F7": [F1, Ab1, Bb1, C2, Bb1, Ab1],
    "Bb7": [Bb1, C2, Eb2, C2, Bb1, Ab1],
    "C7": [C2, Bb1, C2, Eb2, C2, Bb1],
}
RIFF_T = [0, 18, 24, 30, 36, 42]
for bar in range(s.bars):
    o = bar * BAR
    ch = chord_at(bar)
    nxt = chord_at(bar + 1) if bar + 1 < s.bars else "F7"
    if intro(bar):
        continue
    if bar == LAST:
        s.note(s.bass, o, F1, 1.0, 40)
        continue
    if broken(bar):
        s.note(s.bass, o, ROOT[ch], 1.0, 8)
        if bar % 12 == 3:
            s.note(s.bass, o + 36, F1, 0.7, 5)
            s.note(s.bass, o + 42, 33, 0.8, 5)
        continue
    k = kind(bar)
    if k == "A":
        for i, (t, n) in enumerate(zip(RIFF_T, BASS_RIFF[ch])):
            s.note(s.bass, o + t, n, 0.95 if i == 0 else 0.84 if t % TPB == 0 else 0.78, 12 if i == 0 else 5)
    elif k == "B":
        s.note(s.bass, o, ROOT[ch], 0.95, 16)
        s.note(s.bass, o + 24, FIFTH[ch], 0.78, 6)
        s.note(s.bass, o + 30, ROOT[ch], 0.6, 5)
        approach = ROOT[nxt] - 1 if ROOT[nxt] > 28 else ROOT[nxt] + 2
        s.note(s.bass, o + 42, approach if nxt != ch else ROOT[ch] + 3, 0.76, 5)
    else:
        for t, n, ln in [(0, C2, 16), (24, C2, 6), (30, Bb1, 6), (36, G1, 6), (42, 28, 5)]:
            s.note(s.bass, o + t, n, 0.9 if t == 0 else 0.78, ln)

# MARK: Chords part: the piano's stabs.

VOICING = {  # (note, role, finger), the left hand, the pinky low; F4 on top of the I and the IV
    "F7": [(57, "third", 5), (60, "fifth", 3), (63, "seventh", 2), (65, "root", 1)],    # A C Eb F
    "Bb7": [(56, "seventh", 5), (58, "root", 4), (62, "third", 2), (65, "fifth", 1)],   # Ab Bb D F
    "C7": [(55, "fifth", 5), (58, "seventh", 4), (60, "root", 3), (64, "third", 1)],    # G Bb C E
}
chords = s.part("chords", "The stabs", "piano", "keys", "piano")
for bar in range(s.bars):
    o = bar * BAR
    ch = chord_at(bar)
    nxt = chord_at(bar + 1) if bar + 1 < s.bars else "F7"
    if intro(bar):
        continue
    if bar == LAST:
        s.pchord(chords, o, VOICING["F7"], 1, 44)
        continue
    if broken(bar):
        s.pchord(chords, o, VOICING[ch], 1, 8)
        continue
    if kind(bar) == "A":
        s.pchord(chords, o, VOICING[ch], 1, 6)
        s.pchord(chords, o + 18, VOICING[ch], 3, 5)
        s.pchord(chords, o + 24, VOICING[ch], 2, 8)
    else:
        s.pchord(chords, o, VOICING[ch], 1, 16)
        s.pchord(chords, o + 24, VOICING[ch], 2, 6)
        s.pchord(chords, o + 36, VOICING[ch], 2, 5)
        if bar + 1 != LAST:
            s.pchord(chords, o + 42, VOICING[nxt], 3, 5)


def comp_v(e):
    soft = 0.85 if e["t"] // BAR // 12 in (PIANO, VERSE) else 1.0
    t = e["t"] % BAR
    return soft * (0.78 if t == 0 else 0.66 if t in (24, 36) else 0.56)


s.chart_to_channel(chords, s.keys, comp_v)

# The left hand on the riff (the channel only): the intro, the verse and the out chorus.
PIANO_RIFF = {k: [n + 12 for n in v] for k, v in BASS_RIFF.items()}
for bar in range(s.bars):
    c = bar // 12
    if kind(bar) != "A" or not (intro(bar) or c in (VERSE, OUT)) or bar == LAST:
        continue
    for i, (t, n) in enumerate(zip(RIFF_T, PIANO_RIFF[chord_at(bar)])):
        s.note(s.keys, bar * BAR + t, n, 0.8 if i == 0 else 0.7, 12 if i == 0 else 5)
        if intro(bar) or c == OUT:
            s.note(s.keys, bar * BAR + t, n + 12, 0.7 if i == 0 else 0.6, 12 if i == 0 else 5)
# The intro's answer bar: the piano lands with the guitar.
s.note(s.keys, BAR, 41, 0.8, 18)
s.note(s.keys, BAR, 53, 0.7, 18)

# The right hand's answers in the verse's gaps (the channel only): crushed thirds, a tremolo.
C5, Eb5, F5, Ab5, A5, Bb5, B5, C6, D6, Eb6, F6 = 72, 75, 77, 80, 81, 82, 83, 84, 86, 87, 89
ANSWERS = {
    1: [(24, [Ab5], 2), (26, [A5, C6], 10), (36, [F5], 6), (42, [Eb5], 6)],
    3: [(24, [C6], 6), (30, [Bb5], 6), (36, [Ab5], 3), (39, [A5, C6], 9)],
    5: [(24, [Ab5, D6], 6), (30, [Ab5, D6], 6), (36, [F5], 6), (42, [Ab5], 6)],
    7: [(t, [F5 if (t // 3) % 2 == 0 else F6], 3) for t in range(24, 45, 3)] + [(45, [Eb6], 3)],
    10: [(24, [Ab5], 2), (26, [A5, C6], 10), (36, [Eb6], 6), (42, [C6], 6)],
}
for b, fill in ANSWERS.items():
    for t, notes, ln in fill:
        s.chord(s.keys, (VERSE * 12 + b) * BAR + t, notes, 0.62, ln)

# The piano's chorus (the channel only): the right hand over the stabs.
PIANO_SOLO = {
    0: [(0, [Ab5], 2), (2, [A5, C6], 10), (12, [A5, C6], 6), (18, [F5], 6), (24, [Ab5], 2), (26, [A5, C6], 10), (36, [Bb5], 6), (42, [Ab5], 6)],
    1: [(0, [F5], 12), (18, [Eb5], 6), (24, [F5], 6), (30, [Ab5], 6), (36, [F5], 12)],
    2: [(0, [C6], 6), (6, [Eb6], 6), (12, [F6], 12), (24, [Eb6], 6), (30, [C6], 6), (36, [Bb5], 6), (42, [Ab5], 6)],
    3: [(0, [F5], 18), (24, [Eb5], 6), (30, [F5], 6), (36, [Ab5], 6), (42, [A5], 6)],
    4: [(0, [Bb5, D6], 12), (12, [Bb5, D6], 6), (18, [Ab5], 6), (24, [Bb5, D6], 12), (36, [C6], 6), (42, [Bb5], 6)],
    5: [(t, [Ab5 if (t // 3) % 2 == 0 else D6], 3) for t in range(0, 36, 3)] + [(36, [Bb5], 12)],
    6: [(0, [F6], 6), (6, [Eb6], 6), (12, [C6], 6), (18, [Bb5], 6), (24, [Ab5], 3), (27, [A5, C6], 9), (36, [F5], 12)],
    7: [(0, [C5], 6), (6, [Eb5], 6), (12, [F5], 6), (18, [Ab5], 6), (24, [A5, C6], 12), (36, [Eb6], 6), (42, [F6], 6)],
    8: [(0, [C6, 88], 6), (12, [C6, 88], 6), (18, [Bb5], 6), (24, [C6, 88], 12), (36, [Eb6], 6), (42, [C6], 6)],
    9: [(0, [Bb5, D6], 12), (12, [Ab5], 6), (18, [F5], 6), (24, [Ab5, D6], 12), (36, [Bb5], 6), (42, [Ab5], 6)],
    10: [(0, [Ab5], 2), (2, [A5, C6], 16), (24, [F5], 6), (30, [Eb5], 6), (36, [C5], 6), (42, [Eb5], 6)],
    11: [(0, [Eb5, F6], 10), (12, [74, F6], 10), (24, [73, F6], 10), (36, [C5, 88], 12)],
}
for b, line in PIANO_SOLO.items():
    for t, notes, ln in line:
        s.chord(s.keys, (PIANO * 12 + b) * BAR + t, notes, 0.74 if t % TPB == 0 else 0.62, ln)

# MARK: Melody part: the guitar. One box: F4 under the thumb, Ab4, Bb4, C5, Eb5 under the pinky.

F4, Ab4, Bb4, B4 = 65, 68, 70, 71
# (tick, note, length, weight[, from])
RIFF = {
    "F7": [(0, F4, 12, 1), (18, Ab4, 6, 2), (24, Bb4, 6, 2), (30, C5, 6, 3), (36, Bb4, 6, 3), (42, Ab4, 6, 3)],
    "Bb7": [(0, Bb4, 12, 1), (18, C5, 6, 2), (24, Eb5, 6, 2), (30, C5, 6, 3), (36, Bb4, 6, 3), (42, Ab4, 6, 3)],
    "C7": [(0, C5, 12, 1), (18, Bb4, 6, 2), (24, C5, 6, 2), (30, Eb5, 6, 3), (36, C5, 6, 3), (42, Bb4, 6, 3)],
}
TURN = [(0, C5, 18, 1), (24, Eb5, 6, 2), (30, C5, 6, 3), (36, Bb4, 6, 2), (42, Ab4, 6, 3)]
# The head: the riff, and the guitar answering itself in the landing bars.
HEAD_LINE = {
    1: [(0, F4, 18, 1), (18, Bb4, 6, 3), (24, C5, 12, 1), (36, Eb5, 6, 3), (42, C5, 6, 2)],
    3: [(0, F4, 18, 1), (24, C5, 12, 1), (36, Bb4, 6, 2), (42, Ab4, 6, 3)],
    5: [(0, Bb4, 18, 1), (24, Ab4, 6, 2), (30, Bb4, 6, 3), (36, C5, 12, 2)],
    7: [(0, F4, 18, 1), (18, C5, 6, 3), (24, Eb5, 12, 1), (36, F5, 12, 2, 5)],
    10: [(0, F4, 18, 1), (24, Ab4, 6, 2), (30, F4, 6, 3), (36, Ab4, 6, 2), (42, Bb4, 6, 3)],
}
# The verse: the line a singer would take, AAB, a held note where the piano answers.
VERSE_LINE = {
    0: [(0, C5, 18, 1), (18, C5, 6, 3), (24, Eb5, 6, 2), (30, C5, 6, 3), (36, Bb4, 12, 2)],
    1: [(0, Ab4, 30, 1)],
    2: [(0, C5, 18, 1), (18, C5, 6, 3), (24, Eb5, 6, 2), (30, C5, 6, 3), (36, Bb4, 6, 2), (42, Ab4, 6, 3)],
    3: [(0, F4, 30, 1)],
    4: [(0, Eb5, 18, 1), (18, C5, 6, 3), (24, Eb5, 6, 2), (30, C5, 6, 3), (36, Bb4, 12, 2)],
    5: [(0, Ab4, 30, 1)],
    6: [(0, C5, 18, 1), (24, Bb4, 6, 2), (30, Ab4, 6, 3), (36, F4, 12, 2)],
    7: [(0, F4, 30, 1)],
    8: [(0, Eb5, 12, 1), (12, Eb5, 6, 3), (18, C5, 6, 3), (24, Eb5, 6, 2), (30, C5, 6, 3), (36, Bb4, 12, 2)],
    9: [(0, Bb4, 12, 1), (12, Bb4, 6, 3), (18, Ab4, 6, 3), (24, Bb4, 6, 2), (30, Ab4, 6, 3), (36, F4, 12, 2)],
    10: [(0, F4, 30, 1)],
    11: [(0, C5, 18, 1), (24, Bb4, 6, 2), (30, C5, 6, 3), (36, Eb5, 6, 2), (42, C5, 6, 3)],
}
# Under the piano's chorus: the riff, and the landing with one answer so the piano has the room.
UNDER = {1: C5, 3: Ab4, 5: C5, 7: Ab4, 10: C5}
# The guitar's chorus: four bars of breaks, then the solo. Every bar stands on a key of the box;
# the reaches over it (F5, Ab5) come in at Medium and Hard.
SOLO_LINE = {
    0: [(0, C5, 12, 1), (12, Eb5, 6, 2), (18, C5, 6, 3), (24, Eb5, 3, 3), (27, F5, 9, 3, 6), (36, Eb5, 6, 2), (42, C5, 6, 3)],
    1: [(0, Bb4, 12, 1), (12, Ab4, 6, 3), (18, F4, 6, 2), (24, Ab4, 6, 3), (30, Bb4, 6, 3), (36, C5, 12, 2)],
    2: [(0, Eb5, 12, 1), (12, Eb5, 6, 3), (18, C5, 6, 3), (24, Eb5, 12, 1), (36, C5, 6, 2), (42, Bb4, 6, 3)],
    3: [(0, F4, 12, 1), (12, Ab4, 6, 3), (18, Bb4, 6, 3), (24, C5, 6, 2), (30, Eb5, 6, 3), (36, F5, 12, 2, 5)],
    4: [(0, Eb5, 18, 1), (18, F5, 3, 3, 6), (21, Eb5, 3, 3), (24, C5, 6, 2), (30, Eb5, 6, 3), (36, C5, 6, 2), (42, Bb4, 6, 3)],
    5: [(0, Bb4, 24, 1), (24, C5, 6, 3), (30, Eb5, 6, 3), (36, F5, 6, 2, 5), (42, Ab5, 6, 3, 6)],
    6: [(0, C5, 12, 1), (12, F5, 12, 2, 5), (24, Eb5, 12, 1), (36, Bb4, 6, 3), (42, C5, 6, 3)],
    7: [(0, F4, 24, 1), (24, Ab4, 6, 2), (30, Bb4, 6, 3), (36, C5, 6, 2), (42, Eb5, 6, 3)],
    8: [(0, Eb5, 12, 1), (12, Eb5, 6, 3), (18, F5, 6, 3, 6), (24, Eb5, 6, 2), (30, C5, 6, 3), (36, Eb5, 12, 2)],
    9: [(0, Bb4, 12, 1), (12, C5, 6, 3), (18, Eb5, 6, 2), (24, C5, 6, 2), (30, Bb4, 6, 3), (36, Ab4, 12, 2)],
    10: [(0, F4, 18, 1), (24, Ab4, 6, 2), (30, Bb4, 6, 3), (36, C5, 6, 2), (42, Eb5, 6, 3)],
    11: [(0, C5, 18, 1), (18, B4, 3, 3, 7), (24, Eb5, 6, 2), (30, C5, 6, 3), (36, Bb4, 6, 2), (42, Ab4, 6, 3)],
}
# The last two bars: the lick home, and the stop.
ENDING = [(0, F4, 12, 1), (12, Ab4, 6, 3), (18, Bb4, 6, 2), (24, C5, 6, 2), (30, Bb4, 6, 3), (36, Ab4, 12, 2)]

melody = s.part("melody", "Electric guitar", "piano", "horns", "eguitar")
for bar in range(s.bars):
    o = bar * BAR
    c, b = divmod(bar, 12)
    ch = chord_at(bar)
    k = kind(bar)
    if bar == LAST:
        line = [(0, F4, 44, 1)]
    elif bar == LAST - 1:
        line = ENDING
    elif c == VERSE:
        line = VERSE_LINE[b]
    elif c == SOLO:
        line = SOLO_LINE[b]
    elif k == "T":
        line = TURN
    elif k == "A":
        line = RIFF[ch]
    elif c == PIANO:
        line = [(0, F4 if ch == "F7" else Bb4, 18, 1), (24, UNDER[b], 12, 1 if b in (3, 7) else 2)]
    else:
        line = HEAD_LINE[b]
    for t, n, ln, lv, *frm in line:
        s.pnote(melody, o + t, n, ln, lv, tier=frm[0] if frm else None)
s.fingered(melody)



def guitar_v(e):
    """Under the piano's chorus the guitar sits back; everywhere else it leads."""
    back = 0.8 if e["t"] // BAR // 12 == PIANO else 1.0
    return back * (0.98 if e["lv"] == 1 else 0.88 if e["lv"] == 2 else 0.8)


s.chart_to_channel(melody, s.horns, guitar_v)
# The record's own: the riff an octave down under the guitar (not where it sings or solos), and
# a fourth under the held stings, the way a blues guitar grabs two strings.
for e in list(melody):
    bar = e["t"] // BAR
    c = bar // 12
    if c in (HEAD, PIANO, OUT) and (kind(bar) == "A" or bar >= LAST - 1):
        s.note(s.horns, e["t"], e["n"] - 12, 0.7 if c == PIANO else 0.86, e["len"])
        continue
    sting = e["n"] >= C5 and e["len"] >= 12 and c != PIANO
    if sting and e["lv"] == 2 and c in (HEAD, SOLO, OUT):
        s.note(s.horns, e["t"], e["n"] - 5, 0.74, e["len"])
    if sting and e["t"] >= 2:
        # The finger sliding into the note from the fret below.
        s.note(s.horns, e["t"] - 2, e["n"] - 1, 0.66, 2)
s.horns.sort(key=lambda e: e["t"])

s.write()
