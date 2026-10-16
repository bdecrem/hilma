"""Step 9b, part 1: real questions and their real replies, out of the Usenet archive.

A reply on Usenet usually starts "In article <message-id> someone writes:",
and that message id is the post it answers. So for every group: index the
posts that start a thread and ask something (no "Re:", a question mark, short),
find the replies that name one of them, and keep the pair when the reply has
something of its own to say (quotes and signatures stripped with step 6b's
clean_body).

Runs where the raw archive is (data/usenet/raw/, on the Mac mini).
Writes data/usenet/threads.jsonl: {id, group, year, subject, q, replies: [...]}.

Run:  python3 09-sft/threads.py
"""

import glob
import gzip
import json
import os
import re
import sys
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ROOT, "06b-usenet"))
from clean import SKIP_GROUP, clean_body  # noqa: E402

RAW = os.path.join(ROOT, "data", "usenet", "raw")
OUT = os.path.join(ROOT, "data", "usenet", "threads.jsonl")
PARENT = re.compile(r"^\s*in article\s*<([^>\s]+)>", re.I | re.M)
CODEY = re.compile(r"[;{}]\s*$|^\s*(#include|#define|int |char |void |struct |if ?\(|for ?\(|while ?\()")


def readable(body, lo, hi):
    if not body or not lo <= len(body) <= hi:
        return False
    if sum(1 for c in body if ord(c) > 126) > 3:
        return False
    lines = [l for l in body.split("\n") if l.strip()]
    return sum(1 for l in lines if CODEY.search(l)) <= len(lines) // 5


def mine(path):
    questions, replies = {}, []
    with gzip.open(path, "rt", encoding="utf-8") as f:
        for line in f:
            p = json.loads(line)
            group = (p["g"].split(",")[0].strip() or os.path.basename(path)[:-9])
            if SKIP_GROUP.search(group):
                continue
            subject = re.sub(r"\s+", " ", p["s"]).strip()
            if re.match(r"\s*re\b", subject, re.I):
                m = PARENT.search(p["b"][:2000])
                if m:
                    body = clean_body(p["b"])
                    if readable(body, 40, 1200):
                        replies.append((m.group(1), body))
            else:
                body = clean_body(p["b"])
                if p["id"] and "?" in (body or "") and readable(body, 60, 1500):
                    questions[p["id"].strip("<>")] = {"id": p["id"], "group": group, "year": p["y"], "subject": subject, "q": body, "replies": []}
    for pid, body in replies:
        q = questions.get(pid)
        if q and len(q["replies"]) < 4:
            q["replies"].append(body)
    return [q for q in questions.values() if q["replies"]], len(questions), len(replies)


if __name__ == "__main__":
    files = sorted(glob.glob(os.path.join(RAW, "*.jsonl.gz")), key=os.path.getsize, reverse=True)
    n_q = n_r = n = 0
    seen = set()
    with Pool() as pool, open(OUT, "w") as out:
        for found, nq, nr in pool.imap_unordered(mine, files):
            n_q += nq
            n_r += nr
            for q in found:
                if q["id"] in seen:
                    continue
                seen.add(q["id"])
                out.write(json.dumps(q) + "\n")
                n += 1
    print(f"{len(files)} groups: {n_q:,} question posts, {n_r:,} replies naming a parent, {n:,} questions with a reply -> {OUT}")
