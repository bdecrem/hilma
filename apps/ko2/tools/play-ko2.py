#!/usr/bin/env python3
"""Play Minimal 130's groove INTO the EP-133 over USB MIDI, with the kit that
upload-kit.py put on its pads: the Mac is the sequencer, the KO II makes the sound.

    apps/ko2/.venv/bin/python3 apps/ko2/tools/play-ko2.py [--bars 16] [--bpm 130] [--clock]

Patterns are Bart's own lines from scripts/jam/songs/techno-128-base.json
(stabs A, the one-note sub, the kit from Minimal 130), mapped to the pads the
kit sits on. --clock also sends MIDI clock + start so the KO II's sync follows.
Press REC on the KO II first and it records the performance into its own sequencer.
"""
import argparse, json, time
from pathlib import Path
import mido

HERE = Path(__file__).parent
ap = argparse.ArgumentParser()
ap.add_argument("--bars", type=int, default=16)
ap.add_argument("--bpm", type=float, default=130)
ap.add_argument("--clock", action="store_true")
ap.add_argument("--kit", default=str(HERE.parent / "out/kit/kit.json"))
a = ap.parse_args()

OFFSET = {1: 9, 2: 10, 3: 11, 4: 6, 5: 7, 6: 8, 7: 3, 8: 4, 9: 5, 10: 0, 11: 1, 12: 2}  # archive pNN → note offset
def note_for(group, pad): return 36 + "ABCD".index(group) * 12 + OFFSET[pad]
kit = json.load(open(a.kit))["sounds"]
pads = {s["name"]: note_for(s["group"], s["pad"]) for s in kit}

base = json.load(open(HERE.parents[2] / "scripts/jam/songs/techno-128-base.json"))
stabsA = base["patterns"]["jb202"]["A"]["pattern"]      # 16 steps of {note, gate, accent, slide}
subA = base["patterns"]["jb202-2"]["A"]["pattern"]

# events: (step, note, velocity) over one 16-step bar; the song's sections decide who plays
def drums(bar):
    ev = [(s, pads["kick"], 112) for s in (0, 4, 8, 12)]
    ev += [(s, pads["ch"], 70 if s % 4 else 84) for s in range(0, 16, 2)]
    if bar >= 2: ev.append((11, pads["rimshot"], 100))                # the "a" of 3
    if bar >= 6: ev.append((6, pads["oh"], 70))                       # one dark open hat
    if bar % 8 == 7: ev += [(14, pads["lowtom"], 90), (15, pads["midtom"], 80)]
    return ev
def line(pattern, prefix, bar):
    ev = []
    for i, st in enumerate(pattern):
        if not st["gate"]: continue
        name = f"{prefix}{st['note']}"
        if name not in pads: name = f"{prefix}A1"
        ev.append((i, pads[name], 118 if st["accent"] else 96))
    return ev
def bar_events(bar):
    ev = drums(bar)
    ev += [(s, n, v) for s, n, v in line(subA, "sub-", bar)]
    if bar >= 4: ev += line(stabsA, "stab-", bar)
    if bar >= 8: ev += [(0, pads["acid-A1-320"], 110), (6, pads["acid-C2-320"], 96), (10, pads["acid-A1-620"], 96), (12, pads["acid-G1-320"], 96)]
    if bar >= 12 and bar % 2 == 0: ev += [(0, pads["lead-E4-acc"], 100), (6, pads["lead-G4"], 90), (12, pads["lead-A4"], 90)]
    return ev

out = mido.open_output([n for n in mido.get_output_names() if "EP-133" in n][0])
step = 60 / a.bpm / 4
gate = step * 0.5
print(f"playing {a.bars} bars at {a.bpm} into the EP-133 ({len(pads)} pads mapped)")
t0 = time.perf_counter()
if a.clock: out.send(mido.Message("start"))
clock_i = 0
offs = []   # (time, note)
for bar in range(a.bars):
    events = bar_events(bar)
    for s in range(16):
        t = t0 + (bar * 16 + s) * step
        while True:
            now = time.perf_counter()
            if a.clock:   # 6 clocks per 16th
                while clock_i * (step / 6) + t0 <= now and clock_i < (bar * 16 + s + 1) * 6:
                    out.send(mido.Message("clock")); clock_i += 1
            while offs and offs[0][0] <= now:
                out.send(mido.Message("note_off", note=offs.pop(0)[1])); 
            if now >= t: break
            time.sleep(0.0005)
        for st, note, vel in events:
            if st == s:
                out.send(mido.Message("note_on", note=note, velocity=vel)); offs.append((t + gate, note))
        offs.sort()
for _, n in offs: out.send(mido.Message("note_off", note=n))
if a.clock: out.send(mido.Message("stop"))
print("done")
