"""Step 13: the 10M and the 92M model side by side.

  base  the two pretrained models continue the same three post openings
  sft   the two cranky hackers answer the five questions of the step 11
        example pairs (questions neither saw in training)

Writes 13-scale/compare.txt.

Run:  .venv/bin/python 13-scale/compare.py
"""

import os
import sys

import torch

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(ROOT, "09-sft"))
sys.path.insert(0, os.path.join(ROOT, "02-tokenizer"))
from bpe import Tokenizer  # noqa: E402
from model import load  # noqa: E402
from sft import TOK, Chat, answer  # noqa: E402

device = "mps" if torch.backends.mps.is_available() else "cpu"
OUT = lambda *p: os.path.join(ROOT, "out", *p)  # noqa: E731
BASES = {"10M": OUT("usenet", "final.pt"), "92M": OUT("scale", "best.pt")}
SFTS = {"10M": OUT("sft-usenet", "final.pt"), "92M": OUT("sft-usenet-big", "final.pt")}
OPENINGS = [
    "Newsgroups: comp.sys.mac\nSubject: Mac Plus won't boot\n\n",
    "Newsgroups: rec.bicycles\nSubject: Best lock for a commuter bike?\n\n",
    "My Macintosh crashed again and I think the problem is",
]
QUESTIONS = [
    "Is the Korn shell available for Xenix on the 386?",
    "In NetHack, should I eat as much as I can, or wait until I'm Weak to save food?",
    "I want a computer for MIDI and music software. Should I get a Mac II, a Mac SE, or an IBM?",
    "I hit a railway track on my new bike and now there's a bump on the rear rim that makes the brakes grab. Can I fix it?",
    "At Disney-MGM Studios, do the animators work on weekends?",
]

if __name__ == "__main__":
    tok = Tokenizer.load(TOK)
    chat = Chat(tok)
    lines = []
    say = lambda s="": (print(s, flush=True), lines.append(s))  # noqa: E731
    say("== base models: the same opening, continued (temperature 0.8, top-k 40)")
    for name, path in BASES.items():
        m = load(path, device).eval()
        torch.manual_seed(13)
        say(f"\n-- {name}")
        for p in OPENINGS:
            ids = m.sample(torch.tensor([tok.encode(p)], device=device), 70, temperature=0.8, top_k=40)[0].tolist()
            say("  " + p.replace("\n", " | ") + " >> " + tok.decode(ids[len(tok.encode(p)):]).replace("\n", " "))
    say("\n== the cranky hackers: questions neither model trained on (temperature 0.7, top-k 40, two tries each)")
    models = {n: load(p, device).eval() for n, p in SFTS.items()}
    torch.manual_seed(13)
    for q in QUESTIONS:
        say(f"\nQ: {q}")
        for n, m in models.items():
            for k in range(2):
                say(f"  {n}: {answer(m, chat, q)}")
    open(os.path.join(HERE, "compare.txt"), "w").write("\n".join(lines) + "\n")
