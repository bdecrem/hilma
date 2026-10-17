"""Step 11a, part 1: fresh questions the cranky model never trained on.

Step 9b's usenet_qa.py drew 4,800 threads from threads.jsonl (seed 9) and had
Claude rewrite the good ones as a question plus an answer built from the real
replies. This draws 4,000 more threads from the ones that sample left out,
with the same prompt, and keeps the thread's id and replies too: the judge
compares the model's answers with what people actually said.

Writes 11-rlhf/data/questions.jsonl: {id, group, year, subject, q, ref, replies}
(ref is Claude's cranky rewrite of the replies, like the SFT answers).
The first 200 (after a seeded shuffle) are held out for the final win rate.

Run (on a machine with the `claude` CLI):  .venv/bin/python 11-rlhf/questions.py   (~30 min)
"""

import json
import os
import random
from concurrent.futures import ThreadPoolExecutor, as_completed

from common import ROOT, claude, write

import sys
sys.path.insert(0, os.path.join(ROOT, "09-sft"))
from usenet_qa import COMP_SHARE, PER_CALL, PROMPT, SAMPLE, SCHEMA  # noqa: E402

SRC = os.path.join(ROOT, "data", "usenet", "threads.jsonl")
MORE = 4000


def ask(batch):
    items = "\n\n".join(
        f"=== {i + 1}. {t['group']}, {t['year']}\nSubject: {t['subject']}\n{t['q'][:1500]}\n"
        + "".join(f"--- reply {j + 1}:\n{r[:1000]}\n" for j, r in enumerate(t["replies"][:3]))
        for i, t in enumerate(batch)
    )
    years = f"{min(t['year'] for t in batch)}-{max(t['year'] for t in batch)}"
    got = claude(PROMPT.format(k=len(batch), years=years, items=items), SCHEMA)
    out = []
    for x in (got or {}).get("items", []):
        if 1 <= x["n"] <= len(batch) and x["keep"] and x["q"].strip() and x["a"].strip():
            t = batch[x["n"] - 1]
            out.append({"id": t["id"], "group": t["group"], "year": t["year"], "subject": t["subject"],
                        "q": " ".join(x["q"].split()), "ref": " ".join(x["a"].split()),
                        "replies": [r[:1000] for r in t["replies"][:3]]})
    return out


if __name__ == "__main__":
    rows = [json.loads(l) for l in open(SRC)]
    # step 9b's draw, repeated exactly, so none of its threads come back
    random.seed(9)
    comp = [r for r in rows if r["group"].startswith("comp.")]
    rest = [r for r in rows if not r["group"].startswith("comp.") and not r["group"].startswith(("talk.", "alt."))]
    used = random.sample(comp, int(SAMPLE * COMP_SHARE)) + random.sample(rest, SAMPLE - int(SAMPLE * COMP_SHARE))
    used = {r["id"] for r in used}
    comp = [r for r in comp if r["id"] not in used]
    rest = [r for r in rest if r["id"] not in used]
    random.seed(11)
    pick = random.sample(comp, int(MORE * COMP_SHARE)) + random.sample(rest, MORE - int(MORE * COMP_SHARE))
    random.shuffle(pick)
    batches = [pick[i:i + PER_CALL] for i in range(0, len(pick), PER_CALL)]
    sft_qs = {json.loads(l)["q"].lower() for l in open(os.path.join(ROOT, "09-sft", "qa-usenet.jsonl"))}
    kept, done = [], 0
    with ThreadPoolExecutor(8) as pool:
        for fut in as_completed([pool.submit(ask, b) for b in batches]):
            kept += fut.result()
            done += 1
            print(f"{done:3d}/{len(batches)}  {len(kept):5d} kept", flush=True)
    seen, out = set(sft_qs), []
    for r in kept:
        if r["q"].lower() not in seen:
            seen.add(r["q"].lower())
            out.append(r)
    random.seed(11)
    random.shuffle(out)
    write("questions.jsonl", out)
    print(f"wrote {len(out)} questions (first 200 held out for the win rate)")
