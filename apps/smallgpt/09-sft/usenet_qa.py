"""Step 9b, part 2: real Usenet questions and real replies, cleaned into SFT pairs.

threads.py found 91,884 posts that asked something and got at least one reply
that names them. This takes a sample (three quarters comp.*, the rest from the
other hierarchies), and has Claude go through them thirty at a time: skip the
ones that don't work as a question and answer, write the question as the asker
would put it in one or two sentences, and the answer from what the replies
actually said, in one to four sentences, in the voice of a cranky old hacker.
The facts come from the replies, not from Claude.

Writes 09-sft/qa-usenet.jsonl: {group, year, subject, q, a} per kept pair.

Run:  .venv/bin/python 09-sft/usenet_qa.py        (about half an hour)
"""

import json
import os
import random
import subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, "data", "usenet", "threads.jsonl")
OUT = os.path.join(HERE, "qa-usenet.jsonl")
MODEL = "claude-sonnet-5-5"
SAMPLE = 4800
COMP_SHARE = 0.75
PER_CALL = 30

SCHEMA = {
    "type": "object",
    "properties": {
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"n": {"type": "integer"}, "keep": {"type": "boolean"}, "q": {"type": "string"}, "a": {"type": "string"}},
                "required": ["n", "keep", "q", "a"],
            },
        }
    },
    "required": ["items"],
}

PROMPT = """Below are {k} real Usenet threads from {years}: a post that asks something, and the replies it got.

For each one, decide whether it makes a good question-and-answer pair, and if so write it.

keep = false when: the replies don't actually answer the question; the question is really an announcement, a rant or a for-sale ad; the answer would need a code listing or table; it depends on private details (someone's name, address, phone, account); or it's about something unpleasant (harassment, slurs). When keep is false, q and a are empty strings.

When keep = true:
- q: the question as the original poster would ask it, in one or two plain sentences, standing on its own (fold in what the subject line says if needed). Keep their words and their era; no names of posters.
- a: the answer, built only from what the replies say. Never add a fact the replies don't contain; if replies disagree, go with the one that best answers. One to four short sentences, 15 to 60 words. Write it in the voice of a cranky old-school hacker on the net: impatient, terse, superior, a little grumpy ("Sigh.", "RTFM.", "this comes up every week", "any idiot knows", scorn for marketing and newbies), but it does answer. Every answer carries at least one cranky touch (a grumble, a jab, a sigh, a dig at the asker or at the vendor), but it still gives the real answer. Keep the replier's own good phrases. Vary the crankiness; many answers should start with the answer and grumble at the end, and no opening should repeat more than a few times.
- plain text only: no greeting, no "Re:", no quotes, no signature, no lists, no markdown, no emoticons, no names or addresses of posters. Mild language at most.

Return one item per thread, with its number n.

{items}"""


def ask(batch):
    items = "\n\n".join(
        f"=== {i + 1}. {t['group']}, {t['year']}\nSubject: {t['subject']}\n{t['q'][:1500]}\n"
        + "".join(f"--- reply {j + 1}:\n{r[:1000]}\n" for j, r in enumerate(t["replies"][:3]))
        for i, t in enumerate(batch)
    )
    years = f"{min(t['year'] for t in batch)}-{max(t['year'] for t in batch)}"
    cmd = [
        "claude", "-p", PROMPT.format(k=len(batch), years=years, items=items),
        "--model", MODEL, "--output-format", "json", "--json-schema", json.dumps(SCHEMA),
        "--tools", "", "--setting-sources", "", "--strict-mcp-config", "--no-session-persistence",
    ]
    env = {k: v for k, v in os.environ.items() if k != "ANTHROPIC_API_KEY"}  # use the login, not an API key
    for attempt in range(3):
        r = subprocess.run(cmd, capture_output=True, text=True, env=env, cwd="/tmp", timeout=900)
        try:
            got = {x["n"]: x for x in json.loads(r.stdout)["structured_output"]["items"]}
            if len(got) >= len(batch) * 0.9:
                out = []
                for i, t in enumerate(batch):
                    x = got.get(i + 1)
                    if x and x["keep"] and x["q"].strip() and x["a"].strip():
                        out.append({"group": t["group"], "year": t["year"], "subject": t["subject"],
                                    "q": " ".join(x["q"].split()), "a": " ".join(x["a"].split())})
                return out
        except (json.JSONDecodeError, KeyError, TypeError):
            pass
        print(f"  retry ({attempt + 1})", flush=True)
    print(f"  gave up on a batch: {r.stderr[-300:]}", flush=True)
    return []


if __name__ == "__main__":
    rows = [json.loads(l) for l in open(SRC)]
    random.seed(9)
    comp = [r for r in rows if r["group"].startswith("comp.")]
    rest = [r for r in rows if not r["group"].startswith("comp.") and not r["group"].startswith(("talk.", "alt."))]
    pick = random.sample(comp, int(SAMPLE * COMP_SHARE)) + random.sample(rest, SAMPLE - int(SAMPLE * COMP_SHARE))
    random.shuffle(pick)
    batches = [pick[i:i + PER_CALL] for i in range(0, len(pick), PER_CALL)]
    kept, done = [], 0
    with ThreadPoolExecutor(8) as pool:
        for fut in as_completed([pool.submit(ask, b) for b in batches]):
            kept += fut.result()
            done += 1
            print(f"{done:3d}/{len(batches)}  {len(kept):5d} kept", flush=True)
    seen, rows = set(), []
    for r in kept:
        if r["q"].lower() not in seen:
            seen.add(r["q"].lower())
            rows.append(r)
    rows.sort(key=lambda r: (r["group"], r["q"]))
    with open(OUT, "w") as f:
        for r in rows:
            f.write(json.dumps(r) + "\n")
    print(f"wrote {len(rows)} pairs to {OUT}")
