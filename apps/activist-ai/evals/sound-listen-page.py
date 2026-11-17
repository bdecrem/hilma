#!/usr/bin/env python3
"""A page to hear the sound evals: for each sound task, the best run made WITH the skill (most checks
passed) and the run WITHOUT it from the same seed, as short mp3s side by side, with what listen.py
measured. Every clip is what the page played, cut to its sounds; a clip that would be loud is turned
down (to -12 dBFS peak for interface sounds, -6 for music) and the page says by how much, so nothing
on it is loud or clipped.

    python3 evals/sound-listen-page.py --runs runs/<config name> --out <folder>

Needs ffmpeg (mp3). Writes <folder>/index.html and <folder>/<task>-with.mp3, <task>-without.mp3.
"""
import argparse, array, html, json, math, shutil, subprocess, tempfile, wave
from pathlib import Path

HERE = Path(__file__).resolve().parent
SKIP = ("before any click", "sound off", "after sound off", "sound switch")


def best(runs, task, arm, seed=None):
    d = Path(f"{runs}-skills-{arm}")
    cands = []
    for r in sorted(d.glob(f"{task}-s*")) if d.exists() else []:
        c = r / "check.json"
        if not c.exists() or not (r / "work-listen" / "report.json").exists():
            continue
        j = json.loads(c.read_text())
        s = int(r.name.split("-s")[-1].split("-")[0])
        if seed is None or s == seed:
            cands.append((j.get("passed", 0), -s, r, j))
    if not cands:
        return None
    cands.sort(key=lambda x: (x[0], x[1]))
    return cands[-1]


def clip(report_dir, music_task):
    """The run's sounds, trimmed and joined, as 16-bit stereo samples; with the gain applied for safety."""
    rep = json.loads((report_dir / "report.json").read_text())
    out = array.array("h")
    gap = array.array("h", [0] * int(44100 * 0.5) * 2)
    names = []
    for i, s in enumerate(rep["segments"]):
        if s.get("silent") or s["label"].startswith(SKIP) or not s.get("clip"):
            continue
        f = report_dir / Path(s["clip"]).name
        if not f.exists():
            continue
        with wave.open(str(f)) as w:
            data = array.array("h", w.readframes(w.getnframes()))
        a = int(max(0, s.get("sound_starts", 0) - 0.02) * 44100) * 2
        b = a + int(min(14.0, (s.get("sound_length") or 1) + 0.5) * 44100) * 2
        out.extend(data[a:b])
        out.extend(gap)
        names.append(s["label"])
    if not out:
        return None, 0, names, rep
    peak = max(abs(x) for x in out) / 32768
    ceiling = 10 ** ((-6 if music_task else -12) / 20)
    cut = 0.0
    if peak > ceiling:
        g = ceiling / peak
        cut = round(-20 * math.log10(g), 1)
        out = array.array("h", (int(x * g) for x in out))
    return out, cut, names, rep


def mp3(samples, path):
    with tempfile.TemporaryDirectory() as t:
        w = Path(t) / "a.wav"
        with wave.open(str(w), "wb") as o:
            o.setnchannels(2); o.setsampwidth(2); o.setframerate(44100); o.writeframes(samples.tobytes())
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(w), "-codec:a", "libmp3lame", "-b:a", "160k", str(path)], check=True)


def numbers(rep):
    rows = []
    for s in rep["segments"]:
        if s.get("silent") or s["label"].startswith(SKIP):
            continue
        m = s.get("music")
        rows.append(f"{html.escape(s['label'])}: peak {s['peak_dbfs']} dBFS, {round((s.get('hf') or 0) * 100, 1)}% above 5 kHz, {s.get('sound_length')} s"
                    + (f"; {m['events']} notes in {m['key']}, ends on {m['last_pitch_class']}" if m else ""))
    fails = [x["text"] for x in rep.get("lines", []) if x["level"] == "fail"]
    return rows, fails


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    tasks = [json.loads(p.read_text()) for p in sorted((HERE / "tasks").glob("v*/task.json"))]
    tasks = [t for t in tasks if t.get("skill") == "sound"]
    cards = []
    for t in tasks:
        tid = t["id"]
        instr = (HERE / "tasks" / tid / "instruction.md").read_text().strip()
        on = best(a.runs, tid, "on")
        off = best(a.runs, tid, "off", seed=-on[1] if on else None) or best(a.runs, tid, "off")
        music = tid in ("v2-signature-tune", "v3-calm-loop")
        cols = []
        for label, r in (("Without the skill", off), ("With the skill", on)):
            if not r:
                cols.append(f"<div class=col><h3>{label}</h3><p>No run.</p></div>")
                continue
            passed, negseed, rdir, j = r
            s, cut, names, rep = clip(rdir / "work-listen", music)
            rows, fails = numbers(rep)
            name = f"{tid}-{'with' if label.startswith('With ') else 'without'}.mp3"
            player = "<p>It made no sound.</p>"
            if s is not None:
                mp3(s, out / name)
                player = f'<audio controls preload="none" src="{name}"></audio>'
            note = f"<p class=note>Turned down by {cut} dB so it is safe to play; the page played it {cut} dB louder.</p>" if cut else ""
            cols.append(f"<div class=col><h3>{label} <span>seed {-negseed}, {passed} of {j.get('total')} checks</span></h3>{player}{note}"
                        f"<p class=what>In order: {html.escape(', '.join(names)) or 'nothing'}</p><ul>{''.join(f'<li>{x}</li>' for x in rows)}</ul>"
                        + (f"<p class=fails>Its problems: {html.escape(' / '.join(fails[:4]))}</p>" if fails else "<p class=ok>No problems found.</p>") + "</div>")
        cards.append(f"<section><h2>{html.escape(tid)}</h2><p class=ask>{html.escape(instr)}</p><div class=pair>{''.join(cols)}</div></section>")
    page = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ola's sound, with and without the skill</title><style>
:root{{--paper:#f6f3ee;--ink:#1d1b19;--ink2:#5b5650;--rule:#d9d3ca;--accent:#2f5d50}}
body{{margin:0;background:var(--paper);color:var(--ink);font:16px/1.55 -apple-system, system-ui, sans-serif}}
main{{max-width:1080px;margin:0 auto;padding:32px 16px 64px}} h1{{font-size:30px;margin:0 0 8px}} .lede{{color:var(--ink2);max-width:66ch}}
section{{border-top:1px solid var(--rule);padding:24px 0}} h2{{font-size:20px;margin:0 0 4px}} .ask{{color:var(--ink2);margin:0 0 16px;max-width:80ch}}
.pair{{display:grid;grid-template-columns:1fr 1fr;gap:24px}} @media (max-width:720px){{.pair{{grid-template-columns:1fr}}}}
h3{{font-size:16px;margin:0 0 8px}} h3 span{{font-weight:400;color:var(--ink2)}} audio{{width:100%}} ul{{padding-left:18px;margin:8px 0;font-size:14px}}
.note,.what{{font-size:14px;color:var(--ink2);margin:6px 0}} .fails{{font-size:14px;color:#8a2c12}} .ok{{font-size:14px;color:var(--accent)}}
</style></head><body><main><h1>Ola's sound, with and without the skill</h1>
<p class=lede>Six requests a group might make. For each, what the open model (Nemotron 3.5 Super VL) made without Ola's sound skill, and the best of three runs with it,
as the page played them, one sound after another. Nothing here is louder than -6 dBFS; clips that were louder say so. Start with your volume low.</p>
{''.join(cards)}</main></body></html>"""
    (out / "index.html").write_text(page)
    print(f"wrote {out}/index.html and {len(list(out.glob('*.mp3')))} mp3s")


if __name__ == "__main__":
    main()
