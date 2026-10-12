"""Step 2a: assemble the corpus.

Two piles, kept as two files in data/ (gitignored):

  data/tinystories.txt  the first ~300 MB of TinyStories V2 (GPT-4-written
                        children's stories, Microsoft Research 2023, CDLA-Sharing-1.0),
                        fetched with an HTTP range request so we never download the 2.2 GB.
  data/usenet.txt       the Oracle's cleaned 1980s Usenet corpus from the Mac Plus
                        project (apps/macplus/drunk85/data/corpus.txt, 80 MB):
                        net.micro.mac, net.micro.68k, net.unix-wizards, net.flame, net.jokes ...

Both use <|endoftext|> between documents, the GPT-2 convention.

Run:  .venv/bin/python 02-tokenizer/fetch_corpus.py
"""

import os
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "data")
os.makedirs(DATA, exist_ok=True)

EOT = "<|endoftext|>"

TINY_URL = "https://huggingface.co/datasets/roneneldan/TinyStories/resolve/main/TinyStoriesV2-GPT4-train.txt"
TINY_BYTES = 300 * 1024 * 1024
TINY_OUT = os.path.join(DATA, "tinystories.txt")

USENET_SRC = os.path.join(ROOT, "..", "macplus", "drunk85", "data", "corpus.txt")
USENET_OUT = os.path.join(DATA, "usenet.txt")


def fetch_tinystories():
    if os.path.exists(TINY_OUT):
        print(f"have {TINY_OUT} ({os.path.getsize(TINY_OUT) / 1e6:.0f} MB)")
        return
    print(f"fetching the first {TINY_BYTES / 1e6:.0f} MB of TinyStories ...")
    req = urllib.request.Request(TINY_URL, headers={"Range": f"bytes=0-{TINY_BYTES - 1}"})
    with urllib.request.urlopen(req) as r:
        raw = r.read()
    text = raw.decode("utf-8", errors="ignore")
    # the slice ends mid-story: cut back to the last complete one
    text = text[: text.rfind(EOT) + len(EOT)]
    with open(TINY_OUT, "w") as f:
        f.write(text)
    print(f"wrote {TINY_OUT}: {len(text) / 1e6:.0f} MB, {text.count(EOT):,} stories")


def convert_usenet():
    if os.path.exists(USENET_OUT):
        print(f"have {USENET_OUT} ({os.path.getsize(USENET_OUT) / 1e6:.0f} MB)")
        return
    with open(USENET_SRC) as f:
        text = f.read()
    text = text.replace("<|doc|>", EOT)
    with open(USENET_OUT, "w") as f:
        f.write(text)
    print(f"wrote {USENET_OUT}: {len(text) / 1e6:.0f} MB, {text.count(EOT):,} posts")


if __name__ == "__main__":
    fetch_tinystories()
    convert_usenet()
