#!/usr/bin/env python3
"""Upload a Jambot-rendered kit (scripts/jam/ko2/out/kit/kit.json) to the EP-133
sample library and assign it to the 48 pads of one project, over SysEx.

    python3 scripts/jam/ko2/upload-kit.py --project 9 --first-slot 560 [--activate]

Needs the ep-series-sysex toolkit on EPSYSEX (path to the clone) and mido.
Never overwrites an occupied slot; refuses a project that has any pad assigned
unless --force. No project TAR is written: pads are assigned through the pad
metadata ("sym"), which is what the device's own UI does.
"""
import argparse, json, os, sys, time
from pathlib import Path
sys.path.insert(0, os.environ.get("EPSYSEX", str(Path.home() / "ep-series-sysex")))
from epsysex.fileclient import FileClient
from epsysex.sysex import EP133_PRODUCT
from epsysex.dependencies import wav_to_pcm16

ap = argparse.ArgumentParser()
ap.add_argument("--kit", default=str(Path(__file__).parent / "out/kit/kit.json"))
ap.add_argument("--project", type=int, required=True)
ap.add_argument("--first-slot", type=int, required=True)
ap.add_argument("--activate", action="store_true", help="make the project the active one when done")
ap.add_argument("--force", action="store_true")
ap.add_argument("--skip-upload", action="store_true", help="slots already hold the kit; only assign")
a = ap.parse_args()

kit = json.load(open(a.kit))
sounds = kit["sounds"]
kit_dir = Path(a.kit).parent
c = FileClient(product_byte=EP133_PRODUCT, lock_owner="upload_kit")

used = {int(n["id"]) for n in c.list_sounds()}
slots = list(range(a.first_slot, a.first_slot + len(sounds)))

base = 3200 + (a.project - 1) * 1000
def pad_fid(group, pad): return base + "ABCD".index(group) * 100 + pad
assigned = {}
for g in "ABCD":
    for p in range(1, 13):
        sym = c.get_metadata(pad_fid(g, p)).get("sym")
        if sym not in (-1, 0, None): assigned[f"{g}{p:02d}"] = sym
if assigned and not a.force:
    sys.exit(f"project {a.project} has {len(assigned)} assigned pads, refusing: {assigned}")

t0 = time.time()
plan = []
for slot, s in zip(slots, sounds):
    channels = 2 if s["group"] == "C" else 1   # the JT10 line carries its ping-pong delay
    pcm, stream = wav_to_pcm16(kit_dir / s["file"], target_channels=channels)
    name = s["name"][:20]
    meta = {"sound.playmode": "oneshot", "envelope.release": 255, "sound.rootnote": int(s["root"])}
    if not a.skip_upload:
        if slot in used:
            # resumable: a slot that already holds exactly these bytes is ours (a previous run), anything else is refused
            if int(c.stat_sound(slot)["byteSize"]) != len(pcm):
                sys.exit(f"slot {slot} is occupied by something else, refusing")
            c.set_sample_metadata(slot, {"name": name, **meta})
            print(f"slot {slot:3d}  {name:20s}  already there, metadata set", flush=True)
        else:
            c.upload_sound(slot, pcm, name=name, channels=channels, extra_metadata=meta)
            st = c.stat_sound(slot)
            ok = int(st["byteSize"]) == len(pcm)
            print(f"slot {slot:3d}  {name:20s}  {len(pcm):7d} B  {stream['frames']:6d} fr  {'ok' if ok else 'SIZE MISMATCH'}  {time.time()-t0:5.1f}s", flush=True)
            if not ok: sys.exit("upload verify failed")
    plan.append((slot, s, stream["frames"]))

for slot, s, frames in plan:
    fid = pad_fid(s["group"], s["pad"])
    c.set_metadata(fid, {"sym": slot, "sound.playmode": "oneshot", "envelope.release": 255,
                         "sample.start": 0, "sample.end": frames, "envelope.attack": 0,
                         "sound.pitch": 0, "sound.amplitude": 100, "sound.pan": 0})
    back = c.get_metadata(fid)
    print(f"pad {s['group']}{s['pad']:02d} ← slot {slot} ({s['name']})  readback sym={back.get('sym')} end={back.get('sample.end')}", flush=True)
    if back.get("sym") != slot: sys.exit("pad assignment did not stick")

if a.activate:
    c.set_metadata(2000, {"active": 3000 + (a.project - 1) * 1000})
    print("active project:", c.get_metadata(2000))
print(f"done in {time.time()-t0:.0f}s")
