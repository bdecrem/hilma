"""Step 11d: did it get better? Claude judges the SFT model against the RLHF one.

The 200 held-out questions (never answered during 11a, never seen by PPO).
Each model answers each once at the chat page's settings (temperature 0.7,
top-k 40). Claude sees the question, the real replies, and the two answers in
a random order as A and B, with the same rules as 11a, and picks A, B or tie.
The reward model scores the same answers, which shows whether what it liked
is what Claude likes.

  answers   (on the mini)  .venv/bin/python 11-rlhf/winrate.py answers ppo ppo-noleash
  judge     (with claude)  .venv/bin/python 11-rlhf/winrate.py judge ppo ppo-noleash

Writes 11-rlhf/data/eval-<name>.jsonl and 11-rlhf/winrate.txt.
"""

import os
import random
import sys
from concurrent.futures import ThreadPoolExecutor

import torch

from common import HERE, OUT, SFT, Scorer, chat, claude, device, generate, load, pad, rows, text, with_eot, write
from judge import RULES

HELD_OUT = 200
PER_CALL = 10

PROMPT = """You are comparing answers written by two small language models that play a cranky old-school hacker answering questions on Usenet around 1985-1993. For each question you get the real replies it got back then, then answer A and answer B.

{rules}

For each question, say which answer is better by those rules: "A", "B", or "tie" when they are equally good or equally useless.

{items}"""

SCHEMA = {
    "type": "object",
    "properties": {"items": {"type": "array", "items": {"type": "object", "properties": {
        "n": {"type": "integer"}, "better": {"type": "string", "enum": ["A", "B", "tie"]}},
        "required": ["n", "better"]}}},
    "required": ["items"],
}


def path_of(name):
    return SFT if name == "sft" else os.path.join(OUT, name, "final.pt")


def answers(names):
    c = chat()
    qs = rows("questions.jsonl")[:HELD_OUT]
    rm = Scorer.load(os.path.join(OUT, "reward.pt")).eval()
    for name in ["sft"] + names:
        model = load(path_of(name), device).eval()
        torch.manual_seed(7)
        got = []
        for s in range(0, HELD_OUT, 50):
            got += generate(model, [c.prompt(r["q"]) for r in qs[s:s + 50]], c.eot, temperature=0.7, top_k=40)
        with torch.no_grad():
            x, n = pad([c.prompt(r["q"]) + with_eot(c, a) for r, a in zip(qs, got)], c.eot)
            sc = []
            for s in range(0, HELD_OUT, 25):
                sc += rm(x[s:s + 25])[torch.arange(min(25, HELD_OUT - s), device=device), n[s:s + 25] - 1].tolist()
        sc = [(v - rm.extra["mu"]) / rm.extra["sd"] for v in sc]
        write(f"eval-{name}.jsonl", [{"i": k, "q": r["q"], "a": text(c, a), "ids": a, "rm": round(v, 3)} for k, (r, a, v) in enumerate(zip(qs, got, sc))])
        print(f"{name}: reward model {sum(sc) / len(sc):+.3f}, {sum(map(len, got)) / len(got):.1f} tokens", flush=True)


def judge_pair(name):
    qs = rows("questions.jsonl")[:HELD_OUT]
    base, new = rows("eval-sft.jsonl"), rows(f"eval-{name}.jsonl")
    rng = random.Random(13)
    flips = [rng.random() < 0.5 for _ in range(HELD_OUT)]

    def call(s):
        blocks = []
        for n, k in enumerate(range(s, min(s + PER_CALL, HELD_OUT)), 1):
            a, b = (new[k]["a"], base[k]["a"]) if flips[k] else (base[k]["a"], new[k]["a"])
            replies = "".join(f"--- real reply {j + 1}:\n{x[:700]}\n" for j, x in enumerate(qs[k]["replies"]))
            blocks.append(f"=== {n}. Question: {qs[k]['q']}\n{replies}--- answer A: {a or '(empty)'}\n--- answer B: {b or '(empty)'}\n")
        got = claude(PROMPT.format(rules=RULES, items="\n".join(blocks)), SCHEMA)
        out = {}
        for x in (got or {}).get("items", []):
            k = s + x["n"] - 1
            if s <= k < min(s + PER_CALL, HELD_OUT):
                out[k] = "tie" if x["better"] == "tie" else ("new" if (x["better"] == "A") == flips[k] else "sft")
        return out

    verdicts = {}
    with ThreadPoolExecutor(8) as pool:
        for v in pool.map(call, range(0, HELD_OUT, PER_CALL)):
            verdicts.update(v)
    wins = sum(v == "new" for v in verdicts.values())
    losses = sum(v == "sft" for v in verdicts.values())
    ties = sum(v == "tie" for v in verdicts.values())
    rate = (wins + ties / 2) / len(verdicts)
    rm_new = sum(r["rm"] for r in new) / len(new)
    rm_base = sum(r["rm"] for r in base) / len(base)
    len_new = sum(len(r["ids"]) for r in new) / len(new)
    len_base = sum(len(r["ids"]) for r in base) / len(base)
    write(f"verdicts-{name}.jsonl", [{"i": k, "q": qs[k]["q"], "sft": base[k]["a"], name: new[k]["a"], "better": verdicts[k]} for k in sorted(verdicts)])
    return (f"{name} vs sft on {len(verdicts)} held-out questions, judged blind by Claude: "
            f"{wins} wins, {losses} losses, {ties} ties -> win rate {100 * rate:.0f}%\n"
            f"  reward model: {name} {rm_new:+.2f}, sft {rm_base:+.2f}; answer length {len_new:.0f} vs {len_base:.0f} tokens")


if __name__ == "__main__":
    what, names = sys.argv[1], sys.argv[2:]
    if what == "answers":
        answers(names)
    else:
        lines = [judge_pair(n) for n in names]
        print("\n".join(lines))
        open(os.path.join(HERE, "winrate.txt"), "w").write("\n".join(lines) + "\n")
