#!/usr/bin/env python3
"""Abyss: dub techno at 117, D minor drifting to C minor, 72 bars (2:28), built to sound like
misc/dub_reference.py (misc/DUB_TECHNO_FIXES.md), the reference Bart listens against.

    python3 apps/takt/scripts/songs/abyss.py        -> Takt/Content/song-abyss.json
    python3 apps/takt/scripts/songs/abyss.py --ref  -> Takt/Content/song-abyss-ref.json

`--ref` is **Abyss Reference**, its own song on the Stage: the reference's 16 bars and nothing
else (no sub or 16th hats for bars 0–3, the kick out for bars 12–13, the stab every bar, no
melody; velocities exactly as the reference writes them, not humanized). Its only part is the
stab.

The sound: the stab is synthesized live (`stab`, Takt/Audio/DubStab.swift): five notes of
three PolyBLEP saws through a state-variable lowpass whose cutoff opens on the hit and settles
on the breath, 350 Hz to 2.4 kHz and back over sixteen bars, continuously. The echo is the
engine's dub send (`dub`, Takt/Audio/DubChamber.swift): the send filtered, a dotted-eighth
ping-pong with gentle one-pole filters and a soft saturator in the loop (about eight repeats,
each ~4.5 dB down), the time wobbling like tape, a little crossfeed, into a Dattorro plate that
hears the dry stab too; tape hiss under it. Kick, sub and hats stay dry; the stab and the
melody duck 0.3 to the kick, the sub 0.6, the return 0.25. Chords part: the stab. Melody part:
single notes in the stab's voice, on the offbeats between its hits, sent hard so the delay
writes the line (DUB_TECHNO_FIXES.md §7, option 2): no separate lead synth.

Levels follow the reference's mix, measured bus by bus (solo, bars 4–11): drums 0 dB, sub
−3.7, dry stab −9.1, echoes −11.8, plate −15.8, hiss −35.7.
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import BAR, Song  # noqa: E402

REF16 = "--ref" in sys.argv

if REF16:
    s = Song("song-abyss-ref", "Abyss Reference", "Dub techno", "D minor", 117, "abyss",
             "The 16 bars Claude made as the target for Abyss, exactly as made: kick, hats, sub, the stab into the chamber. Nothing added.",
             seed=117)
    s.human = 0
    s.bars = 16
    SECTIONS = [(0, "Intro"), (4, "Deep"), (12, "Abyss"), (14, "Deep again")]
else:
    s = Song("song-abyss", "Abyss", "Dub techno", "D minor", 117, "abyss",
             "Dub techno at 117. One chord stab into the chamber, breathing, drifting from D to C and back.", seed=117)
    s.bars = 72
    SECTIONS = [(0, "Intro"), (8, "Deep"), (24, "Drift"), (40, "Abyss"), (48, "Deep again"), (68, "Out")]

s.sounds = {
    "kick": {"kit": "kickDub", "gainDb": -14.4},
    "hat": {"kit": "hatDub", "gainDb": -25.2},
    "hat16": {"kit": "hatDub16", "gainDb": -32.1},
    "xstick": {"kit": "rimMin", "gainDb": -28},
}
s.instruments = {"bass": "subDub", "keys": "liveStab", "horns": "liveStab", "monitor": "piano"}
s.levels = {"bass": -4.9, "keys": -0.7, "horns": -0.7}
s.stab = {"detune": [1.0, 1.0045, 0.9955], "q": 1.1, "env": 2.2, "envTime": 0.018, "attack": 0.003, "decay": 0.16,
          "release": 0.02, "length": 0.45, "low": 350, "high": 2400, "sweepBars": 16}
s.duck = {"release": 0.2, "channels": {"bass": 0.6, "keys": 0.3, "horns": 0.3}}
# The reference sends the stab at 0.8 against a dry level of 1.3; the melody at 0.9.
s.dub = {"sends": {"keys": round(0.8 / 1.3, 4), "horns": round(0.9 / 1.3, 4)}, "level": 0.291,
         "beats": 0.75, "feedback": 0.72, "highpass": 180, "lowpass": 3200, "drive": 1.4, "wobble": 0.004, "wobbleRate": 0.6,
         "sendHighpass": 220, "sendLowpass": 3800, "cross": 0.3, "echo": 2.2, "reverb": 1.5,
         "reverbDry": round(0.35 / 0.8, 4), "reverbEcho": 0.6, "decay": 0.82, "damping": 0.35, "bandwidth": 0.7,
         "predelay": 0.02, "reverbHighpass": 300, "duck": 0.25, "hiss": 0.006}
if REF16:
    # The reference's master, 6 dB down: it soft-clips its sum peaking at 0.95 and renormalizes
    # by 0.96 (0.89 over the clipped peak). The knee at 0.48 does that clipping here, and every
    # bus, the chamber's level with it, comes down 0.35 dB to match: out = 0.5 × the reference.
    s.knee = 0.48
    trim = 0.48 / 0.5
    for k in ("kick", "hat", "hat16"):
        s.sounds[k]["gainDb"] = round(s.sounds[k]["gainDb"] + 20 * math.log10(trim), 2)
    s.levels = {k: round(v + 20 * math.log10(trim), 2) for k, v in s.levels.items()}
    s.dub["level"] = round(s.dub["level"] * trim, 4)
for b, name in SECTIONS:
    s.section(b, name)


def section(bar):
    return [n for b, n in SECTIONS if b <= bar][-1]


def chord_at(bar):
    return "Dm9" if (bar // 4) % 2 == 0 else "Cm9"


def kick_on(bar):
    return section(bar) != "Abyss"


def sub_on(bar):
    sec = section(bar)
    return sec not in ("Intro", "Abyss") and not (sec == "Out" and bar >= 70)


def hats16_on(bar):
    if REF16:
        return section(bar) not in ("Intro", "Abyss")
    return bar >= 8 and section(bar) not in ("Abyss", "Out")


s.chords = [chord_at(b) for b in range(s.bars)]
# (note, role, finger): root, third, fifth, seventh, ninth from the bottom up.
STACK = ["root", "third", "fifth", "seventh", "ninth"]
VOICING = {c: [(n, r, 5 - i) for i, (n, r) in enumerate(zip(ns, STACK))] for c, ns in {
    "Dm9": [50, 53, 57, 60, 64],
    "Cm9": [48, 51, 55, 58, 62],
}.items()}
SUB = {"Dm9": 38, "Cm9": 36}

# MARK: Drums: the kick on every beat, the hat on the offbeats, the 16ths shuffled (in the sample)


def vel_for(gain):
    """The velocity a drum hit needs to sound at `gain` of its full level: the renderer plays a
    one-layer kit at (0.3 + 0.7v)(0.5 + 0.5v), and the reference writes plain gains."""
    return round((-0.5 + (0.25 + 1.4 * (gain - 0.15)) ** 0.5) / 0.7, 4)



for bar in range(s.bars):
    o = bar * BAR
    for i in range(16):
        t = o + i * 3
        if i % 4 == 0 and kick_on(bar):
            s.hit(t, "kick", 1.0, 0.0)
        if i % 4 == 2:
            s.hit(t, "hat", 1.0 if bar else vel_for(0.5), 0.0)  # the reference: 0.5, bar 0 at 0.25
        if i % 2 == 1 and hats16_on(bar) and kick_on(bar):
            # The reference: 0.16 to 0.22, against the offbeat's 0.5 (`gainDb` holds the 0.22/0.5).
            s.hit(t, "hat16", vel_for((0.16 + 0.06 * s.rng.random()) / 0.22), 0.0)

# MARK: Sub on 1 and 3, 1.9 beats

for bar in range(s.bars):
    if not sub_on(bar):
        continue
    for t in (0, 24):
        s.note(s.bass, bar * BAR + t, SUB[chord_at(bar)], 1.0, 23)

# MARK: Chords part: the stab on the 16ths 2, 7 and (odd bars) 10

VEL = {1: 0.85, 2: 0.7, 3: 0.55}
chords = s.part("chords", "The stab", "liveStab", "keys", "liveStab")
for bar in range(s.bars):
    o = bar * BAR
    if section(bar) == "Out" and bar >= 70:
        continue
    v = VOICING[chord_at(bar)]
    s.pchord(chords, o + 6, v, 1, 30)
    s.pchord(chords, o + 21, v, 2, 20)
    if bar % 2 == 1:
        s.pchord(chords, o + 30, v, 3, 14)
s.chart_to_channel(chords, s.keys, lambda e: VEL[e["lv"]])

# MARK: Melody part: single stab notes between the hits, the delay answering

# Four bars on Dm9 (A C, E D, C A E, E C), chord tones only, the same a step down on Cm9. Every
# note sits off the stab's 16ths (2, 7, 10), where the dotted-eighth echo has room.
LINE_D = {
    0: [(15, 69, 6, 1), (39, 72, 6, 3)],
    1: [(12, 76, 6, 1), (33, 74, 6, 2)],
    2: [(15, 72, 6, 1), (36, 69, 6, 2), (45, 64, 3, 3)],
    3: [(24, 76, 12, 1), (42, 72, 6, 3)],
}
LINE = {"Dm9": LINE_D, "Cm9": {b: [(t, n - 2, ln, lv) for t, n, ln, lv in ph] for b, ph in LINE_D.items()}}
melody = [] if REF16 else s.part("melody", "The echo line", "liveStab", "horns", "liveStab")
for bar in range(s.bars if not REF16 else 0):
    o = bar * BAR
    sec = section(bar)
    if sec == "Intro":
        continue
    if sec == "Out":
        if bar == 68:
            s.pnote(melody, o + 15, 69, 12, 1)
        continue
    for t, n, ln, lv in LINE[chord_at(bar)].get(bar % 4, []):
        if (sec == "Deep" and bar < 16 and lv > 1) or (sec == "Abyss" and lv > 2):
            continue  # the first eight bars and the break: the main notes alone
        s.pnote(melody, o + t, n, ln, lv)
s.fingered(melody)
s.chart_to_channel(melody, s.horns, lambda e: VEL[e["lv"]])

s.write()
