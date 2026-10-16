"""Step 9, part 3: the same question to the base model and the SFT model.

The base model gets the question as plain text and continues it; it has
never seen <|user|> or <|assistant|>. The SFT model gets the conversation
format and writes until it says <|endoftext|>. Same seed, same sampling
(temperature 0.7, top 40) for both.

Run:  .venv/bin/python 09-sft/ask.py                    (held-out questions + a few new ones)
      .venv/bin/python 09-sft/ask.py "What is a SIMM?"  (your own)
Writes 09-sft/compare.txt when run without questions.
"""

import json
import os
import sys

import torch
import torch.nn.functional as F

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(ROOT, "02-tokenizer"))
from bpe import Tokenizer  # noqa: E402
from sft import BASE, DATA, OUT, TOK, Chat, answer, load_sft, split  # noqa: E402

# Questions that are not in the dataset at all, about things the model read about in its Usenet years.
NEW = [
    "What is the difference between a Mac Plus and a Mac SE?",
    "How do I get my modem to dial a BBS?",
    "Is an Amiga better than an Atari ST for music?",
    "What does the Unix command grep do?",
]


@torch.no_grad()
def continue_text(model, tok, text, n=60, temperature=0.7, top_k=40):
    idx = torch.tensor([tok.encode(text)])
    out = []
    eot = tok.special["<|endoftext|>"]
    for _ in range(n):
        logits = model(idx[:, -model.cfg.block:])[:, -1, :] / temperature
        v, _ = torch.topk(logits, top_k)
        logits[logits < v[:, [-1]]] = -float("inf")
        nxt = torch.multinomial(F.softmax(logits, dim=-1), 1)
        if nxt.item() == eot:
            break
        out.append(nxt.item())
        idx = torch.cat([idx, nxt], dim=1)
    return tok.decode(out).strip()


if __name__ == "__main__":
    tok = Tokenizer.load(TOK)
    chat = Chat(tok)
    base, sft = load_sft(BASE), load_sft(os.path.join(OUT, "final.pt"))
    mine = sys.argv[1:]
    if mine:
        qs = mine
    else:
        _, val = split([json.loads(l) for l in open(DATA)])
        qs = [r["q"] for r in val[:8]] + NEW
    lines = []
    for i, q in enumerate(qs):
        torch.manual_seed(7)
        b = continue_text(base, tok, q + "\n").replace("\n", " / ")
        torch.manual_seed(7)
        s = answer(sft, chat, q)
        lines += [f"Q: {q}", f"  base: {b}", f"  sft:  {s}", ""]
    text = "\n".join(lines)
    print(text)
    if not mine:
        with open(os.path.join(HERE, "compare.txt"), "w") as f:
            f.write(text)
