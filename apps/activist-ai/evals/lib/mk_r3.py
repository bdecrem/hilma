#!/usr/bin/env python3
"""Writes tasks/<id>/ (task.json, instruction.md, task.py) for the skills tasks: round three (lib/r3_skills.py,
s1 to s8), round four (lib/r4_design.py, the design tasks u1 to u7) and round five (lib/r5_sound.py, the sound tasks v1 to v6). Each task.json names the skill it
measures ("skill"), which run.mjs --skills and skills-report.mjs read. Bump a task's version here by hand
when its checker changes."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import r3_skills, r4_design, r5_sound

VERSIONS = {}
root = Path(__file__).resolve().parent.parent / "tasks"
for mod, rnd in ((r3_skills, 3), (r4_design, 4), (r5_sound, 5)):
    for tid, T in mod.TASKS.items():
        d = root / tid
        d.mkdir(parents=True, exist_ok=True)
        meta = {"id": tid, "family": T["family"], "skill": T["skill"], "level": T["level"], "honesty": False, "version": VERSIONS.get(tid, 1), "round": rnd, "outputs": T["outputs"]}
        if T.get("register"):
            meta["register"] = T["register"]  # the designer's Bold register: design-judge.mjs judges these as fun, colorful pages
        (d / "task.json").write_text(json.dumps(meta) + "\n")
        (d / "instruction.md").write_text(T["instruction"] + "\n")
        (d / "task.py").write_text(f"# Round {['three', 'four', 'five'][rnd - 3]} (skills): the code is in lib/{mod.__name__}.py\nimport {mod.__name__} as M\nT = M.TASKS[{tid!r}]\n"
                                   "generate, check, solve, wrong, wrong2 = T['generate'], T['check'], T['solve'], T['wrong'], T['wrong2']\n")
        print(tid)
