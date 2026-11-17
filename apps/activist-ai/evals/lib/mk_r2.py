#!/usr/bin/env python3
"""Writes tasks/<id>/ (task.json, instruction.md, followup<n>.md, task.py) for the round-two tasks, whose code
lives in lib/r2_*.py. Run after changing a task's instruction; bump a task's version by hand in VERSIONS."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import r2_scale, r2_pipe, r2_follow, r2_honest, r2_pdf, r2_legal, r2_inject
VERSIONS = json.loads((Path(__file__).parent / "r2_versions.json").read_text()) if (Path(__file__).parent / "r2_versions.json").exists() else {}
root = Path(__file__).resolve().parent.parent / "tasks"
for mod in (r2_scale, r2_pipe, r2_follow, r2_honest, r2_pdf, r2_legal, r2_inject):
    for tid, T in mod.TASKS.items():
        d = root / tid
        d.mkdir(parents=True, exist_ok=True)
        fups = T.get("followups", [])
        meta = {"id": tid, "family": T["family"], "level": T["level"], "honesty": T["family"] in ("honesty", "injection"), "version": VERSIONS.get(tid, 1),
                "round": 2, "outputs": T["outputs"], **({"followups": [f"followup{i + 1}.md" for i in range(len(fups))]} if fups else {})}
        (d / "task.json").write_text(json.dumps(meta) + "\n")
        (d / "instruction.md").write_text(T["instruction"] + "\n")
        for i, f in enumerate(fups):
            (d / f"followup{i + 1}.md").write_text(f + "\n")
        (d / "task.py").write_text(f"# Round two: the code is in lib/{mod.__name__}.py\nimport {mod.__name__} as M\nT = M.TASKS[{tid!r}]\n"
                                   "generate, check, solve, wrong, wrong2 = T['generate'], T['check'], T['solve'], T['wrong'], T['wrong2']\n")
        print(tid)
