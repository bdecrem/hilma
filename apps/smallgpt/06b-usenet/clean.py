"""Step 6b, part 2: the raw 1981-1991 posts -> data/usenet/usenet.txt, one
cleaned post per document, documents separated by <|endoftext|>.

What comes out of a post, and why:
  - quoted lines (">", "|", "}", ":" at the start) and the "In article <...>
    so-and-so writes:" line before them: someone else's words, already in the
    corpus once as their own post
  - the signature: everything after a "-- " line, and a short last paragraph
    full of addresses, bang paths, phone numbers or ASCII boxes
  - header lines that leaked into the body, uucp bang-path lines, the
    "#R:site:..." and "/* Written ... */" lines of the old notesfiles software
  - whole posts that are a uuencoded binary, a shell archive, a source
    listing, a uucp map or a test; whole groups made of those
    (comp.sources.*, *.binaries, comp.mail.maps, *.test, control)
  - crossposts (the same Message-ID in several groups) and reposts (the same
    opening 300 characters), kept once
  - posts under 100 or over 6,000 characters after cleaning, posts that are
    more than 2% non-ASCII, posts where more than a quarter of the lines look
    like code or tables

Each document starts with the group and subject, so later a prompt like
"Newsgroups: comp.sys.mac / Subject: ..." tells the model where it is:

    Newsgroups: comp.sys.mac
    Subject: StartupScreen size

    How do I get the StartupScreen [created in SuperPaint] to fill the ...

Run:  .venv/bin/python 06b-usenet/clean.py        (a few minutes, all cores)
"""

import glob
import gzip
import hashlib
import json
import os
import re
import time
from collections import Counter
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
RAW = os.path.join(ROOT, "data", "usenet", "raw")
OUT = os.path.join(ROOT, "data", "usenet", "usenet.txt")
EOT = "<|endoftext|>"
MIN_CHARS, MAX_CHARS = 100, 6000

SKIP_GROUP = re.compile(r"(^|\.)(sources|binaries|test|tests|maps|pictures|bitmaps|digests?)(\.|$)|^control$|^junk$|^to\.")

QUOTE = re.compile(r"^\s*([>|}]|:(?!-?\)))")
ATTRIB = re.compile(r"(^\s*in article\b|^\s*in <\S+>|\bwrites:\s*$|\bwrote:\s*$|\bsays:\s*$|^\s*quoth\b|^\s*from article\b|^\s*>?\s*from: )", re.I)
HEADER_LEAK = re.compile(
    r"^(Path|From|Newsgroups|Subject|Message-ID|Date|Organization|Lines|References|Reply-To|Sender|"
    r"Followup-To|Distribution|Keywords|Summary|Xref|Article-I\.D\.|Posted|Received|Relay-Version|"
    r"Posting-Version|News-Path|Approved|Expires|Control|Nf-ID|Nf-From|Date-Received|To|Cc|Status|"
    r"Return-Path|Mail-From|X-[\w-]+): ", re.I)
NOTESFILE = re.compile(r"^#[RN]:\S+:\d+|^\s*[\w.-]+![\w.-]+\s+\w{3}\s+\d+\s+\d\d:\d\d(:\d\d)?\s+\d{4}\s*$|^\s*/\* (Written|-{5,}) .*\*/\s*$")
BANGPATH = re.compile(r"^\s*(\.\.\.\s*)?[{(]?[\w.-]+(![\w.{},-]+){2,}[)}]?\s*$")
ADDRESSY = re.compile(r"[\w.-]+@[\w.-]+|\w+!\w+|\b(UUCP|ARPA|BITNET|CSNET|Internet|uucp|arpa|bitnet|csnet|ihnp4|decvax|ucbvax|seismo)\b|\(\d{3}\)\s*\d{3}-\d{4}|\d{3}-\d{3}-\d{4}")
BOXY = re.compile(r"^[\s|+*=_#~-]{3,}$|^\s*[|*#].*[|*#]\s*$")
UUENCODE = re.compile(r"^M[\x20-\x60]{59,61}$")
CODE_LINE = re.compile(r"[;{}]\s*$|^\s*(#include|#define|int |char |void |struct |if ?\(|for ?\(|while ?\(|return\b|else\b|\w+\s*=\s*[^=])")


def strip_signature(lines):
    for i, l in enumerate(lines):
        if l.strip() in ("--", "-- ", "---", "----") or l.startswith("-- "):
            if i >= len(lines) - 15:
                return lines[:i]
    # no marker: drop a short last paragraph that is mostly addresses / boxes
    for _ in range(2):
        while lines and not lines[-1].strip():
            lines = lines[:-1]
        try:
            cut = len(lines) - 1 - lines[::-1].index("")
        except ValueError:
            return lines
        tail = [l for l in lines[cut + 1:] if l.strip()]
        if 0 < len(tail) <= 6:
            hits = sum(1 for l in tail if ADDRESSY.search(l) or BOXY.match(l) or len(l.strip()) < 25)
            if hits / len(tail) >= 0.6 and any(ADDRESSY.search(l) or BOXY.match(l) for l in tail):
                lines = lines[:cut]
                continue
        return lines
    return lines


def clean_body(text):
    lines = text.replace("\r", "").split("\n")
    if sum(1 for l in lines if UUENCODE.match(l)) > 5 or any(l.startswith(("begin 644", "begin 666", "#!/bin/sh", "# This is a shell archive")) for l in lines):
        return None
    out = []
    for l in lines:
        s = l.rstrip()
        if QUOTE.match(s) or ATTRIB.search(s) or HEADER_LEAK.match(s) or BANGPATH.match(s) or NOTESFILE.match(s):
            continue
        out.append(s)
    out = strip_signature(out)
    body = "\n".join(out)
    body = re.sub(r"\n{3,}", "\n\n", body).strip()
    return body


def doc_ok(body):
    if not MIN_CHARS <= len(body) <= MAX_CHARS:
        return "length"
    if sum(1 for c in body if ord(c) > 126) / len(body) > 0.02:
        return "non-ascii"
    lines = [l for l in body.split("\n") if l.strip()]
    weird = sum(1 for l in lines if CODE_LINE.search(l) or not re.match(r'^\s*["\'A-Za-z0-9(]', l))
    if weird / len(lines) > 0.25:
        return "code/table"
    return None


def clean_file(path):
    group_file = os.path.basename(path)[: -len(".jsonl.gz")]
    docs, why = [], Counter()
    with gzip.open(path, "rt", encoding="utf-8") as f:
        for line in f:
            p = json.loads(line)
            groups = [g.strip() for g in p["g"].split(",") if g.strip()] or [group_file]
            if any(SKIP_GROUP.search(g) for g in groups):
                why["skipped group"] += 1
                continue
            body = clean_body(p["b"])
            if body is None:
                why["binary/archive"] += 1
                continue
            bad = doc_ok(body)
            if bad:
                why[bad] += 1
                continue
            subject = re.sub(r"^(\s*re(\^\d+)?:\s*)+", "Re: ", p["s"], flags=re.I).strip()
            subject = re.sub(r"\s+", " ", re.sub(r"\s*-\s*\(nf\)\s*$", "", subject))
            head = f"Newsgroups: {groups[0]}\nSubject: {subject}\n\n"
            key = hashlib.md5(re.sub(r"\s+", " ", body[:300]).encode()).hexdigest()
            docs.append((p["id"], key, p["y"], groups[0], head + body))
            why["ok"] += 1
    return docs, why


def main():
    t0 = time.time()
    files = sorted(glob.glob(os.path.join(RAW, "*.jsonl.gz")), key=os.path.getsize, reverse=True)
    seen_ids, seen_keys = set(), set()
    why, years, groups = Counter(), Counter(), Counter()
    n_docs, n_chars = 0, 0
    with Pool() as pool, open(OUT, "w") as out:
        for docs, w in pool.imap_unordered(clean_file, files):
            why.update(w)
            for mid, key, year, group, doc in docs:
                if mid and mid in seen_ids:
                    why["crosspost"] += 1
                    continue
                if key in seen_keys:
                    why["repost"] += 1
                    continue
                seen_ids.add(mid)
                seen_keys.add(key)
                out.write(doc + EOT)
                n_docs += 1
                n_chars += len(doc)
                years[year] += 1
                groups[group.split(".")[0]] += 1
    print(f"{len(files)} groups -> {n_docs:,} posts, {n_chars / 1e6:.0f} MB in {OUT}  ({time.time() - t0:.0f} s)")
    print("dropped:", ", ".join(f"{k} {v:,}" for k, v in why.most_common() if k != "ok"))
    print("by year:", ", ".join(f"{y} {years[y]:,}" for y in sorted(years)))
    print("by hierarchy:", ", ".join(f"{g} {n:,}" for g, n in groups.most_common(15)))


if __name__ == "__main__":
    main()
