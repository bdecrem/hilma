#!/usr/bin/env python3
"""UserPromptSubmit: when Bart says he did something, the tracker is updated the same turn; and
what Bart wrote on the board is in front of every session.

Bart, 2026-11-17: "ola-81 and ola-122 have been closed - i signed the dev agreement and freed
up space. also i told the agent but somehow they did not update the tickets -> MAKE SURE THAT
DOES NOT HAPPEN AGAIN."

Every prompt in this repo gets a short note with the issues waiting on Bart, the rule (if his
message reports any issue done, changed or no longer wanted, run scripts/venture/issues.mjs
done/edit/drop for it before replying, and say so in one line), and, since 2026-11-18 (OLA-163),
what Bart wrote on the board that Kit has not read yet: comments, edits, status changes and new
issues from app.kochitolabs.com (`issues.mjs inbox`; mark them read with `inbox --mark`).
Since 2026-11-18 (OLA-171) also the days whose daily sweep is still owed (apps/venture/SWEEP.md).
One node call (`issues.mjs hook`), cached for two minutes. Silent if the tracker cannot be read.
"""
import json, os, subprocess, sys, time

root = os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()
cache = os.path.expanduser("~/.claude/bart-done-cache.json")
try:
    json.load(sys.stdin)
except Exception:
    pass

data = None
try:
    if time.time() - os.path.getmtime(cache) < 120:
        data = json.load(open(cache))
except Exception:
    data = None
if data is None:
    try:
        out = subprocess.run(["node", "scripts/venture/issues.mjs", "hook"],
                             cwd=root, capture_output=True, text=True, timeout=6)
        if out.returncode == 0:
            data = json.loads(out.stdout.strip().splitlines()[-1])
            json.dump(data, open(cache, "w"))
    except Exception:
        data = None

def most_seen():
    """The weaknesses Bart corrected most in the last three days, each with the one line to act on
    (`now` in apps/venture/private/data/weaknesses.json). Since 2026-11-19: on Nov 18, 25 of his 30
    corrections fell under a weakness that was already written down, and a rule read once at the
    start of a session was not in front of the agent when the reply was written. This puts the few
    that matter most in front of every prompt, where a compaction cannot drop them."""
    try:
        from datetime import date, timedelta
        ws = json.load(open(os.path.join(os.environ.get("VENTURE_PRIVATE") or os.path.join(root, "apps/venture/private"), "data/weaknesses.json")))
        since = (date.today() - timedelta(days=3)).isoformat()
        rows = sorted(((sum(1 for x in w.get("seen", []) if x.get("day", "") >= since), w) for w in ws if w.get("now")),
                      key=lambda r: -r[0])
        rows = [r for r in rows if r[0] > 0][:5]
        if not rows:
            return ""
        return ("Bart's corrections of the last three days, by weakness, most frequent first. Each one is an error "
                "the agent already made; check this turn's work and reply against each line before stopping:\n"
                + "\n".join(f"- {w['name']} ({n}x): {w['now']}" for n, w in rows))
    except Exception:
        return ""


def owed_fixes():
    """Fixes owed (OLA-251, Nov 20): corrections recorded the moment Bart made them, whose stronger fix
    is not built yet (`correct.mjs owed`). Listed before every prompt until `correct.mjs fix` settles
    them; `sweep.mjs post` refuses while one is older than two days."""
    try:
        from datetime import datetime, timezone
        ws = json.load(open(os.path.join(os.environ.get("VENTURE_PRIVATE") or os.path.join(root, "apps/venture/private"), "data/weaknesses.json")))
        rows = sorted(((o, w) for w in ws for o in w.get("owed") or []), key=lambda r: r[0].get("since", ""))
        if not rows:
            return ""
        now = datetime.now(timezone.utc)
        def age(o):
            try:
                return (now - datetime.fromisoformat(o["since"].replace("Z", "+00:00"))).days
            except Exception:
                return 0
        return ("Fixes owed (a correction recorded, its stronger fix not built yet; build it, then "
                "`node scripts/venture/correct.mjs fix <n> --fix ... --level <n> --where ...`):\n"
                + "\n".join(f"- {o['ref']}, {w['name']}: kind {o.get('need')} or stronger, {o.get('issue')}, owed {age(o)} day(s)" for o, w in rows))
    except Exception:
        return ""


def plan_usage():
    """Plan usage (OLA-319, Bart Nov 20: "You need to keep an eye on usage- we may hit usage limits and
    need to resume after 2am"): the one line from `usage.mjs line`, every machine, cached ten minutes and
    refreshed in the background, so no prompt waits for it."""
    try:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import usage_cache
        d = usage_cache.read(600, probe=True)
        return ("Plan usage (start an agent only if this allows it; agent-guard.py refuses one while a limit holds): "
                + d["line"]) if d and d.get("line") else ""
    except Exception:
        return ""


remind = "\n\n".join(x for x in (plan_usage(), most_seen(), owed_fixes()) if x)
if not isinstance(data, dict):
    if remind:
        print(json.dumps({"hookSpecificOutput": {"hookEventName": "UserPromptSubmit", "additionalContext": remind}}))
    sys.exit(0)

note = ("Tracker rule (Bart, Nov 17): if this message says Bart did something, or that an issue is "
        "done, changed or not wanted, update the tracker FIRST with `node scripts/venture/issues.mjs "
        "done <id> --proof \"Bart: <his words>; checked: <what you verified>\"` (or edit/drop), "
        "then reply, saying in one line which issues you closed. This applies to things he says "
        "he did in voice transcripts and texts too.")
waiting = [l for l in data.get("waiting") or [] if isinstance(l, str)]
unread = [l for l in data.get("unread") or [] if isinstance(l, str)]
if waiting:
    note += "\nWaiting on Bart right now:\n" + "\n".join(waiting)
if unread:
    note += ("\nBart wrote on the board and Kit has not read it yet (act on it, answer with "
             "`issues.mjs comment <id> \"...\"`, then `issues.mjs inbox --mark`):\n" + "\n".join(unread[:20]))
sweep = [d for d in data.get("sweep") or [] if isinstance(d, str)]
if sweep:
    note += ("\nThe daily sweep has not been done for " + ", ".join(sweep) + ": when the work in hand allows, and "
             "before this session ends, follow apps/venture/SWEEP.md (it ends with `sweep.mjs post`). "
             "Do not tell Bart about it; the Learning page is where he reads it.")
if remind:
    note += "\n\n" + remind
print(json.dumps({"hookSpecificOutput": {"hookEventName": "UserPromptSubmit", "additionalContext": note}}))
