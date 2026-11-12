#!/usr/bin/env python3
"""Irrlicht (will-o'-the-wisp): melodic techno in B minor at 124, 128 bars and the tail (4:16). The
sixth record Claude rendered in Python for Takt and the second on the moog rack: a two-bar bass
of sixteenths that never changes, an accent on top of it in a cycle of its own (4, then 3, then 5
sixteenths) so the bright note wanders across the bar, a second voice on B1 through a frequency
shifter, a pad that moves one finger, a hand-played lead that comes late. Bart, on hearing it:
"Fantastic!" The record is `misc/irrlicht_reference.py` (the brief `misc/IRRLICHT.md`); this is
its song file.

    python3 apps/takt/scripts/songs/irrlicht.py   -> Takt/Content/song-irrlicht.json

Nothing here is written by ear. `scripts/irrlicht.py` runs the reference, which logs every event
it places, and writes that log (`irrlicht-events.json`) with the gains, each file's scale, the
pad's phases, where the shadow's file starts and the lanes read out of the reference's source.
This script turns it into the band:

- drums: each hit at its own time (`late`), at its own gain (`g`), on the reference's sound, into
  its bus of the console (`MoogRack`); the closed hats slices of the hat's noise (`o`, `n`, `d`),
  the closed hats and the toms with their own pans (`p`);
- the bass (horns): the console's first voice (the one your keys play), a note each, an accent at
  velocity 1, its own velocity as the note's gain, the gate the reference's to the sample
  (`hold`); the slid notes exactly those that start while the gate is open (asserted);
- the lead (the bass channel): the console's lead, the same way, its legato notes likewise;
- the pad (keys): the console's gated saws, a note for every run of bars a pitch is on;
- the shadow: no notes; the console plays the reference's own bus from its file at the song's
  position;
- `moogRack`: every lane, gain and setting the reference's own.

The parts, by the takt-chart skill (LEVELING.md, CHARTING.md rule 23):

- melody, "The bass": the record's bass, every sixteenth, in its own octave (A1 to B2). Up to
  Medium one hand position, B1 under the thumb to F#2 under the pinky; the accented notes are the
  anchors (they are what the ear follows, and they wander across the bar by themselves), then the
  B1 on the beats, then the rest. The octave B2 comes in with the record's sixteenths (in bars
  8–15, where the record has only B1 and B2, at every level); the A1 is the record's alone.
- chords, "The pad": C#4 D4 A4 and C#4 D4 G4 as the record holds them, a hit a bar from bar 24
  (the pad is silent before 22), the left hand: C# under 5, D under 4, the thumb on A, or G for
  two bars in eight. D and the thumb's note are the two-note chord.
"""
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import BAR, Song  # noqa: E402

D = json.loads((Path(__file__).resolve().parent / "irrlicht-events.json").read_text())
G, K, LANES = D["gains"], D["scale"], D["lanes"]
TEMPO = D["tempo"]
RSR = D["sr"]
TICK = 60 / TEMPO / 12  # seconds
BARS = D["bars"]
BAR_S = TICK * BAR
TAIL_BARS = math.ceil(D["tail"] / BAR_S)

s = Song("song-irrlicht", "Irrlicht", "Melodic Techno", "B minor", int(TEMPO), "wisp",
         "Melodic techno at 124, four minutes. A bass of sixteenths that never changes, its bright note wandering across the bar; a second voice through a frequency shifter.",
         seed=1240)
s.human = 0
s.bars = BARS + TAIL_BARS
SECTIONS = [(0, "The bass alone"), (4, "Kick"), (8, "Hats"), (16, "The whole bass"), (24, "Clap"), (32, "The shadow"), (40, "Toms"),
            (48, "In five"), (56, "Break"), (64, "Back"), (72, "Lead"), (88, "Peak"), (96, "Second break"), (100, "Drums back"),
            (112, "Closing"), (120, "Kick and bass"), (124, "Out")]
for b, name in SECTIONS:
    s.section(b, name)


def pad_notes(bar):
    """The reference's `pad_notes`; the last bar's chord holds through the tail."""
    return tuple(D["padBars"][min(bar, BARS - 1)])


CHORD_NAME = {(61, 62, 69): "Dmaj7", (61, 62, 67): "Dsus4"}
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


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


# MARK: Drums: every sound into a bus of the console (a rack bus has no fader of its own).

s.sounds = {
    "kick": {"kit": "kickIL", "gainDb": db(G["kick"] / K["kickIL"]), "bus": "kick"},
    "hat": {"kit": "ilHatNoise", "gainDb": db(G["hats"] / K["ilHatNoise"]), "bus": "hats"},
    "xstick": {"kit": "rimMin", "gainDb": -27},  # the count-in's click only
}
for j in range(2):
    s.sounds[f"clap{j}"] = {"kit": f"ilClap{j}", "gainDb": db(G["clap"] / K[f"ilClap{j}"]), "bus": "clap"}
    s.sounds[f"ohh{j}"] = {"kit": f"ilOhh{j}", "gainDb": db(G["ohat"] / K[f"ilOhh{j}"]), "bus": "ohat"}
for m in (47, 54):
    s.sounds[f"tom{m}"] = {"kit": f"ilTom{m}", "gainDb": db(G["toms"] / K[f"ilTom{m}"]), "bus": "toms"}


def hit(sec, sound, g=1.0, **extra):
    t, late = when(sec)
    e = {"t": t, "s": sound, "v": 1.0, "late": late}
    if g != 1.0:
        e["g"] = round(g, 6)
    e.update({k: round(v, 7) for k, v in extra.items()})
    s.drums.append(e)


BASS, LEAD = [], []
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
    elif kind == "tom":
        hit(sec, f"tom{e[2]}", e[3], p=e[4])
    elif kind == "bass":
        BASS.append((sec, e[2], e[3], e[4], e[5], e[6]))  # time, midi, gate in samples, accent, slide, velocity
    elif kind == "lead":
        LEAD.append((sec, e[2], e[3], 0, e[4], e[5]))


def notes(events, channel):
    """A note each, the gate to the sample. A note is legato (slid) in the record exactly when the
    gate before it is still open at its sample, which is what the console reads."""
    for (a, _, ln, _, _, _), (b, _, _, _, slide, _) in zip(events, events[1:]):
        open_ = round(b * RSR) < round(a * RSR) + ln
        assert open_ == bool(slide), ("a note slides exactly when the gate is open", a, b)
    for sec, note, ln, acc, _, vel in events:
        t, late = when(sec)
        h = hold(ln)
        channel.append({"t": t, "n": int(note), "v": 1.0 if acc else 0.6, "len": math.ceil(h), "late": late, "hold": round(h, 6), "g": round(vel, 6)})


notes(BASS, s.horns)
notes(LEAD, s.bass)

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

s.instruments = {"bass": "rackLead", "keys": "rackPad", "horns": "rackAcid", "monitor": "rackAcid"}
s.levels = {"bass": 0.0, "keys": 0.0, "horns": 0.0}
# The reference's sidechain: 0 → 1 over 2 ms, held to 35 ms, e^(−t/100 ms), 0.45 s long, on every kick.
s.duck = {"release": 0.1, "attack": 0.002, "hold": 0.035, "length": 0.45, "channels": {}}

# MARK: The console

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
        {"name": "toms", "hall": 0.4, "room": 0.4},
    ],
    # The bass: the record's carrier and your keys' voice (the `bass…` lanes replace the numbers).
    "line": {"prefix": "bass", "start": 35, "attack": 0.0012, "decay": 0.12, "sustain": 0.3, "release": 0.02, "envelope": 0.06, "glide": 0.004,
             "slideGlide": 0.03, **CTRL, "drift": "21", "widthLfo": [0.14, 11],
             "oscs": [{"ratio": 1, "phase": 0.0, "saw": 0.6, "pulse": 0.45},
                      {"ratio": 2 ** (6 / 1200), "phase": 0.4, "saw": 0.4, "drift": "22"}],
             "input": 0.5, "base": 85, "baseLog": True, "amount": 1.6, "cutoffDrift": "23", "min": 45, "max": 3800,
             "resonance": 0.5, "ladderDrive": 1.6, "drive": 1.6, "boost": 3.2, "highpass": 30, "gain": G["bass"], "level": 1.0, "duck": 0.5,
             "pan": 0.0, "hall": 0.5, "send": 0.0, "accentVelocity": 0.9},
    # The lead: played by hand, legato, a vibrato that comes up on long notes; no accents.
    "lead": {"prefix": "lead", "start": 78, "attack": 0.02, "decay": 1.0, "sustain": 0.75, "release": 0.25, "envelope": 0.7, "glide": 0.08,
             **CTRL, "drift": "31", "widthLfo": [0.08, 1 / 0.23], "widthCenter": 0.36, "widthSeconds": True,
             "oscs": [{"ratio": 2 ** (3 / 1200), "phase": 0.1, "saw": 0.35, "pulse": 0.5},
                      {"ratio": 2 ** (-4 / 1200), "phase": 0.55, "pulse": 0.45}],
             "input": 0.5, "base": 800, "amount": 1.0, "track": [mtof(78), 0.5], "min": 80, "max": 8000, "resonance": 1.3, "ladderDrive": 1.3,
             "drive": 1.3, "boost": 1.4, "highpass": 200, "gain": G["lead"], "level": 1.0, "duck": 0.1, "pan": -0.08, "hall": 0.7, "send": 0.5,
             "vibrato": {"rate": 4.9, "depth": 0.0045, "wobbleRate": 0, "wobbleDepth": 0, "gate": 0.5, "smooth": 1.0, "scale": 1.5, "offset": 0.35},
             "accentVelocity": 2.0},
    # The bass's echo hears only its top (a 420 Hz highpass on what goes in).
    "lineEcho": {"beats": 0.75, "feedback": 0.45, "lowpass": 2600, "highpass": 420, "drive": 1.4, "wobble": [[0.0011, 0.17], [0.0003, 2.3]],
                 "level": G["echo_return"], "duck": 0.3, "hall": 0.6},
    "echoFeedback": "bassFeedback", "echoHighpass": 420,
    "leadEcho": {"beats": 1.5, "feedback": 0.46, "lowpass": 2400, "highpass": 350, "drive": 1.3, "wobble": [[0.0015, 0.13]],
                 "level": G["lead_echo_return"], "duck": 0.2, "hall": 0.6},
    "leadEchoRight": True,
    "sideBars": 0.125, "sideWindow": 400 / RSR,
    "pad": {"notes": sorted(int(k) for k in D["pad"]), "phases": pad_phases, "left": [[-9, 1, 1], [4, 1, 1], [3, 2, 0.5]],
            "right": [[9, 1, 1], [-5, 1, 1], [-4, 2, 0.5]], "smooth": 1 / 0.9, "input": 0.2, "resonance": 0.4, "ladderDrive": 1.0,
            "rightScale": 1.06, "lfoDepth": 0.18, "lfoBars": 5, "lfoPhase": 0.7, "highpass": 200, "gain": G["pad"], "duck": 0.5, "hall": 0.9},
    "stem": {"name": "shadow", "kit": "ilShadow", "from": D["shadowFrom"], "gain": G["shadow"] / K["ilShadow"], "duck": 0.6, "hall": 0.5},
    "drift": "il-drift",
    "hall": {"ir": "il-ir-hall", "block": 1024, "level": G["hall_return"], "duck": 0.4, "highpass": 180},
    "room": {"ir": "il-ir-room", "block": 256, "level": G["room_return"]},
    "noise": {"kit": "ilNoise", "gain": G["noise"] / K["ilNoise"], "duck": 0.0},
    "master": {"highpass": 25, "drive": G["master_pregain"], "post": G["master_post"], "scale": G["final_scale"],
               "level": round(10 ** (-8 / 20), 4), "limit": G["limiter_threshold"], "limitRelease": 0.12},
}

# MARK: Melody part: the bass, every note

# Weight and floor (CHARTING.md rule 23). The hand sits on B1 (thumb) to F#2 (pinky) up to the
# rungs where the sixteenths fill in: an accented note there is an anchor (the record's own
# reduction: the note that wanders), a B1 on the beat the groove, the rest the pushes. The octave
# B2 is a hand move by LEVELING.md's measure, so it waits for tier 6 (an accented one) or 7, but
# in bars 8–15, where the record plays only B1 and B2, so a level there is still two keys
# (rule 7). The B1s off the eighths wait for Hard with the A1 under the thumb, so the rung under
# the record is the line on eighths and no rung doubles the one below.


def rung(bar, step, note, acc):
    if note == 33:
        return 3, 7
    if note == 47:
        if 8 <= bar < 16:
            return (1, None) if acc else (3, 5)
        return (1, 6) if acc else (3, 7)
    if acc:
        return 1, None
    if note == 35:
        return (2, None) if step % 4 == 0 else (3, 6) if step % 2 == 0 else (3, 7)
    if note == 38 and step == 6:
        # The D2 on the "and" of 2, in both bars: no floor, so the key cover can give a phrase
        # whose accents all land on B1 (the cycle of five, bars 48–55 and 88–103) its second key.
        return 3, None
    return 3, 5


melody = s.part("melody", "The bass", "rackAcid", "horns", "rackAcid")
for sec, note, ln, acc, _, _ in BASS:
    tick = round(sec / TICK)
    bar, step = divmod(round(sec / (TICK * 3)), 16)
    lv, tier = rung(bar, step, note, acc)
    # The gate in whole ticks, rounded up: what the key holds is what the record's gate holds.
    s.pnote(melody, tick, note, math.ceil(ln / RSR / TICK - 1e-6), lv, tier=tier)
    melody[-1]["v"] = 1.0 if acc else 0.6
assert {e["n"] for e in melody} == {33, 35, 38, 40, 42, 47}, "the bass stays on A1 B1 D2 E2 F#2 B2"
s.fingered(melody)

# MARK: Chords part: the pad, a hit a bar from bar 24

# The left hand: C#4 under 5, D4 under 4, the thumb on A4 (or G4). D and the thumb's note are
# the root and the fifth of the two-note chord; the C# is the seventh.
VOICING = {(61, 62, 69): [(61, "seventh", 5), (62, "root", 4), (69, "fifth", 1)],
           (61, 62, 67): [(61, "seventh", 5), (62, "root", 4), (67, "fifth", 1)]}
chords = s.part("chords", "The pad", "rackPad", "keys", "rackPad")
# Before the pad (bars 4–23) the part has chords of its own, the pad's first chord every other
# bar, quiet: the record has nothing pitched over the bass there, and the part started at 46 s
# (Bart, 2026-11-12: "15 seconds or so should be the longest break ever, and not more than once
# a game"; CHARTING.md rule 24). Taking the chords, the rack's pad plays them; the record's own
# channel is untouched.
for bar in range(4, 24, 2):
    at = len(chords)
    s.pchord(chords, bar * BAR, VOICING[pad_notes(24)], 1 if bar % 4 == 0 else 2, BAR)
    for e in chords[at:]:
        e["v"] = 0.6
for bar in range(24, BARS):
    notes_ = pad_notes(bar)
    moved = notes_ != pad_notes(bar - 1)
    # The bar the chord changes on (and every fourth bar while it holds) is the anchor, the third
    # bar of the four the groove, the others the pushes; the last bar an anchor too, so no level
    # ends on more than ten seconds with nothing to play.
    lv = 1 if moved or bar % 4 == 0 or bar == BARS - 1 else 2 if bar % 4 == 2 else 3
    s.pchord(chords, bar * BAR, VOICING[notes_], lv, BAR)

s.write()
