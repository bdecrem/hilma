"""Give the one-block model a beginning and let it continue. Run after train.py.

  .venv/bin/python 05-attention/complete.py "Good morning, fellow Researchers"
"""
import os
import sys

import torch

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(ROOT, "02-tokenizer"))
from bpe import Tokenizer  # noqa: E402
from model import GPT, Config  # noqa: E402

tok = Tokenizer.load(os.path.join(ROOT, "02-tokenizer", "tok8192.json"))
model = GPT(Config())
model.load_state_dict(torch.load(os.path.join(ROOT, "out", "block1.pt"), map_location="cpu"))
model.eval()

prompts = sys.argv[1:] or ["Once upon a time, there was a little girl named"]
torch.manual_seed(7)
for p in prompts:
    start = torch.tensor([tok.encode(p)])
    for _ in range(3):
        out = model.sample(start, 30)[0, start.shape[1]:].tolist()
        print(p + "|" + tok.decode(out).replace("\n", " ") + "\n")
