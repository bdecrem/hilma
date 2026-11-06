"""Build codebook.json from the MRD data: every indicator with its answer options and scores,
the implementation scale, worked examples from the coded countries, and the chunk plan.

    python3 codebook.py          # writes codebook.json next to this file
"""
import csv, json, os, re, collections

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data")
L = lambda n: list(csv.DictReader(open(os.path.join(DATA, n), encoding="utf-8")))

questions, answers, citations, countries = L("questions.csv"), L("answers.csv"), L("citations.csv"), L("countries.csv")
cats = {c["slug"]: c for c in L("categories.csv")}

P = [q for q in questions if q["type"] == "Protection" and q["category_slug"] != "basic_information"]
IMPL = {q["parent_question_id"]: q for q in questions if q["type"] == "Implementation"}

# Implementation scale (the database's own labels; a pair means "between the two")
LEVELS = [("Effectively Never", 0), ("Rarely", 25), ("Sometimes", 50), ("Usually", 75), ("Effectively Always", 100)]
IMPL_OPTIONS = [{"answer": a, "score": s} for a, s in LEVELS]
for (a1, s1), (a2, s2) in zip(LEVELS, LEVELS[1:]):
    IMPL_OPTIONS.append({"answer": f"{a1}; {a2}", "score": (s1 + s2) / 2})
IMPL_OPTIONS.append({"answer": "Does Not Apply", "score": None})


def norm(s):
    s = s.strip().rstrip(".").strip()
    s = re.sub(r"\s+", " ", s)
    return s


def options_for(qid):
    """The answer options the coders used for this indicator, one per distinct score, the most
    common wording first. Variants with a parenthetical gloss ("Yes (applies to all three)") fold
    into their base answer."""
    cnt = collections.Counter()
    for a in answers:
        if true_id(a["question_id"]) != qid or a["question_type"] != "Protection":
            continue
        ans = norm(a["answer_text_en"])
        if not ans or ans in ("NA", "N/A"):
            continue
        base = re.sub(r"\s*\(.*\)$", "", ans) if ans.lower().startswith(("yes", "no")) and "(" in ans else ans
        sc = a["subscore"].strip()
        cnt[(base, float(sc) if sc else 0.0)] += 1
    by_score = collections.defaultdict(list)
    for (ans, sc), n in cnt.items():
        by_score[sc].append((n, ans))
    out = []
    for sc, lst in by_score.items():
        lst.sort(reverse=True)
        # keep the wordings that were used at least twice, or the top one
        words = [a for n, a in lst if n >= 2] or [lst[0][1]]
        for w in words[:3]:
            out.append({"answer": w, "score": sc})
    out.sort(key=lambda o: (-o["score"], o["answer"]))
    return out


# The MRD's answers and citations link to question ids that were renumbered after the coding:
# from stored id 73 on, the text under id S is about question T = SHIFT[S] (checked by content,
# 2026-11-06: stored 93 holds the voting answers, 107 the loss-of-employment ones, and so on).
# Ids 3..71 are aligned. Four indicators have no coded text at all (105, 107, 121, 129).
SHIFT = {73: 137, 75: 73, 77: 75, 79: 77, 81: 79, 83: 81, 85: 83, 87: 85, 89: 87, 91: 89, 93: 91, 95: 93,
         97: 131, 99: 135, 101: 95, 103: 97, 105: 99, 107: 101, 109: 103, 113: 109, 115: 111, 117: 113,
         119: 115, 121: 133, 123: 117, 125: 119, 127: 123, 129: 125, 131: 127}
TRUE_ID = {str(s): str(t) for s, t in SHIFT.items()}          # protection ids
TRUE_ID.update({str(s + 1): str(t + 1) for s, t in SHIFT.items()})   # their implementation ids
true_id = lambda qid: TRUE_ID.get(qid, qid)

# the 2023 edition answers, keyed (by the true indicator) for examples
ans23 = {}
for a in answers:
    if a["year"] == "2023":
        ans23[(a["country_iso"], true_id(a["question_id"]))] = a
cit = {(c["country_iso"], true_id(c["question_id"])): c for c in citations}
codebook_shift = {str(k): v for k, v in SHIFT.items()}

codebook = {"implementation_options": IMPL_OPTIONS, "shift": codebook_shift, "categories": [], "questions": {}}
for slug, c in cats.items():
    if slug in ("basic_information",) or c.get("macrogroup") in ("TOTAL SCORE",):
        continue
    codebook["categories"].append({"slug": slug, "name": c["name_en"], "group": c.get("macrogroup")})

for q in P:
    qid = q["id"]
    imp = IMPL.get(qid)
    examples = []
    for co in countries:
        iso = co["iso"]
        a = ans23.get((iso, qid)); ci = cit.get((iso, qid))
        if not a or not ci:
            continue
        ia = ans23.get((iso, imp["id"])) if imp else None
        if len(ci["citation_text_en"].strip()) < 40:
            continue
        examples.append({"iso": iso, "country": co["name_en"], "answer": norm(a["answer_text_en"]),
                         "score": a["subscore"] or None, "citation": ci["citation_text_en"].strip()[:1400],
                         "international": (ci["international_text_en"] or "").strip() or None,
                         "implementation": norm(ia["answer_text_en"]) if ia else None})
    codebook["questions"][qid] = {
        "id": int(qid), "category": q["category_slug"], "category_name": q["category"], "text": q["question_text_en"].strip(),
        "options": options_for(qid),
        "implementation_id": int(imp["id"]) if imp else None,
        "implementation_text": imp["question_text_en"].strip() if imp else None,
        "examples": examples,
    }

# Chunks: related indicators researched together (they share the same statutes). <= 6 per chunk.
codebook["chunks"] = [
    {"key": "vulnerable", "label": "Vulnerable migrants", "questions": [3, 5, 7]},
    {"key": "life", "label": "Life: force at the border, trafficking", "questions": [9, 11, 13]},
    {"key": "liberty_a", "label": "Liberty: consular access, detention", "questions": [15, 17, 19]},
    {"key": "liberty_b", "label": "Liberty: review of detention, torture", "questions": [21, 23, 25]},
    {"key": "personhood", "label": "Legal personhood: documents, birth registration", "questions": [27, 29, 31, 33]},
    {"key": "due_process", "label": "Due process and victims of crime", "questions": [35, 37, 39, 41, 43, 45]},
    {"key": "expulsion_a", "label": "Expulsion: convictions, non-refoulement", "questions": [47, 49, 51, 53]},
    {"key": "expulsion_b", "label": "Expulsion: asylum, chain refoulement, procedure", "questions": [55, 57, 59, 61]},
    {"key": "nationality_a", "label": "Nationality: naturalisation", "questions": [63, 65, 67, 69]},
    {"key": "nationality_b", "label": "Nationality: dual nationality, regularisation, statelessness", "questions": [71, 133, 137]},
    {"key": "family", "label": "Family reunification", "questions": [73, 75, 77, 79]},
    {"key": "civil_liberties", "label": "Religion, opinion, expression, association, assembly, equal protection", "questions": [81, 83, 85, 87, 89, 131]},
    {"key": "political", "label": "Civil and political life: voting, standing for election", "questions": [91, 93]},
    {"key": "labor_a", "label": "Labor: pay, choice of employment, spouses, conditions, discrimination", "questions": [95, 97, 99, 103, 135]},
    {"key": "labor_b", "label": "Labor: status after job loss, redress before deportation, settlement", "questions": [101, 107, 113, 115]},
    {"key": "labor_c", "label": "Labor: unions, social security, unemployment, contract redress", "questions": [105, 109, 111, 117]},
    {"key": "health_housing", "label": "Health care and housing", "questions": [119, 121, 123]},
    {"key": "education", "label": "Education", "questions": [125, 127, 129]},
]
covered = sorted(q for ch in codebook["chunks"] for q in ch["questions"])
assert covered == sorted(int(q["id"]) for q in P), set(int(q["id"]) for q in P) ^ set(covered)

json.dump(codebook, open(os.path.join(HERE, "codebook.json"), "w"), ensure_ascii=False, indent=1)
print(f"{len(codebook['questions'])} indicators, {len(codebook['chunks'])} chunks, "
      f"{sum(len(q['examples']) for q in codebook['questions'].values())} examples")
for qid in ("3", "19", "91", "97", "121"):
    q = codebook["questions"][qid]; print(qid, q["text"][:60], q["options"])
