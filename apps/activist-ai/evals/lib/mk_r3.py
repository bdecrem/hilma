#!/usr/bin/env python3
"""Writes tasks/<id>/ (task.json, instruction.md, task.py) for the round-three skills tasks, whose code
lives in lib/r3_skills.py. Each task.json names the skill it measures ("skill"), which run.mjs --skills
and skills-report.mjs read. Bump a task's version here by hand when its checker changes."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import r3_skills

VERSIONS = {}
root = Path(__file__).resolve().parent.parent / "tasks"
for tid, T in r3_skills.TASKS.items():
    d = root / tid
    d.mkdir(parents=True, exist_ok=True)
    meta = {"id": tid, "family": T["family"], "skill": T["skill"], "level": T["level"], "honesty": False, "version": VERSIONS.get(tid, 1), "round": 3, "outputs": T["outputs"]}
    (d / "task.json").write_text(json.dumps(meta) + "\n")
    (d / "instruction.md").write_text(T["instruction"] + "\n")
    (d / "task.py").write_text(f"# Round three (skills): the code is in lib/r3_skills.py\nimport r3_skills as M\nT = M.TASKS[{tid!r}]\n"
                               "generate, check, solve, wrong, wrong2 = T['generate'], T['check'], T['solve'], T['wrong'], T['wrong2']\n")
    print(tid)
