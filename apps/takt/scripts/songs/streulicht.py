#!/usr/bin/env python3
"""Streulicht (stray light): melodic techno in E minor at 122, 128 bars and the tail (4:20). The
fifth record Claude rendered in Python for Takt and the first on the moog rack: one eight-stage
sequencer row whose length the player changes (8, 7, 6 stages) so it drifts against the bar, a
sixteenth bass that never leaves E, a pad that moves one finger, a hand-played lead that comes
late. The record is `misc/streulicht_reference.py` (the brief `misc/STREULICHT.md`); this is its
song file.

    python3 apps/takt/scripts/songs/streulicht.py   -> Takt/Content/song-streulicht.json

Nothing here is written by ear. `scripts/streulicht.py` runs the reference, which logs every event
it places, and writes that log (`streulicht-events.json`) with the gains, each file's scale, the
pad's phases and the lanes read out of the reference's source. This script turns it into the band:

- drums: each hit at its own time (`late`), at its own gain (`g`), on the reference's sound, into
  its bus of the console (`MoogRack`); every closed hat a slice of the hat's noise (`o`, `n`,
  `d`: where it starts, how long it lasts, its decay) at its own pan (`p`);
- the line (horns): the console's line voice, a note each, an accent at velocity 1, its own
  velocity as the note's gain, the gate the reference's to the sample (`hold`);
- the bass and the lead (the bass channel, the lead's notes on `rackLead`): the same, the bass's
  slid notes and the lead's legato ones exactly those that start while the gate is open
  (asserted);
- the pad (keys): the console's gated saws, a note for every run of bars a pitch is on;
- `moogRack`: every lane, gain and setting the reference's own.

The parts, by the takt-chart skill (LEVELING.md, CHARTING.md rule 22):

- melody, "The line": the record's row, every note, in its own octave (E3 to G4). The row is
  charted by its stage, not its place in the bar (it drifts against the bar by design). Home is
  E3 F#3 G3 A3 B3 under the right hand, thumb on E3: the stages on E3, G3, B3 and A3 live there.
  The anchors are the E3 on stage 1 (the accent) and the G3 on stage 3, the groove the B3 on
  stage 7: every level to Medium plays the row's triad, E G B. Then the E3 on stage 5 and the B3
  on stage 2; the A3 on stage 8 and D4 and F#4 / G4 (stages 4 and 6), the notes that leave the
  hand, are the record's only, on Hard. The rungs climb to the record's
  sixteenths by the song's gaps in `charting.json` (CHARTING.md rule 22).
- chords, "The pad": B3 D4 F#4 and C4 D4 F#4 as the record holds them, a hit a bar, the left
  hand with D and F# under 3 and 1 all song and the low note under 5 (B) or 4 (C). D and F# are
  the two-note chord; the moving finger comes in on three.
"""
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import BAR, Song  # noqa: E402

D = json.loads((Path(__file__).resolve().parent / "streulicht-events.json").read_text())
G, K, LANES = D["gains"], D["scale"], D["lanes"]
TEMPO = D["tempo"]
RSR = D["sr"]
TICK = 60 / TEMPO / 12  # seconds
BARS = D["bars"]
BAR_S = TICK * BAR
TAIL_BARS = math.ceil(D["tail"] / BAR_S)

s = Song("song-streulicht", "Streulicht", "Melodic Techno", "E minor", int(TEMPO), "scatter",
         "Melodic techno at 122, four minutes. One sequencer row drifting against the bar, a bass that never leaves E, a lead that comes late.",
         seed=1220)
s.human = 0
s.bars = BARS + TAIL_BARS
SECTIONS = [(0, "The line alone"), (8, "Kick"), (16, "Bass"), (24, "Open hat"), (32, "Seven stages"), (40, "One finger"),
            (56, "Break"), (64, "Back"), (72, "Lead"), (88, "Peak"), (96, "Second break"), (104, "Lead again"),
            (112, "Closing"), (120, "Kick and line"), (124, "Out")]
for b, name in SECTIONS:
    s.section(b, name)


def pad_notes(bar):
    """The reference's `pad_notes`; the last bar's chord holds through the tail."""
    return tuple(D["padBars"][min(bar, BARS - 1)])


CHORD_NAME = {(59, 62, 66): "Bm", (60, 62, 66): "D/C"}
s.chords = [CHORD_NAME[pad_notes(b)] for b in range(s.bars)]


def db(x):
    return round(20 * math.log10(x), 3)


def when(sec):
    """A time in seconds as (tick, late): the tick at or before it, and how much later than that
    tick it is. An event on the grid goes a tick early too, so the renderer places it by
    rounding its exact time, as the reference did."""
    x = sec / TICK
    t = math.floor(x)
    if x - t < 0.01:
        t -= 1
    t = max(0, t)
    return t, round(x - t, 5)


def hold(ln):
    """A gate of `ln` samples in ticks; the renderer truncates it to the reference's samples."""
    return (ln + 0.5) / (RSR * TICK)


# MARK: Drums: every sound into a bus of the console (a rack bus has no fader of its own).

s.sounds = {
    "kick": {"kit": "kickSL", "gainDb": db(G["kick"] / K["kickSL"]), "bus": "kick"},
    "hat": {"kit": "slHatNoise", "gainDb": db(G["hats"] / K["slHatNoise"]), "bus": "hats"},
    "xstick": {"kit": "rimMin", "gainDb": -27},  # the count-in's click only
}
for j in range(2):
    s.sounds[f"clap{j}"] = {"kit": f"slClap{j}", "gainDb": db(G["clap"] / K[f"slClap{j}"]), "bus": "clap"}
    s.sounds[f"ohh{j}"] = {"kit": f"slOhh{j}", "gainDb": db(G["ohat"] / K[f"slOhh{j}"]), "bus": "ohat"}


def hit(sec, sound, g=1.0, **extra):
    t, late = when(sec)
    e = {"t": t, "s": sound, "v": 1.0, "late": late}
    if g != 1.0:
        e["g"] = round(g, 6)
    e.update({k: round(v, 7) for k, v in extra.items()})
    s.drums.append(e)


LINE, BASS, LEAD = [], [], []
for e in D["events"]:
    kind, sec = e[0], e[1]
    if kind == "kick":
        hit(sec, "kick")
    elif kind == "clap":
        hit(sec, f"clap{e[3]}", e[2])
    elif kind == "ohat":
        hit(sec, f"ohh{e[3]}", e[2])
    elif kind == "hat":
        _, _, g, dec, length, offset, pn = e
        hit(sec, "hat", g, p=pn, o=offset / RSR, n=length / RSR, d=dec)
    elif kind == "line":
        LINE.append((sec, e[2], e[3], e[4], 0, e[5]))  # time, midi, gate in samples, accent, slide, velocity
    elif kind == "bass":
        BASS.append((sec, e[2], e[3], e[4], e[5], e[6]))
    elif kind == "lead":
        LEAD.append((sec, e[2], e[3], 0, e[4], e[5]))


def notes(events, channel, inst=None):
    """A note each, the gate to the sample. A note is legato (slid) in the record exactly when the
    gate before it is still open at its sample, which is what the console reads."""
    for (a, _, ln, _, _, _), (b, _, _, _, slide, _) in zip(events, events[1:]):
        open_ = round(b * RSR) < round(a * RSR) + ln
        assert open_ == bool(slide), ("a note slides exactly when the gate is open", a, b)
    for sec, note, ln, acc, _, vel in events:
        t, late = when(sec)
        h = hold(ln)
        e = {"t": t, "n": int(note), "v": 1.0 if acc else 0.6, "len": math.ceil(h), "late": late, "hold": round(h, 6), "g": round(vel, 6)}
        if inst:
            e["i"] = inst
        channel.append(e)


notes(LINE, s.horns)
notes(BASS, s.bass)
notes(LEAD, s.bass, "rackLead")

# MARK: The pad (keys): a note for every run of bars a pitch is on.

for m in sorted({n for b in range(BARS) for n in pad_notes(b)}):
    b = 0
    while b < s.bars:
        if m not in pad_notes(b):
            b += 1
            continue
        e = b
        while e < s.bars and m in pad_notes(e):
            e += 1
        t, late = when(b * BAR_S)
        s.keys.append({"t": t, "n": m, "v": 1.0, "len": (e - b) * BAR, "late": late})
        b = e

s.instruments = {"bass": "rackBass", "keys": "rackPad", "horns": "rackAcid", "monitor": "rackAcid"}
s.levels = {"bass": 0.0, "keys": 0.0, "horns": 0.0}
# The reference's sidechain: 0 → 1 over 2 ms, held to 35 ms, e^(−t/100 ms), 0.45 s long, on every kick.
s.duck = {"release": 0.1, "attack": 0.002, "hold": 0.035, "length": 0.45, "channels": {}}

# MARK: The console


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


# The master's fade: half a cosine from the end of the last bar to the end of the tail.
end_bar = (BARS * BAR_S + D["tail"]) / BAR_S
FADE = [[round(BARS + (end_bar - BARS) * i / 128, 6), round(0.5 * (1 + math.cos(math.pi * i / 128)), 8)] for i in range(129)]
pad_phases = [x for m in sorted(int(k) for k in D["pad"]) for x in D["pad"][str(m)]]
CTRL = {"accentLevel": 0.3, "accentEnv": 0.4}
s.moog_rack = {
    "lanes": {**LANES, "fade": [[0, 1.0]] + FADE},
    "buses": [
        {"name": "kick"},
        {"name": "clap", "hall": 0.35, "room": 0.7},
        {"name": "hats", "room": 0.35, "lowpass": 11000},
        {"name": "ohat", "hall": 0.1, "room": 0.3},
    ],
    # The line: three oscillators, lanes on nearly everything (the `line…` lanes replace the numbers).
    "line": {"prefix": "line", "start": 52, "attack": 0.0015, "decay": 0.1, "sustain": 0, "release": 0.03, "envelope": 0.07, "glide": 0,
             **CTRL, "drift": "11", "widthLfo": [0.13, 9],
             "oscs": [{"ratio": 1, "phase": 0.0, "saw": 0.6, "pulseLane": "linePulse"},
                      {"ratio": 2 ** (-7 / 1200), "phase": 0.31, "saw": 0.45, "drift": "12"},
                      {"ratio": 2 * 2 ** (5 / 1200), "phase": 0.67, "sawLane": "lineOsc3", "drift": "13"}],
             "input": 0.5, "base": 200, "baseLog": True, "amount": 1.4, "track": [mtof(52), 0.35], "cutoffDrift": "14", "min": 60, "max": 4200,
             "resonance": 1.0, "ladderDrive": 1.4, "drive": 1.2, "boost": 2.2, "highpass": 95, "gain": G["line"], "level": 1.0, "duck": 0.22,
             "pan": -0.06, "hall": 0.4, "send": 0.4, "accentVelocity": 0.9},
    # The bass: sixteenths on E, a saw and a pulse an octave down; a slid note glides for its gate.
    "bass": {"prefix": "bass", "start": 40, "attack": 0.0012, "decay": 0.13, "sustain": 0.3, "release": 0.02, "envelope": 0.075, "glide": 0.004,
             "slideGlide": 0.03, **CTRL, "drift": "21",
             "oscs": [{"ratio": 1, "phase": 0.0, "saw": 0.75}, {"ratio": 0.5, "phase": 0.25, "width": 0.5, "pulse": 0.4}],
             "input": 0.6, "base": 95, "baseLog": True, "amount": 2.2, "min": 50, "max": 5000, "resonance": 0.6, "ladderDrive": 1.6,
             "drive": 1.5, "boost": 2.2, "highpass": 32, "gain": G["bass"], "level": 1.0, "duck": 0.5, "pan": 0.0, "hall": 0, "send": 0,
             "accentVelocity": 0.9},
    # The lead: played by hand, legato, a vibrato that comes up on long notes; no accents.
    "lead": {"prefix": "lead", "start": 71, "attack": 0.014, "decay": 0.9, "sustain": 0.72, "release": 0.22, "envelope": 0.55, "glide": 0.065,
             **CTRL, "drift": "31",
             "oscs": [{"ratio": 2 ** (4 / 1200), "phase": 0.1, "width": 0.42, "saw": 0.55, "pulse": 0.3},
                      {"ratio": 2 ** (-4 / 1200), "phase": 0.55, "saw": 0.5},
                      {"ratio": 0.5, "phase": 0.8, "width": 0.5, "pulse": 0.25}],
             "input": 0.5, "base": 950, "amount": 0.9, "track": [mtof(71), 0.5], "min": 80, "max": 9000, "resonance": 1.1, "ladderDrive": 1.3,
             "drive": 1.3, "boost": 1.4, "highpass": 180, "gain": G["lead"], "level": 1.0, "duck": 0.1, "pan": 0.08, "hall": 0.7, "send": 0.5,
             "vibrato": {"rate": 5.3, "depth": 0.0042, "wobbleRate": 0.31, "wobbleDepth": 0.4, "gate": 0.5, "smooth": 1.1, "scale": 1.5, "offset": 0.35},
             "accentVelocity": 2.0},
    "lineEcho": {"beats": 0.75, "feedback": 0.5, "lowpass": 2800, "highpass": 260, "drive": 1.4, "wobble": [[0.0011, 0.17], [0.0003, 2.3]],
                 "level": G["echo_return"], "duck": 0.3, "hall": 0.5},
    "leadEcho": {"beats": 1.5, "feedback": 0.46, "lowpass": 2400, "highpass": 350, "drive": 1.3, "wobble": [[0.0015, 0.13]],
                 "level": G["lead_echo_return"], "duck": 0.2, "hall": 0.6},
    "sideBars": 0.125, "sideWindow": 400 / RSR,
    "pad": {"notes": sorted(int(k) for k in D["pad"]), "phases": pad_phases, "left": [[-9, 1, 1], [4, 1, 1], [3, 2, 0.5]],
            "right": [[9, 1, 1], [-5, 1, 1], [-4, 2, 0.5]], "smooth": 1 / 0.9, "input": 0.2, "resonance": 0.4, "ladderDrive": 1.0,
            "rightScale": 1.06, "lfoDepth": 0.18, "lfoBars": 5, "lfoPhase": 0.7, "highpass": 190, "gain": G["pad"], "duck": 0.5, "hall": 0.9},
    "drift": "sl-drift",
    "hall": {"ir": "sl-ir-hall", "block": 1024, "level": G["hall_return"], "duck": 0.4},
    "room": {"ir": "sl-ir-room", "block": 256, "level": G["room_return"]},
    "noise": {"kit": "slNoise", "gain": G["noise"] / K["slNoise"], "duck": 0.0},
    "master": {"highpass": 25, "drive": G["master_pregain"], "post": G["master_post"], "scale": G["final_scale"],
               "level": round(10 ** (-8 / 20), 4), "limit": G["limiter_threshold"], "limitRelease": 0.12},
}

# MARK: Melody part: the line, every note

# The row's stage of every note, from the reference's own sections (`LINE_SECTIONS`): the stage
# counter restarts at each and wraps at its length, and bars 0–15 skip stage 5.
SECTIONS_ROW = [(0, 16, 8, 4), (16, 32, 8, -1), (32, 56, 7, -1), (56, 64, 6, -1), (64, 96, 7, -1), (96, 104, 6, -1), (104, 128, 8, -1)]
stages = []
for b0, b1, nst, skip in SECTIONS_ROW:
    for st in range((b1 - b0) * 16):
        if st % nst != skip:
            stages.append(st % nst)
assert len(stages) == len(LINE)
# Weight and floor by stage (0-based; the brief counts from 1): the E3 on the accent and the G3
# two stages on are the anchors, the B3 on stage 7 the groove, so every level plays the row's
# triad, E G B, under one hand (rule 7: a level is still the line). The rest wait for the rung
# over Medium, where the row's sixteenths begin to fill in: the second E3 and the B3 between
# (tier 6); the A3 and the D4 and F#4 / G4 out of the hand are the record's alone (Hard). Those floors
# keep tier 5 to three stages in eight, so no rung doubles the one below (CHARTING.md rule 22).
RUNGS = {0: (1, None), 2: (1, None), 6: (2, None), 4: (2, 6), 1: (3, 6), 7: (3, 7), 3: (3, 7), 5: (3, 7)}
melody = s.part("melody", "The line", "rackAcid", "horns", "rackAcid")
for (sec, note, ln, acc, _, _), stage in zip(LINE, stages):
    lv, tier = RUNGS[stage]
    s.pnote(melody, round(sec / TICK), note, math.ceil(ln / RSR / TICK - 1e-6), lv, tier=tier)
    melody[-1]["v"] = 1.0 if acc else 0.6
assert {e["n"] for e in melody} == {52, 55, 57, 59, 62, 66, 67}, "the line stays on E3 G3 A3 B3 D4 F#4 G4"
s.fingered(melody)

# MARK: Chords part: the pad, a hit a bar

# The left hand: the low note under 5 (B3) or 4 (C4), D4 under 3, F#4 under the thumb. D and F#
# are the root and the third of the two-note chord, the low note the sixth or the seventh.
VOICING = {(59, 62, 66): [(59, "sixth", 5), (62, "root", 3), (66, "third", 1)],
           (60, 62, 66): [(60, "seventh", 4), (62, "root", 3), (66, "third", 1)]}
chords = s.part("chords", "The pad", "rackPad", "keys", "rackPad")
for bar in range(BARS):
    notes_ = pad_notes(bar)
    moved = notes_ != pad_notes(bar - 1) if bar else True
    # The bar the chord changes on (and every fourth bar when it holds) is the anchor, the third
    # bar of the four the groove, the others the pushes.
    lv = 1 if moved or bar % 4 == 0 else 2 if bar % 4 == 2 else 3
    s.pchord(chords, bar * BAR, VOICING[notes_], lv, BAR)

s.write()
