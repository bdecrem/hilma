#!/usr/bin/env python3
"""Gezeiten (tides): dub techno in E minor at 116, 112 bars and the tail (3:59). The second
record on the dub techno production system (the takt-electronic skill), made for Bart's ask of
2026-11-10: "another electronic track, patterned after Halbschatten, but a different core track
concept". The record is `misc/gezeiten_reference.py`; this is its song file.

    python3 apps/takt/scripts/songs/gezeiten.py   -> Takt/Content/song-gezeiten.json

Nothing here is written by ear. `scripts/gezeiten.py` runs the reference and logs every event it
places; this script turns that log (`gezeiten-events.json`) into the band, the way
`halbschatten.py` does:

- drums: each hit at its own time (`late`), at its own gain (`g`), on the reference's one-shot,
  into its rack bus; the kick on the drums channel. The hats, the shaker and the clap are
  Halbschatten's samples (the reference makes them with the same functions and seeds);
- bass: every note the reference's own render of that pitch and length (`gzBass…`);
- the chord (keys): one event a hit, the raw buffer the reference drew (`hsStabGz0…1`, a zone
  per chord), into the rack's stab bus, a tick ahead so the echo's side switch can finish;
- the bell (horns): the rack's FM voice, a note each, the reference's velocity;
- `rack`: lanes, the stab bus, both echoes, the pad, the hall and the room (Halbschatten's
  impulses), the noise tile, the master, every number the reference's own (`mix`, `lanes`,
  `gains` in the log) over each file's scale.

The record differs from Halbschatten at its core: the bell is the motor from bar 1 (steps 0, 3,
8, 11; its dotted-eighth echo answers on 6 and 14), the chord is an off-beat skank in a slower
bloom with a dotted-quarter echo, the ground stays on E while the chords plane (Em11, Dm11,
Am11), and the form is two tides.

The parts, by the takt-chart skill (LEVELING.md, CHARTING.md; BLUES.md's bands do not apply):

- chords, "The skank": the cluster's five white keys (B D E G A for Em11; a white key down for
  Dm11; E G A C D for Am11), the same hand shape all song. The hit on the "and" of 2 is the one
  the part stands on (weight 1, every bar), the one on the "and" of 4 its answer (2), the ghost
  on step 9 the record's (3).
- melody, "The bell": the record's own line, every note of it, in one hand position (the thumb
  on A4, the pinky on G5). The note on the 1 of every bar is the anchor (weight 1), the note on
  the 3 the answer (2), the two off the beat the motor (3). `from` keeps the answers and the
  off-beat notes out of the levels under them (rule 17), so the ladder has a rung at every
  step: every other 1, every 1, the 3 of every other bar, every 3, the "a" of 1, all four.
"""
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import BAR, Song  # noqa: E402

D = json.loads((Path(__file__).resolve().parent / "gezeiten-events.json").read_text())
G, K, M, LANES = D["gains"], D["scale"], D["mix"], D["lanes"]
TEMPO = D["tempo"]
TICK = 60 / TEMPO / 12  # seconds
BARS = D["bars"]
# The reference's tail (7 s) is the song's last bars: the echoes and the hall ringing out
# under the master's fade.
TAIL_BARS = math.ceil(D["tail"] / (TICK * BAR))

s = Song("song-gezeiten", "Gezeiten", "Dub techno", "E minor", int(TEMPO), "tide",
         "Dub techno at 116, four minutes. A bell on five white keys from the first bar, an off-beat chord that planes over a ground that never moves.",
         seed=1160)
s.human = 0
s.bars = BARS + TAIL_BARS
SECTIONS = [(0, "Still water"), (8, "Kick"), (16, "Bass"), (24, "Hats"), (32, "First tide"), (40, "Ebb"), (48, "Flood"), (56, "Shaker"),
            (64, "Crest"), (72, "High water"), (80, "One chord"), (88, "Thinning"), (96, "Low"), (104, "Out")]
for b, name in SECTIONS:
    s.section(b, name)
NAME = {"E": "Em11", "D": "Dm11", "A": "Am11"}


def chord_at(bar):
    if 32 <= bar < 64:
        return ["Em11", "Em11", "Dm11", "Dm11"][(bar - 32) % 4]
    if 64 <= bar < 80:
        return ["Em11", "Dm11", "Am11", "Em11"][(bar - 64) % 4]
    return "Em11"


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
    "kick": {"kit": "kickGZ", "gainDb": db(G["kick"] * CENTRE / K["kickGZ"] / 1.6)},
    "clap": {"kit": "hsClap", "gainDb": db(G["clap"] / K["hsClap"]), "bus": "clap"},
    "rim": {"kit": "gzRim", "gainDb": db(G["rim"] / K["gzRim"]), "bus": "rim"},
    "riser": {"kit": "gzRiser", "gainDb": db(G["riser"] / K["gzRiser"]), "bus": "riser"},
    "xstick": {"kit": "rimMin", "gainDb": -27},  # the count-in's click only
}
for j in range(3):
    s.sounds[f"chh{j}"] = {"kit": f"hsChh{j}", "gainDb": db(G["hats"] / K[f"hsChh{j}"]), "bus": "hats"}
    s.sounds[f"shk{j}"] = {"kit": f"hsShk{j}", "gainDb": db(G["shaker"] / K[f"hsShk{j}"]), "bus": "shaker"}
for j in range(2):
    s.sounds[f"ohh{j}"] = {"kit": f"hsOhh{j}", "gainDb": db(G["hats"] / K[f"hsOhh{j}"]), "bus": "hats"}
TOMS = sorted({(e[2], "LR"[e[3]]) for e in D["events"] if e[0] == "tom"})
for m, side in TOMS:
    s.sounds[f"tom{m}{side}"] = {"kit": f"gzTom{m}{side}", "gainDb": db(G["toms"] / K[f"gzTom{m}{side}"]), "bus": "toms"}


def hit(sec, sound, g):
    t, late = when(sec)
    s.drums.append({"t": t, "s": sound, "v": 1.0, "late": late, "g": round(g, 5)})


ROOT = {k: D["chords"][NAME[k]][0] for k in NAME}  # a stab file's zone: its chord's lowest note
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
    elif kind == "riser":
        hit(sec, "riser", e[2])
    elif kind == "tom":
        hit(sec, f"tom{e[2]}{'LR'[e[3]]}", e[4])
    elif kind == "bass":
        note, ln, vel = e[2], e[3], e[4]
        t, late = when(sec)
        # The whole one-shot: the note, its 120 ms of release, the lowpass's ring.
        length = math.ceil((ln * TICK * 3 + 0.12 + 0.06) / TICK)
        s.bass.append({"t": t, "n": note, "v": 1.0, "len": length, "i": f"gzBass{int(ln * 10)}", "late": late, "g": round(vel, 5)})
    elif kind == "stab":
        ch, variant, v, bar, step = e[2], e[3], e[4], e[6], e[7]
        t, late = when(sec, ahead=1)
        s.keys.append({"t": t, "n": ROOT[ch], "v": 1.0, "len": 12, "i": f"hsStabGz{variant}", "late": late,
                       "g": round(v / K[f"hsStabGz{variant}"], 5)})
        STAB.append((bar, step, NAME[ch], v))
    elif kind == "lead":
        note, ln, vel, bar, step = e[2], e[3], e[4], e[5], e[6]
        ticks = round(ln * 3)
        assert abs(ticks - ln * 3) < 1e-9, "a bell note's length is a whole number of ticks"
        t, late = when(sec)
        s.horns.append({"t": t, "n": note, "v": round(vel, 5), "len": ticks, "late": late})
        LEAD.append((bar, step, note, ticks, vel))

s.instruments = {"bass": "gzBass20", "keys": "hsStabGz0", "horns": "rackLead", "monitor": "rackStab"}
s.levels = {"bass": db(G["bass"] * CENTRE / K["gzBass20"] / 0.32), "keys": 0.0, "horns": 0.0}
# The reference's sidechain: 0 → 1 over 3 ms, held to 20 ms, e^(−t/110 ms), 450 ms long.
s.duck = {"release": 0.11, "attack": 0.003, "hold": 0.02, "length": 0.45, "channels": {"bass": 0.78}}

# MARK: The rack

fade_bars = 2 + D["tail"] / (TICK * BAR)
s.rack = {
    "lanes": {
        "stabCutoff": LANES["stabCutoff"],
        "stabDecay": LANES["stabDecay"],
        "echoFeedback": LANES["echoFeedback"],
        "echoSend": LANES["echoSend"],
        "padCutoff": LANES["padCutoff"],
        "padLevel": LANES["padLevel"],
        "leadLevel": LANES["leadLevel"],
        "noise": LANES["noise"],
        # The master's fade: half a cosine from two bars before the end to the end of the tail.
        "fade": [[BARS - 2 + fade_bars * i / 64, round(0.5 * (1 + math.cos(math.pi * i / 64)), 6)] for i in range(65)],
    },
    "buses": [
        {"name": "hats", "room": 0.35},
        {"name": "shaker", "room": 0.4},
        {"name": "clap", "hall": 0.35, "room": 0.8},
        {"name": "rim", "hall": 0.3, "room": 0.6, "echo": 0.6},
        {"name": "toms", "room": 0.5, "echo": 0.25},
        {"name": "riser", "hall": 0.8},
    ],
    "stab": {"gain": G["chords"], "duck": 0.30, "hall": 0.55, "q": [2.4, 0.7], "env": M["STAB_ENV"], "envTime": M["STAB_ENV_TIME"],
             "drive": 1.3, "compRef": 700, "compPower": 0.15, "lfoDepth": 0.10, "lfoBars": M["STAB_LFO_BARS"], "min": 60, "max": 14000,
             "attack": 0.003, "lengths": 7, "detune": [-9, 0, 8], "pans": [-0.75, 0, 0.75], "spread": 1.5, "noise": 0.10, "notes": 5,
             "fileScale": K["hsStabGz0"]},
    "echo": {"beats": M["ECHO_STEPS"] / 4, "feedback": 0.6, "lowpass": M["ECHO_LP"], "highpass": M["ECHO_HP"], "drive": 1.5,
             "wobble": [[0.0012, 0.23], [0.0004, 3.1]], "level": G["echo_return"], "duck": 0.35, "hall": 0.5},
    "lead": {"gain": G["lead"], "lowpass": 5200, "hall": M["LEAD_HALL"]},
    "leadEcho": {"beats": M["LEAD_ECHO_STEPS"] / 4, "feedback": M["LEAD_ECHO_FB"], "lowpass": 3000, "highpass": 350, "drive": 1.5,
                 "wobble": [[0.001, 0.17]], "level": G["lead_echo_return"], "duck": 0.25, "hall": 0.5},
    "pad": {"notes": M["PAD_NOTES"], "left": [-6, 3], "right": [6, -2], "phases": D["pad"],
            "q": 0.9, "lfoDepth": 0.28, "lfoBars": 9.0, "lfoPhase": 1.0, "rightScale": 1.07, "highpass": 110, "gain": G["pad"],
            "duck": 0.55, "hall": 0.9},
    "hall": {"ir": "hs-ir-hall", "block": 1024, "level": G["hall_return"], "duck": 0.40},
    "room": {"ir": "hs-ir-room", "block": 256, "level": G["room_return"]},
    "noise": {"kit": "gzNoise", "gain": G["noise"] / K["gzNoise"], "duck": 0.3},
    "master": {"highpass": 24, "drive": G["master_pregain"], "post": G["master_post"], "scale": G["final_scale"],
               "level": round(10 ** (-8 / 20), 4), "limit": G["limiter_threshold"], "limitRelease": 0.12},
}

# MARK: Chords part: the skank, the cluster's five keys under one hand

# Low to high the cluster is fifth, seventh, root, third, eleventh (the same shape for all three
# chords). The eleventh carries the role "ninth": the ladder's name for the colour note on top,
# the first to go when a level asks for fewer notes (two notes are root and third, three add
# the fifth under them, four the seventh).
STACK = ["fifth", "seventh", "root", "third", "ninth"]
VOICING = {c: [(n, r, 5 - i) for i, (n, r) in enumerate(zip(ns, STACK))] for c, ns in D["chords"].items()}
chords = s.part("chords", "The skank", "rackStab", "keys", "hsStabGz0")
for bar, step, ch, v in STAB:
    # The hit on the "and" of 2 is the one the part stands on (weight 1, every bar); the one on
    # the "and" of 4 its answer (2); the ghost on step 9 the record's (3). So the ladder has a
    # rung at one hit a bar, at two and at all of them (CHARTING.md rule 3).
    lv = 1 if step == 6 else 2 if step == 14 else 3
    at = len(chords)
    s.pchord(chords, bar * BAR + step * 3, VOICING[ch], lv, 6)
    for e in chords[at:]:
        e["v"] = round(min(1.0, v), 4)

# MARK: Melody part: the bell, the record's own line

melody = s.part("melody", "The bell", "rackLead", "horns", "rackLead")
for bar, step, note, ticks, vel in LEAD:
    # One hand position all song: A4 under the thumb, B4, D5, E5, G5 under the pinky. The 1 of
    # every bar is the anchor; the 3 is the answer, in even bars from the tier after Easy and
    # in odd bars one later; the "a" of 1 comes in with the pushes and the "a" of 3 on Hard.
    if step == 0:
        lv, tier = 1, None
    elif step == 8:
        lv, tier = 2, 3 if bar % 2 == 0 else 4
    elif step == 3:
        lv, tier = 3, 6
    else:
        lv, tier = 3, 7
    s.pnote(melody, bar * BAR + step * 3, note, ticks, lv, tier=tier)
    melody[-1]["v"] = round(vel, 4)
assert {e["n"] for e in melody} == {69, 71, 74, 76, 79}, "the bell stays on A4 B4 D5 E5 G5"
s.fingered(melody)

s.write()
