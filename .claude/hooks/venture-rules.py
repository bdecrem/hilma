#!/usr/bin/env python3
"""SessionStart hook: Bart's standing rules, one line each, in every session's context at startup,
resume, clear and after compaction. He asked on 2026-11-14 that these "are always part of your
context".

Until 2026-11-19 this hook printed the whole of apps/venture/private/RULES.md. Claude Code caps a
hook's context at 10,000 characters: past that it keeps the output in a file and shows the session
the first 2,000 characters. The file had grown to 34,000, so sessions were starting with the
protocol and no rules. Now the hook prints a digest that fits: the correction protocol, then each
rule's number and its lead sentence (the bold sentence the rule opens with), then where the full
text and the checklists are. `sync.mjs push` refuses to save the notes when the digest is over
LIMIT, so the rules cannot outgrow the context again without someone seeing it.

  venture-rules.py            the hook (JSON for Claude Code)
  venture-rules.py --text     the digest as plain text
  venture-rules.py --size     "<characters> <rules>", exit 1 when over LIMIT or a rule has no lead

The file is private (gitignored); when it is missing (a machine before `sync.mjs pull`) the hook
does nothing.
"""
import json, os, re, sys

LIMIT = 9000  # characters; Claude Code's cap is 10,000
root = os.environ.get("CLAUDE_PROJECT_DIR") or os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
path = os.path.join(root, "apps/venture/private/RULES.md")


def digest():
    s = open(path).read()
    numbered = re.findall(r"^(\d+)\. (.+)$", s[s.index("## The rules"):], re.M)
    rules, bare = [], []
    for n, rest in numbered:
        m = re.match(r"\*\*(.+?)\*\*", rest)
        if m:
            rules.append(f"{n}. {m.group(1).strip()}")
        else:
            bare.append(n)
    out = [
        f"Standing rules from Bart's corrections: {len(rules)} rules, one line each. Every rule exists because Bart had to correct the agent once; he must never have to make the same correction twice.",
        "This is the digest. The full text of each rule (his words, the cases, how it is enforced) and the checklists are in apps/venture/private/RULES.md: read the full rule before work it bears on (grep -n '^12\\. ' apps/venture/private/RULES.md), and the section \"Checklists\" before Bart or a customer sees anything.",
        "",
        "When Bart corrects anything (same turn, before other work): (1) fix what he pointed at; (2) write it in CORRECTIONS.md as an error of the agent, with the real cause, and file it under a weakness in data/weaknesses.json (rule 50); (3) add or sharpen a rule in RULES.md; (4) fix the other places the same cause exists, without being asked; (5) enforce it with a hook, a check or a guard in code where one can, because a rule that is only remembered gets broken; (6) `node scripts/venture/sync.mjs push`, and tell him in one line what changed in the system.",
        "",
        "The rules:",
        *rules,
    ]
    return "\n".join(out), len(rules), bare


if not os.path.isfile(path):
    sys.exit(0)
text, n, bare = digest()
if "--text" in sys.argv:
    print(text)
elif "--size" in sys.argv:
    print(len(text), n)
    if bare:
        print(f"rules with no bold lead sentence: {', '.join(bare)}", file=sys.stderr)
    if len(text) > LIMIT:
        print(f"the rules digest is {len(text)} characters, over {LIMIT}: shorten lead sentences or merge rules in RULES.md", file=sys.stderr)
    sys.exit(1 if bare or len(text) > LIMIT else 0)
else:
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": text}}))
