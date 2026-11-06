"""Load the MRD's own answers (2020 and 2023) and scores for the 46 coded countries, and point the
citations at the indicators they are actually about (the SHIFT in codebook.py). Run once.

    python3 seed_answers.py
"""
import csv, json, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "laws"))
from lib import sb, sb_all   # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__)); DATA = os.path.join(HERE, "..", "data")
CB = json.load(open(os.path.join(HERE, "codebook.json"), encoding="utf-8"))
SHIFT = {int(k): v for k, v in CB["shift"].items()}
TRUE = dict(SHIFT); TRUE.update({k + 1: v + 1 for k, v in SHIFT.items()})
true_id = lambda q: TRUE.get(q, q)
L = lambda n: list(csv.DictReader(open(os.path.join(DATA, n), encoding="utf-8")))

countries = {c["iso"]: c for c in sb_all("countries?select=id,iso,experimental")}
cats = {c["name_en"]: c["id"] for c in sb_all("categories?select=id,name_en")}
qids = {q["id"] for q in sb_all("questions?select=id")}


def up(table, rows, conflict):
    for i in range(0, len(rows), 500):
        sb("POST", f"{table}?on_conflict={conflict}", rows[i:i + 500], prefer="resolution=merge-duplicates,return=minimal")


# 1. answers: one row per country x year x indicator (the CSV repeats a few; last one wins)
rows = {}
for a in L("answers.csv"):
    co = countries.get(a["country_iso"])
    if not co or co["experimental"] or not a["year"]:
        continue
    qid = true_id(int(a["question_id"]))
    if qid not in qids:
        continue
    sc = a["subscore"].strip()
    rows[(co["id"], int(a["year"]), qid)] = {"country_id": co["id"], "year": int(a["year"]), "question_id": qid,
                                              "answer": a["answer_text_en"].strip() or None, "subscore": float(sc) if sc else None, "experimental": False}
up("answers", list(rows.values()), "country_id,year,question_id"); print("answers", len(rows))

# 2. scores (the CSV has duplicates per key; keep the last)
srows = {}
for s in L("scores.csv"):
    co = countries.get(s["country_iso"])
    if not co or co["experimental"] or not s["year"] or s["category"] not in cats or s["score"] == "":
        continue
    srows[(co["id"], int(s["year"]), cats[s["category"]], s["score_type"])] = {"country_id": co["id"], "year": int(s["year"]), "category_id": cats[s["category"]],
                                                                             "score_type": s["score_type"], "score": float(s["score"]), "experimental": False}
up("scores", list(srows.values()), "country_id,year,category_id,score_type"); print("scores", len(srows))

# 3. citations: question_id -> the indicator the text is about
cits = sb_all("citations?select=id,question_id,country_id&country_id=lt.1000")
moves = {}
for c in cits:
    t = true_id(c["question_id"])
    if t != c["question_id"]:
        moves.setdefault(t, []).append(c["id"])
n = 0
for t, ids in moves.items():
    for i in range(0, len(ids), 200):
        sb("PATCH", "citations?id=in.(" + ",".join(map(str, ids[i:i + 200])) + ")", {"question_id": t}, prefer="return=minimal"); n += len(ids[i:i + 200])
print("citations re-pointed", n)
