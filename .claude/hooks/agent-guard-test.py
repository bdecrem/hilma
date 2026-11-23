#!/usr/bin/env python3
"""Offline checks of agent-guard.py and limit-watch.py (OLA-319): python3 .claude/hooks/agent-guard-test.py
A fake cache (VENTURE_USAGE_CACHE) stands in for `usage.mjs line --json`; nothing is written to the tracker."""
import json, os, subprocess, sys, tempfile, time
from datetime import datetime, timedelta, timezone

here = os.path.dirname(os.path.abspath(__file__))
n = 0
def run(script, event, cache=None):
    env = {**os.environ, "CLAUDE_PROJECT_DIR": os.path.dirname(os.path.dirname(here))}
    if cache is not None:
        f = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False); json.dump(cache, f); f.close()
        env["VENTURE_USAGE_CACHE"] = f.name
    out = subprocess.run([sys.executable, os.path.join(here, script)], input=json.dumps(event), capture_output=True, text=True, env=env, timeout=20)
    return json.loads(out.stdout) if out.stdout.strip() else None
def ok(name, cond):
    global n
    assert cond, name
    n += 1
    print("ok", name)

iso = lambda d: (datetime.now(timezone.utc) + d).isoformat().replace("+00:00", "Z")
line = "Plan, one login for every machine: 5 h not reported, week 58%"
r = run("agent-guard.py", {"tool_name": "Agent"}, {"line": line, "limit": None})
ok("no limit: the agent starts, with the usage line in front of the session",
   r["hookSpecificOutput"].get("permissionDecision") is None and line in r["hookSpecificOutput"]["additionalContext"])
lim = {"kind": "limit", "until": iso(timedelta(hours=3)), "text": "You've hit your session limit · resets 2am", "by": "runner", "cut": ["OLA-12"]}
r = run("agent-guard.py", {"tool_name": "Agent"}, {"line": "LIMIT HIT", "limit": lim})
ok("a recorded limit that holds: the Agent call is refused, with the reset and the tickets to continue",
   r["hookSpecificOutput"]["permissionDecision"] == "deny" and "OLA-12" in r["hookSpecificOutput"]["permissionDecisionReason"] and lim["until"] in r["hookSpecificOutput"]["permissionDecisionReason"])
r = run("agent-guard.py", {"tool_name": "Task"}, {"line": line, "limit": {**lim, "until": iso(timedelta(minutes=-5))}})
ok("a limit past its reset does not refuse", r["hookSpecificOutput"].get("permissionDecision") is None)
ok("another tool: nothing", run("agent-guard.py", {"tool_name": "Bash"}, {"line": line, "limit": lim}) is None)

t = tempfile.NamedTemporaryFile("w", suffix=".jsonl", delete=False)
t.write(json.dumps({"type": "assistant", "message": {"model": "claude-opus-5-5", "content": [{"type": "text", "text": "You've hit your session limit, as a quote"}]}}) + "\n"); t.close()
ok("limit-watch: a turn that ended normally records nothing (and does not run node)", run("limit-watch.py", {"transcript_path": t.name}) is None)
limit_msg = {"type": "assistant", "isApiErrorMessage": True, "message": {"model": "<synthetic>", "content": [{"type": "text", "text": "You've hit your session limit · resets 2am (America/Los_Angeles)"}]}}
root = os.path.dirname(os.path.dirname(here))
t2 = tempfile.NamedTemporaryFile("w", suffix=".jsonl", delete=False); t2.write(json.dumps(limit_msg) + "\n"); t2.close()
out = subprocess.run(["node", "scripts/venture/usage.mjs", "limit", "--transcript", t2.name, "--dry"], cwd=root, capture_output=True, text=True, timeout=30)
rec = json.loads(out.stdout.split("would record: ", 1)[1]) if "would record: " in out.stdout else {}
ok("usage.mjs limit --transcript --dry: the reset read from the message, a minute after 2 am Pacific",
   rec.get("kind") == "limit" and rec.get("until", "").endswith(":01:00.000Z") and isinstance(rec.get("cut"), list))
print(f"{n} checks passed")
