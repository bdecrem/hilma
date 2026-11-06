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

# Options the data leaves messy or missing (a coder's slip that scored a "No" 100, a "?",
# indicators whose coded text never made it into the database). One wording per score.
OVERRIDES = {
    "13": [("Yes", 100), ("No, government may punish trafficked or smuggled migrants", 0)],
    "21": [("Yes (legality, conditions and length)", 100), ("Yes, two of the three", 67), ("Yes, one of the three", 33), ("No", 0)],
    "25": [("Yes", 100), ("Yes, right to be free from torture but not from cruel, inhuman or degrading treatment", 50), ("No", 0)],
    "27": [("Yes, right for migrants explicitly specified", 100), ("Yes, right implied by existing laws", 50), ("No, no such right specified or implied in any law", 0)],
    "47": [("Convictions do not affect residence status", 100), ("Only major convictions (criminal offenses) can lead to loss of residence status", 50), ("Any conviction (even minor administrative offenses) can lead to loss of residence status", 0)],
    "63": [("Convictions do not affect citizenship status", 100), ("Only major convictions (criminal offenses) can lead to loss of citizenship status", 50), ("Any conviction can lead to loss of citizenship status", 0)],
    "65": [("Yes, but there may be residency requirements that have to be met", 100), ("No", 0)],
    "67": [("Yes, but there may be residency requirements that have to be met", 100), ("No", 0)],
    "69": [("Yes, but there may be residency requirements that have to be met", 100), ("No", 0)],
    "71": [("Yes, all migrants can obtain dual nationality by retaining their nationality of origin", 100), ("Conditional, depending on the country of origin or some other consideration", 50), ("No, no migrants may obtain dual nationality", 0)],
    "77": [("Yes", 100), ("Conditional", 50), ("No", 0)],
    "91": [("Right to vote in all elections", 100), ("Right to vote in local or regional elections", 50), ("No right to vote in any election", 0)],
    "93": [("Right to run for public office in all elections", 100), ("Right to run for public office in local or regional elections", 50), ("No right to run for public office in any election", 0)],
    "97": [("Migrant workers have completely free choice of employment", 100), ("Workers can freely change employers within a specific sector", 75), ("Employment is tied to a specific employer; change of employer possible but requires a new work permit application", 50), ("Employment tied to a specific employer and no change of employer possible", 0)],
    "99": [("Yes, unrestricted right to work", 100), ("Yes, but limited", 50), ("No", 0)],
    "101": [("Loss of employment does not affect immigration status", 100), ("Loss of employment implies loss of immigration status unless a new job is found within a specified time period", 50), ("Loss of employment automatically implies the loss of immigration status", 0)],
    "103": [("Yes, migrants have a right to the same employment conditions and protections", 100), ("Migrants have a right to most of the employment conditions and protections for citizens", 50), ("No, migrant workers have significantly fewer legal rights", 0)],
    "105": [("Yes", 100), ("Yes, but limited", 50), ("No", 0)],
    "107": [("Yes", 100), ("No", 0)],
    "109": [("Yes, immediate equal access to all types of social security protections", 100), ("Equal access to all types of social security protections after some period of time", 75), ("Access to some, but not all types of social security protections", 50), ("No right to access any social security protections", 0)],
    "111": [("Yes, immediate equal access to all types of unemployment benefits", 100), ("Equal access to all types of unemployment benefits after some time", 75), ("Access to some, but not all types of unemployment benefits; or not to the same extent as citizens; or it depends on their status", 50), ("No access to any unemployment benefits", 0)],
    "113": [("Yes, there is an opportunity to switch to permanent status after certain conditions are met", 100), ("No, there is no opportunity to acquire permanent residence status", 0)],
    "119": [("Yes", 100), ("No", 0)],
    "121": [("Yes", 100), ("Yes, but limited (e.g. emergency and essential care only)", 50), ("No", 0)],
    "123": [("Yes, same as citizens", 100), ("Yes, but limited", 50), ("No", 0)],
    "125": [("Yes, for all visa types", 100), ("Yes, but only for certain visa types and migrant statuses", 50), ("No", 0)],
    "127": [("Yes", 100), ("Yes, but only for certain visa types and migrant statuses", 50), ("No", 0)],
    "129": [("Yes", 100), ("Yes, but only for certain visa types and migrant statuses", 50), ("No", 0)],
    "131": [("Yes", 100), ("Yes, but only for certain visa types and migrant statuses", 50), ("No", 0)],
    "133": [("Yes, there is an opportunity to regularize after certain conditions are met", 100), ("No, there is no opportunity for irregular migrant workers to regularize", 0)],
}


# The MRD's own 2023 coding instrument (instrument/MRD_2023_Survey_Instrument.pdf, parsed to
# instrument/instrument.json): the full wording of each indicator and its answer options, in the
# order the instrument lists them (worst first). Instrument Q number -> MRD question id.
INSTRUMENT_Q = {3: 3, 4: 5, 5: 7, 6: 9, 7: 11, 8: 13, 9: 25, 10: 15, 11: 17, 12: 19, 13: 21, 14: 23, 15: 27, 16: 29, 17: 31, 18: 33,
                19: 35, 20: 37, 21: 39, 22: 41, 23: 43, 24: 45, 25: 47, 26: 49, 27: 51, 28: 53, 29: 55, 30: 57, 31: 59, 32: 61,
                33: 63, 34: 65, 35: 67, 36: 69, 37: 71, 38: 137, 39: 73, 40: 75, 41: 77, 42: 79, 43: 81, 44: 83, 45: 85, 46: 87,
                47: 89, 48: 91, 49: 93, 50: 131, 51: 135, 52: 95, 53: 97, 54: 99, 55: 101, 56: 103, 57: 109, 58: 111, 59: 113,
                60: 115, 61: 133, 62: 117, 63: 119, 64: 123, 65: 125, 66: 127}
INSTRUMENT = {}
for b in json.load(open(os.path.join(HERE, "instrument", "instrument.json"))):
    m = re.fullmatch(r"Q(\d+)", b["q"])
    if m and int(m.group(1)) in INSTRUMENT_Q:
        INSTRUMENT[str(INSTRUMENT_Q[int(m.group(1))])] = b
LADDER = {2: [0, 100], 3: [0, 50, 100], 4: [0, 50, 75, 100]}


def instrument_options(qid):
    b = INSTRUMENT.get(qid)
    if not b or len(b["options"]) not in LADDER:
        return None
    opts = [re.sub(r"\s+", " ", o).strip() for o in b["options"]]
    opts = [o[4:] if o.startswith("met ") else o for o in opts]          # a wrapped line in Q59
    out = [{"answer": a, "score": float(s)} for a, s in zip(opts, LADDER[len(opts)])]
    if qid == "21":   # coders also used partial answers for appeal of legality / conditions / length
        out += [{"answer": "Yes, two of the three (legality, conditions, length)", "score": 67.0},
                {"answer": "Yes, one of the three (legality, conditions, length)", "score": 33.0}]
    return sorted(out, key=lambda o: -o["score"])


def clean_options(qid, opts):
    inst = instrument_options(qid)
    if inst:
        return inst
    if qid in OVERRIDES:
        return [{"answer": a, "score": float(s)} for a, s in OVERRIDES[qid]]
    best = {}
    for o in opts:
        if o["answer"] in ("?",) or o["score"] in best:
            continue
        best[o["score"]] = o
    return sorted(best.values(), key=lambda o: -o["score"])


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
    if qid not in INSTRUMENT:          # 105, 107, 121, 129: in the site's question list, not in the 2023 instrument, never coded
        continue
    codebook["questions"][qid] = {
        "id": int(qid), "category": q["category_slug"], "category_name": q["category"], "text": q["question_text_en"].strip(),
        "text_long": re.sub(r"\s+", " ", INSTRUMENT[qid]["text"]).strip(), "instrument_q": INSTRUMENT[qid]["q"],
        "options": clean_options(qid, options_for(qid)),
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
    {"key": "labor_b", "label": "Labor: status after job loss, settlement, contract redress", "questions": [101, 113, 115, 117]},
    {"key": "labor_c", "label": "Labor: social security, unemployment benefits", "questions": [109, 111]},
    {"key": "health_housing", "label": "Health care and housing", "questions": [119, 123]},
    {"key": "education", "label": "Education", "questions": [125, 127]},
]
covered = sorted(q for ch in codebook["chunks"] for q in ch["questions"])
assert covered == sorted(int(q) for q in codebook["questions"]), set(int(q) for q in codebook["questions"]) ^ set(covered)
codebook["intro"] = re.sub(r"\s+", " ", open(os.path.join(HERE, "instrument", "instrument.txt"), encoding="utf-8").read().split("Start of Block")[0]).strip()

json.dump(codebook, open(os.path.join(HERE, "codebook.json"), "w"), ensure_ascii=False, indent=1)
print(f"{len(codebook['questions'])} indicators, {len(codebook['chunks'])} chunks, "
      f"{sum(len(q['examples']) for q in codebook['questions'].values())} examples")
