"""Flatten raw/ into data/: one CSV per table plus one Excel workbook.

    python3 build.py [raw_dir] [data_dir]   (defaults: raw/ and data/ next to this file)

Needs openpyxl for the workbook (pip install openpyxl); without it the CSVs
are still written and the workbook is skipped with a note.
"""
import csv, json, os, sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "raw")
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, "data")
os.makedirs(OUT, exist_ok=True)


def load(name):
    return json.load(open(os.path.join(RAW, f"{name}.json")))


def rel(attrs, key):
    d = attrs.get(key, {}).get("data")
    return d["id"] if d else None


countries = {c["id"]: c["attributes"] for c in load("countries")}
cats = {c["id"]: c["attributes"] for c in load("categories")}
macros = {m["id"]: m["attributes"] for m in load("macrogroups")}
types = {t["id"]: t["attributes"] for t in load("types")}
years = {y["id"]: y["attributes"]["year"] for y in load("years")}
qs = {q["id"]: q["attributes"] for q in load("questions")}
meta = json.load(open(os.path.join(RAW, "meta.json"))) if os.path.exists(os.path.join(RAW, "meta.json")) else {}

cname = lambda i: countries[i]["name_en"] if i in countries else ""
ciso = lambda i: countries[i]["iso"] if i in countries else ""
catname = lambda i: cats[i]["name_en"] if i in cats else ""
catslug = lambda i: cats[i]["slug"] if i in cats else ""
tname = lambda i: types[i]["name_en"] if i in types else ""
s = lambda v: v or ""   # sort key for possibly-empty strings
n = lambda v: v or 0    # sort key for possibly-empty numbers

sheets = []


def table(name, header, rows):
    with open(os.path.join(OUT, f"{name}.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)
    print(f"{name}.csv: {len(rows)} rows")
    sheets.append((name, header, rows))


table("countries",
      ["id", "iso", "slug", "name_en", "name_es", "name_fr", "description_en", "description_es", "description_fr"],
      [[i, a["iso"], a["slug"], a["name_en"], a.get("name_es"), a.get("name_fr"),
        a.get("description_en"), a.get("description_es"), a.get("description_fr")]
       for i, a in sorted(countries.items(), key=lambda x: s(x[1]["name_en"]))])

table("categories",
      ["id", "slug", "name_en", "short_name", "macrogroup", "name_es", "name_fr",
       "description_en", "description_es", "description_fr"],
      [[i, a["slug"], a["name_en"], a.get("short_name"), macros.get(rel(a, "id_macrogroup"), {}).get("name_en"),
        a.get("name_es"), a.get("name_fr"), a.get("description_en"), a.get("description_es"), a.get("description_fr")]
       for i, a in sorted(cats.items())])

table("questions",
      ["id", "category_slug", "category", "type", "parent_question_id", "parent_question_text",
       "question_text_en", "question_text_es", "question_text_fr"],
      [[i, catslug(rel(a, "id_category")), catname(rel(a, "id_category")), tname(rel(a, "id_type")),
        rel(a, "id_parent_question"), (qs.get(rel(a, "id_parent_question")) or {}).get("question_text_en"),
        a["question_text_en"], a.get("question_text_es"), a.get("question_text_fr")]
       for i, a in sorted(qs.items())])

scores = []
for x in load("scores"):
    a = x["attributes"]
    scores.append([ciso(rel(a, "id_country")), cname(rel(a, "id_country")), catslug(rel(a, "id_category")),
                   catname(rel(a, "id_category")), tname(rel(a, "id_type")), years.get(rel(a, "id_year")), a["score"]])
scores.sort(key=lambda r: (s(r[1]), n(r[5]), s(r[3]), s(r[4])))
table("scores", ["country_iso", "country", "category_slug", "category", "score_type", "year", "score"], scores)

# wide: one row per country-year, one column per category x score type, Average first
catorder = [a["name_en"] for _, a in sorted(cats.items(), key=lambda x: (x[1]["slug"] != "total_score", s(x[1]["name_en"])))]
typeorder = ["Protection", "Implementation", "Adjusted"]
cols = [(c, t) for c in catorder for t in typeorder]
wide = defaultdict(dict)
for r in scores:
    wide[(r[1], r[0], r[5])][(r[3], r[4])] = r[6]
table("scores_wide",
      ["country", "iso", "year"] + [f"{c} / {t}" for c, t in cols],
      [[k[0], k[1], k[2]] + [v.get(c) for c in cols]
       for k, v in sorted(wide.items(), key=lambda x: (n(x[0][2]), s(x[0][0])))])

answers = []
for x in load("answers"):
    a = x["attributes"]
    q = qs.get(rel(a, "id_question"), {})
    answers.append([ciso(rel(a, "id_country")), cname(rel(a, "id_country")), years.get(rel(a, "id_year")),
                    rel(a, "id_question"), catname(rel(q, "id_category")), tname(rel(q, "id_type")),
                    q.get("question_text_en"), a.get("answer_text_en"), a.get("subscore"),
                    a.get("answer_text_es"), a.get("answer_text_fr")])
answers.sort(key=lambda r: (s(r[1]), n(r[2]), s(r[4]), n(r[3])))
table("answers",
      ["country_iso", "country", "year", "question_id", "category", "question_type", "question_text_en",
       "answer_text_en", "subscore", "answer_text_es", "answer_text_fr"], answers)

citations = []
for x in load("citations"):
    a = x["attributes"]
    q = qs.get(rel(a, "id_question"), {})
    citations.append([ciso(rel(a, "id_country")), cname(rel(a, "id_country")), years.get(rel(a, "id_year")),
                      rel(a, "id_question"), catname(rel(q, "id_category")), q.get("question_text_en"),
                      a.get("citation_number"), a.get("citation_text_en"), a.get("local_text_en"),
                      a.get("international_text_en")])
citations.sort(key=lambda r: (s(r[1]), n(r[2]), s(r[4]), n(r[3])))
table("citations",
      ["country_iso", "country", "year", "question_id", "category", "question_text_en", "citation_number",
       "citation_text_en", "local_text_en", "international_text_en"], citations)

try:
    import openpyxl
    from openpyxl.utils import get_column_letter
except ImportError:
    print("openpyxl not installed, workbook skipped (pip install openpyxl)")
    sys.exit(0)

wb = openpyxl.Workbook()
wb.remove(wb.active)
readme = wb.create_sheet("README")
for line in [
    f"Migrant Rights Database (Cornell Migrant Rights Initiative), pulled {meta.get('pulled', '?')} from the public API behind migrantrightsinitiative.org.",
    f"{len(countries)} countries, {len(cats) - 1} rights categories plus an overall Average, editions {', '.join(str(y) for y in sorted(years.values()))}, score types Protection (law on paper), Implementation, Adjusted.",
    "scores: one row per country x category x score type x year. scores_wide: one row per country-year, one column per category / type.",
    f"questions: the {len(qs)} indicators, per category, Protection or Implementation; implementation questions hang under a parent protection question.",
    f"answers: {len(answers):,} country-level answers to the questions, with subscores. citations: {len(citations):,} legal sources behind the answers.",
    "Source and scripts: apps/mrd in the hilma repo.",
]:
    readme.append([line])
readme.column_dimensions["A"].width = 140
for name, header, rows in sheets:
    ws = wb.create_sheet(name)
    ws.append(header)
    for r in rows:
        ws.append(["" if v is None else v for v in r])
    ws.freeze_panes = "A2"
    for i, h in enumerate(header, 1):
        ws.column_dimensions[get_column_letter(i)].width = min(60, max(12, len(str(h)) + 2))
wb.save(os.path.join(OUT, "Migrant Rights Database.xlsx"))
print("Migrant Rights Database.xlsx saved")
