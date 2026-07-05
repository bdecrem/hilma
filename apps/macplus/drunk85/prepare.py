"""
drunk85 corpus prep: 1980s Usenet mboxes -> cleaned docs -> sentencepiece vocab
-> pretokenized shards in the layout llama2.c's train.py expects.

Usage (from drunk85/):
  .venv/bin/python prepare.py extract      # unzip + parse + clean -> data/corpus.txt
  .venv/bin/python prepare.py vocab        # train sentencepiece -> llama2.c/data/tok512.model
  .venv/bin/python prepare.py pretokenize  # encode docs -> llama2.c/data/tok512/shard*.bin
"""

import glob
import hashlib
import mailbox
import os
import random
import re
import sys
import zipfile

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "data", "raw")
CORPUS = os.path.join(HERE, "data", "corpus.txt")  # docs separated by \x00 lines
LLAMA_DATA = os.path.join(HERE, "llama2.c", "data")
VOCAB_SIZE = 2048

DOC_SEP = "\n<|doc|>\n"  # separator in corpus.txt, never fed to the model

# lines that are attribution/quote/header leakage, not prose
QUOTE_RE = re.compile(r"^\s*[>}|:]")
ATTRIB_RE = re.compile(
    r"(^in article\b|^in <\S+>|\bwrites:\s*$|\bwrote:\s*$|\bwriteth:\s*$|^quoth\b|^from article\b)",
    re.IGNORECASE,
)
HEADER_LEAK_RE = re.compile(
    r"^(Path|From|Newsgroups|Subject|Message-ID|Date|Organization|Lines|References|"
    r"Reply-To|Sender|Followup-To|Distribution|Keywords|Summary|Xref|Article-I\.D\.|"
    r"Posted|Received|Relay-Version|Posting-Version|News-Path|Approved|Expires|Control|Nf-ID|Nf-From): ",
)
BANGPATH_RE = re.compile(r"^\s*(\.\.\.\s*)?\{?[\w.-]+(![\w.-]+){2,}\s*$")  # uucp sig lines


def clean_body(text: str) -> str:
    lines = text.split("\n")
    out = []
    for line in lines:
        s = line.rstrip()
        if s.strip() in ("--", "-- "):  # signature marker: drop the rest
            break
        if QUOTE_RE.match(s):
            continue
        if ATTRIB_RE.search(s):
            continue
        if HEADER_LEAK_RE.match(s):
            continue
        if BANGPATH_RE.match(s):
            continue
        out.append(s)
    body = "\n".join(out)
    body = re.sub(r"\n{3,}", "\n\n", body)
    return body.strip()


def doc_ok(doc: str) -> bool:
    if not (80 <= len(doc) <= 3000):
        return False
    # mostly-ASCII prose check
    nonascii = sum(1 for c in doc if ord(c) > 126)
    if nonascii / len(doc) > 0.02:
        return False
    lines = [l for l in doc.split("\n") if l.strip()]
    if not lines:
        return False
    # drop code/table-heavy posts: too many lines not starting with a letter/quote digit
    weird = sum(1 for l in lines if not re.match(r'^\s*["\'A-Za-z0-9(]', l))
    if weird / len(lines) > 0.3:
        return False
    return True


def extract():
    os.makedirs(os.path.dirname(CORPUS), exist_ok=True)
    seen = set()
    n_posts = 0
    n_kept = 0
    docs_written = 0
    with open(CORPUS, "w", encoding="utf-8") as out:
        for zpath in sorted(glob.glob(os.path.join(RAW, "*.mbox.zip"))):
            group = os.path.basename(zpath).replace(".mbox.zip", "")
            mbox_path = zpath[:-4]  # strip .zip
            if not os.path.exists(mbox_path):
                with zipfile.ZipFile(zpath) as z:
                    names = z.namelist()
                    assert len(names) == 1, names
                    z.extract(names[0], RAW)
                    extracted = os.path.join(RAW, names[0])
                    if extracted != mbox_path:
                        os.rename(extracted, mbox_path)
            mb = mailbox.mbox(mbox_path)
            g_kept = 0
            for msg in mb:
                n_posts += 1
                try:
                    payload = msg.get_payload()
                    if not isinstance(payload, str):
                        continue
                    subject = str(msg.get("Subject", "") or "")
                except Exception:
                    continue
                body = clean_body(payload)
                subject = re.sub(r"^\s*(Re:\s*|re:\s*)+", "", subject).strip()
                subject = re.sub(r"\s+", " ", subject)
                doc = (subject + "\n\n" + body).strip() if subject else body
                if not doc_ok(doc):
                    continue
                h = hashlib.md5(body[:300].encode("utf-8", "ignore")).hexdigest()
                if h in seen:
                    continue
                seen.add(h)
                out.write(doc + DOC_SEP)
                g_kept += 1
                n_kept += 1
            docs_written += g_kept
            print(f"{group}: kept {g_kept}")
    size_mb = os.path.getsize(CORPUS) / 1e6
    print(f"total posts seen {n_posts}, kept {n_kept}, corpus {size_mb:.1f} MB")


def vocab():
    import sentencepiece as spm

    os.makedirs(LLAMA_DATA, exist_ok=True)
    # sample docs into a line-per-doc file for spm (same flags as llama2.c train_vocab)
    tiny = os.path.join(LLAMA_DATA, "tiny.txt")
    with open(CORPUS, encoding="utf-8") as f:
        docs = f.read().split(DOC_SEP)
    random.Random(42).shuffle(docs)
    with open(tiny, "w", encoding="utf-8") as f:
        for d in docs[:60000]:
            f.write(d.strip() + "\n")
    prefix = os.path.join(LLAMA_DATA, f"tok{VOCAB_SIZE}")
    spm.SentencePieceTrainer.train(
        input=tiny,
        model_prefix=prefix,
        model_type="bpe",
        vocab_size=VOCAB_SIZE,
        self_test_sample_size=0,
        input_format="text",
        character_coverage=1.0,
        num_threads=os.cpu_count(),
        split_digits=True,
        allow_whitespace_only_pieces=True,
        byte_fallback=True,
        unk_surface=r" \342\201\207 ",
        normalization_rule_name="identity",
    )
    print(f"trained {prefix}.model")


def pretokenize():
    sys.path.insert(0, os.path.join(HERE, "llama2.c"))
    from tokenizer import Tokenizer

    enc = Tokenizer(os.path.join(LLAMA_DATA, f"tok{VOCAB_SIZE}.model"))
    with open(CORPUS, encoding="utf-8") as f:
        docs = [d.strip() for d in f.read().split(DOC_SEP) if d.strip()]
    random.Random(1337).shuffle(docs)  # mix groups across shards
    all_tokens = []
    for d in docs:
        all_tokens.extend(enc.encode(d, bos=True, eos=False))
    arr = np.array(all_tokens, dtype=np.uint16)
    print(f"{len(docs)} docs -> {arr.size/1e6:.1f}M tokens "
          f"({arr.size/len(docs):.0f} avg/doc)")
    bin_dir = os.path.join(LLAMA_DATA, f"tok{VOCAB_SIZE}")
    os.makedirs(bin_dir, exist_ok=True)
    NSHARDS = 12  # shard 0 becomes val in train.py
    for i, chunk in enumerate(np.array_split(arr, NSHARDS)):
        p = os.path.join(bin_dir, f"shard{i:02d}.bin")
        with open(p, "wb") as f:
            f.write(chunk.tobytes())
    print(f"wrote {NSHARDS} shards to {bin_dir}")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "extract":
        extract()
    elif cmd == "vocab":
        vocab()
    elif cmd == "pretokenize":
        pretokenize()
    else:
        print(__doc__)
        sys.exit(1)
