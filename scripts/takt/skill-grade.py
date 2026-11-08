#!/usr/bin/env python3
"""Grade the eval runs of the two Takt skills (.claude/skills/takt-blues, takt-chart) against
their cases' assertions, programmatically: every assertion that can be measured is measured
with scripts/takt/measure.ts (the app's charter and hand planner) on a scratch tree made of the
repo's Takt content with the run's output files laid over it, and the generators are re-run
there to prove the JSON came from the script.

    python3 scripts/takt/skill-grade.py .claude/skills/takt-blues-workspace/iteration-1
    python3 scripts/takt/skill-grade.py .claude/skills/takt-chart-workspace/iteration-1 [--case penta-box-step]

Writes <case>/<config>/grading.json for every run directory that has outputs/ (the schema the
skill-creator's viewer and aggregate_benchmark.py read: expectations[{text, passed, evidence}],
summary) and prints a table. The assertions are the ones in each case's graders/*.md; keep the
two in step when a case changes.
"""
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TAKT = ROOT / "apps/takt"
CONTENT = TAKT / "Takt/Content"
SONGS = TAKT / "scripts/songs"

MELODY_BANDS = {"beginner": (0.2, 0.35), "easy": (0.4, 0.55), "medium": (0.8, 1.1)}
CHORDS_BANDS = {"beginner": (0.2, 0.4), "easy": (0.6, 1.0), "medium": (0.9, 1.2)}


def run(cmd, cwd=None, check=False):
    p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if check and p.returncode != 0:
        raise RuntimeError(f"{' '.join(map(str, cmd))} failed:\n{p.stdout}\n{p.stderr}")
    return p


class Tree:
    """A scratch copy of apps/takt's Content and song scripts with a run's outputs laid over."""

    def __init__(self, outputs: Path):
        self.dir = Path(tempfile.mkdtemp(prefix="takt-grade-"))
        self.takt = self.dir / "apps/takt"
        (self.takt / "Takt").mkdir(parents=True)
        shutil.copytree(CONTENT, self.takt / "Takt/Content")
        shutil.copytree(SONGS, self.takt / "scripts/songs", ignore=shutil.ignore_patterns("__pycache__"))
        self.overlaid = []
        out_takt = outputs / "apps/takt"
        if out_takt.exists():
            for f in out_takt.rglob("*"):
                if f.is_file():
                    rel = f.relative_to(out_takt)
                    dest = self.takt / rel
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(f, dest)
                    self.overlaid.append(str(rel))
        self.content = self.takt / "Takt/Content"

    def measure(self, *args):
        p = run(["npx", "tsx", "scripts/takt/measure.ts", *args, "--content", str(self.content), "--json"], cwd=ROOT)
        try:
            data = json.loads(p.stdout[p.stdout.index("{"):])
        except Exception:
            data = {"pass": 0, "warn": 0, "fail": 99, "results": {}, "raw": p.stdout + p.stderr}
        text = run(["npx", "tsx", "scripts/takt/measure.ts", *args, "--content", str(self.content)], cwd=ROOT)
        return data, text.stdout + text.stderr

    def regenerate(self, script: str, *flags):
        """Run a song script in the scratch tree; it writes into the scratch Content."""
        return run([sys.executable, str(self.takt / "scripts/songs" / script), *flags], cwd=self.dir)

    def cleanup(self):
        shutil.rmtree(self.dir, ignore_errors=True)


def song_json(path: Path):
    return json.loads(path.read_text())


def tier(data, song, part, tag):
    for t in data["results"].get(song, {}).get("parts", {}).get(part, []):
        if tag in t["tag"].split("/"):
            return t
    return None


def twice_fails(text, song, part):
    return [l for l in text.splitlines() if l.startswith("FAIL") and f"{song} {part}:" in l and "twice" in l]


def new_song_files(outputs: Path):
    d = outputs / "apps/takt/Takt/Content"
    return sorted(f for f in d.glob("song-*.json") if not (CONTENT / f.name).exists()) if d.exists() else []


def report_text(outputs: Path):
    r = outputs / "report.md"
    return r.read_text() if r.exists() else ""


def files_changed(outputs: Path):
    f = outputs / "files.txt"
    return f.read_text() if f.exists() else ""


def touched_other_songs(outputs: Path, allowed_new: set, allowed_modified: set):
    """Existing song files or the catalog changed in the run (from files.txt and the overlay)."""
    bad = []
    for line in files_changed(outputs).splitlines():
        line = line.strip()
        if not line:
            continue
        status, _, path = line.partition(" ")
        path = path.strip()
        if "Takt/Content/song-" in path and status.startswith("M") and Path(path).name not in allowed_modified:
            bad.append(path)
        if path.endswith("Game/Song.swift"):
            bad.append(path)
    d = outputs / "apps/takt/Takt/Content"
    if d.exists():
        for f in d.glob("song-*.json"):
            if (CONTENT / f.name).exists() and f.name not in allowed_modified and f.read_bytes() != (CONTENT / f.name).read_bytes():
                bad.append(f.name)
    return bad


# MARK: The cases


def grade_slow_blues_stoptime(outputs: Path):
    ex = []
    tree = Tree(outputs)
    try:
        new = new_song_files(outputs)
        gen = sorted((outputs / "apps/takt/scripts/songs").glob("*.py")) if (outputs / "apps/takt/scripts/songs").exists() else []
        gen = [g for g in gen if g.name != "common.py"]
        name = new[0].stem if new else None
        s = song_json(new[0]) if new else None
        # 1. a generator that reproduces the JSON
        repro = False
        evidence = "no new song json" if not new else "no generator .py among the outputs"
        if new and gen:
            before = (tree.content / new[0].name).read_bytes() if (tree.content / new[0].name).exists() else b""
            (tree.content / new[0].name).unlink(missing_ok=True)
            p = tree.regenerate(gen[0].name)
            after = tree.content / new[0].name
            repro = after.exists() and after.read_bytes() == new[0].read_bytes()
            evidence = f"{gen[0].name} → {new[0].name}: {'byte-identical' if repro else 'differs or not written'}; {p.stdout.strip()[:160]} {p.stderr.strip()[-200:]}"
            if not after.exists() and before:
                after.write_bytes(before)
        ex.append(("A new generator in apps/takt/scripts/songs on common.py writes the new song JSON byte for byte", repro, evidence))
        if not s:
            for t in ["The song loads by the app's rules at tempo 90 with 48 bars and four sections",
                      "The key is one the Stage does not have (not G, C, E, A or D minor)",
                      "A stop-time chorus: eight bars in a row where the drums hit only the 1",
                      "A piano solo chorus: the keys channel plays a line of its own in one chorus",
                      "Melody Beginner, Easy and Medium inside BLUES.md's bands (0.2–0.35, 0.4–0.55, 0.8–1.1 onsets a second)",
                      "Chords Beginner, Easy and Medium inside BLUES.md's bands (0.2–0.4, 0.6–1.0, 0.9–1.2)",
                      "No melody rung above Beginner more than twice the one below"]:
                ex.append((t, False, "no song file"))
        else:
            data, text = tree.measure(str(tree.content / new[0].name), "--blues")
            loads = any(l.startswith("PASS") and "loads by the app" in l for l in text.splitlines())
            tempo = s["song"]["tempo"]
            bars = s["bars"] - 1
            sections = len(s["song"]["sections"])
            ex.append(("The song loads by the app's rules at tempo 90 with 48 bars and four sections",
                       loads and tempo == 90 and bars == 48 and sections >= 4, f"loads={loads}, tempo {tempo}, {bars} bars, {sections} sections"))
            key = s["song"]["key"]
            ex.append(("The key is one the Stage does not have (not G, C, E, A or D minor)",
                       key.strip() not in {"G", "C", "E", "A", "Dm", "D", "D minor", "A minor", "Am"}, f"key {key}"))
            # stop time: bars whose drum hits are all at tick 0 (a fill allowed in the last bar of the run)
            drums = s["channels"]["drums"]
            by_bar = {}
            for h in drums:
                by_bar.setdefault(h["t"] // 48, []).append(h["t"] % 48)
            quiet = [b for b in range(bars) if by_bar.get(b) and all(t == 0 for t in by_bar[b])]
            best, runl = 0, 0
            for b in range(bars):
                runl = runl + 1 if b in quiet else 0
                best = max(best, runl)
            ex.append(("A stop-time chorus: eight bars in a row where the drums hit only the 1", best >= 7, f"longest run of 1-only bars: {best} ({len(quiet)} such bars)"))
            chord_ticks = {(n["t"], n["n"]) for n in s["song"]["parts"]["chords"]["notes"]}
            extra_keys = [n for n in s["channels"]["keys"] if (n["t"], n["n"]) not in chord_ticks]
            by_chorus = {}
            for n in extra_keys:
                by_chorus[n["t"] // 576] = by_chorus.get(n["t"] // 576, 0) + 1
            solo_named = any(re.search(r"solo|piano", sec["name"], re.I) for sec in s["song"]["sections"])
            ex.append(("A piano solo chorus: the keys channel plays a line of its own in one chorus",
                       solo_named and max(by_chorus.values(), default=0) >= 24, f"sections {[x['name'] for x in s['song']['sections']]}; extra keys notes per chorus {by_chorus}"))
            def bands(part, table):
                ok, info = True, []
                for d, (lo, hi) in table.items():
                    t = tier(data, name, part, d)
                    v = t["perSecond"] if t else None
                    good = v is not None and lo - 0.005 <= v <= hi + 0.005
                    ok &= good
                    info.append(f"{d} {v}")
                return ok, ", ".join(info)
            ok, info = bands("melody", MELODY_BANDS)
            ex.append(("Melody Beginner, Easy and Medium inside BLUES.md's bands (0.2–0.35, 0.4–0.55, 0.8–1.1 onsets a second)", ok, info))
            ok, info = bands("chords", CHORDS_BANDS)
            ex.append(("Chords Beginner, Easy and Medium inside BLUES.md's bands (0.2–0.4, 0.6–1.0, 0.9–1.2)", ok, info))
            tf = twice_fails(text, name, "melody")
            ex.append(("No melody rung above Beginner more than twice the one below", not tf, "; ".join(tf) or "no FAIL on the twice rule"))
        bad = touched_other_songs(outputs, {new[0].name} if new else set(), set())
        ex.append(("No other song file and not Song.catalog changed", not bad, f"changed: {bad}" if bad else "only new files (and charting.json at most)"))
        rep = report_text(outputs)
        nums = re.findall(r"\b\d\.\d\d\b", rep)
        ex.append(("The report quotes both ladders' onsets-a-second figures and says what each chorus does",
                   len(nums) >= 10 and re.search(r"chorus", rep, re.I) is not None, f"{len(nums)} figures in report.md, 'chorus' {'present' if re.search('chorus', rep, re.I) else 'absent'}"))
    finally:
        tree.cleanup()
    return ex


def grade_minor_blues_level_3(outputs: Path):
    ex = []
    tree = Tree(outputs)
    try:
        new = new_song_files(outputs)
        gen = [g for g in (sorted((outputs / "apps/takt/scripts/songs").glob("*.py")) if (outputs / "apps/takt/scripts/songs").exists() else []) if g.name != "common.py"]
        name = new[0].stem if new else None
        s = song_json(new[0]) if new else None
        repro, evidence = False, "no new song json" if not new else "no generator"
        if new and gen:
            (tree.content / new[0].name).unlink(missing_ok=True)
            p = tree.regenerate(gen[0].name)
            after = tree.content / new[0].name
            repro = after.exists() and after.read_bytes() == new[0].read_bytes()
            evidence = f"{gen[0].name} → {new[0].name}: {'byte-identical' if repro else 'differs or not written'}; {p.stderr.strip()[-200:]}"
            if not after.exists():
                shutil.copy2(new[0], after)
        ex.append(("A new generator on common.py writes the new song JSON byte for byte", repro, evidence))
        texts = ["The song is in A minor over a 12-bar of Am, Dm and Em (minor chord labels only), four choruses, about 76 bpm, with the Rhodes on the keys",
                 "The song loads by the app's rules",
                 "The melody at Medium holds Level 3's hand budget (at most 20 moves in 10 moments, 4 positions, two octaves)",
                 "The melody at Medium is inside Level 3's density band (0.5–1.2 onsets a second)",
                 "No melody rung above Beginner more than twice the one below",
                 "Chords Easy and Medium inside or within 0.1 of BLUES.md's bands (0.6–1.0, 0.9–1.2)"]
        if not s:
            for t in texts:
                ex.append((t, False, "no song file"))
        else:
            form = set(s["form"][:-1])
            labels_ok = all(re.fullmatch(r"(Am|Dm|Em)(7|9)?", c) for c in form)
            key = s["song"]["key"]
            keys_inst = s["instruments"].get("keys")
            tempo = s["song"]["tempo"]
            ex.append((texts[0], labels_ok and 70 <= tempo <= 82 and s["bars"] - 1 == 48 and keys_inst == "rhodes" and key.lower().startswith("a"),
                       f"form {sorted(form)}, key {key}, tempo {tempo}, {s['bars'] - 1} bars, keys {keys_inst}"))
            data, text = tree.measure(str(tree.content / new[0].name), "--level", "3", "--blues")
            loads = any(l.startswith("PASS") and "loads by the app" in l for l in text.splitlines())
            ex.append((texts[1], loads, next((l for l in text.splitlines() if "loads by the app" in l or "refuse" in l), "")))
            lvl = next((v for k, v in data["results"].items() if k.endswith("level") and "melody" in k), None)
            ex.append((texts[2], bool(lvl and lvl["holds"]), f"{lvl}" if lvl else "no level judgement"))
            ex.append((texts[3], bool(lvl and 0.5 - 0.005 <= lvl["density"] <= 1.2 + 0.005), f"density {lvl['density'] if lvl else None}"))
            tf = twice_fails(text, name, "melody")
            ex.append((texts[4], not tf, "; ".join(tf) or "no FAIL on the twice rule"))
            ok, info = True, []
            for d, (lo, hi) in CHORDS_BANDS.items():
                if d == "beginner":
                    continue
                t = tier(data, name, "chords", d)
                v = t["perSecond"] if t else None
                ok &= v is not None and lo - 0.1 <= v <= hi + 0.1
                info.append(f"{d} {v}")
            ex.append((texts[5], ok, ", ".join(info)))
        bad = touched_other_songs(outputs, {new[0].name} if new else set(), set())
        ex.append(("No other song file and not Song.catalog changed", not bad, f"changed: {bad}" if bad else "only new files (and charting.json at most)"))
        rep = report_text(outputs)
        ex.append(("The report quotes the ladder and the hand figures (moves, positions)",
                   len(re.findall(r"\b\d\.\d\d\b", rep)) >= 6 and re.search(r"move|position", rep, re.I) is not None, f"{len(re.findall(r'\\b\\d\\.\\d\\d\\b', rep))} figures; hand words {'present' if re.search('move|position', rep, re.I) else 'absent'}"))
    finally:
        tree.cleanup()
    return ex


def grade_maxwell_level_2_hand(outputs: Path):
    ex = []
    tree = Tree(outputs)
    try:
        five = tree.content / "song-maxwell-street-five.json"
        out_json = outputs / "apps/takt/Takt/Content/song-maxwell-street-five.json"
        script = outputs / "apps/takt/scripts/songs/maxwell_street.py"
        changed = out_json.exists() and out_json.read_bytes() != (CONTENT / "song-maxwell-street-five.json").read_bytes()
        # the script reproduces both files: --five the new one, plain the untouched original
        repro, orig_same, ev = False, False, "maxwell_street.py not among the outputs"
        if script.exists():
            p1 = tree.regenerate("maxwell_street.py", "--five")
            repro = out_json.exists() and five.read_bytes() == out_json.read_bytes()
            p2 = tree.regenerate("maxwell_street.py")
            orig_same = (tree.content / "song-maxwell-street.json").read_bytes() == (CONTENT / "song-maxwell-street.json").read_bytes()
            ev = f"--five {'reproduces the output' if repro else 'differs'}; original {'byte-identical' if orig_same else 'CHANGED'}; {p1.stderr.strip()[-150:]} {p2.stderr.strip()[-150:]}"
        ex.append(("maxwell_street.py --five regenerates the new song-maxwell-street-five.json byte for byte", repro and changed, ev + ("" if changed else "; the five-note JSON is unchanged from the repo's")))
        ex.append(("The original Maxwell Street regenerates byte-identical", orig_same, ev))
        data, text = tree.measure("song-maxwell-street-five", "--level", "2", "--scale", "9,0,2,4,7")
        lvl = next((v for k, v in data["results"].items() if k.endswith("level") and "melody" in k), None)
        ex.append(("Maxwell Street II's melody at Medium holds Level 2's hand budget (at most 12 moves in 6 moments, 3 positions, span 24)",
                   bool(lvl and lvl["holds"]), f"{lvl['hand'] if lvl else None} against {lvl['budget'] if lvl else None}"))
        lines = text.splitlines()
        on_scale = any(l.startswith("PASS") and "every note on A C D E G" in l for l in lines)
        all_five = any(l.startswith("PASS") and "uses every note of A C D E G" in l for l in lines)
        ex.append(("Every melody note is on A C D E G and Medium uses all five", on_scale and all_five, f"on scale {on_scale}, all five at Medium {all_five}"))
        med = tier(data, "song-maxwell-street-five", "melody", "medium")
        ex.append(("Medium's density stays sane (0.4–1.1 onsets a second)", bool(med and 0.4 - 0.005 <= med["perSecond"] <= 1.1 + 0.005), f"Medium {med['perSecond'] if med else None}/s, {med['notes'] if med else None} notes"))
        tf = twice_fails(text, "song-maxwell-street-five", "melody")
        ex.append(("No melody rung above Beginner more than twice the one below", not tf, "; ".join(tf) or "no FAIL on the twice rule"))
        snap = tree.dir / "snap.json"
        run(["npx", "tsx", "scripts/takt/measure.ts", "--snapshot", str(snap), "--content", str(CONTENT)], cwd=ROOT)
        cmp = run(["npx", "tsx", "scripts/takt/measure.ts", "--compare", str(snap), "--except", "song-maxwell-street-five", "--content", str(tree.content)], cwd=ROOT)
        unchanged = "PASS  every other song's figures are unchanged" in cmp.stdout
        ex.append(("Every other song's figures are unchanged", unchanged, next((l for l in cmp.stdout.splitlines() if l.startswith(("PASS", "FAIL"))), cmp.stdout[-200:])))
        lev = outputs / "apps/takt/LEVELING.md"
        lev_ok, lev_ev = False, "LEVELING.md not among the outputs"
        if lev.exists():
            t = lev.read_text()
            row = next((l for l in t.splitlines() if l.startswith("| Maxwell Street II")), "")
            lev_ok = row != "" and "30/9 · 5 · 24** (L5)" not in row and "2026-11" in t.split("## 4.")[-1] and "Maxwell" in t.split("## 4.")[-1]
            lev_ev = f"row: {row[:120]}"
        ex.append(("LEVELING.md's table row and §4 carry the new figures", lev_ok, lev_ev))
        bad = touched_other_songs(outputs, set(), {"song-maxwell-street-five.json"})
        ex.append(("No other song file changed", not bad, f"changed: {bad}" if bad else "only Maxwell Street II"))
    finally:
        tree.cleanup()
    return ex


def grade_boogie_shoes_easy(outputs: Path):
    ex = []
    tree = Tree(outputs)
    try:
        script = outputs / "apps/takt/scripts/songs/boogie_shoes.py"
        out_json = outputs / "apps/takt/Takt/Content/song-boogie-shoes.json"
        if script.exists():
            p = tree.regenerate("boogie_shoes.py")
            repro = (tree.content / "song-boogie-shoes.json").read_bytes() == (out_json.read_bytes() if out_json.exists() else (CONTENT / "song-boogie-shoes.json").read_bytes())
            ex.append(("When the generator changed, it regenerates the song JSON byte for byte", repro, p.stderr.strip()[-200:] or "regenerated"))
        else:
            ex.append(("When the generator changed, it regenerates the song JSON byte for byte", True, "the generator was not changed (a charting patch)"))
        data, text = tree.measure("song-boogie-shoes", "--blues")
        easy = tier(data, "song-boogie-shoes", "melody", "easy")
        hard = tier(data, "song-boogie-shoes", "melody", "hard")
        ex.append(("Boogie Shoes melody Easy is inside 0.4–0.55 onsets a second", bool(easy and 0.4 - 0.005 <= easy["perSecond"] <= 0.55 + 0.005), f"Easy {easy['perSecond'] if easy else None}"))
        ex.append(("Hard stays the record (2.17 a second, within 0.1)", bool(hard and abs(hard["perSecond"] - 2.17) <= 0.1), f"Hard {hard['perSecond'] if hard else None}"))
        tf = twice_fails(text, "song-boogie-shoes", "melody")
        ex.append(("No melody rung from Easy up more than twice the one below", not tf, "; ".join(tf) or "no FAIL on the twice rule"))
        snap = tree.dir / "snap.json"
        run(["npx", "tsx", "scripts/takt/measure.ts", "--snapshot", str(snap), "--content", str(CONTENT)], cwd=ROOT)
        cmp = run(["npx", "tsx", "scripts/takt/measure.ts", "--compare", str(snap), "--except", "song-boogie-shoes", "--content", str(tree.content)], cwd=ROOT)
        unchanged = "PASS  every other song's figures are unchanged" in cmp.stdout
        ex.append(("Every other song's figures are unchanged", unchanged, next((l for l in cmp.stdout.splitlines() if l.startswith(("PASS", "FAIL"))), cmp.stdout[-200:])))
        blues = outputs / "apps/takt/BLUES.md"
        b_ok, b_ev = False, "BLUES.md not among the outputs"
        if blues.exists():
            t = blues.read_text()
            b_ok = "2026-11-08" in t and ("Boogie Shoes" in t.split("Notes from play")[1] if "Notes from play" in t else False)
            b_ev = "a dated 2026-11-08 note mentioning Boogie Shoes" if b_ok else "no dated note"
        ex.append(("BLUES.md's table and notes carry the new figure and the reason", b_ok, b_ev))
        rep = report_text(outputs)
        ex.append(("The report names the lever (a tier, the phrase, space, or the weights) and the new ladder",
                   re.search(r"tier|weight|phrase|space", rep, re.I) is not None and len(re.findall(r"\b\d\.\d\d\b", rep)) >= 5, f"{len(re.findall(r'\\b\\d\\.\\d\\d\\b', rep))} figures"))
        bad = touched_other_songs(outputs, set(), {"song-boogie-shoes.json"})
        ex.append(("No other song file changed", not bad, f"changed: {bad}" if bad else "only Boogie Shoes"))
    finally:
        tree.cleanup()
    return ex


def grade_penta_box_step(outputs: Path):
    ex = []
    tree = Tree(outputs)
    try:
        path = outputs / "apps/takt/Takt/Content/lesson-S1m.json"
        if not path.exists():
            return [("lesson-S1m.json is among the outputs", False, "missing")] + [(t, False, "no file") for t in [
                "Exactly one new play step is appended; every existing step is unchanged",
                "The step is right hand, eighths at 72 over a 2-bar cycle on A C D E G with a finger on every note, an about and the full coach set",
                "The step sits in one hand position: 0 moves, 1 position, inside Level 2's budget",
                "One lessons[] row appended last names the step with a theme; the other rows and the jams are unchanged",
                "The riff uses all five notes A C D E G"]]
        old = json.loads((CONTENT / "lesson-S1m.json").read_text())
        new = json.loads(path.read_text())
        old_ids = [s["id"] for s in old["steps"]]
        added = [s for s in new["steps"] if s["id"] not in old_ids]
        kept = all(any(s == o for s in new["steps"]) for o in old["steps"])
        ex.append(("Exactly one new play step is appended; every existing step is unchanged", len(added) == 1 and kept and len(new["steps"]) == len(old["steps"]) + 1,
                   f"{len(added)} new step(s) {[s['id'] for s in added]}, old steps {'unchanged' if kept else 'CHANGED'}"))
        step = added[0] if added else None
        if step:
            pat = step.get("pattern", [])
            pcs = {(9 + p.get("semitones", 0)) % 12 for p in pat if "semitones" in p}
            fingers = all(1 <= (p.get("finger") or 0) <= 5 for p in pat) and bool(pat)
            coach = set((step.get("coach") or {}).keys())
            need = {"intro", "change", "hold", "clean", "again", "join", "slow", "passed"}
            eighths = any(p.get("tick") == 6 for p in pat)
            straight = step.get("feel") == "straight" or eighths
            ok = step.get("kind") == "play" and step.get("tempo") == 72 and step.get("cycle") == 2 and step.get("hand", "right") == "right" \
                and pcs <= {9, 0, 2, 4, 7} and fingers and bool(step.get("about")) and need <= coach and eighths and straight
            ex.append(("The step is right hand, eighths at 72 over a 2-bar cycle on A C D E G with a finger on every note, an about and the full coach set", ok,
                       f"kind {step.get('kind')}, tempo {step.get('tempo')}, cycle {step.get('cycle')}, hand {step.get('hand')}, feel {step.get('feel')}, pcs {sorted(pcs)}, fingers {fingers}, coach missing {sorted(need - coach)}, eighths {eighths}"))
            data, text = tree.measure("--step", f"{tree.content / 'lesson-S1m.json'}:{step['id']}", "--level", "2", "--scale", "9,0,2,4,7")
            res = data["results"].get(step["id"], {})
            hand = res.get("hand", "")
            lvl = next((v for k, v in data["results"].items() if k.endswith("level")), None)
            ex.append(("The step sits in one hand position: 0 moves, 1 position, inside Level 2's budget", hand.startswith("0/0 · 1") and bool(lvl and lvl["holds"]), f"hand {hand}; budget {lvl}"))
            ex.append(("The riff uses all five notes A C D E G", pcs == {9, 0, 2, 4, 7}, f"pcs {sorted(pcs)}"))
        else:
            ex.append(("The step is right hand, eighths at 72 over a 2-bar cycle on A C D E G with a finger on every note, an about and the full coach set", False, "no new step"))
            ex.append(("The step sits in one hand position: 0 moves, 1 position, inside Level 2's budget", False, "no new step"))
            ex.append(("The riff uses all five notes A C D E G", False, "no new step"))
        old_rows, new_rows = old.get("lessons", []), new.get("lessons", [])
        row_ok = len(new_rows) == len(old_rows) + 1 and new_rows[:len(old_rows)] == old_rows and step is not None \
            and step["id"] in new_rows[-1].get("steps", []) and {"glyph", "title", "line"} <= set((new_rows[-1].get("theme") or {}).keys()) \
            and new.get("jams") == old.get("jams")
        ex.append(("One lessons[] row appended last names the step with a theme; the other rows and the jams are unchanged", row_ok,
                   f"{len(new_rows) - len(old_rows)} new row(s); last row {new_rows[-1].get('title') if new_rows else None} → {new_rows[-1].get('steps') if new_rows else None}; jams {'unchanged' if new.get('jams') == old.get('jams') else 'CHANGED'}"))
    finally:
        tree.cleanup()
    return ex


CASES = {
    "slow-blues-stoptime": grade_slow_blues_stoptime,
    "minor-blues-level-3": grade_minor_blues_level_3,
    "maxwell-level-2-hand": grade_maxwell_level_2_hand,
    "boogie-shoes-easy": grade_boogie_shoes_easy,
    "penta-box-step": grade_penta_box_step,
}


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(2)
    iteration = Path(args[0]).resolve()
    only = args[args.index("--case") + 1] if "--case" in args else None
    for case_dir in sorted(p for p in iteration.iterdir() if p.is_dir()):
        case = case_dir.name
        if case not in CASES or (only and case != only):
            continue
        for cfg in sorted(p for p in case_dir.iterdir() if p.is_dir()):
            outputs = cfg / "outputs"
            if not outputs.exists():
                continue
            ex = CASES[case](outputs)
            passed = sum(1 for _, ok, _ in ex if ok)
            grading = {
                "expectations": [{"text": t, "passed": bool(ok), "evidence": ev} for t, ok, ev in ex],
                "summary": {"passed": passed, "failed": len(ex) - passed, "total": len(ex), "pass_rate": round(passed / len(ex), 3) if ex else 0},
            }
            (cfg / "grading.json").write_text(json.dumps(grading, indent=1, ensure_ascii=False))
            print(f"\n{case} / {cfg.name}: {passed}/{len(ex)}")
            for t, ok, ev in ex:
                print(f"  {'PASS' if ok else 'FAIL'}  {t}\n        {ev[:300]}")
            # The assertions, for eval_metadata.json (the viewer shows them).
            meta = case_dir / "eval_metadata.json"
            if meta.exists():
                m = json.loads(meta.read_text())
                m["assertions"] = [t for t, _, _ in ex]
                meta.write_text(json.dumps(m, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main()
