"""Give the trained bigram a beginning and let it continue. Run after train.py.

  .venv/bin/python 04-bigram/complete.py "Once upon a time, there was a"
"""
import os
import sys

import torch

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from train import ROOT, VOCAB, Bigram, tok  # noqa: E402

model = Bigram(VOCAB)
model.load_state_dict(torch.load(os.path.join(ROOT, "out", "bigram.pt"), map_location="cpu"))

prompts = sys.argv[1:] or [
    "Once upon a time, there was a little girl named",
    "My Macintosh crashed again and I think the problem is",
    "Tim and Sue went to the park to",
]
torch.manual_seed(7)
for p in prompts:
    last = tok.encode(p)[-1]            # the bigram only ever sees the last token
    print(p + "|" + tok.decode(model.sample(30, start=last)).replace("\n", " ") + "\n")
