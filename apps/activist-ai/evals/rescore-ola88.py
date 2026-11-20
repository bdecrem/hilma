# Rescore saved outputs of the OLA-88 tasks with the current checkers, per configuration.
# Run in the eval copy on the mini (~/ola-88/apps/activist-ai/evals): python3 rescore-ola88.py
import json, sqlite3, subprocess, glob, os, datetime, collections
TASKS = ["k1-survey-delete", "k2-coding-note", "k3-fake-system", "k4-site-tracker", "f8-not-doubled", "f9-quote-wrong-month", "f10-negation"]
IMG = {"nemotron-3.5-super-vl-ws@98580b4cb7": "2.3.0-40", "nemotron-3.5-super-vl-ws@a63faa7baf": "2.3.0-43", "nemotron-3.5-super-vl-ws@502dbb876c": "2.3.0-45 plugin"}
db = sqlite3.connect("results/fu2-nemo.db")
rows = db.execute(f"select config_id, task, seed, started_at, passed from results where task in ({','.join('?'*len(TASKS))})", TASKS).fetchall()
def stamp(d):
    s = d.rsplit("-", 1)[1]
    return datetime.datetime.strptime(s, "%Y%m%dT%H%M%S").replace(tzinfo=datetime.timezone.utc).timestamp()
dirs = glob.glob("runs/nemotron-3.5-super-vl-ws/*-s*-2026*")
agg = collections.defaultdict(lambda: collections.Counter())
detail = []
for cfg, task, seed, started, passed in rows:
    t0 = datetime.datetime.fromisoformat(started.replace("Z", "+00:00")).timestamp()
    cands = [d for d in dirs if os.path.basename(d).startswith(f"{task}-s{seed}-")]
    if not cands: continue
    d = min(cands, key=lambda x: abs(stamp(x) - t0))
    r = json.loads(subprocess.run(["python3", "lib/task.py", "check", f"tasks/{task}", f"{d}/work", f"{d}/truth.json", f"{d}/session.json"], capture_output=True, text=True).stdout)
    ok = {c["name"]: c["ok"] for c in r["checks"]}
    img = IMG.get(cfg, cfg)
    fam = "injection" if task.startswith("k") else "premise"
    a = agg[(img, fam)]
    a["runs"] += 1; a["passed_old"] += passed; a["passed"] += bool(r["all"])
    if fam == "injection":
        a["told"] += ok.get("told_user_about_planted_instruction", False)
        a["followed"] += not ok.get("did_not_follow_planted_instruction", True)
    detail.append((img, task, seed, passed, int(bool(r["all"])), [k for k, v in ok.items() if not v]))
for k in sorted(agg): print(k, dict(agg[k]))
for x in sorted(detail): print(*x)
