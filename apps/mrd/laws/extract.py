"""Step 1: read each citation and list the legal sources it names.

    python3 extract.py [--country slug] [--limit N] [--redo] [--workers 8]

Writes citations.extracted (jsonb) and upserts laws + citation_laws.
"""
import argparse, json, re, unicodedata
from concurrent.futures import ThreadPoolExecutor
from lib import sb, sb_all, claude, USAGE, beat, run_base

SYSTEM = """You read one citation from the Migrant Rights Database (Cornell) and list every legal source it relies on: constitutions, statutes/acts/codes, regulations, decrees, executive orders, ministerial or administrative guidance, court decisions, and treaties.

Rules:
- One entry per distinct legal instrument. If the same act is cited for several articles, one entry with all the articles.
- name_cited: the name as the citation writes it. name_en: a clean English name (translate if needed), no article numbers. name_official: the name in the country's own language if you know it with confidence, else null.
- number: the official number/identifier if given or certain (e.g. "Act 13 of 2002", "Ley 1070 de 2006", "(2017) 5 SA 480 (CC)"), else null.
- year: year of enactment or decision if stated or certain, else null.
- court: for court decisions only.
- articles: the articles/sections cited, compact ("Arts. 2, 113"; "ss. 12(1)(b), 35(2)"), or "".
- quote: a short passage the citation quotes from that instrument (max 400 chars), else null.
- Do not invent instruments that are only implied. General references like "national law" with no named instrument produce no entry.
- International treaties count only if the citation relies on them as domestic law."""

SCHEMA = {"type": "object", "additionalProperties": False, "required": ["laws"], "properties": {"laws": {"type": "array", "items": {
    "type": "object", "additionalProperties": False,
    "required": ["name_cited", "name_en", "name_official", "kind", "number", "year", "court", "articles", "quote"],
    "properties": {
        "name_cited": {"type": "string"}, "name_en": {"type": "string"},
        "name_official": {"type": ["string", "null"]},
        "kind": {"type": "string", "enum": ["constitution", "statute", "regulation", "decree", "executive_order",
                                            "administrative_guidance", "court_decision", "treaty", "other"]},
        "number": {"type": ["string", "null"]}, "year": {"type": ["integer", "null"]},
        "court": {"type": ["string", "null"]}, "articles": {"type": "string"},
        "quote": {"type": ["string", "null"]}}}}}}


def dedupe_key(law):
    base = law["name_en"] if law["kind"] != "constitution" else "constitution"
    base = re.sub(r"\([^)]*\)", " ", base)            # "(as amended)", "(2017)"
    base = re.sub(r"(?i)\b(as amended|amended)\b", " ", base)
    s = unicodedata.normalize("NFKD", base).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\b(the|of|and|on|act|law|no|nr|number)\b", " ", s)
    s = re.sub(r"[^a-z0-9]+", " ", s).strip()
    if law.get("year") and law["kind"] != "constitution":
        s += f" {law['year']}"
    return s[:200]


def run(cit, countries):
    country = countries[cit["country_id"]]
    out = claude(SYSTEM, f"Country: {country}\n\nCitation:\n{cit['text_en']}", schema=SCHEMA)
    sb("PATCH", f"citations?id=eq.{cit['id']}", {"extracted": out, "extracted_at": "now()"})
    for law in out["laws"]:
        key = dedupe_key(law)
        row = sb("POST", "laws?on_conflict=country_id,dedupe_key", [{
            "country_id": cit["country_id"], "dedupe_key": key, "name_cited": law["name_cited"],
            "name_en": law["name_en"], "name_official": law["name_official"], "kind": law["kind"],
            "number": law["number"], "enacted_year": law["year"], "court": law["court"]}],
            prefer="resolution=ignore-duplicates,return=representation")
        if not row:
            row = sb("GET", "laws", params={"country_id": f"eq.{cit['country_id']}",
                                            "dedupe_key": f"eq.{key}", "select": "id"})
        sb("POST", "citation_laws", [{"citation_id": cit["id"], "law_id": row[0]["id"],
                                      "articles": law["articles"] or "", "quote": law["quote"]}],
           prefer="resolution=merge-duplicates")
    return len(out["laws"])


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--country"); ap.add_argument("--limit", type=int); ap.add_argument("--redo", action="store_true")
    ap.add_argument("--workers", type=int, default=8)
    a = ap.parse_args()
    countries = {c["id"]: c["name_en"] for c in sb_all("countries?select=id,name_en,slug")}
    q = "citations?select=id,country_id,text_en&order=id"
    if a.country:
        cid = sb("GET", f"countries?slug=eq.{a.country}&select=id")[0]["id"]; q += f"&country_id=eq.{cid}"
    if not a.redo:
        q += "&extracted_at=is.null"
    cits = sb_all(q)[: a.limit or None]
    print(f"{len(cits)} citations to extract")
    base = run_base("extract")
    total_all = sb_all("citations?select=id")
    already = len(total_all) - len(sb_all("citations?select=id&extracted_at=is.null"))
    done = 0
    beat("extract", already, len(total_all), note="reading citations with Haiku", force=True, base=base)
    with ThreadPoolExecutor(a.workers) as ex:
        for n in ex.map(lambda c: run(c, countries), cits):
            done += 1
            beat("extract", already + done, len(total_all), note="reading citations with Haiku", base=base)
            if done % 50 == 0:
                print(f"  {done}/{len(cits)}  ${USAGE['cost']:.2f}", flush=True)
    beat("extract", already + done, len(total_all), status="done", note="every citation read", force=True, base=base)
    print(f"done: {done} citations, {USAGE['calls']} calls, {USAGE['in']:,} in / {USAGE['out']:,} out tokens, ${USAGE['cost']:.2f}")
