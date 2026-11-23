#!/usr/bin/env python3
"""PreToolUse on Agent (and Task): plan usage is in front of the session the moment it starts an
agent, and no agent starts once the plan's limit was recorded (OLA-319).

Bart, Nov 20, 7:15 pm: "You need to keep an eye on usage- we may hit usage limits and need to resume
after 2am". That session had read usage.mjs once and started three Opus agents. Now every Agent call
first shows the line from `scripts/venture/usage.mjs line` (all machines: the plan's 5-hour and weekly
use, each machine's tokens); while a limit the runner or a session recorded (venture_state
"runner_limit") holds, the call is refused with the reset time. The runner starts again by itself
after the reset and continues the tickets the limit cut off first.

Test: python3 .claude/hooks/agent-guard-test.py"""
import json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import usage_cache

try:
    event = json.load(sys.stdin)
except Exception:
    event = {}
if event.get("tool_name") not in ("Agent", "Task"):
    sys.exit(0)

data = usage_cache.read(180, wait=True)
if not data:
    sys.exit(0)  # the tracker cannot be read: never block on that
lim = usage_cache.limit_live(data)
if lim:
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": (
            f"No new agent: the plan's usage limit was hit ({lim.get('text')}), recorded by {lim.get('by') or 'the runner'}; "
            f"it holds until {lim.get('until')}. The runner on the mini starts again by itself then"
            + (f" and continues {', '.join(lim.get('cut') or [])} first" if lim.get("cut") else "")
            + ". Do the work in this session if it can run, or leave it on its ticket with a comment."),
    }}))
    sys.exit(0)
print(json.dumps({"hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "additionalContext": "Plan usage before this agent starts: " + data.get("line", ""),
}}))
