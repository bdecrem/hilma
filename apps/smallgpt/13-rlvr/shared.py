"""Step 13 shares step 11's pieces: the batched generator with its KV cache, the
chat format, padding, the model loader. Import them from there."""

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ROOT, "11-rlhf"))
sys.path.insert(0, HERE)
from common import SFT, chat, device, generate, load, pad, text  # noqa: E402,F401
from arith import LEVELS, check, held_out, train_problem  # noqa: E402,F401

OUT = os.environ.get("RLVR_OUT", os.path.join(ROOT, "out", "rlvr"))
START = os.path.join(ROOT, "out", "rlhf", "ppo", "final.pt")   # step 11's PPO model (leash 0.2): the plan's starting point
MAX_ANSWER = 48   # tokens: room for a sum and a grumble, not an essay


def accuracy(model, c, problems, group=1, temperature=1.0, top_k=None, batch=256):
    """Each problem answered `group` times; returns (fraction of answers right, fraction of problems with any right, the replies)."""
    prompts = [c.prompt(p["q"]) for p in problems for _ in range(group)]
    answers = [p["answer"] for p in problems for _ in range(group)]
    replies = []
    for s in range(0, len(prompts), batch):
        import torch
        torch.manual_seed(13 + s)
        replies += [text(c, a) for a in generate(model, prompts[s:s + batch], c.eot, n=MAX_ANSWER, temperature=temperature, top_k=top_k)]
    hits = [check(r, a) for r, a in zip(replies, answers)]
    any_hit = [max(hits[i:i + group]) for i in range(0, len(hits), group)]
    return sum(hits) / len(hits), sum(any_hit) / len(any_hit), replies
