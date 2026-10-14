"""Give the pretrained model a beginning and let it continue. Run after train.py.

  .venv/bin/python 06-pretrain/complete.py "6pm and I just finished Pilates class"
  .venv/bin/python 06-pretrain/complete.py --usenet "Newsgroups: comp.sys.mac\nSubject: ..."
      (the Usenet-only model of step 6b; "\n" in a prompt is a new line)
"""
import os
import sys

import torch

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ROOT, "05-attention"))
sys.path.insert(0, os.path.join(ROOT, "02-tokenizer"))
from bpe import Tokenizer  # noqa: E402
from model import GPT, Config  # noqa: E402

args = sys.argv[1:]
usenet = "--usenet" in args
args = [a.replace("\\n", "\n") for a in args if a != "--usenet"]
if usenet:
    tok = Tokenizer.load(os.path.join(ROOT, "06b-usenet", "tok8192.json"))
    ck = torch.load(os.path.join(ROOT, "out", "usenet", "final.pt"), map_location="cpu")
else:
    tok = Tokenizer.load(os.path.join(ROOT, "02-tokenizer", "tok8192.json"))
    ck = torch.load(os.path.join(ROOT, "out", "pretrain", "final.pt"), map_location="cpu")
cfg = ck["cfg"]
model = GPT(cfg if isinstance(cfg, Config) else Config(**cfg))
model.head.weight = model.tok_emb.weight
model.load_state_dict(ck["model"])
model.eval()

prompts = args or ["Once upon a time, there was a little girl named"]
torch.manual_seed(7)
for p in prompts:
    start = torch.tensor([tok.encode(p)])
    for _ in range(3):
        out = model.sample(start, 40)[0].tolist()
        print(p + "|" + tok.decode(out[start.shape[1]:]).replace("\n", " "))
    print()
