"""Load the MRD countries, categories, questions and citations into the database."""
import json, os
from lib import sb, ROOT

L = lambda n: json.load(open(os.path.join(ROOT, "raw", f"{n}.json")))
rel = lambda a, k: (a.get(k, {}).get("data") or {}).get("id")
macro = {m["id"]: m["attributes"]["name_en"] for m in L("macrogroups")}
types = {t["id"]: t["attributes"]["name_en"] for t in L("types")}
cats_raw = L("categories")


def up(table, rows):
    for i in range(0, len(rows), 500):
        sb("POST", table, rows[i:i + 500], prefer="resolution=merge-duplicates")
    print(table, len(rows))


up("countries", [{"id": c["id"], "iso": c["attributes"]["iso"], "slug": c["attributes"]["slug"],
                  "name_en": c["attributes"]["name_en"]} for c in L("countries")])
up("categories", [{"id": c["id"], "slug": c["attributes"]["slug"], "name_en": c["attributes"]["name_en"],
                   "macrogroup": macro.get(rel(c["attributes"], "id_macrogroup"))} for c in cats_raw])
qs = L("questions")
up("questions", [{"id": q["id"], "category_id": rel(q["attributes"], "id_category"),
                  "type": types.get(rel(q["attributes"], "id_type")), "parent_question_id": None,
                  "text_en": q["attributes"]["question_text_en"]} for q in qs])
sb("POST", "questions", [{"id": q["id"], "category_id": rel(q["attributes"], "id_category"),
                          "type": types.get(rel(q["attributes"], "id_type")),
                          "parent_question_id": rel(q["attributes"], "id_parent_question"),
                          "text_en": q["attributes"]["question_text_en"]} for q in qs],
   prefer="resolution=merge-duplicates")
up("citations", [{"id": c["id"], "country_id": rel(c["attributes"], "id_country"),
                  "question_id": rel(c["attributes"], "id_question"),
                  "text_en": c["attributes"]["citation_text_en"],
                  "local_text_en": c["attributes"].get("local_text_en") or None,
                  "international_text_en": c["attributes"].get("international_text_en") or None}
                 for c in L("citations")])
