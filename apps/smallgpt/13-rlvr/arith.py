"""Step 13: the verifiable task. Addition problems and the checker.

Three levels, by the size of the numbers:

  1   one digit plus one digit        3 + 5        (100 problems in all)
  2   two digits plus one digit       47 + 8       (900)
  3   two digits plus two digits      47 + 38      (8,100)

A problem is written in one of several phrasings, so the model learns the
sum and not one sentence. The last phrasing is never used in training; the
held-out sets use it, with operand pairs training never draws at levels 2
and 3 (level 1 has only 100 problems, so every pair is seen).

The checker is one rule: the first integer in the reply is the answer.
Nothing about the format is in the prompt. If the model echoes the question
("47 + 38 is 85") the first integer is 47 and it is wrong; it has to learn
to lead with the number. That is the whole of RLVR: a reward of 1 or 0 from
a check, and the model finds a way to earn it.
"""

import random
import re

LEVELS = {1: ((0, 9), (0, 9)), 2: ((10, 99), (0, 9)), 3: ((10, 99), (10, 99))}
PHRASINGS = [
    "What is {a} + {b}?",
    "What's {a} plus {b}?",
    "{a} + {b} = ?",
    "Quick one: what do you get when you add {a} and {b}?",
]
TRAIN_PHRASINGS = PHRASINGS[:-1]
HELD_OUT = 200      # operand pairs per level (2 and 3) kept out of training
_INT = re.compile(r"-?\d+")


def pairs(level):
    (a0, a1), (b0, b1) = LEVELS[level]
    return [(a, b) for a in range(a0, a1 + 1) for b in range(b0, b1 + 1)]


def split(level, seed=13):
    """(train pairs, held-out pairs). Level 1 has nothing to hold out."""
    ps = pairs(level)
    if level == 1:
        return ps, ps
    rng = random.Random(seed * 100 + level)
    rng.shuffle(ps)
    return ps[HELD_OUT:], ps[:HELD_OUT]


def problem(a, b, phrasing):
    return {"q": phrasing.format(a=a, b=b), "a": a, "b": b, "answer": a + b}


def train_problem(level, rng):
    a, b = rng.choice(split(level)[0])
    return problem(a, b, rng.choice(TRAIN_PHRASINGS))


def held_out(level, n=100, seed=13):
    """n fixed problems in the unseen phrasing, on unseen pairs where there are any."""
    rng = random.Random(seed * 1000 + level)
    ps = split(level)[1]
    return [problem(a, b, PHRASINGS[-1]) for a, b in rng.sample(ps, min(n, len(ps)))]


def check(reply, answer):
    """1 if the first integer in the reply is the answer, else 0."""
    m = _INT.search(reply)
    return int(m is not None and int(m.group()) == answer)


if __name__ == "__main__":
    rng = random.Random(0)
    for lv in LEVELS:
        tr, ho = split(lv)
        print(f"level {lv}: {len(tr):,} training pairs, {len(ho)} held out; e.g. {train_problem(lv, rng)['q']!r}")
    for r, ans in [("85", 85), ("85. Buy a calculator.", 85), ("47 + 38 is 85", 85), ("It's eighty-five", 85), ("-3", -3)]:
        print(f"  {r!r:32} -> {check(r, ans)}")
