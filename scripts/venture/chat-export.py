#!/usr/bin/env python3
"""Keeps the terminal conversation where the voice Kit and the texting Kit can read it.

Bart, 2026-11-18, on a voice call: "You typed it just now in the chat that I'm having with you.
Go read it." The voice Kit could not: it reads venture_docs, and the terminal conversation was
only in the terminal. Then, typed: "provide this chat to the agent that handles the voice chats.
NOW!!!"

Runs as a hook after every turn of an interactive session in this repo (Stop) and when Bart
sends a message (UserPromptSubmit): writes what Bart typed and what Kit answered (no tool
output, no thinking) to apps/venture/private/TERMINAL-CHAT.md and pushes that one document to
venture_docs as "terminal-chat". The last 60,000 characters only: the newest lines matter.
Headless runs do nothing. Never prints anything (a hook's output would land in the session).
  test: python3 scripts/venture/chat-export.py --dry < hook.json
"""
import json, os, re, subprocess, sys

DRY = "--dry" in sys.argv
KEEP = 60_000


def main():
    if not DRY and os.environ.get("CLAUDE_CODE_ENTRYPOINT", "cli") != "cli":
        return
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return
    path = payload.get("transcript_path") or ""
    root = os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()
    private = os.path.join(root, "apps/venture/private")
    if not os.path.isdir(private) or not os.path.exists(path):
        return
    out = []
    for line in open(path):
        try:
            d = json.loads(line)
        except Exception:
            continue
        if d.get("isSidechain"):
            continue
        m = d.get("message") or {}
        c = m.get("content")
        ts = (d.get("timestamp") or "")[:16].replace("T", " ")
        if d.get("type") == "user":
            text = c if isinstance(c, str) else "\n".join(b.get("text", "") for b in c if isinstance(b, dict) and b.get("type") == "text") if isinstance(c, list) else ""
            text = re.sub(r"<system-reminder>.*?</system-reminder>", "", text, flags=re.S).strip()
            if not text or text.startswith(("<task-notification", "<local-command", "<command-", "Base directory for this skill", "[SYSTEM NOTIFICATION")):
                continue
            out.append(f"\n**BART** ({ts} UTC): {text[:4000]}\n")
        elif d.get("type") == "assistant" and isinstance(c, list):
            text = "\n".join(b.get("text", "") for b in c if isinstance(b, dict) and b.get("type") == "text").strip()
            if text:
                out.append(f"\n**KIT (terminal)** ({ts} UTC): {text[:4000]}\n")
    # A prompt that has just been sent is not in the transcript yet.
    if payload.get("hook_event_name") == "UserPromptSubmit" and payload.get("prompt"):
        out.append(f"\n**BART** (just now): {str(payload['prompt'])[:4000]}\n")
    body = "".join(out)
    if len(body) > KEEP:
        body = "(earlier lines left out)\n" + body[-KEEP:]
    head = ("# The terminal conversation, live (Bart and the terminal Kit)\n\n"
            "What Bart typed in the terminal and what the terminal Kit answered, word for word (tool output left out), kept current after "
            "every message. Times are UTC (Pacific is 8 hours earlier). The newest lines are at the END. Voice Kit and texting Kit: this is "
            "your own work; never tell Bart you cannot see the terminal chat, and never make him repeat what is here.\n")
    text = head + body
    if DRY:
        print(len(text), "characters")
        return
    f = os.path.join(private, "TERMINAL-CHAT.md")
    try:
        if os.path.exists(f) and open(f).read() == text:
            return
    except Exception:
        pass
    open(f, "w").write(text)
    subprocess.Popen(["node", os.path.join(root, "scripts/venture/sync.mjs"), "push", "--only", "TERMINAL-CHAT.md"], cwd=root,
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)


main()
