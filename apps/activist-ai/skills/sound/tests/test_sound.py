#!/usr/bin/env python3
"""The sound skill's own tests. Run inside the workspace image (ola-page's renderer):
    python3 /opt/ola/skills/sound/tests/test_sound.py
The music checks run anywhere; the listening checks need the page renderer and say so when it is missing."""
import importlib.util, json, shutil, subprocess, sys, tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
results = []


def case(name, ok, detail=""):
    results.append(bool(ok))
    print(f"{'pass' if ok else 'FAIL'}  sound: {name}" + (f"  ({detail})" if detail and not ok else ""))


spec = importlib.util.spec_from_file_location("listen", HERE / "scripts" / "listen.py")
L = importlib.util.module_from_spec(spec)
spec.loader.exec_module(L)


def osc(at, midi, dur, **kw):
    return {"kind": "OscillatorNode", "at": at, "stop": at + dur, "clicks": 1, "freq": 440 * 2 ** ((midi - 69) / 12), "detune": 0, "sweep": False, **kw}


# A tune: a figure, the figure again with a change, an answer that lands on the home note, held.
D = 62
tune = [(0, 0.5), (4, 0.25), (7, 0.25), (9, 1.0), (0, 0.5), (4, 0.25), (7, 0.25), (12, 1.0), (9, 0.5), (7, 0.25), (4, 0.25), (5, 0.5), (2, 0.5), (0, 2.0)]
notes, t = [], 0.0
for st, d in tune:
    notes.append(osc(t, D + st, d * 0.9))
    notes.append(osc(t, D + st + 23.56, 0.1))  # a marimba partial: not a note
    t += d
m = L.music_of(L.pitched_events(notes))
case("a written tune is read in D major, all in key", m["key"] == "D major" and m["in_key"] == 1.0, m)
case("a written tune lands on the home note, held", m["ends_on_tonic"] and m["last_is_long"], m)
case("a written tune has a figure that comes back and long and short notes", m["motif_share"] >= 0.4 and not m["same_length"], m)

# A pentatonic random walk: the owner's "cheesy" default.
walk_deg = [2, 3, 2, 1, 2, 4, 3, 5, 6, 5, 4, 2, 3, 1, 0, 1, 3, 4]
P = [0, 2, 4, 7, 9]
walk = [osc(i * 0.3, D + 12 * (d // 5) + P[d % 5], 0.28) for i, d in enumerate(walk_deg)]
r = {"segments": [{"label": "before any click", "silent": True}, {"label": "Play", "start": 0, "end": 12, "peak_dbfs": -14, "rms_dbfs": -27, "sound_length": 5.5, "hf": 0.0, "dc": 0}],
     "notes": walk, "media": [], "contexts": [{"id": 0, "before_click": False, "resumed_after_click": True}], "warnings": []}
lines = L.judge(r, {"sound_control": None, "pressed": [{"name": "Play"}]}, "OlaSound")
case("a pentatonic random walk is failed in plain words", any(l == "fail" and "pentatonic random walk" in t for l, t in lines), lines)
r["notes"] = notes
lines = L.judge(r, {"sound_control": None, "pressed": [{"name": "Play"}]}, "OlaSound")
case("the written tune passes the melody checks", not any(l == "fail" for l, t in lines), [t for l, t in lines if l == "fail"])

# Levels and edges on made-up measurements: what a harsh interface sound looks like.
harsh = {"label": "Beep", "start": 1, "end": 2, "peak_dbfs": -0.5, "rms_dbfs": -6, "sound_length": 0.3, "hf": 0.2, "attack_ms": 0.0, "ends_abruptly": True, "jumps": 900, "dc": 0.0, "clipped_samples": 12}
r = {"segments": [{"label": "before any click", "peak_dbfs": -3, "silent": False}, harsh], "notes": [], "media": [], "warnings": [],
     "contexts": [{"id": i, "before_click": i == 0, "resumed_after_click": False} for i in range(5)]}
got = " | ".join(t for l, t in L.judge(r, {"sound_control": None, "pressed": []}, "") if l == "fail")
for want in ("before anyone clicks", "never resumed", "5 times", "clips", "too loud", "harsh", "starts with a click", "cut off", "hard edges"):
    case(f"a harsh page is failed for '{want}'", want in got, got[:300])

# Listening for real: the fixtures in the page renderer.
binary = L.chromium()
if not binary:
    print("skip  sound: the page renderer is not installed here; the listening tests did not run")
else:
    d = Path(tempfile.mkdtemp(prefix="sound-test-"))
    for f in (HERE / "tests" / "fixtures").glob("*.html"):
        shutil.copy(f, d / f.name)
    shutil.copy(HERE / "assets" / "olasound.js", d / "olasound.js")

    def listen(page, *extra):
        out = d / ("out-" + page.replace(".html", ""))
        p = subprocess.run([sys.executable, str(HERE / "scripts" / "listen.py"), str(d / page), "--out", str(out), *extra], capture_output=True, text=True, timeout=240)
        rep = json.loads((out / "report.json").read_text()) if (out / "report.json").exists() else {}
        return p, rep

    p, rep = listen("good.html")
    fails = [x["text"] for x in rep.get("lines", []) if x["level"] == "fail"]
    case("the kit's own sounds pass every check (switch, message, done, a win, a tune)", p.returncode == 0 and rep and not fails, (fails or p.stderr)[:3])
    ui = [s for s in rep.get("segments", []) if s.get("label") in ("New message", "Done", "Signed") and not s.get("silent")]
    case("the kit's interface sounds are quiet and soft (peak -14 dBFS or lower, under 5% above 5 kHz)", len(ui) == 3 and all(s["peak_dbfs"] <= -14 and s["hf"] < 0.05 for s in ui), [(s.get("label"), s.get("peak_dbfs"), s.get("hf")) for s in ui])
    case("the spectrogram and one clip per sound are written", (d / "out-good" / "spectrogram.png").exists() and len(list((d / "out-good").glob("0*.wav"))) >= 3)
    p, rep = listen("harsh.html")
    got = " | ".join(x["text"] for x in rep.get("lines", []) if x["level"] == "fail")
    case("a harsh page is heard as harsh (before a click, too loud, harsh, a click at the start, one system per sound)",
         all(w in got for w in ("before anyone clicks", "too loud", "harsh", "starts with a click", "6 times")), got[:300])
    p, rep = listen("walk.html")
    got = " | ".join(x["text"] for x in rep.get("lines", []) if x["level"] == "fail")
    case("a pentatonic random walk in a page is heard as one", "pentatonic random walk" in got, got[:300])
    p, rep = listen("loop.html")
    lines = rep.get("lines", [])
    case("the calm pad bed passes and its switch turns it off", not any(x["level"] == "fail" for x in lines) and any("turns the music off" in x["text"] for x in lines),
         [x["text"] for x in lines][:4])
    p, rep = listen("loop.html", "--do", "js:OlaSound.loop('dub')", "--do", "wait:10")
    seg = next((s for s in rep.get("segments", []) if s.get("label", "").startswith("OlaSound")), {})
    case("the dub bed (chamber's voices) plays at a page's level without clipping", seg and seg.get("peak_dbfs", 0) <= -3 and -28 <= seg.get("rms_dbfs", -99) <= -17 and not seg.get("clipped_samples"),
         {k: seg.get(k) for k in ("peak_dbfs", "rms_dbfs", "hf")})
    shutil.rmtree(d, ignore_errors=True)

print(f"sound tests: {sum(results)} of {len(results)} passed")
sys.exit(0 if all(results) else 1)
