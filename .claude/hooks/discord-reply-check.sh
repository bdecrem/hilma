#!/bin/bash
# Stop hook: if the most recent user message came from Discord, ensure the
# Discord reply tool was actually called this turn before allowing stop.
#
# Why: terminal output never reaches the user when they're reading via Discord.
# This catches the very common failure mode where Claude writes a long answer
# in the terminal but forgets to also call mcp__plugin_discord_discord__reply.
#
# Hook input: JSON on stdin with `transcript_path`
# Exit 0 = allow stop, exit 2 = block stop (stderr becomes feedback to Claude)

INPUT=$(cat)
export HOOK_INPUT="$INPUT"

python3 <<'PY'
import json, sys, os

raw = os.environ.get("HOOK_INPUT", "")
try:
    payload = json.loads(raw) if raw else {}
except Exception:
    sys.exit(0)

# guard against infinite loop — if Stop is already running this hook recursively,
# allow stop so we don't deadlock.
if payload.get("stop_hook_active"):
    sys.exit(0)

transcript = payload.get("transcript_path")
if not transcript or not os.path.isfile(transcript):
    sys.exit(0)

entries = []
with open(transcript) as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        try:
            entries.append(json.loads(line))
        except Exception:
            continue

# walk backward to find the most recent user message
last_user_idx = None
for i in range(len(entries) - 1, -1, -1):
    e = entries[i]
    role = e.get("role") or e.get("message", {}).get("role")
    if role == "user":
        last_user_idx = i
        break

if last_user_idx is None:
    sys.exit(0)

def text_of(entry):
    msg = entry.get("message", entry)
    content = msg.get("content", "")
    if isinstance(content, list):
        parts = []
        for c in content:
            if isinstance(c, dict):
                t = c.get("text") or c.get("content") or ""
                parts.append(str(t))
            else:
                parts.append(str(c))
        return " ".join(parts)
    return str(content)

last_user_text = text_of(entries[last_user_idx])
if 'source="plugin:discord:discord"' not in last_user_text and "source='plugin:discord:discord'" not in last_user_text:
    sys.exit(0)

# scan assistant turns after last_user_idx for the discord reply tool call
for entry in entries[last_user_idx + 1 :]:
    msg = entry.get("message", entry)
    if msg.get("role") != "assistant":
        continue
    content = msg.get("content", [])
    if not isinstance(content, list):
        continue
    for block in content:
        if isinstance(block, dict) and block.get("type") == "tool_use":
            if block.get("name") == "mcp__plugin_discord_discord__reply":
                sys.exit(0)

# not called — block stop with feedback to Claude
print(
    "STOP-HOOK: The most recent user message came from Discord but you didn't call "
    "mcp__plugin_discord_discord__reply this turn. The user is reading via Discord — "
    "your terminal text never reached them. Send your reply via the Discord reply tool now, "
    "then stop.",
    file=sys.stderr,
)
sys.exit(2)
PY
