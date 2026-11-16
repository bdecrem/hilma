import re
from pathlib import Path
import fam_laws
from evalkit import read_csv, num, verbatim, read, write_csv

C6 = ["Arvania", "Belmora", "Corvenia", "Elyria", "Fennmark", "Galvoria"]
PROV = ["detention", "work", "appeal"]


def generate(work, seed, rng):
    while True:
        t = fam_laws.build(work, rng, C6, PROV, amend=("Belmora", "Fennmark"), hard_appeal=True)
        det = {k.split("|")[0]: v["value"] for k, v in t.items() if k.endswith("|detention")}
        app = {k.split("|")[0]: v["value"] for k, v in t.items() if k.endswith("|appeal")}
        if sorted(det.values())[-1] != sorted(det.values())[-2] and sorted(app.values())[0] != sorted(app.values())[1]:
            return {"cells": t, "longest_detention": max(det, key=det.get), "shortest_appeal": min(app, key=app.get)}


def check(work, truth, session, C):
    names = ["all_rows_present", "values_correct", "articles_correct", "amendments_correct", "quotes_verbatim_from_cited_article"]
    if C.exists(work, "comparison.csv"):
        rows = read_csv(Path(work) / "comparison.csv")
        got = {f"{(r.get('country') or '').strip().title()}|{(r.get('provision') or '').strip().lower()}": r for r in rows}
        cells = truth["cells"]
        C.add("all_rows_present", set(got) == set(cells) and len(rows) == len(cells), "missed_items", f"{len(rows)} rows")
        C.add("values_correct", all(k in got and num(got[k].get("value")) == v["value"] for k, v in cells.items()), "numbers_wrong")
        C.add("articles_correct", all(k in got and fam_laws.art_num(got[k].get("article")) == v["article"] for k, v in cells.items()), "citation_wrong")
        C.add("amendments_correct", all(k in got and fam_laws.art_num(got[k].get("amended_by")) == v["amended_by"] for k, v in cells.items()), "citation_wrong")
        bad = []
        for k, r in got.items():
            c = k.split("|")[0]
            f = Path(work) / "laws" / f"{c.lower()}.txt"
            arts = fam_laws.articles(f.read_text()) if f.exists() else {}
            cited = r.get("amended_by") if fam_laws.art_num(r.get("amended_by")) else r.get("article")
            if not verbatim(r.get("quote", ""), arts.get(str(fam_laws.art_num(cited)), "")):
                bad.append(k)
        C.add("quotes_verbatim_from_cited_article", bool(got) and not bad, "quote_not_verbatim", bad[:5])
    else:
        C.skip(names, "stopped_early")
    if C.exists(work, "summary.md"):
        text = read(work, "summary.md").lower()
        C.add("summary_longest_detention", _near(text, truth["longest_detention"], "detention"), "numbers_wrong", truth["longest_detention"])
        C.add("summary_shortest_appeal", _near(text, truth["shortest_appeal"], "appeal"), "numbers_wrong", truth["shortest_appeal"])
    else:
        C.skip(["summary_longest_detention", "summary_shortest_appeal"], "stopped_early")


def _near(text, country, word):
    return any(country.lower() in line and word in line for line in re.split(r"(?<=[.\n])", text))


def _solve(work, truth, ignore_amend=False):
    rows = []
    for k, v in sorted(truth["cells"].items()):
        c, p = k.split("|")
        val, by, q = v["value"], v["amended_by"], v["quote"]
        if ignore_amend and by:
            by = None
        rows.append([c, p, val, v["article"], by or "", q])
    write_csv(Path(work) / "comparison.csv", ["country", "provision", "value", "article", "amended_by", "quote"], rows)
    (Path(work) / "summary.md").write_text(f"Longest detention: {truth['longest_detention']}.\nShortest time to appeal: {truth['shortest_appeal']}.\n")


def solve(work, truth):
    _solve(work, truth)


def wrong(work, truth):
    _solve(work, truth, ignore_amend=True)
