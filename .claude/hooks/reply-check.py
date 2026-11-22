#!/usr/bin/env python3
"""Stop hook: reads the reply before the turn ends and sends it back once when it is too long or
contains a phrase Bart has banned (OLA-180; rule 52).

NOT REGISTERED in .claude/settings.json since Nov 19 (ad47a2e0, correction 85: it sent back replies
Bart had already read, so every answer arrived twice). It does not run; nothing checks terminal
replies. Kept as a record only (OLA-255).

Why: "Text too long, or in Kit's voice" was his most frequent correction on Nov 18 (7 of 30) and
rested on rules the agent had to remember. The limits are his: at most four sentences unless he
asked for depth, no label before a point, no praise opener, no offer in place of the work, no link
wrapped in markdown (scripts/venture/reply-rules.json, shared with the check on texts in imsg.mjs).

What it can and cannot do: a terminal reply is already on screen when this runs, so the hook does
not hide it. It blocks the stop once and names what is wrong; the agent then writes the reply
again, and that second one is the last thing he reads. It never blocks twice in a row
(stop_hook_active), so a reply that has to be long because he asked for depth goes through on the
second try. Each block is counted in ~/.claude/reply-check.log (day, sentences, reasons).
"""
import json, os, re, sys, time

try:
    p = json.load(sys.stdin)
except Exception:
    sys.exit(0)
if p.get("stop_hook_active"):
    sys.exit(0)
root = os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()
try:
    rules = json.load(open(os.path.join(root, "scripts/venture/reply-rules.json")))
except Exception:
    sys.exit(0)

text = p.get("last_assistant_message") or ""
if not text and p.get("transcript_path") and os.path.isfile(p["transcript_path"]):
    # older Claude Code: the last assistant text in the transcript
    for line in reversed(open(p["transcript_path"]).read().splitlines()[-200:]):
        try:
            e = json.loads(line)
        except Exception:
            continue
        m = e.get("message", {})
        if m.get("role") == "assistant" and isinstance(m.get("content"), list):
            text = "\n".join(b.get("text", "") for b in m["content"] if b.get("type") == "text")
            if text.strip():
                break
if not text.strip():
    sys.exit(0)


def sentences(t):
    t = re.sub(r"```.*?```", "", t, flags=re.S)          # code blocks do not count
    t = re.sub(r"`[^`]*`", "x", t)                        # nor what is inside inline code
    t = re.sub(r"https?://\S+", "link", t)
    n = 0
    for line in t.splitlines():
        line = line.strip().lstrip("-*•0123456789. ").strip()
        if not line or line.startswith("#") or line.startswith("|"):
            continue
        ends = len(re.findall(r"[.!?](?=\s|$|[\"')\]*])", line))
        n += max(ends, 1)
    return n


bad = []
n = sentences(text)
if n > rules["maxSentences"]:
    bad.append(f"it has {n} sentences; the limit is {rules['maxSentences']} unless Bart asked for depth in his last message")
plain = re.sub(r"```.*?```", "", text, flags=re.S)
for what, rx in rules["banned"]:
    m = re.search(rx, plain, re.I | re.M)
    if m:
        bad.append(f"{what}: \"{m.group(0).strip()}\"")
if not bad:
    sys.exit(0)
try:
    with open(os.path.expanduser("~/.claude/reply-check.log"), "a") as f:
        f.write(json.dumps({"at": time.strftime("%Y-%m-%dT%H:%M:%S"), "sentences": n, "why": bad}) + "\n")
except Exception:
    pass
print("The reply Bart is about to read breaks his rules for replies: " + "; ".join(bad) + ". "
      "Write it again as the last message: the answer first, in his words, only what he needs to know or do, "
      "no account of the work. If his last message asked for depth, a list or a full description, keep the "
      "length and remove only the banned phrases.", file=sys.stderr)
sys.exit(2)
