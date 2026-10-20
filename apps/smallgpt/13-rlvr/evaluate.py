"""Step 13c: what a checkpoint can add, measured four ways, next to the model it started from.

For each level:

  seen phrasing     greedy, on the three phrasings training used
  unseen phrasing   greedy, on the fourth phrasing training never used (the curriculum's held-out number)
  sampled           temperature 1, 8 answers a problem: the fraction right
  pass@8            problems with at least one right answer among the 8

Level 1 is all 100 problems; levels 2 and 3 are the 200 operand pairs training
never drew. The seen/unseen gap says how much is "can't read the question"
and how much is "can't add". Then the probes, side by side.

Writes out/rlvr/<run>/evaluate.json. Run: .venv/bin/python 13-rlvr/evaluate.py grpo [grpo-short ...]
"""

import json
import os
import random
import sys
import time

import torch

from arith import LEVELS, PHRASINGS, TRAIN_PHRASINGS, problem, split
from shared import MAX_ANSWER, OUT, START, accuracy, chat, device, generate, load, text

PROBES = [(3, 5), (9, 8), (7, 0), (47, 8), (62, 9), (47, 38), (85, 76)]


def problems(level, phrasings, n=200, seed=13):
    rng = random.Random(seed * 7 + level)
    ps = split(level)[1]
    ps = ps if level == 1 else rng.sample(ps, min(n, len(ps)))
    return [problem(a, b, phrasings[i % len(phrasings)]) for i, (a, b) in enumerate(ps)]


def evaluate(model, c):
    out = {}
    for lv in LEVELS:
        seen = accuracy(model, c, problems(lv, TRAIN_PHRASINGS), group=1, top_k=1)[0]
        unseen = accuracy(model, c, problems(lv, PHRASINGS[-1:]), group=1, top_k=1)[0]
        sampled, p8, _ = accuracy(model, c, problems(lv, TRAIN_PHRASINGS), group=8)
        out[lv] = {"seen": seen, "unseen": unseen, "sampled": sampled, "pass@8": p8}
        print(f"    level {lv}: seen {100 * seen:5.1f}%   unseen {100 * unseen:5.1f}%   sampled {100 * sampled:5.1f}%   pass@8 {100 * p8:5.1f}%", flush=True)
    torch.manual_seed(13)
    qs = [f"What is {a} + {b}?" for a, b in PROBES]
    answers = generate(model, [c.prompt(q) for q in qs], c.eot, n=MAX_ANSWER, temperature=0.7, top_k=40)
    out["probes"] = [{"q": q, "answer": a + b, "a": text(c, s)} for q, (a, b), s in zip(qs, PROBES, answers)]
    for p in out["probes"]:
        print(f"    {p['q']} [{p['answer']}] -> {p['a']!r}", flush=True)
    return out


if __name__ == "__main__":
    runs = sys.argv[1:] or ["grpo"]
    c = chat()
    t0 = time.time()
    print("start (step 11's PPO model):", flush=True)
    base = evaluate(load(START, device).eval(), c)
    for run in runs:
        path = os.path.join(OUT, run, "final.pt")
        print(f"{run}:", flush=True)
        res = evaluate(load(path, device).eval(), c)
        json.dump({"start": base, run: res}, open(os.path.join(OUT, run, "evaluate.json"), "w"), indent=1)
    print(f"DONE in {time.time() - t0:.0f} s")
