#!/usr/bin/env python3
"""Load the Kindle CSV into book_scout_library with a fiction flag + norm_title.
Keep normTitle in lockstep with src/lib/book-scout/normalize.ts.
Usage: python3 scripts/book-scout/load-library.py
"""
import csv, json, re, os, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CSV_PATH = os.path.join(ROOT, "misc", "Kindle_Books_Recent_200.csv")

# Row numbers (the CSV "#" column) that are NON-fiction. Everything else fiction.
NONFICTION = {1, 2, 3, 4, 5, 8, 9, 12, 20, 21, 61, 68, 70, 114, 116, 117, 126}


def norm_title(raw: str) -> str:
    t = raw
    m = re.search(r"[:–—]", t)
    if m and m.start() > 0:
        t = t[: m.start()]
    t = t.lower()
    t = re.sub(r"\([^)]*\)", " ", t)
    t = re.sub(r"[^a-z0-9]+", " ", t)
    t = re.sub(r"\b(a|an|the)\b", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def env(key: str) -> str:
    with open(os.path.join(ROOT, ".env.local")) as f:
        for line in f:
            if line.startswith(key + "="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit(f"{key} not in .env.local")


def main():
    url = env("SUPABASE_URL")
    keyv = env("SUPABASE_SERVICE_KEY")
    rows = []
    with open(CSV_PATH) as f:
        for row in csv.DictReader(f):
            n = int(row["#"])
            rows.append({
                "title": row["Title"],
                "author": row["Author"],
                "acquired": row["Acquired Date"],
                "type": row["Type"].strip(),
                "is_fiction": n not in NONFICTION,
                "norm_title": norm_title(row["Title"]),
            })

    # wipe + reload (idempotent)
    req = urllib.request.Request(
        f"{url}/rest/v1/book_scout_library?id=neq.00000000-0000-0000-0000-000000000000",
        method="DELETE",
        headers={"apikey": keyv, "Authorization": f"Bearer {keyv}", "Prefer": "return=minimal"},
    )
    urllib.request.urlopen(req)

    req = urllib.request.Request(
        f"{url}/rest/v1/book_scout_library",
        data=json.dumps(rows).encode(),
        method="POST",
        headers={"apikey": keyv, "Authorization": f"Bearer {keyv}",
                 "Content-Type": "application/json", "Prefer": "return=minimal"},
    )
    urllib.request.urlopen(req)
    fic = sum(1 for r in rows if r["is_fiction"])
    print(f"loaded {len(rows)} books: {fic} fiction, {len(rows)-fic} nonfiction")


if __name__ == "__main__":
    main()
