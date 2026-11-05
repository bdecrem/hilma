"""Download the whole Migrant Rights Database from its public API into raw/.

    python3 pull.py [raw_dir]      (default: raw/ next to this file)

The site (migrantrightsinitiative.org) is a Next.js front end over a Strapi
backend at migration-rights-backend.herokuapp.com. Every collection is readable
without a key; this walks each one page by page (100 per page) and keeps the
relations as ids plus one display field, so a row stays small.
"""
import json, os, sys, time, urllib.request

API = "https://migration-rights-backend.herokuapp.com/api"
COLLECTIONS = ["countries", "categories", "macrogroups", "types", "years",
               "questions", "scores", "answers", "citations"]
# the one field to carry for each relation (ids come along by default)
NAME_FIELD = {"id_country": "slug", "id_category": "slug", "id_year": "year",
              "id_macrogroup": "name_en", "id_question": "question_text_en",
              "id_parent_question": "question_text_en"}


def get(url):
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.load(r)
        except Exception as e:  # Heroku dyno waking up, transient network
            print(f"  retry {attempt + 1}: {e}", file=sys.stderr)
            time.sleep(3)
    raise SystemExit(f"gave up on {url}")


def pull(collection):
    probe = get(f"{API}/{collection}?pagination[pageSize]=1&populate=*")
    attrs = probe["data"][0]["attributes"]
    relations = [k for k, v in attrs.items() if isinstance(v, dict) and "data" in v]
    populate = "&".join(f"populate[{k}][fields][0]={NAME_FIELD.get(k, 'id')}" for k in relations)
    rows, page = [], 1
    while True:
        d = get(f"{API}/{collection}?pagination[pageSize]=100&pagination[page]={page}&{populate}")
        rows += d["data"]
        pg = d["meta"]["pagination"]
        if page >= pg["pageCount"]:
            break
        page += 1
    if len(rows) != pg["total"]:
        raise SystemExit(f"{collection}: got {len(rows)} rows, API says {pg['total']}")
    print(f"{collection}: {len(rows)} rows, relations {relations}")
    return rows


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "raw")
    os.makedirs(out, exist_ok=True)
    for c in COLLECTIONS:
        json.dump(pull(c), open(os.path.join(out, f"{c}.json"), "w"), ensure_ascii=False)
    json.dump({"pulled": time.strftime("%Y-%m-%d"), "api": API}, open(os.path.join(out, "meta.json"), "w"))
