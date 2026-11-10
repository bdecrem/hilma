#!/usr/bin/env python3
"""Halbschatten: dub techno in G minor at 122, 120 bars and the tail (4:03). The record Claude
rendered for Bart in Python (misc/halbschatten_reference.py, misc/HALBSCHATTEN.md), on the Stage
as it was rendered. Bart, 2026-11-09: "implement this track into TAKT but make sure it sounds
EXACTLY the same as the wav".

    python3 apps/takt/scripts/songs/halbschatten.py   -> Takt/Content/song-halbschatten.json

Nothing here is written by ear. `scripts/halbschatten.py` runs the reference and logs every
event it places (its time to the sample, its round robin, its velocity after the humanizing);
this script turns that log (`halbschatten-events.json`) into the band:

- drums: each hit at its own time (`late`: the swing and the jitter are finer than a tick), at
  its own gain (`g`), on the reference's own one-shot (a sound per round robin), into the rack
  bus its stem is (hats, shaker, clap, rim, toms, riser); the kick on the drums channel;
- bass: every note the reference's own render of that pitch and length (`hsBass…`);
- the stab (keys): one event a hit, the raw buffer the reference drew (`hsStab0…3`, a zone per
  chord), into the rack's stab bus; a tick ahead of its time, so the echo's side switch can
  finish before it as the reference's does;
- the lead (horns): the rack's FM voice, a note each, the reference's velocity;
- `rack`: the console (Takt/Audio/Rack.swift): lanes, the stab bus, both echoes, the pad with
  the reference's start phases, the hall and room impulses, the noise bed, the master. Every
  gain is the reference's resolved number (gains.json) over the file's scale.

Levels are reference units all the way to the master; `master.level` brings the result to the
Stage's electronic tracks (about −19 dBFS mean; the reference is at −11).

The parts: the chords are the stab's five-note voicings (Gm9, Cm9, Dm9; your keys play the
rack's synthesized stab into the same filter, echo and hall); the melody is the lead line (the
rack's FM voice), with a line of the part's own under bars 0–47 so it has notes from the start. Weights by the takt-chart skill (BLUES.md does not apply: CHARTING.md's rules).
"""
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import BAR, Song  # noqa: E402

D = json.loads((Path(__file__).resolve().parent / "halbschatten-events.json").read_text())
G, K = D["gains"], D["scale"]
TEMPO = D["tempo"]
TICK = 60 / TEMPO / 12  # seconds
BARS = D["bars"]
# The reference's tail (7 s) is the song's last bars: the echoes and the hall ringing out
# under the master's fade.
TAIL_BARS = math.ceil(D["tail"] / (TICK * BAR))

s = Song("song-halbschatten", "Halbschatten", "Dub techno", "G minor", int(TEMPO), "penumbra",
         "Dub techno at 122, four minutes. One chord stab into a tape echo and a hall, a pad, a lead that arrives late.", seed=303)
s.human = 0
s.bars = BARS + TAIL_BARS
SECTIONS = [(0, "Dust"), (8, "Kick"), (16, "Bass"), (24, "Hats"), (32, "Full"), (40, "Clap"), (48, "Break"), (56, "The lead"),
            (64, "Shaker"), (72, "Open"), (80, "Lead again"), (88, "One chord"), (96, "Thinning"), (104, "Low"), (112, "Out")]
for b, name in SECTIONS:
    s.section(b, name)
CYCLE = ["Gm9", "Gm9", "Cm9", "Dm9"]


def chord_at(bar):
    return CYCLE[(bar - 48) % 4] if 48 <= bar < 88 else "Gm9"


s.chords = [chord_at(b) for b in range(s.bars)]


def db(x):
    return round(20 * math.log10(x), 3)


def when(sec, ahead=0):
    """A time in seconds as (tick, late): the tick at or before it (`ahead` ticks earlier), and
    how much later than that tick it is. An event on the grid goes a tick early too, so the
    renderer places it by rounding its exact time, as the reference did."""
    x = sec / TICK
    t = math.floor(x) - ahead
    if x - t < 0.01:
        t -= 1
    t = max(0, t)
    return t, round(x - t, 5)


# MARK: Drums. The renderer's faders: drums 1.6, bass 0.32 (BandRenderer.mix); a rack bus has none.

# A mono file plays on both sides at full level; the reference pans its centre at cos(π/4) a side.
CENTRE = math.sqrt(0.5)

s.sounds = {
    "kick": {"kit": "kickHS", "gainDb": db(G["kick"] * CENTRE / K["kickHS"] / 1.6)},
    "clap": {"kit": "hsClap", "gainDb": db(G["clap"] / K["hsClap"]), "bus": "clap"},
    "rim": {"kit": "hsRim", "gainDb": db(G["rim"] / K["hsRim"]), "bus": "rim"},
    "xstick": {"kit": "rimMin", "gainDb": -27},  # the count-in's click only
}
for j in range(3):
    s.sounds[f"chh{j}"] = {"kit": f"hsChh{j}", "gainDb": db(G["hats"] / K[f"hsChh{j}"]), "bus": "hats"}
    s.sounds[f"shk{j}"] = {"kit": f"hsShk{j}", "gainDb": db(G["shaker"] / K[f"hsShk{j}"]), "bus": "shaker"}
for j in range(2):
    s.sounds[f"ohh{j}"] = {"kit": f"hsOhh{j}", "gainDb": db(G["hats"] / K[f"hsOhh{j}"]), "bus": "hats"}
for m, side in ((55, "L"), (53, "R"), (50, "R"), (53, "L")):
    s.sounds[f"tom{m}{side}"] = {"kit": f"hsTom{m}{side}", "gainDb": db(G["toms"] / K[f"hsTom{m}{side}"]), "bus": "toms"}
for i in range(4):
    s.sounds[f"riser{i}"] = {"kit": f"hsRiser{i}", "gainDb": db(G["riser"] / K[f"hsRiser{i}"]), "bus": "riser"}


def hit(sec, sound, g):
    t, late = when(sec)
    s.drums.append({"t": t, "s": sound, "v": 1.0, "late": late, "g": round(g, 5)})


ROOT = {"F": 55, "Bb": 48, "C": 50}  # the reference writes in F minor: Gm9, Cm9, Dm9 sounding
STAB = []
LEAD = []
for e in D["events"]:
    kind, sec = e[0], e[1]
    if kind == "kick":
        # On the drums channel (its frame is the duck's), placed like every other hit.
        t, late = when(sec)
        s.drums.append({"t": t, "s": "kick", "v": 1.0, "late": late})
    elif kind in ("chh", "ohh", "shk"):
        hit(sec, f"{kind}{e[2]}", e[3])
    elif kind == "clap":
        hit(sec, "clap", e[2])
    elif kind == "rim":
        hit(sec, "rim", e[2])
    elif kind == "tom":
        hit(sec, f"tom{e[2]}{'LR'[e[3]]}", e[4])
    elif kind == "bass":
        note, ln, vel = e[2], e[3], e[4]
        t, late = when(sec)
        # The whole one-shot: the note, its 120 ms of release, the lowpass's ring.
        length = math.ceil((ln * TICK * 3 + 0.12 + 0.06) / TICK)
        s.bass.append({"t": t, "n": note, "v": 1.0, "len": length, "i": f"hsBass{int(ln * 10)}", "late": late, "g": round(vel, 5)})
    elif kind == "stab":
        ch, variant, v, bar, step = e[2], e[3], e[4], e[6], e[7]
        t, late = when(sec, ahead=1)
        s.keys.append({"t": t, "n": ROOT[ch], "v": 1.0, "len": 12, "i": f"hsStab{variant}", "late": late,
                       "g": round(v / K[f"hsStab{variant}"], 5)})
        STAB.append((bar, step, {"F": "Gm9", "Bb": "Cm9", "C": "Dm9"}[ch], v))
    elif kind == "lead":
        note, ln, vel, bar, step = e[2], e[3], e[4], e[5], e[6]
        t, late = when(sec)
        s.horns.append({"t": t, "n": note, "v": round(vel, 5), "len": int(ln * 3), "late": late})
        LEAD.append((bar, step, note, ln, vel))
# The four risers, each from its first bar (the sweep ends on the downbeat at the song's tempo).
for i, bar in enumerate((14, 30, 52, 86)):
    # The reference's own sample for the bar (it rounds the bar's time to a 44.1 kHz frame).
    hit(round(bar * BAR * TICK * 44100) / 44100, f"riser{i}", 1.0)

s.instruments = {"bass": "hsBass20", "keys": "hsStab0", "horns": "rackLead", "monitor": "rackStab"}
s.levels = {"bass": db(G["bass"] * CENTRE / K["hsBass20"] / 0.32), "keys": 0.0, "horns": 0.0}
# The reference's sidechain: 0 → 1 over 3 ms, held to 20 ms, e^(−t/110 ms), 450 ms long.
s.duck = {"release": 0.11, "attack": 0.003, "hold": 0.02, "length": 0.45, "channels": {"bass": 0.78}}

# MARK: The rack

fade_bars = 2 + D["tail"] / (TICK * BAR)
s.rack = {
    "lanes": {
        "stabCutoff": [[0, 250], [8, 360], [16, 500], [32, 720], [44, 1050], [48, 560], [56, 1400], [64, 1750], [76, 2500],
                       [84, 2100], [88, 1200], [96, 800], [104, 520], [112, 360], [120, 230]],
        "stabDecay": [[0, 0.11], [32, 0.14], [48, 0.24], [56, 0.16], [76, 0.20], [96, 0.13], [120, 0.10]],
        "echoFeedback": [[0, 0.68], [15, 0.68], [15.5, 0.86], [16.25, 0.66], [31, 0.66], [31.5, 0.88], [32.25, 0.64], [46.5, 0.64],
                         [47.5, 0.90], [49, 0.74], [55, 0.74], [55.5, 0.86], [56.25, 0.62], [86.5, 0.62], [87.5, 0.88], [88.5, 0.66],
                         [110, 0.68], [112, 0.82], [118, 0.76], [120, 0.6]],
        "echoSend": [[0, 1.0], [32, 0.9], [48, 1.0], [56, 0.9], [88, 0.95], [104, 1.0]],
        "padCutoff": [[0, 300], [16, 480], [48, 900], [56, 620], [76, 1100], [96, 600], [120, 300]],
        "padLevel": [[0, 0.0], [4, 0.8], [8, 1.0], [16, 0.75], [32, 0.6], [47, 0.7], [48, 1.0], [55, 1.0], [56, 0.6], [88, 0.75],
                     [112, 1.0], [118, 0.7], [BARS + 2, 0.0]],
        "leadLevel": [[0, 0.55], [48, 0.55], [56, 1.0], [72, 1.0], [80, 0.8], [88, 0.8]],
        "noise": [[0, 0.0], [1, 1.0], [16, 0.8], [32, 0.6], [48, 1.0], [56, 0.6], [96, 0.8], [112, 1.0], [120, 0.9], [BARS + 2.5, 0.0]],
        # The master's fade: half a cosine from bar 118 to the end of the tail.
        "fade": [[118 + fade_bars * i / 64, round(0.5 * (1 + math.cos(math.pi * i / 64)), 6)] for i in range(65)],
    },
    "buses": [
        {"name": "hats", "room": 0.35},
        {"name": "shaker", "room": 0.4},
        {"name": "clap", "hall": 0.35, "room": 0.8},
        {"name": "rim", "hall": 0.3, "room": 0.6, "echo": 0.6},
        {"name": "toms", "room": 0.5, "echo": 0.25},
        {"name": "riser", "hall": 0.8},
    ],
    "stab": {"gain": G["chords"], "duck": 0.30, "hall": 0.55, "q": [2.4, 0.7], "env": 1.6, "envTime": 0.085, "drive": 1.3,
             "compRef": 700, "compPower": 0.15, "lfoDepth": 0.10, "lfoBars": 6.5, "min": 60, "max": 14000, "attack": 0.003,
             "lengths": 7, "detune": [-9, 0, 8], "pans": [-0.75, 0, 0.75], "spread": 1.5, "noise": 0.10, "notes": 5,
             "fileScale": K["hsStab0"]},
    "echo": {"beats": 0.75, "feedback": 0.68, "lowpass": 4200, "highpass": 130, "drive": 1.5, "wobble": [[0.0012, 0.23], [0.0004, 3.1]],
             "level": G["echo_return"], "duck": 0.35, "hall": 0.5},
    "lead": {"gain": G["lead"], "lowpass": 5200, "hall": 0.7},
    "leadEcho": {"beats": 1.5, "feedback": 0.42, "lowpass": 3000, "highpass": 350, "drive": 1.5, "wobble": [[0.001, 0.17]],
                 "level": G["lead_echo_return"], "duck": 0.25, "hall": 0.5},
    "pad": {"notes": [[43, 1.0], [50, 0.9], [55, 0.7], [62, 0.5], [65, 0.4]], "left": [-6, 3], "right": [6, -2], "phases": D["pad"],
            "q": 0.9, "lfoDepth": 0.28, "lfoBars": 9.0, "lfoPhase": 1.0, "rightScale": 1.07, "highpass": 110, "gain": G["pad"],
            "duck": 0.55, "hall": 0.9},
    "hall": {"ir": "hs-ir-hall", "block": 1024, "level": G["hall_return"], "duck": 0.40},
    "room": {"ir": "hs-ir-room", "block": 256, "level": G["room_return"]},
    "noise": {"kit": "hsNoise", "gain": G["noise"] / K["hsNoise"], "duck": 0.3},
    "master": {"highpass": 24, "drive": G["master_pregain"], "post": G["master_post"], "scale": G["final_scale"],
               "level": round(10 ** (-8 / 20), 4), "limit": G["limiter_threshold"], "limitRelease": 0.12},
}

# MARK: Chords part: the stab's voicings, a hit a 16th step

STACK = ["root", "third", "fifth", "seventh", "ninth"]
VOICING = {c: [(n, r, 5 - i) for i, (n, r) in enumerate(zip(ns, STACK))] for c, ns in {
    "Gm9": [55, 58, 62, 65, 69],
    "Cm9": [48, 51, 55, 58, 62],
    "Dm9": [50, 53, 57, 60, 64],
}.items()}
chords = s.part("chords", "The stab", "rackStab", "keys", "hsStab0")
for bar, step, ch, v in STAB:
    # The hit on the second 16th is the one the part stands on (weight 1, every bar); the louder
    # answer late in the bar (steps 11 and 13, at 0.55 to 0.8) is its groove (2); the quiet hit
    # on step 7 and the push on the last 16th of every fourth bar are the record's (3). So the
    # ladder has a rung at one hit a bar, at two and at all of them (CHARTING.md rule 3).
    lv = 1 if step == 2 else 2 if step in (11, 13) else 3
    at = len(chords)
    s.pchord(chords, bar * BAR + step * 3, VOICING[ch], lv, 6)
    for e in chords[at:]:
        e["v"] = round(min(1.0, v), 4)

# MARK: Melody part: the lead

melody = s.part("melody", "The lead", "rackLead", "horns", "rackLead")
# Before the lead (bars 0–47) the part has a line of its own, so every level has notes from
# the first bar (Bart, 2026-11-09: "at any level there should always be notes to play"). It is
# not the record's: the band's horns channel stays the reference's, so taking the chords part
# plays the record as rendered; taking the melody, the rack's lead plays these where your level
# leaves them out. One hand position, G4 to D5 (thumb on G, pinky on D), the lead's own keys,
# and it grows into the lead's phrase eight bars a step:
#   0–15  long tones falling D5 B♭4 A4 G4, a bar each;
#   16–31 the lead's first bar (D5 B♭4 A4 on steps 0, 6, 10), answered by a held G4;
#   32–47 the whole four-bar phrase kept in the hand: D5 B♭4 A4 | G4 – A4 B♭4 | C5 B♭4 A4 | G4,
#         the last bar of the section on A4, the fifth of the Dm9 the stab hints at.
D5, C5, BB4, A4, G4 = 74, 72, 70, 69, 67
INTRO_V = 0.7


def intro(bar, step, note, ln, lv):
    s.pnote(melody, bar * BAR + step * 3, note, ln * 3, lv)
    melody[-1]["v"] = INTRO_V


for bar in range(16):
    intro(bar, 0, [D5, BB4, A4, G4][bar % 4], 14, 1 if bar % 2 == 0 else 2)
for bar in range(16, 32):
    if bar % 2 == 0:
        intro(bar, 0, D5, 6, 1)
        intro(bar, 6, BB4, 4, 2)
        intro(bar, 10, A4, 6, 2)
    else:
        intro(bar, 0, G4, 14, 2)
for bar in range(32, 48):
    k = bar % 4
    if k == 0:
        intro(bar, 0, D5, 6, 1); intro(bar, 6, BB4, 4, 2); intro(bar, 10, A4, 6, 2)
    elif k == 1:
        intro(bar, 0, G4, 10, 1); intro(bar, 10, A4, 2, 3); intro(bar, 12, BB4, 4, 2)
    elif k == 2:
        intro(bar, 0, C5, 6, 1); intro(bar, 6, BB4, 4, 2); intro(bar, 10, A4, 6, 2)
    else:
        intro(bar, 0, A4 if bar == 47 else G4, 14, 1)
for bar, step, note, ln, vel in LEAD:
    # A phrase is four bars; each bar's first note is the one it stands on (1), the others the
    # line (2), the two-step A into the B♭ of the phrase's second bar a pickup (3).
    s.pnote(melody, bar * BAR + step * 3, note, int(ln * 3), 1 if step == 0 else 3 if ln <= 2 else 2)
    melody[-1]["v"] = round(vel, 4)
s.fingered(melody)

s.write()
