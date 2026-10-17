"""Step 11a, part 3: Claude judges the four answers to each question (RLAIF).

Ten questions per call. For each, Claude sees the question, the real replies it
got on Usenet, and the model's four answers in a shuffled order labelled A-D,
and scores each 1-10 against written rules. Any two answers whose scores
differ make a pair (better, worse); equal scores make none, because a forced
order between two equally bad answers is noise the reward model would learn.

Writes 11-rlhf/data/judged.jsonl: {i, q, ids: [4], scores: [4]} (scores in ids order).

Run (on a machine with the `claude` CLI):  .venv/bin/python 11-rlhf/judge.py
"""

import random
from concurrent.futures import ThreadPoolExecutor, as_completed

from common import chat, claude, rows, text, write

PER_CALL = 10

RULES = """Score each answer from 1 (worst) to 10 (best) by these rules, in this order of weight:
1. It answers the question that was asked: on topic, a real answer, not a dodge or a different question.
2. It is right, as far as the real replies tell: it agrees with them and does not invent wrong specifics (versions, names, numbers, dates). An answer that is confidently wrong scores below one that is vague.
3. It says it once and stops: no repeated sentences or phrases, no going in circles, no contradicting itself ("it's free... it's not free").
4. It sounds like a cranky old hacker on 1980s Usenet: terse, grumpy, superior, but it still answers.
Longer is not better. Most answers are from a small model and will be poor: use the whole scale, so a 6 means clearly better than a 3."""

PROMPT = """You are judging answers written by a small language model that plays a cranky old-school hacker answering questions on Usenet around 1985-1993. For each question you get the real replies it got back then, then the model's answers A, B, C, D.

{rules}

Give one item per question with its number n and the four scores in the order A, B, C, D.

{items}"""

SCHEMA = {
    "type": "object",
    "properties": {"items": {"type": "array", "items": {"type": "object", "properties": {
        "n": {"type": "integer"},
        "scores": {"type": "array", "items": {"type": "integer"}, "minItems": 4, "maxItems": 4}},
        "required": ["n", "scores"]}}},
    "required": ["items"],
}


def judge(batch, c, qs):
    blocks, orders = [], []
    for n, r in enumerate(batch, 1):
        order = list(range(4))
        random.Random(r["i"]).shuffle(order)
        orders.append(order)
        replies = "".join(f"--- real reply {j + 1}:\n{x[:700]}\n" for j, x in enumerate(qs[r["i"]]["replies"]))
        answers = "".join(f"[{'ABCD'[k]}] {text(c, r['ids'][o]) or '(empty)'}\n" for k, o in enumerate(order))
        blocks.append(f"=== {n}. Question: {r['q']}\n{replies}--- the model's answers:\n{answers}")
    got = claude(PROMPT.format(rules=RULES, items="\n".join(blocks)), SCHEMA)
    out = []
    for x in (got or {}).get("items", []):
        if 1 <= x["n"] <= len(batch) and len(x["scores"]) == 4:
            r, order = batch[x["n"] - 1], orders[x["n"] - 1]
            scores = [0] * 4
            for k, o in enumerate(order):
                scores[o] = max(1, min(10, x["scores"][k]))
            out.append({**r, "scores": scores})
    return out


if __name__ == "__main__":
    c = chat()
    qs = rows("questions.jsonl")
    ans = rows("answers.jsonl")
    batches = [ans[s:s + PER_CALL] for s in range(0, len(ans), PER_CALL)]
    judged, done = [], 0
    with ThreadPoolExecutor(8) as pool:
        for fut in as_completed([pool.submit(judge, b, c, qs) for b in batches]):
            judged += fut.result()
            done += 1
            if done % 10 == 0 or done == len(batches):
                print(f"{done:4d}/{len(batches)}  {len(judged)} judged", flush=True)
    judged.sort(key=lambda r: r["i"])
    write("judged.jsonl", judged)
    pairs = sum(1 for r in judged for a in range(4) for b in range(a + 1, 4) if r["scores"][a] != r["scores"][b])
    print(f"wrote {len(judged)} judged sets, {pairs} pairs")
