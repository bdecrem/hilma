"""Step 13a: can the cranky hacker add at all, before any training?

GRPO learns only from groups with both right and wrong answers in them. A
model that is right 0% of the time gives all-zero groups and never moves, so
the starting rate decides the curriculum. For each level: 100 held-out
problems, 8 sampled answers each at temperature 1 (what GRPO samples), plus
one greedy answer.

  accuracy   fraction of the 800 sampled answers that are right
  pass@8     fraction of problems with at least one right answer among the 8,
             which is the fraction of groups GRPO could learn from

Writes out/rlvr/probe.json. Run: .venv/bin/python 13-rlvr/probe.py [checkpoint]
"""

import json
import os
import sys
import time

from shared import LEVELS, OUT, SFT, accuracy, chat, device, held_out, load

if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else SFT
    os.makedirs(OUT, exist_ok=True)
    c = chat()
    model = load(path, device).eval()
    print(f"device {device}; {path}", flush=True)
    t0 = time.time()
    out = {}
    for lv in LEVELS:
        probs = held_out(lv)
        acc, p8, replies = accuracy(model, c, probs, group=8)
        greedy, _, greplies = accuracy(model, c, probs, group=1, top_k=1)
        out[lv] = {"accuracy": acc, "pass@8": p8, "greedy": greedy,
                   "samples": [{"q": p["q"], "answer": p["answer"], "greedy": g, "sampled": replies[i * 8:i * 8 + 3]}
                               for i, (p, g) in enumerate(zip(probs[:6], greplies[:6]))]}
        print(f"level {lv}: accuracy {100 * acc:5.1f}%   pass@8 {100 * p8:5.1f}%   greedy {100 * greedy:5.1f}%   ({time.time() - t0:.0f} s)", flush=True)
        for s in out[lv]["samples"][:4]:
            print(f"    {s['q']}  [{s['answer']}]\n      greedy: {s['greedy']!r}\n      sampled: {s['sampled']!r}", flush=True)
    json.dump(out, open(os.path.join(OUT, "probe.json"), "w"), indent=1)
    print(f"DONE in {time.time() - t0:.0f} s -> {OUT}/probe.json")
