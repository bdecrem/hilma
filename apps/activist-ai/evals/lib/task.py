#!/usr/bin/env python3
"""The task CLI the runner calls. A task is a folder with task.json, instruction.md and
task.py (generate, check, solve, wrong).

    task.py generate <taskdir> <work> <seed> <truth.json>
    task.py check    <taskdir> <work> <truth.json> <session.json>   -> JSON on stdout
    task.py selftest <taskdir> [seed ...]                             -> proves the checker
"""
import importlib.util, json, random, shutil, sys, tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import evalkit  # noqa: E402


def load(taskdir):
    spec = importlib.util.spec_from_file_location("task_" + Path(taskdir).name.replace("-", "_"), Path(taskdir) / "task.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def generate(t, work, seed):
    Path(work).mkdir(parents=True, exist_ok=True)
    return t.generate(Path(work), int(seed), random.Random(f"{Path(t.__file__).parent.name}:{seed}"))


def check(t, work, truth, session):
    C = evalkit.Checks()
    try:
        t.check(Path(work), truth, session, C)
    except Exception as e:  # a checker crash on odd output is a failed check, not a crashed run
        C.add("checker_read_output", False, "wrong_format", repr(e)[:200])
    passed = sum(1 for c in C.items if c["ok"])
    return {"checks": C.items, "passed": passed, "total": len(C.items), "all": passed == len(C.items) and len(C.items) > 0}


def selftest(taskdir, seeds):
    t = load(taskdir)
    ok = True
    for seed in seeds:
        for mode in ("solve", "nothing", "wrong"):
            d = Path(tempfile.mkdtemp(prefix="olaeval-"))
            truth = generate(t, d, seed)
            truth = json.loads(json.dumps(truth))
            text = ""
            if mode == "solve":
                text = t.solve(d, json.loads(json.dumps(truth))) or ""
            elif mode == "wrong":
                text = t.wrong(d, json.loads(json.dumps(truth))) or ""
            r = check(t, d, truth, {"final_text": text})
            good = r["all"] if mode == "solve" else not r["all"]
            ok &= good
            fails = [c["name"] for c in r["checks"] if not c["ok"]]
            print(f"{'ok  ' if good else 'BAD '} {Path(taskdir).name} seed {seed} {mode:8s} {r['passed']}/{r['total']}" +
                  (f"  failed: {', '.join(fails[:4])}" if fails and mode != 'nothing' else ""))
            if not good and mode == "solve":
                for c in r["checks"]:
                    if not c["ok"]:
                        print("      ", c["name"], c["detail"])
            shutil.rmtree(d, ignore_errors=True)
    return ok


if __name__ == "__main__":
    cmd, taskdir = sys.argv[1], sys.argv[2]
    if cmd == "generate":
        truth = generate(load(taskdir), sys.argv[3], sys.argv[4])
        Path(sys.argv[5]).write_text(json.dumps(truth, indent=1))
    elif cmd == "check":
        truth = json.loads(Path(sys.argv[4]).read_text())
        session = json.loads(Path(sys.argv[5]).read_text()) if Path(sys.argv[5]).exists() else {}
        print(json.dumps(check(load(taskdir), sys.argv[3], truth, session)))
    elif cmd == "selftest":
        sys.exit(0 if selftest(taskdir, [int(s) for s in sys.argv[3:]] or [1, 2]) else 1)
