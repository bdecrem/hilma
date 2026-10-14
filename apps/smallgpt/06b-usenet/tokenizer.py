"""Step 6b, part 3: a tokenizer for Usenet alone.

Step 2's BPE (02-tokenizer/bpe.py), trained the same way on a 4 MB sample of
data/usenet/usenet.txt in slices spread through the whole file, to the same
vocabulary of 8,192. Saved as 06b-usenet/tok8192.json. Then it shows what the
merges turned into tokens and checks that decode(encode(text)) gives the text
back.

Run:  .venv/bin/python 06b-usenet/tokenizer.py       (a few minutes)
"""

import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ROOT, "02-tokenizer"))
from bpe import EOT, Tokenizer  # noqa: E402

CORPUS = os.path.join(ROOT, "data", "usenet", "usenet.txt")
OUT = os.path.join(HERE, "tok8192.json")
VOCAB_SIZE = 8192
MB = 1024 * 1024


def read(path, start, n_bytes):
    with open(path, "rb") as f:
        f.seek(start)
        text = f.read(n_bytes).decode("utf-8", errors="ignore")
    a, b = text.find(EOT), text.rfind(EOT)
    return text[a + len(EOT): b] if 0 <= a < b else text


def sample(path, total, n_slices):
    """The corpus is ordered by group, so take many small slices from all through it."""
    step = os.path.getsize(path) // n_slices
    return EOT.join(read(path, i * step, total // n_slices) for i in range(n_slices))


def log(msg, i=None):
    if i is None or i < 30 or (i + 1) % 500 == 0:
        print(msg, flush=True)


if __name__ == "__main__":
    text = sample(CORPUS, 4 * MB, 64)
    print(f"training on {len(text) / MB:.1f} MB (64 slices from all through the corpus) to a vocabulary of {VOCAB_SIZE}\n")
    t0 = time.time()
    tok = Tokenizer()
    tok.train(text, VOCAB_SIZE, log=log)
    tok.save(OUT)
    print(f"\ntrained in {time.time() - t0:.0f} s, saved {OUT}")

    print("\nthe last 20 merges:")
    for (a, b), c in list(tok.merges.items())[-20:]:
        print(f"  {tok.vocab[c]!r}")

    words = [" Macintosh", " Mac", " Apple", " unix", " Usenet", " modem", " disk", " kernel", " compiler",
             " floppy", " baud", " VAX", " PDP", " Reagan", " flame", " netiquette", " king", " queen", " man", " woman"]
    print("\nwords as tokens:")
    for w in words:
        print(f"  {w!r:14} {'|'.join(tok.pieces(w))}")

    examples = [
        "Newsgroups: comp.sys.mac\nSubject: Re: Mac Plus won't boot\n\nI just got my 512K Mac upgraded and the new System file won't boot.",
        "Once upon a time, there was a little girl named Lily who loved to play outside.",
    ]
    print("\nsentences as tokens:")
    for s in examples:
        ids = tok.encode(s)
        assert tok.decode(ids) == s
        print(f"  {len(s)} characters -> {len(ids)} tokens")
        print("  " + "|".join(tok.pieces(s)).replace("\n", "\\n"))
    print("  decode(encode(s)) == s for both.")
