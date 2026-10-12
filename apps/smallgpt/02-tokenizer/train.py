"""Step 2b: train the tokenizer and look at what it learned.

Trains on a sample of the corpus (3 MB of TinyStories + 1 MB of Usenet — the
3:1 mix of the whole corpus, in slices spread through both files; BPE learns
from what is frequent, and 4 MB has plenty of everything frequent), prints
the merges as they happen, saves the result as tok8192.json, then:

  - shows a few words as token pieces at vocabulary 4096 and 8192
  - shows a story sentence and a Usenet sentence as token pieces, and that
    decode(encode(text)) gives the text back
  - counts the tokens of a 1 MB slice at vocabulary sizes 512 ... 8192
    (same training, stopped earlier) and extrapolates to the whole corpus

Run:  .venv/bin/python 02-tokenizer/train.py          (about three minutes)
"""

import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bpe import EOT, Tokenizer  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(os.path.dirname(HERE), "data")
VOCAB_SIZE = 8192  # trained to 8192; a 4096 tokenizer is the same merges stopped early (Tokenizer.truncated)
OUT = os.path.join(HERE, f"tok{VOCAB_SIZE}.json")


def read(path, start, n_bytes):
    with open(path, "rb") as f:
        f.seek(start)
        text = f.read(n_bytes).decode("utf-8", errors="ignore")
    # trim to whole documents
    a, b = text.find(EOT), text.rfind(EOT)
    return text[a + len(EOT): b] if 0 <= a < b else text


def sample(path, total, n_slices):
    """`total` bytes from `path`, as `n_slices` slices spread evenly through the file.
    The Usenet file is ordered by newsgroup (net.bizarre first, net.micro.mac far in),
    so reading the first megabyte would see no Mac talk at all."""
    size = os.path.getsize(path)
    step = size // n_slices
    return EOT.join(read(path, i * step, total // n_slices) for i in range(n_slices))


tiny_path = os.path.join(DATA, "tinystories.txt")
use_path = os.path.join(DATA, "usenet.txt")
MB = 1024 * 1024

# --- train -------------------------------------------------------------------
sample_text = sample(tiny_path, 3 * MB, 12) + EOT + sample(use_path, 1 * MB, 16)
print(f"training on {len(sample_text) / MB:.1f} MB (3 MB stories + 1 MB usenet, slices from all through both files) to a vocabulary of {VOCAB_SIZE}\n")


def log(msg, i=None):
    # the first 30 merges, then every 250th: the arc from " t" to " computer"
    if i is None or i < 30 or (i + 1) % 250 == 0:
        print(msg, flush=True)


t0 = time.time()
tok = Tokenizer()
tok.train(sample_text, VOCAB_SIZE, log=log)
tok.save(OUT)
print(f"\ntrained in {time.time() - t0:.0f} s, saved {OUT}")

# --- look at it ---------------------------------------------------------------
print("\nthe last 20 merges (the rarest things that still earned a token):")
for (a, b), c in list(tok.merges.items())[-20:]:
    print(f"  {tok.vocab[c]!r}")

WORDS = [" king", " queen", " man", " woman", " princess", " dragon", " computer", " Macintosh", " Apple", " program", " unix", " Usenet", " modem", " disk"]
print("\nwords as tokens, at two vocabulary sizes (the same merges, stopped earlier for the smaller one):")
print(f"  {'':14} {'vocab 4096':28} {'vocab ' + str(VOCAB_SIZE)}")
t4096 = tok.truncated(4096)
for word in WORDS:
    print(f"  {word!r:14} {'|'.join(t4096.pieces(word)):28} {'|'.join(tok.pieces(word))}")

examples = [
    "Once upon a time, there was a little girl named Lily who loved to play outside.",
    "I just got my 512K Mac upgraded and the new System file won't boot from the external drive.",
]
print("\nsentences as tokens:")
for s in examples:
    ids = tok.encode(s)
    assert tok.decode(ids) == s, "decode(encode(s)) must give s back"
    print(f"  {len(s)} characters -> {len(ids)} tokens")
    print("  " + "|".join(tok.pieces(s)))
print("  decode(encode(s)) == s for both.")

# --- how much does the vocabulary size buy? ---------------------------------
slice_ = read(tiny_path, 100 * MB + 12345, int(0.75 * MB)) + EOT + read(use_path, 40 * MB + 12345, int(0.25 * MB))
print(f"\ntokens in a 1 MB slice of the corpus (3:1 mix), by vocabulary size:")
sizes = [512, 1024, 2048, 4096, 8192]
counts = {}
for size in [s for s in sizes if s <= VOCAB_SIZE]:
    counts[size] = len(tok.truncated(size).encode(slice_))
    print(f"  vocab {size:5d}: {counts[size]:>9,} tokens   {len(slice_) / counts[size]:.2f} characters per token")

total_bytes = os.path.getsize(tiny_path) + os.path.getsize(use_path)
for size, n in counts.items():
    if size >= 4096:
        est = total_bytes / len(slice_.encode()) * n
        print(f"whole corpus: {total_bytes / MB:.0f} MB -> about {est / 1e6:.0f} million tokens at vocab {size} (extrapolated from the slice)")
