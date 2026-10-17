"""Step 11a, part 2: the cranky model answers every question four times.

Two answers at temperature 1.0 (what PPO will sample, so the reward model sees
that kind of answer) and two at the chat page's 0.7 with top-k 40. Questions
0-199 are held out for the win rate and get none.

Writes 11-rlhf/data/answers.jsonl: {i, q, ids: [four token lists]}. Token ids,
not text, so the reward model trains on exactly what the model wrote.

Run:  .venv/bin/python 11-rlhf/answers.py     (a few minutes on the mini)
"""

import time

import torch

from common import SFT, chat, device, generate, load, rows, text, write

HELD_OUT = 200
CHUNK = 64

if __name__ == "__main__":
    c = chat()
    model = load(SFT, device).eval()
    qs = rows("questions.jsonl")[HELD_OUT:]
    torch.manual_seed(11)
    out, t0 = [], time.time()
    for s in range(0, len(qs), CHUNK):
        chunk = qs[s:s + CHUNK]
        ps = [c.prompt(r["q"]) for r in chunk] * 2
        hot = generate(model, ps, c.eot, temperature=1.0)
        warm = generate(model, ps, c.eot, temperature=0.7, top_k=40)
        k = len(chunk)
        for j, r in enumerate(chunk):
            out.append({"i": HELD_OUT + s + j, "q": r["q"], "ids": [hot[j], hot[k + j], warm[j], warm[k + j]]})
        print(f"{s + k:5d}/{len(qs)}  ({time.time() - t0:.0f} s)  {r['q'][:60]!r} -> {text(c, warm[k - 1])[:80]!r}", flush=True)
    write("answers.jsonl", out)
    print(f"wrote {len(out) * 4} answers to {len(out)} questions")
