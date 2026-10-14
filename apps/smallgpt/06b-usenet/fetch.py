"""Step 6b, part 1: every Usenet post from 1981-1991 that archive.org still has.

archive.org's Usenet Historical Collection has one zipped mbox per newsgroup,
grouped by hierarchy (usenet-net, usenet-comp, ...). Each mbox holds every
year the group existed, mixed together, so the only way to get the 1980s is to
download the whole group and keep the posts whose date is old enough.

For each group: download the zip, read it post by post, keep the posts dated
1981-1991 (X-Google-ArrivalTime, else Date), write them to
data/usenet/raw/<group>.jsonl.gz as {id, g, s, y, b} (message id, newsgroups,
subject, year, body), delete the zip. Nothing is cleaned here; clean.py does
that. Each finished group is a line in data/usenet/fetch.jsonl, so the script
can be stopped and started again and skips what is done.

Run (on the mini, ~150 GB goes through the disk one group at a time):
  nohup .venv/bin/python -u 06b-usenet/fetch.py > data/usenet/fetch.log 2>&1 &
"""

import gzip
import json
import os
import re
import sys
import time
import urllib.request
import zipfile
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "data", "usenet")
ZIPS = os.path.join(OUT, "zips")
RAW = os.path.join(OUT, "raw")
DONE = os.path.join(OUT, "fetch.jsonl")

# the hierarchies that existed in the 1980s; alt.* (234 GB, almost all later) is left out
ITEMS = ["usenet-net", "usenet-mod", "usenet-fa", "usenet-news", "usenet-talk", "usenet-misc",
         "usenet-sci", "usenet-comp", "usenet-soc", "usenet-rec"]
FIRST, LAST = 1981, 1991
WORKERS = 6

POST_START = re.compile(rb"^From -?\d+\r?\n$")  # Google mbox ids can be negative
YEAR_ARRIVAL = re.compile(rb"^X-Google-ArrivalTime: (\d{4})-")
YEAR_DATE = re.compile(rb"^Date: .*?\b(19\d\d|20\d\d|\d\d)\b(?:\s+\d\d?:\d\d|\s*$)")


def groups():
    """Every (item, group, zip size) in the chosen hierarchies, smallest item first."""
    out = []
    for item in ITEMS:
        meta = json.load(urllib.request.urlopen(f"https://archive.org/metadata/{item}", timeout=120))
        for f in meta["files"]:
            if f["name"].endswith(".mbox.zip"):
                out.append((item, f["name"][: -len(".mbox.zip")], int(f.get("size", 0))))
    return out


def download(url, path):
    for attempt in range(5):
        try:
            with urllib.request.urlopen(url, timeout=120) as r, open(path, "wb") as f:
                while chunk := r.read(1 << 22):
                    f.write(chunk)
            return
        except Exception as e:
            print(f"  retry {attempt + 1} {url}: {e}", flush=True)
            time.sleep(10 * (attempt + 1))
    raise RuntimeError(f"download failed: {url}")


def year_of(headers):
    for line in headers:
        m = YEAR_ARRIVAL.match(line)
        if m:
            return int(m.group(1))
    for line in headers:
        m = YEAR_DATE.match(line)
        if m:
            y = int(m.group(1))
            return y + 1900 if y < 100 else y
    return None


def header(headers, name):
    prefix = name.encode() + b": "
    for line in headers:
        if line.startswith(prefix):
            return line[len(prefix):].decode("utf-8", "replace").strip()
    return ""


def posts(stream):
    """Yield (header lines, body lines) for each post in an mbox stream."""
    headers, body, in_body = None, [], False
    for line in stream:
        if POST_START.match(line):
            if headers is not None:
                yield headers, body
            headers, body, in_body = [], [], False
        elif headers is None:
            continue
        elif not in_body:
            if line.strip() == b"":
                in_body = True
            else:
                headers.append(line)
        else:
            body.append(line)
    if headers is not None:
        yield headers, body


def fetch(job):
    item, group, size = job
    t = time.time()
    zpath = os.path.join(ZIPS, group + ".mbox.zip")
    download(f"https://archive.org/download/{item}/{group}.mbox.zip", zpath)
    n, kept, years = 0, 0, {}
    tmp = os.path.join(RAW, group + ".jsonl.gz.part")
    with zipfile.ZipFile(zpath) as z, gzip.open(tmp, "wt", encoding="utf-8") as out:
        for name in z.namelist():
            with z.open(name) as stream:
                for headers, body in posts(stream):
                    n += 1
                    y = year_of(headers)
                    if y is None or not FIRST <= y <= LAST:
                        continue
                    kept += 1
                    years[y] = years.get(y, 0) + 1
                    out.write(json.dumps({
                        "id": header(headers, "Message-ID"),
                        "g": header(headers, "Newsgroups"),
                        "s": header(headers, "Subject"),
                        "y": y,
                        "b": b"".join(body).decode("utf-8", "replace"),
                    }) + "\n")
    os.remove(zpath)
    if kept:
        os.rename(tmp, os.path.join(RAW, group + ".jsonl.gz"))
    else:
        os.remove(tmp)
    return {"item": item, "group": group, "zip_mb": round(size / 1e6, 1), "posts": n, "kept": kept,
            "years": years, "sec": round(time.time() - t)}


def main():
    os.makedirs(ZIPS, exist_ok=True)
    os.makedirs(RAW, exist_ok=True)
    done = set()
    if os.path.exists(DONE):
        with open(DONE) as f:
            done = {json.loads(l)["group"] for l in f}
    todo = [g for g in groups() if g[1] not in done]
    total_gb = sum(g[2] for g in todo) / 1e9
    print(f"{len(done)} groups done, {len(todo)} to go ({total_gb:.1f} GB zipped)", flush=True)
    t0, gb, kept = time.time(), 0.0, 0
    with Pool(WORKERS) as pool, open(DONE, "a") as log:
        for r in pool.imap_unordered(fetch, todo):
            log.write(json.dumps(r) + "\n"); log.flush()
            gb += r["zip_mb"] / 1e3
            kept += r["kept"]
            print(f"{r['group']:40s} {r['zip_mb']:8.1f} MB  posts {r['posts']:8,}  kept {r['kept']:7,}   "
                  f"[{gb:.1f}/{total_gb:.1f} GB, {kept:,} kept, {(time.time() - t0) / 60:.0f} min]", flush=True)
    print("done", flush=True)


if __name__ == "__main__":
    sys.exit(main())
