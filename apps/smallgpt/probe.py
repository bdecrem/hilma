"""The same five prompts, run against any checkpoint, so every later step
(SFT, DPO, RL) can be read side by side with the base model.

Each prompt gets three continuations of 40 tokens. The seed is reset before
each prompt, so a prompt's lines don't depend on the others; a model that
hasn't changed gives the same lines every time. The result is printed and
written to out/probe/<checkpoint name>.txt.

Run:  .venv/bin/python probe.py                         (the Usenet base model)
      .venv/bin/python probe.py out/sft/final.pt        (any later checkpoint)
"""

import os
import sys

import torch

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "05-attention"))
sys.path.insert(0, os.path.join(HERE, "02-tokenizer"))
from bpe import Tokenizer  # noqa: E402
from model import GPT, Config  # noqa: E402

TOK = os.path.join(HERE, "06b-usenet", "tok8192.json")
BASE = os.path.join(HERE, "out", "usenet", "final.pt")
PROMPTS = [
    "Newsgroups: comp.sys.mac\nSubject: Mac Plus won't boot\n\n",
    "Newsgroups: misc.forsale\nSubject: FOR SALE: Apple IIe\n\n",
    "I just got back from the computer store and",
    "Does anyone know how to",
    "Hey guys I am so upset at the election. President",
]
SAMPLES, TOKENS, SEED = 3, 40, 7


def load(path):
    ck = torch.load(path, map_location="cpu")
    cfg = ck["cfg"]
    model = GPT(cfg if isinstance(cfg, Config) else Config(**cfg))
    model.head.weight = model.tok_emb.weight
    model.load_state_dict(ck["model"])
    return model.eval()


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else BASE
    tok, model = Tokenizer.load(TOK), load(path)
    eot = "<|endoftext|>"
    lines = [f"probe of {os.path.relpath(path, HERE)}", ""]
    for p in PROMPTS:
        torch.manual_seed(SEED)
        start = torch.tensor([tok.encode(p)])
        lines.append(p.strip().replace("\n", " / ") + " |")
        for _ in range(SAMPLES):
            out = tok.decode(model.sample(start, TOKENS)[0, start.shape[1]:].tolist())
            lines.append("    " + out.split(eot)[0].replace("\n", " ").strip())
        lines.append("")
    text = "\n".join(lines)
    print(text)
    name = os.path.splitext(os.path.relpath(path, os.path.join(HERE, "out")))[0].replace(os.sep, "-")
    os.makedirs(os.path.join(HERE, "out", "probe"), exist_ok=True)
    with open(os.path.join(HERE, "out", "probe", name + ".txt"), "w") as f:
        f.write(text)
