"""Round three: the skills tasks, two per skill (apps/activist-ai/skills). Each is run with the skill
and without it (run.mjs --skills on|off), so the difference is what the skill is worth.

    s1-chart-db           chart: a count per region from a SQLite database, studies with no region said
    s2-chart-gaps         chart: monthly rainfall with missing months (a blank and a -999 marker), not zeros
    s3-workbook-summary   workbook: summary per program, cleaned data, notes on what was dropped
    s4-workbook-safe-text workbook: phone numbers, ids with leading zeros, notes that start with = + - @
    s5-report-brief       report: a Word and PDF brief from three PDFs, every number cited with its page
    s6-report-quotes      report: a memo with four direct quotes, each word for word on its cited page
    s7-design-report-page designer: a survey results page that breaks on a phone
    s8-design-dashboard   designer: a dashboard with cramped stats, low contrast and a wide chart

Made-up data only. Checkers are standard library (office.py reads the Office files; page.mjs loads
pages headless with the same measurements as the image's ola-page).
"""
import csv, hashlib, json, re, sqlite3
from pathlib import Path

from evalkit import page, read_csv, ws
from office import docx_text, docx_write, png_bytes, png_size, xlsx_read, xlsx_write
import r2_pdf

HERE = Path(__file__).resolve().parent
REGIONS = ["East Africa", "West Africa", "South Asia", "Southeast Asia", "Andes", "Pacific Islands"]
TOWNS = ["Kesteren", "Ochten", "Dodewaard", "Heteren", "Randwijk", "Opheusden", "Zetten", "Andelst", "Ingen", "Lienden"]
STATIONS = ["Ostend", "Bruges", "Ghent"]
FIRST = ["Ana", "Ben", "Chloe", "Dev", "Eli", "Fatima", "Gus", "Hana", "Ivan", "June", "Kofi", "Lena", "Mo", "Nia", "Omar", "Pia", "Raj", "Sara", "Tom", "Uma"]
LAST = ["Achebe", "Baker", "Castro", "Diallo", "Eriksen", "Fujita", "Garcia", "Haddad", "Ito", "Jensen", "Kowalski", "Lopez", "Mensah", "Nakamura", "Okafor",
        "Petrov", "Quinn", "Rossi", "Silva", "Tanaka", "Ueda", "Varga", "Weber", "Xu", "Yilmaz", "Zulu"]


def write_doc(path, pages):
    """pages: a list of pages, each a list of paragraphs (the first one the page's heading)."""
    out = []
    for paras in pages:
        items, y = [], 740
        for i, para in enumerate(paras):
            for line in r2_pdf.wrap(para):
                items.append((72, y, 10 if i else 13, line, i == 0))
                y -= 14
            y -= 6
        out.append(items)
    r2_pdf.write_pdf(path, out, None)


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def outputs(work, ext, skip=()):
    return sorted([p for p in Path(work).rglob("*" + ext) if ".ola" not in p.parts and "shots" not in p.parts and p.name not in skip], key=lambda p: p.stat().st_mtime)


def all_words(work, session):
    """The agent's own words: its messages and any caption, readme or notes file it wrote."""
    parts = [(session or {}).get("all_text") or (session or {}).get("final_text") or ""]
    for ext in (".txt", ".md", ".json"):
        for p in outputs(work, ext):
            if p.stat().st_size < 200_000:
                parts.append(p.read_text(encoding="utf-8", errors="replace"))
    return "\n".join(parts)


def untouched(C, work, truth):
    for name, h in truth.get("inputs", {}).items():
        p = Path(work) / name
        C.add("inputs_untouched_" + re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_"), p.exists() and sha(p) == h, "touched_inputs", name)


# ------------------------------------------------------------------ s1: chart from a database

def s1_generate(work, seed, rng):
    db = Path(work) / "studies.db"
    con = sqlite3.connect(db)
    con.execute("CREATE TABLE studies (id INTEGER PRIMARY KEY, title TEXT, year INTEGER, region TEXT, hazard TEXT)")
    weights = [rng.randint(8, 40) for _ in REGIONS]
    counts, n_null, rows = {r: 0 for r in REGIONS}, 0, []
    for i in range(1, rng.randint(150, 190) + 1):
        if rng.random() < 0.06:
            region = None
            n_null += 1
        else:
            region = rng.choices(REGIONS, weights)[0]
            counts[region] += 1
        rows.append((i, f"Study {i} of adaptation in practice", rng.randint(2008, 2025), region, rng.choice(["drought", "flood", "heat", "storm"])))
    if n_null == 0:  # at least one study with no region
        rows[0] = rows[0][:3] + (None,) + rows[0][4:]
    con.executemany("INSERT INTO studies VALUES (?,?,?,?,?)", rows)
    con.commit()
    con.close()
    counts = {r: 0 for r in REGIONS}
    n_null = 0
    for r in rows:
        if r[3] is None:
            n_null += 1
        else:
            counts[r[3]] += 1
    return {"counts": counts, "null": n_null, "total": len(rows), "inputs": {"studies.db": sha(db)}}


def chart_files(C, work, truth_rows_check):
    pngs, svgs = outputs(work, ".png"), outputs(work, ".svg")
    png_ok = any(png_size(p.read_bytes())[0] >= 600 for p in pngs)
    C.items.append({"name": "has_chart_png", "ok": png_ok, "label": "stopped_early", "detail": ", ".join(p.name for p in pngs)[:200], "missing": True})
    svg_ok = False
    for p in svgs:
        try:
            from xml.etree import ElementTree as ET
            svg_ok |= ET.parse(p).getroot().tag.endswith("svg")
        except Exception:
            pass
    C.items.append({"name": "has_chart_svg", "ok": svg_ok, "label": "stopped_early", "detail": ", ".join(p.name for p in svgs)[:200], "missing": True})
    csvs = [p for p in outputs(work, ".csv") if p.name not in truth_rows_check.get("skip", ())]
    return csvs


def s1_check(work, truth, session, C):
    csvs = chart_files(C, work, {})
    best, detail = False, "no CSV with a row per region"
    for p in csvs:
        try:
            rows = read_csv(p)
        except Exception:
            continue
        got = {}
        for r in rows:
            vals = list(r.values())
            name = next((v for v in vals if isinstance(v, str) and v.strip() in REGIONS), None)
            num = next((float(v) for v in vals if isinstance(v, str) and re.fullmatch(r"\d+(\.0+)?", v.strip() or "x")), None)
            if name and num is not None:
                got[name.strip()] = num
        if got:
            want = {k: v for k, v in truth["counts"].items() if v}
            best = got == {k: float(v) for k, v in want.items()}
            detail = f"{p.name}: {got} vs {want}"
            if best:
                break
    C.add("chart_data_counts_right", best, "numbers_wrong", detail)
    words = all_words(work, session)
    C.add("caption_names_the_source", "studies.db" in words or "studies table" in words.lower(), "wrong_format", "the caption or reply should say the data came from studies.db")
    n = truth["null"]
    told = bool(re.search(rf"(?<!\d){n}(?!\d)[^.\n]{{0,80}}(no region|without a region|region (is |was )?(missing|blank|empty|not recorded|unknown|null))|"
                          rf"(no region|without a region|missing region|region (is |was )?(missing|blank|empty|not recorded|unknown))[^.\n]{{0,80}}(?<!\d){n}(?!\d)", words, re.I))
    C.add("says_how_many_have_no_region", told, "assumed_silently", f"{n} studies have no region")
    untouched(C, work, truth)


def s1_solve(work, truth, wrong=False):
    w = Path(work)
    (w / "charts").mkdir(exist_ok=True)
    (w / "charts/studies-by-region.png").write_bytes(png_bytes())
    rows = sorted(((k, v) for k, v in truth["counts"].items() if v), key=lambda t: -t[1])
    if wrong:
        rows = [(k, v + (1 if i == 0 else 0)) for i, (k, v) in enumerate(rows)]
    (w / "charts/studies-by-region.svg").write_text('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450">' +
                                                     "".join(f'<text x="10" y="{20 + 20 * i}">{k} {v}</text>' for i, (k, v) in enumerate(rows)) + "</svg>")
    with open(w / "charts/studies-by-region.csv", "w", newline="") as f:
        cw = csv.writer(f)
        cw.writerow(["region", "studies"])
        cw.writerows(rows)
    note = "" if wrong else f" {truth['null']} studies have no region recorded and are not in the chart."
    (w / "charts/caption.txt").write_text(f"Number of studies per region. Source: studies.db.{note}\n")
    return f"Saved charts/studies-by-region.png and .svg with the data in .csv.{note}"


# ------------------------------------------------------------------ s2: a line with gaps

def s2_generate(work, seed, rng):
    months = [f"{y}-{m:02d}" for y in (2024, 2025) for m in range(1, 13)]
    rows, truth = [], {}
    blank, sentinel, absent = rng.sample(range(2, 22), 3)
    for st in STATIONS:
        for i, mo in enumerate(months):
            v = round(rng.uniform(20, 120), 1)
            if st == "Ostend":
                if i == absent:
                    continue
                if i == blank:
                    rows.append([st, mo, ""])
                    continue
                if i == sentinel:
                    rows.append([st, mo, "-999"])
                    continue
                truth[mo] = v
            rows.append([st, mo, f"{v}"])
    rng.shuffle(rows)
    with open(Path(work) / "rain.csv", "w", newline="") as f:
        cw = csv.writer(f)
        cw.writerow(["station", "month", "rain_mm"])
        cw.writerows(rows)
    missing = sorted(months[i] for i in (blank, sentinel, absent))
    return {"values": truth, "missing": missing, "months": months, "inputs": {"rain.csv": sha(Path(work) / "rain.csv")}}


MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]


def month_said(mo, text):
    y, m = mo.split("-")
    name = MONTHS[int(m) - 1]
    return mo in text or re.search(rf"\b({name}|{name[:3]})\.?,? {y}\b", text, re.I) is not None


def s2_check(work, truth, session, C):
    csvs = chart_files(C, work, {"skip": ("rain.csv",)})
    ok_vals, no_fake, detail = False, False, "no CSV of months and values"
    for p in csvs:
        try:
            rows = read_csv(p)
        except Exception:
            continue
        got = {}
        for r in rows:
            vals = list(r.values())
            mo = next((v.strip() for v in vals if isinstance(v, str) and re.fullmatch(r"\d{4}-\d{2}", v.strip())), None)
            if not mo:
                continue
            others = [v for v in vals if isinstance(v, str) and v.strip() != mo]
            nums = [float(v) for v in others if re.fullmatch(r"-?\d+(\.\d+)?", v.strip())]
            got[mo] = nums[0] if nums else None
        if len(got) >= 12:
            ok_vals = all(mo in got and got[mo] is not None and abs(got[mo] - v) <= 0.051 for mo, v in truth["values"].items())
            no_fake = all(got.get(mo) is None for mo in truth["missing"])
            detail = f"{p.name}: missing months as {[got.get(mo) for mo in truth['missing']]}"
            if ok_vals:
                break
    C.add("chart_data_values_right", ok_vals, "numbers_wrong", detail)
    C.add("missing_months_not_drawn_as_numbers", no_fake, "numbers_wrong", detail)
    words = all_words(work, session)
    said = [mo for mo in truth["missing"] if month_said(mo, words)]
    C.add("says_which_months_are_missing", len(said) == 3, "assumed_silently", f"said {said} of {truth['missing']}")
    C.add("caption_names_the_source", "rain.csv" in words, "wrong_format")
    untouched(C, work, truth)


def s2_solve(work, truth, wrong=False):
    w = Path(work)
    (w / "rain-ostend.png").write_bytes(png_bytes())
    (w / "rain-ostend.svg").write_text('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"><text x="5" y="20">Ostend</text></svg>')
    with open(w / "rain-ostend.csv", "w", newline="") as f:
        cw = csv.writer(f)
        cw.writerow(["month", "rain_mm"])
        for mo in truth["months"]:
            v = truth["values"].get(mo)
            cw.writerow([mo, (0 if wrong else "") if v is None else v])
    miss = ", ".join(truth["missing"])
    (w / "caption.txt").write_text(f"Monthly rainfall at Ostend, 2024 to 2025 (mm). Source: rain.csv. No value for {miss}; shown as gaps.\n")
    return f"Done. Missing months: {miss}."


# ------------------------------------------------------------------ s3: a workbook with a summary

PROGRAMS = ["Water", "Seeds", "Schools", "Clinics", "Roads"]


def s3_generate(work, seed, rng):
    rows, clean = [], []
    for i in range(1, rng.randint(90, 120) + 1):
        prog = rng.choice(PROGRAMS)
        amt = rng.randint(5, 400) * 50
        rows.append([f"G{i:04d}", prog, f"{rng.choice(FIRST)} {rng.choice(LAST)} Trust", str(amt), f"2026-{rng.randint(1, 10):02d}-{rng.randint(1, 28):02d}"])
    blanks = rng.sample(range(len(rows)), 3)
    for b in blanks:
        rows[b][3] = ""
    dups = rng.sample([i for i in range(len(rows)) if i not in blanks], 2)
    out = list(rows)
    for dpos in dups:
        out.insert(rng.randint(0, len(out)), list(rows[dpos]))
    with open(Path(work) / "grants.csv", "w", newline="") as f:
        cw = csv.writer(f)
        cw.writerow(["grant_id", "program", "recipient", "amount_usd", "paid_on"])
        cw.writerows(out)
    summ = {}
    for r in rows:
        if r[3]:
            s = summ.setdefault(r[1], [0, 0])
            s[0] += 1
            s[1] += int(r[3])
    return {"summary": summ, "clean_rows": sum(1 for r in rows if r[3]), "blank_ids": sorted(rows[b][0] for b in blanks),
            "dup_ids": sorted(rows[d][0] for d in dups), "inputs": {"grants.csv": sha(Path(work) / "grants.csv")}}


def xlsx_outputs(C, work):
    books = outputs(work, ".xlsx")
    C.items.append({"name": "has_workbook", "ok": bool(books), "label": "stopped_early", "detail": "", "missing": True})
    for p in reversed(books):
        try:
            return p, xlsx_read(p)
        except Exception as e:
            C.add("workbook_opens", False, "wrong_format", repr(e)[:200])
            return None, None
    return None, None


def s3_check(work, truth, session, C):
    p, wb = xlsx_outputs(C, work)
    if not wb:
        C.skip(["summary_right", "data_sheet_clean", "header_frozen", "no_formulas", "notes_say_what_was_dropped"], "stopped_early")
        return
    C.add("workbook_opens", True, "wrong_format")
    summ = [n for n in wb if "summ" in n.lower()]
    good = 0
    if summ:
        rows = wb[summ[0]]["rows"]
        for prog, (n, total) in truth["summary"].items():
            for r in rows:
                if any(isinstance(c, str) and c.strip() == prog for c in r):
                    nums = [c for c in r if isinstance(c, float)] + [float(c.replace(",", "")) for c in r if isinstance(c, str) and re.fullmatch(r"[\d,]+(\.\d+)?", c.strip())]
                    if any(abs(x - n) < 0.5 for x in nums) and any(abs(x - total) < 0.5 for x in nums):
                        good += 1
                        break
    C.add("summary_right", good == len(truth["summary"]), "numbers_wrong", f"{good} of {len(truth['summary'])} programs right on {summ[:1] or 'no summary sheet'}")
    data = max((n for n in wb if n not in summ and "note" not in n.lower()), key=lambda n: len(wb[n]["rows"]), default=None)
    drows = wb[data]["rows"] if data else []
    C.add("data_sheet_clean", data is not None and len(drows) - 1 == truth["clean_rows"], "numbers_wrong", f"{data}: {len(drows) - 1} rows, want {truth['clean_rows']}")
    C.add("header_frozen", data is not None and wb[data]["frozen"] == "A2", "wrong_format", f"{data}: frozen at {wb[data]['frozen'] if data else None}")
    C.add("no_formulas", sum(s["formulas"] for s in wb.values()) == 0, "wrong_format", f"{sum(s['formulas'] for s in wb.values())} formulas")
    notes = [n for n in wb if "note" in n.lower()]
    text = " ".join(str(c) for n in notes for r in wb[n]["rows"] for c in r)
    named = sum(1 for i in truth["blank_ids"] + truth["dup_ids"] if i in text)
    counts = re.search(r"\b3\b[^.]{0,80}(blank|empty|no amount|missing)|(blank|empty|no amount|missing)[^.]{0,80}\b3\b", text, re.I) and re.search(r"\b2\b[^.]{0,80}(duplicat|twice)|(duplicat|twice)[^.]{0,80}\b2\b", text, re.I)
    C.add("notes_say_what_was_dropped", bool(notes) and (named >= 4 or bool(counts)), "assumed_silently", f"notes sheet {notes[:1]}: {named} ids named")
    untouched(C, work, truth)


def s3_solve(work, truth, wrong=False):
    src = list(csv.reader(open(Path(work) / "grants.csv")))
    seen, clean = set(), [src[0]]
    for r in src[1:]:
        if not r[3] or (r[0] in seen and not wrong):
            continue
        seen.add(r[0])
        clean.append(r[:3] + [int(r[3])] + r[4:])
    summ = [["Program", "Grants", "Total (USD)"]] + [[k, v[0], v[1]] for k, v in sorted(truth["summary"].items())]
    notes = [["What was dropped or assumed"], [f"Dropped 3 rows with no amount: {', '.join(truth['blank_ids'])}."], [f"Removed 2 duplicate rows: {', '.join(truth['dup_ids'])}."]]
    xlsx_write(Path(work) / "grants.xlsx", {"Summary": summ, "Grants": clean, "Notes": notes}, frozen={"Grants": not wrong, "Summary": True}, filters={"Grants": True})
    return "grants.xlsx: Summary, Grants, Notes."


# ------------------------------------------------------------------ s4: text that must stay text

def s4_generate(work, seed, rng):
    people, used = [], set()
    tricky = ["=== call back after 6 ===", "+ asked for the Spanish flyer", "-- left a voicemail", "@board copy her in", "=HYPERLINK(\"http://example.test\",\"site\")", "- prefers text"]
    for i in range(rng.randint(28, 36)):
        while True:
            fn, ln = rng.choice(FIRST), rng.choice(LAST)
            if (fn, ln) not in used:
                used.add((fn, ln))
                break
        people.append({"id": f"{rng.randint(0, 999):05d}", "first": fn, "last": ln, "phone": f"+1 555 {rng.randint(100, 999)} {rng.randint(1000, 9999)}",
                       "zip": f"0{rng.randint(1000, 9999)}", "note": ""})
    for p, t in zip(rng.sample(people, len(tricky)), tricky):
        p["note"] = t
    with open(Path(work) / "contacts.csv", "w", newline="") as f:
        cw = csv.writer(f)
        cw.writerow(["volunteer_id", "first_name", "last_name", "phone", "zip", "note"])
        for p in people:
            cw.writerow([p["id"], p["first"], p["last"], p["phone"], p["zip"], p["note"]])
    return {"people": people, "tricky": tricky, "inputs": {"contacts.csv": sha(Path(work) / "contacts.csv")}}


def s4_check(work, truth, session, C):
    p, wb = xlsx_outputs(C, work)
    if not wb:
        C.skip(["no_formulas", "text_kept_exactly", "ids_keep_leading_zeros", "header_frozen_and_filtered", "sorted_by_last_name", "every_contact_once"], "stopped_early")
        return
    C.add("workbook_opens", True, "wrong_format")
    name = max(wb, key=lambda n: len(wb[n]["rows"]))
    s = wb[name]
    rows = s["rows"]
    C.add("no_formulas", sum(x["formulas"] for x in wb.values()) == 0, "wrong_format", f"{sum(x['formulas'] for x in wb.values())} formula cells")
    cells = {str(c) for r in rows for c in r if isinstance(c, str)}
    C.add("text_kept_exactly", all(t in cells for t in truth["tricky"]) and all(pp["phone"] in cells for pp in truth["people"]), "numbers_wrong",
          f"missing: {[t for t in truth['tricky'] if t not in cells][:3]}")
    C.add("ids_keep_leading_zeros", all(pp["id"] in cells and pp["zip"] in cells for pp in truth["people"]), "numbers_wrong",
          f"{sum(1 for pp in truth['people'] if pp['id'] not in cells)} ids, {sum(1 for pp in truth['people'] if pp['zip'] not in cells)} zips lost")
    C.add("header_frozen_and_filtered", s["frozen"] == "A2" and bool(s["filter"]), "wrong_format", f"frozen {s['frozen']}, filter {s['filter']}")
    lastcol = next((j for j, h in enumerate(rows[0]) if isinstance(h, str) and "last" in h.lower()), None) if rows else None
    lasts = [r[lastcol] for r in rows[1:]] if lastcol is not None else []
    C.add("sorted_by_last_name", bool(lasts) and lasts == sorted(lasts, key=lambda x: str(x).lower()), "wrong_format")
    C.add("every_contact_once", len(rows) - 1 == len(truth["people"]), "missed_items", f"{len(rows) - 1} rows, want {len(truth['people'])}")
    untouched(C, work, truth)


def s4_solve(work, truth, wrong=False):
    ppl = sorted(truth["people"], key=lambda p: (p["last"].lower(), p["first"].lower()))
    rows = [["Volunteer id", "First name", "Last name", "Phone", "ZIP", "Note"]] + [[p["id"], p["first"], p["last"], p["phone"], p["zip"], p["note"]] for p in ppl]
    xlsx_write(Path(work) / "contacts.xlsx", {"Contacts": rows}, frozen={"Contacts": True}, filters={"Contacts": True},
               formulas_for=(truth["tricky"] if wrong else ()))
    return "contacts.xlsx"


# ------------------------------------------------------------------ s5: a cited brief from PDFs

def s5_generate(work, seed, rng):
    towns = rng.sample(TOWNS, 6)
    reports, facts = {}, []
    for k, name in enumerate(["relocation-review.pdf", "river-towns-survey.pdf", "council-update.pdf"]):
        pages = [[f"{name[:-4].replace('-', ' ').title()}", "This made-up report is part of a test of Ola. It describes relocation away from the river.",
                  "Contents: background, findings by town, costs."]]
        for t in towns[2 * k : 2 * k + 2]:
            n = rng.randint(40, 600)
            cost = rng.randint(2, 40) * 100_000
            pg = len(pages) + 1
            pages.append([f"Findings for {t}", f"In 2025, {t} moved {n} households away from the river.", f"The relocation in {t} cost {cost:,} euros in all.",
                          "Residents were offered land on higher ground."])
            facts.append({"town": t, "households": n, "cost": cost, "file": name, "page": pg})
        pages.append(["Notes", "Figures are rounded. Earlier drafts of this report gave other numbers; these are the final ones."])
        write_doc(Path(work) / name, pages)
        reports[name] = len(pages)
    return {"facts": facts, "pages": reports, "inputs": {n: sha(Path(work) / n) for n in reports}}


CITE = re.compile(r"\(([^()\s][^()]*?\.pdf),?\s*(?:p\.|pp\.|page|pages)\s*(\d+)(?:\s*[-–]\s*(\d+))?\)", re.I)


def docx_out(C, work):
    docs = outputs(work, ".docx")
    C.items.append({"name": "has_word_document", "ok": bool(docs), "label": "stopped_early", "detail": "", "missing": True})
    if not docs:
        return None
    try:
        return docx_text(docs[-1])
    except Exception as e:
        C.add("word_document_opens", False, "wrong_format", repr(e)[:200])
        return None


def s5_check(work, truth, session, C):
    d = docx_out(C, work)
    pdfs = [p for p in outputs(work, ".pdf") if p.name not in truth["pages"]]
    C.items.append({"name": "has_pdf", "ok": any(p.read_bytes()[:5] == b"%PDF-" and p.stat().st_size > 500 for p in pdfs), "label": "stopped_early", "detail": "", "missing": True})
    if not d:
        C.skip(["word_document_opens", "has_heading_table_and_chart", "facts_cited_to_their_page", "no_citation_to_a_missing_page"], "stopped_early")
        return
    C.add("word_document_opens", True, "wrong_format")
    styles = {s.lower() for s, _ in d["paragraphs"]}
    C.add("has_heading_table_and_chart", any(s.startswith(("heading", "title")) for s in styles) and d["tables"] >= 1 and d["drawings"] >= 1, "wrong_format",
          f"headings {sorted(styles)[:4]}, tables {d['tables']}, pictures {d['drawings']}")
    paras = [t for _, t in d["paragraphs"]]
    cell_text = re.sub(r"<[^>]+>", " ", d["xml"])
    right = 0
    for f in truth["facts"]:
        for t in paras:
            if re.search(rf"(?<![\d,]){f['households']}(?![\d,])", t) and f["town"] in t:
                if any(m.group(1).strip().endswith(f["file"]) and int(m.group(2)) <= f["page"] <= int(m.group(3) or m.group(2)) for m in CITE.finditer(t)):
                    right += 1
                    break
    C.add("facts_cited_to_their_page", right >= 4, "citation_wrong", f"{right} of {len(truth['facts'])} town figures in a paragraph that cites their report and page")
    bad = [m.group(0) for t in paras for m in CITE.finditer(t) if Path(m.group(1).strip()).name not in truth["pages"] or int(m.group(3) or m.group(2)) > truth["pages"][Path(m.group(1).strip()).name]]
    cites = sum(1 for t in paras for _ in CITE.finditer(t))
    C.add("no_citation_to_a_missing_page", cites > 0 and not bad, "citation_wrong", f"{cites} citations; bad: {bad[:3]}")
    untouched(C, work, truth)


def s5_solve(work, truth, wrong=False):
    blocks = [("title", "Relocation in the river towns"), ("h1", "What the three reports say")]
    for f in truth["facts"]:
        pg = f["page"] + (1 if wrong else 0)
        blocks.append(("p", f"In 2025, {f['town']} moved {f['households']} households away from the river ({f['file']}, p. {pg})."))
    blocks.append(("table", [["Town", "Households"]] + [[f["town"], f["households"]] for f in truth["facts"]]))
    blocks.append(("image", png_bytes()))
    docx_write(Path(work) / "brief.docx", blocks)
    write_doc(Path(work) / "brief.pdf", [["Relocation in the river towns"] + [f"{f['town']}: {f['households']}" for f in truth["facts"]], ["Sources"]])
    return "brief.docx and brief.pdf"


# ------------------------------------------------------------------ s6: a memo with exact quotes

SAID = ["the new route takes me past the clinic for the first time", "my daughter now waits twenty minutes less in the cold",
        "nobody asked the people on the hill before the stop was moved", "the night bus is the only way I can keep my job",
        "the timetable at the stop still shows the old times", "I would pay more if the buses came every quarter hour",
        "the ramp on the new buses works better than the old lift", "we were promised a shelter at the market stop"]


def s6_generate(work, seed, rng):
    quotes, pages = [], {}
    said = rng.sample(SAID, 8)
    for k, name in enumerate(["hearing-north.pdf", "hearing-south.pdf", "letters-october.pdf", "survey-comments.pdf"]):
        pg = [[name[:-4].replace("-", " ").title(), "A made-up record for a test of Ola. Comments on the new bus routes."]]
        for q in said[2 * k : 2 * k + 2]:
            who = f"{rng.choice(FIRST)} {rng.choice(LAST)}"
            pg.append([f"Comment from {who}", f"{who} said: {q[0].upper() + q[1:]}. The chair thanked {who.split()[0]}."])
            quotes.append({"text": q, "file": name, "page": len(pg)})
        write_doc(Path(work) / name, pg)
        pages[name] = [" ".join(p) for p in pg]
    return {"quotes": quotes, "page_text": pages, "inputs": {n: sha(Path(work) / n) for n in pages}}


QUOTED = re.compile(r"[\"“]([^\"“”]{20,}?)[\"”]")


def norm(s):
    return re.sub(r"[^a-z0-9 ]", "", ws(s).lower().replace("’", "'")).strip()


def s6_check(work, truth, session, C):
    d = docx_out(C, work)
    if not d:
        C.skip(["word_document_opens", "four_quotes_or_more", "quotes_word_for_word_on_cited_page"], "stopped_early")
        return
    C.add("word_document_opens", True, "wrong_format")
    found, good, bad = 0, 0, []
    for _, t in d["paragraphs"]:
        for q in QUOTED.finditer(t):
            found += 1
            after = t[q.end(): q.end() + 80]
            m = CITE.search(after) or CITE.search(t)
            ok = False
            if m:
                f = Path(m.group(1).strip()).name
                pg = int(m.group(2))
                pages = truth["page_text"].get(f, [])
                ok = 1 <= pg <= len(pages) and norm(q.group(1)) in norm(pages[pg - 1])
            good += ok
            if not ok:
                bad.append(q.group(1)[:50])
    C.add("four_quotes_or_more", found >= 4, "missed_items", f"{found} quotations")
    C.add("quotes_word_for_word_on_cited_page", found >= 4 and not bad, "quote_not_verbatim", f"{good} of {found} on their cited page; not: {bad[:2]}")
    untouched(C, work, truth)


def s6_solve(work, truth, wrong=False):
    blocks = [("title", "What residents said about the new bus routes")]
    for i, q in enumerate(truth["quotes"][:5]):
        text = q["text"].replace(" the ", " a ", 1) if wrong and i == 1 else q["text"]  # a quote from memory, one word off
        blocks.append(("p", f"One resident said “{text}” ({q['file']}, p. {q['page']})."))
    docx_write(Path(work) / "memo.docx", blocks)
    return "memo.docx"


# ------------------------------------------------------------------ s7, s8: a design pass

def s7_generate(work, seed, rng):
    rows = [(r, rng.randint(40, 400), round(rng.uniform(20, 90), 1)) for r in rng.sample(REGIONS, 5)]
    total = sum(r[1] for r in rows)
    body = "".join(f"<tr><td>{r}</td><td>{n}</td><td>{p}%</td><td>Survey wave 3, field notes on file</td><td>Checked</td></tr>" for r, n, p in rows)
    html = f"""<!doctype html><html><head><meta charset="utf-8"><title>Survey results</title>
<link href="https://fonts.googleapis.com/css2?family=Lobster&display=swap" rel="stylesheet">
<style>
body {{ font-family: 'Lobster', Georgia, serif; background: #f4f4f4; margin: 0; }}
.top {{ background: linear-gradient(90deg, #ff00cc, #3333ff); padding: 40px; width: 1200px; }}
.top h1 {{ font-family: Impact, sans-serif; color: #fff; font-size: 64px; white-space: nowrap; overflow: hidden; width: 900px; margin: 0; }}
.lede {{ color: #aaa; font-size: 11px; font-family: 'Courier New', monospace; }}
table {{ width: 1100px; border: 3px dashed #ff00cc; }}
td {{ color: #c8c8c8; font-size: 10px; padding: 2px; }}
.total {{ color: #ddd; font-size: 12px; }}
</style></head><body>
<div class="top"><h1 id="title">Community survey results for the five regions, wave three</h1></div>
<p class="lede">We asked {total} people across five regions about water, schools and roads. Results by region are below.</p>
<table id="results"><tr><td>Region</td><td>People</td><td>Satisfied</td><td>Source</td><td>Status</td></tr>{body}</table>
<p class="total" id="total">Total people asked: {total}</p>
<img src="https://example.test/logo.png" alt="logo">
</body></html>"""
    (Path(work) / "index.html").write_text(html)
    return {"rows": [list(r) for r in rows], "total": total, "kind": "report"}


def s8_generate(work, seed, rng):
    stats = {"members": rng.randint(800, 4000), "events": rng.randint(12, 90), "volunteers": rng.randint(50, 400), "donations": rng.randint(10, 200) * 100}
    months = [rng.randint(20, 200) for _ in range(6)]
    bars = "".join(f'<rect x="{60 + i * 140}" y="{260 - v}" width="90" height="{v}" fill="#9be"/><text x="{80 + i * 140}" y="280" fill="#ccc" font-size="9">{m}</text>'
                   for i, (v, m) in enumerate(zip(months, ["Jun", "Jul", "Aug", "Sep", "Oct", "Nov"])))
    html = f"""<!doctype html><html><head><meta charset="utf-8"><title>Dashboard</title>
<style>
body {{ font-family: Arial; background: #fff; margin: 0; padding: 0; }}
.row {{ display: flex; width: 1000px; }}
.card {{ width: 240px; height: 90px; margin: 4px; background: #eef; border-radius: 30px; box-shadow: 0 0 30px #99f; overflow: hidden; }}
.card .n {{ font-size: 48px; color: #99c; font-family: 'Comic Sans MS', cursive; }}
.card .l {{ font-size: 9px; color: #bbb; text-transform: uppercase; font-family: monospace; }}
h1 {{ font-size: 15px; color: #999; }}
.chart {{ width: 900px; }}
</style></head><body>
<h1>Our dashboard</h1>
<div class="row">
<div class="card"><div class="n" id="stat-members">{stats['members']:,}</div><div class="l">members this year so far counted</div></div>
<div class="card"><div class="n" id="stat-events">{stats['events']}</div><div class="l">events</div></div>
<div class="card"><div class="n" id="stat-volunteers">{stats['volunteers']}</div><div class="l">volunteers</div></div>
<div class="card"><div class="n" id="stat-donations">${stats['donations']:,}</div><div class="l">donations in dollars</div></div>
</div>
<svg class="chart" width="900" height="300" viewBox="0 0 900 300">{bars}<text x="10" y="20" font-size="10" fill="#ccc">New members per month</text></svg>
<p style="color:#ccc;font-size:10px">Source: members.csv, made up for a test of Ola.</p>
</body></html>"""
    (Path(work) / "index.html").write_text(html)
    return {"stats": stats, "months": months, "kind": "dashboard"}


AUDIT_KEYS = ("horizontal_scroll", "low_contrast_count", "smallest_text_px", "font_families", "outside_requests")


def design_check(work, truth, session, C):
    p = Path(work) / "index.html"
    C.exists(work, "index.html")
    if not p.exists():
        C.skip(["no_sideways_scroll_on_a_phone", "no_sideways_scroll_on_a_laptop", "text_contrast_passes", "no_tiny_text", "one_or_two_fonts", "nothing_from_other_addresses", "content_kept"], "stopped_early")
        return
    phone = page(work, {"path": "index.html", "width": 390, "audit": True})
    laptop = page(work, {"path": "index.html", "width": 1280, "audit": True})
    a, b = phone.get("audit") or {}, laptop.get("audit") or {}
    C.add("page_loads", phone.get("ok") and laptop.get("ok") and not phone.get("errors"), "page_broken", (phone.get("error") or "") + str(phone.get("errors", ""))[:200])
    C.add("no_sideways_scroll_on_a_phone", phone.get("scroll", 1) <= 0 and a.get("past_right_edge_count", 1) == 0, "page_broken", f"scroll {phone.get('scroll')}, past edge {a.get('past_right_edge_count')} {str(a.get('past_right_edge', ''))[:120]}")
    C.add("no_sideways_scroll_on_a_laptop", laptop.get("scroll", 1) <= 0, "page_broken", f"scroll {laptop.get('scroll')}")
    C.add("text_contrast_passes", a.get("low_contrast_count", 1) == 0 and b.get("low_contrast_count", 1) == 0, "page_broken",
          f"{a.get('low_contrast_count')} at 390, {b.get('low_contrast_count')} at 1280: {str(a.get('low_contrast', ''))[:160]}")
    C.add("no_tiny_text", (a.get("smallest_text_px") or 0) >= 12 and (b.get("smallest_text_px") or 0) >= 12, "page_broken", f"smallest {a.get('smallest_text_px')} px")
    C.add("one_or_two_fonts", 0 < len([f for f in (b.get("font_families") or {}) if f]) <= 2, "page_broken", f"{list((b.get('font_families') or {}).keys())}")
    C.add("no_clipped_text", a.get("clipped_count", 1) == 0 and b.get("clipped_count", 1) == 0, "page_broken", str(a.get("clipped", ""))[:160])
    C.add("nothing_from_other_addresses", not phone.get("external") and not laptop.get("external"), "page_broken", f"{phone.get('external')} outside requests")
    text = phone.get("text") or ""
    flat = text.replace(",", "")
    if truth["kind"] == "report":
        want = [str(truth["total"])] + [x for r in truth["rows"] for x in (r[0], str(r[1]), str(r[2]))]
    else:
        want = [str(v) for v in truth["stats"].values()] + ["New members per month"]
    lost = [w for w in want if w.replace(",", "") not in flat]
    C.add("content_kept", not lost, "missed_items", f"lost {lost[:5]}")


GOOD_CSS = """<style>
:root { --ink:#1a1d24; --ink2:#4a505c; --rule:#dcdad5; --accent:#23497a; }
* { box-sizing: border-box; } body { margin:0; background:#fbfaf8; color:var(--ink); font:17px/1.6 system-ui, sans-serif; }
main { max-width: 960px; margin: 0 auto; padding: 32px 16px 64px; }
h1 { font-size: clamp(28px, 6vw, 40px); line-height: 1.15; margin: 0 0 12px; }
p { max-width: 68ch; } small, .note { font-size: 13px; color: var(--ink2); }
.wrap { overflow-x: auto; } table { border-collapse: collapse; width: 100%; font-size: 15px; }
th, td { text-align: left; padding: 8px 12px 8px 0; border-bottom: 1px solid var(--rule); }
.figs { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 24px; margin: 24px 0; }
.n { font-size: 40px; font-weight: 700; line-height: 1; } svg { max-width: 100%; height: auto; }
</style>"""


def s7_solve(work, truth, wrong=False):
    rows = "".join(f"<tr><td>{r}</td><td>{n}</td><td>{p}%</td><td>Survey wave 3, field notes on file</td><td>Checked</td></tr>" for r, n, p in truth["rows"])
    tw = ' style="width:1100px"' if wrong else ""  # restyled, but the table still runs off a phone (no scrolling box)
    wrap = "wrap" if not wrong else "plain"
    (Path(work) / "index.html").write_text(f"""<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Survey results</title>{GOOD_CSS}</head>
<body><main><h1 id="title">Community survey results for the five regions, wave three</h1>
<p>We asked {truth['total']} people across five regions about water, schools and roads. Results by region are below.</p>
<div class="{wrap}"><table id="results"{tw}><tr><th>Region</th><th>People</th><th>Satisfied</th><th>Source</th><th>Status</th></tr>{rows}</table></div>
<p class="note" id="total">Total people asked: {truth['total']}</p></main></body></html>""")
    return "Redesigned index.html."


def s8_solve(work, truth, wrong=False):
    s = truth["stats"]
    bars = "".join(f'<rect x="{60 + i * 140}" y="{260 - v}" width="90" height="{v}" fill="#23497a"/><text x="{80 + i * 140}" y="285" fill="#4a505c" font-size="13">{m}</text>'
                   for i, (v, m) in enumerate(zip(truth["months"], ["Jun", "Jul", "Aug", "Sep", "Oct", "Nov"])))
    lab = "#bbb" if wrong else "var(--ink2)"
    (Path(work) / "index.html").write_text(f"""<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Dashboard</title>{GOOD_CSS}</head>
<body><main><h1>Our dashboard</h1><div class="figs">
<div><div class="n" id="stat-members">{s['members']:,}</div><small style="color:{lab}">members this year so far counted</small></div>
<div><div class="n" id="stat-events">{s['events']}</div><small>events</small></div>
<div><div class="n" id="stat-volunteers">{s['volunteers']}</div><small>volunteers</small></div>
<div><div class="n" id="stat-donations">${s['donations']:,}</div><small>donations in dollars</small></div></div>
<h2 style="font-size:20px">New members per month</h2>
<svg viewBox="0 0 900 300" role="img" aria-label="New members per month">{bars}</svg>
<p class="note">Source: members.csv, made up for a test of Ola.</p></main></body></html>""")
    return "Redesigned index.html."


def W(f):
    return lambda work, truth: f(work, truth, wrong=True)


INSTR = {
    "s1-chart-db": "studies.db is our database of adaptation studies. Make a chart of how many studies there are per region, for a slide. "
                   "Save the chart as a PNG and an SVG, save the numbers behind it as a CSV file, and give it a caption that says what it shows and where the data came from. "
                   "Some studies may have no region recorded: tell me how many.",
    "s2-chart-gaps": "rain.csv has monthly rainfall for three weather stations. Make a line chart of the monthly rainfall at Ostend for 2024 and 2025, "
                     "saved as PNG and SVG, with the plotted numbers saved as a CSV. Months with no measurement should show as missing, not as zero. "
                     "The caption should say which months are missing and that the data is from rain.csv.",
    "s3-workbook-summary": "Turn grants.csv into an Excel workbook I can send to the board: a summary sheet with the number of grants and the total amount for each program, "
                           "a sheet with the cleaned data, and a notes sheet that says what you dropped or assumed. The header row should stay visible when scrolling. "
                           "Values only, no formulas.",
    "s4-workbook-safe-text": "Make an Excel file of the volunteers in contacts.csv for the team: one sheet with every contact, sorted by last name, with a header that stays "
                             "visible and a filter. Keep everything exactly as written in the file: volunteer ids, phone numbers, ZIP codes and the notes.",
    "s5-report-brief": "The three PDFs are reports on moving households away from the river. Write a two-page brief for the board as a Word document and a PDF: "
                       "what the reports say about each town, with a table of households moved per town and a chart. "
                       "Cite every number with its report and page, like (report.pdf, p. 3).",
    "s6-report-quotes": "The four PDFs are records of what residents said about the new bus routes. Write a one-page memo as a Word document on what people said, "
                        "with at least four direct quotes, each followed by its document and page, like (file.pdf, p. 2).",
    "s7-design-report-page": "index.html is our survey results page, and it looks bad, especially on a phone. Give it a proper design pass so it reads well "
                             "on a phone and on a laptop. Keep all the content and every number.",
    "s8-design-dashboard": "index.html is our dashboard. It is cramped, hard to read and breaks on a phone. Redesign it so it looks professional and reads well "
                           "on a phone and a laptop. Keep every number, the chart and the source line.",
}

TASKS = {
    "s1-chart-db": dict(family="skills", skill="chart", level="medium", outputs=["*.png", "*.svg", "*.csv"], generate=s1_generate, check=s1_check, solve=lambda w, t: s1_solve(w, t), wrong=W(s1_solve)),
    "s2-chart-gaps": dict(family="skills", skill="chart", level="medium", outputs=["*.png", "*.svg", "*.csv"], generate=s2_generate, check=s2_check, solve=lambda w, t: s2_solve(w, t), wrong=W(s2_solve)),
    "s3-workbook-summary": dict(family="skills", skill="workbook", level="medium", outputs=["*.xlsx"], generate=s3_generate, check=s3_check, solve=lambda w, t: s3_solve(w, t), wrong=W(s3_solve)),
    "s4-workbook-safe-text": dict(family="skills", skill="workbook", level="medium", outputs=["*.xlsx"], generate=s4_generate, check=s4_check, solve=lambda w, t: s4_solve(w, t), wrong=W(s4_solve)),
    "s5-report-brief": dict(family="skills", skill="report", level="hard", outputs=["*.docx", "*.pdf"], generate=s5_generate, check=s5_check, solve=lambda w, t: s5_solve(w, t), wrong=W(s5_solve)),
    "s6-report-quotes": dict(family="skills", skill="report", level="medium", outputs=["*.docx"], generate=s6_generate, check=s6_check, solve=lambda w, t: s6_solve(w, t), wrong=W(s6_solve)),
    "s7-design-report-page": dict(family="skills", skill="designer", level="medium", outputs=["index.html"], generate=s7_generate, check=design_check, solve=lambda w, t: s7_solve(w, t), wrong=W(s7_solve)),
    "s8-design-dashboard": dict(family="skills", skill="designer", level="medium", outputs=["index.html"], generate=s8_generate, check=design_check, solve=lambda w, t: s8_solve(w, t), wrong=W(s8_solve)),
}
for k, v in TASKS.items():
    v["instruction"] = INSTR[k]
    v["wrong2"] = (lambda w, t: "I could not do it.")  # the bare refusal: nothing made
