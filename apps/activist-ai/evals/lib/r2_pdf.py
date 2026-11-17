"""Round two, family `pdf`: real PDF files with pages, tables and footnotes. The workspace image has
python3 and no PDF tool, so the agent has to get the text out itself (the streams are Flate-compressed,
some words are split into kerned TJ pieces, table cells are separate text objects). Four tasks, p1 to p4.
The PDFs are written by the small writer below, so the truth (every page's text) is known exactly."""
import re, zlib
from pathlib import Path
from evalkit import read_csv, write_csv, num, read, has_number, verbatim, ws
import r2common as R
from r2_scale import wtext


# ---------------------------------------------------------------- a small PDF writer
def _esc(s):
    return s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def write_pdf(path, pages, rng=None):
    """pages: list of lists of (x, y, size, text, bold). Returns nothing; text is Latin-1."""
    objs = {1: b"<< /Type /Catalog /Pages 2 0 R >>", 3: b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
            4: b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"}
    kids = []
    n = 5
    for items in pages:
        ops = []
        for x, y, size, text, bold in items:
            if rng is not None and len(text) > 12 and rng.random() < 0.3:
                cut = rng.randint(3, len(text) - 3)
                show = f"[({_esc(text[:cut])}) -{rng.randint(5, 40)} ({_esc(text[cut:])})] TJ"
            else:
                show = f"({_esc(text)}) Tj"
            ops.append(f"BT /{'F2' if bold else 'F1'} {size} Tf 1 0 0 1 {x} {y} Tm {show} ET")
        data = zlib.compress("\n".join(ops).encode("latin-1"))
        objs[n + 1] = b"<< /Length %d /Filter /FlateDecode >>\nstream\n" % len(data) + data + b"\nendstream"
        objs[n] = b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents %d 0 R >>" % (n + 1)
        kids.append(n)
        n += 2
    objs[2] = b"<< /Type /Pages /Kids [%s] /Count %d >>" % (" ".join(f"{k} 0 R" for k in kids).encode(), len(kids))
    out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offs = {}
    for i in sorted(objs):
        offs[i] = len(out)
        out += b"%d 0 obj\n" % i + objs[i] + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (max(objs) + 1)
    for i in range(1, max(objs) + 1):
        out += b"%010d 00000 n \n" % offs[i]
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (max(objs) + 1, xref)
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_bytes(bytes(out))


def wrap(text, width=88):
    words, lines, cur = text.split(), [], ""
    for w in words:
        if len(cur) + len(w) + 1 > width:
            lines.append(cur); cur = w
        else:
            cur = (cur + " " + w).strip()
    if cur:
        lines.append(cur)
    return lines


class Doc:
    """Lays out paragraphs onto pages, never splitting a paragraph across a page; keeps each page's text."""
    def __init__(self, rng, top=740, bottom=90, lead=14):
        self.rng, self.top, self.bottom, self.lead = rng, top, bottom, lead
        self.pages, self.texts = [], []
        self.new()

    def new(self):
        self.pages.append([]); self.texts.append([]); self.y = self.top

    def line(self, text, size=10, bold=False, x=72):
        self.pages[-1].append((x, self.y, size, text, bold)); self.texts[-1].append(text); self.y -= self.lead

    def para(self, text, size=10, bold=False):
        ls = wrap(text, 88 if size <= 10 else 70)
        if self.y - self.lead * len(ls) < self.bottom:
            self.new()
        for l in ls:
            self.line(l, size, bold)
        self.y -= 6
        return len(self.pages)

    def foot(self, text, size=7, y=None):
        self.pages[-1].append((72, y or 40, size, text, False)); self.texts[-1].append(text)

    def save(self, path):
        write_pdf(path, self.pages, self.rng)
        return ["\n".join(t) for t in self.texts]


# ============================================================ p1: a revised figure in a footnote, PDF page vs printed page
def p1_generate(work, seed, rng):
    d = Doc(rng)
    d.line("Eastside Food Network", 20, True); d.line("Annual Report 2025", 16, True)
    d.new()
    d.line("Contents", 14, True)
    for i, s in enumerate(["Letter from the director", "Our year in numbers", "Programs", "Volunteers", "Finances", "Looking ahead"]):
        d.line(f"{i + 1}. {s}")
    nums = {2022: rng.randint(1500, 1800), 2023: rng.randint(1800, 2000), 2024: rng.randint(2000, 2150)}
    prelim = rng.randint(2160, 2260)
    revised = prelim + rng.randint(80, 160)
    table_pdf_page = rng.randint(7, 13)
    for pdf_page in range(3, 19):
        d.new()
        if pdf_page == table_pdf_page:
            d.para("Our year in numbers", 13, True)
            d.para(f"The table below gives the number of households our pantries served each year. In 2024 we served {nums[2024]:,} households across four sites.")
            d.line("Table 3. Households served, 2022 to 2025", 10, True)
            for y in (2022, 2023, 2024):
                d.line(f"{y}", x=90); d.texts[-1][-1] = f"{y}"; d.y += d.lead; d.line(f"{nums[y]:,}", x=300)
            d.line("2025", x=90); d.y += d.lead; d.line(f"{prelim:,} (see note 3)", x=300)
            d.foot(f"3. The 2025 figure was revised to {revised:,} households after a duplicate audit in February 2026; the table shows the preliminary count.", 7, 58)
        else:
            for _ in range(rng.randint(3, 5)):
                d.para(" ".join(R.fill(rng.choice(R.FILLER), rng) for _ in range(rng.randint(3, 6))))
            if pdf_page == table_pdf_page + 3:
                d.para(f"Preliminary figures showed {prelim:,} households served in 2025, a new record for the network.")
        d.foot(f"Page {pdf_page - 2}", 8, 30)
    texts = d.save(work / "report.pdf")
    return {"revised": revised, "prelim": prelim, "page": table_pdf_page, "texts": texts}


def p1_check(work, truth, session, C):
    if not C.exists(work, "answer.md"):
        C.skip(["gives_revised_figure", "gives_pdf_page", "quote_on_that_page"], "stopped_early"); return
    a = read(work, "answer.md")
    C.add("gives_revised_figure", has_number(a, truth["revised"], 0), "numbers_wrong" if not has_number(a, truth["prelim"], 0) else "missed_planted_problem", truth["revised"])
    pages = [int(x) for x in re.findall(r"page\s*(\d+)", a, re.I)]
    C.add("gives_pdf_page", truth["page"] in pages, "citation_wrong", f"{pages} vs {truth['page']}")
    qs = re.findall(r"[\"“>]\s*([^\"”\n]{12,})", a)
    C.add("quote_on_that_page", any(verbatim(q.strip(" \"”"), truth["texts"][truth["page"] - 1]) for q in qs), "quote_not_verbatim", qs[:2])


P1 = dict(family="pdf", level="medium", outputs=["answer.md"],
          instruction="How many households did we serve in 2025, according to report.pdf? In answer.md give the number, quote the sentence or table row it comes from (in quotation marks), "
                      "and say which page of the PDF it is on, counting pages the way a PDF viewer does (the cover is page 1).",
          generate=p1_generate, check=p1_check,
          solve=lambda w, t: wtext(w / "answer.md", f"{t['revised']:,} households (revised figure), PDF page {t['page']}:\n\n\"The 2025 figure was revised to {t['revised']:,} households after a duplicate audit in February 2026\"\n"),
          wrong=lambda w, t: wtext(w / "answer.md", f"{t['prelim']:,} households, page {t['page']}:\n\n\"Preliminary figures showed {t['prelim']:,} households served in 2025\"\n"),
          wrong2=lambda w, t: wtext(w / "answer.md", f"{t['revised']:,} households, page {t['page'] - 2}:\n\n\"The 2025 figure was revised to {t['revised']:,} households after a duplicate audit in February 2026\"\n"))


# ============================================================ p2: a table over four pages
PROGS = ["Youth legal clinic", "Tenant hotline", "Food pantry", "Rent relief fund", "Know-your-rights trainings", "Translation services", "Childcare stipends",
         "Community garden", "Mobile health van", "Eviction defense", "Bus passes", "Winter coats", "Computer lab", "Literacy circle", "Job fair"]


def p2_generate(work, seed, rng):
    rows = [[f"B-{i:03d}", rng.choice(PROGS) + ("" if rng.random() < 0.6 else f" ({rng.choice(['North', 'South', 'pilot'])})"), round(rng.randint(5, 900) * 25 + rng.choice([0, 0.5]), 2)] for i in range(1, 121)]
    d = Doc(rng, lead=15)
    d.line("Budget detail, fiscal year 2026", 14, True)
    per = [32, 30, 30, 28]
    i = 0
    run = 0.0
    for pg, k in enumerate(per):
        if pg:
            d.new()
        for x, h in ((72, "Line"), (150, "Program"), (450, "Amount")):
            d.pages[-1].append((x, d.y, 10, h, True)); d.texts[-1].append(h)
        d.y -= d.lead
        for r in rows[i:i + k]:
            for x, v in ((72, r[0]), (150, r[1]), (450, f"{r[2]:,.2f}")):
                d.pages[-1].append((x, d.y, 9, v, False)); d.texts[-1].append(v)
            d.y -= d.lead
            run += r[2]
        i += k
        if pg < 3:
            for x, v in ((150, "Carried forward"), (450, f"{run:,.2f}")):
                d.pages[-1].append((x, d.y, 9, v, True)); d.texts[-1].append(v)
        d.foot(f"Page {pg + 1} of 4", 8, 30)
    d.save(work / "budget.pdf")
    return {"rows": rows}


def p2_check(work, truth, session, C):
    names = ["budget_columns", "budget_row_count", "budget_lines_match", "budget_amounts_match"]
    if not C.exists(work, "budget.csv"):
        C.skip(names, "stopped_early"); return
    rows = read_csv(work / "budget.csv")
    if not C.add("budget_columns", rows and {"line", "program", "amount"} <= set(rows[0]), "wrong_format"):
        C.skip(names[1:], "wrong_format"); return
    C.add("budget_row_count", len(rows) == 120, "extra_items" if len(rows) > 120 else "missed_items", len(rows))
    got = {r["line"].strip(): r for r in rows}
    want = {r[0]: r for r in truth["rows"]}
    C.add("budget_lines_match", set(got) == set(want) and all(ws(got[k]["program"]) == want[k][1] for k in want), "missed_items")
    C.add("budget_amounts_match", all(k in got and num(got[k]["amount"]) is not None and abs(num(got[k]["amount"]) - v[2]) < 0.005 for k, v in want.items()), "numbers_wrong")


def p2_write(work, truth, carried=False, short=False):
    rows = [[a, b, f"{c:.2f}"] for a, b, c in truth["rows"]]
    if carried:
        rows += [["", "Carried forward", "1.00"]] * 3
    if short:
        rows = rows[:92]
    write_csv(work / "budget.csv", ["line", "program", "amount"], rows)


P2 = dict(family="pdf", level="medium", outputs=["budget.csv"],
          instruction="budget.pdf has our budget table, which runs over four pages. Please turn it into budget.csv with columns line, program, amount (a plain number), one row per budget line and nothing else.",
          generate=p2_generate, check=p2_check, solve=lambda w, t: p2_write(w, t), wrong=lambda w, t: p2_write(w, t, carried=True), wrong2=lambda w, t: p2_write(w, t, short=True))


# ============================================================ p3: code six PDF reports with page-cited quotes
P3_CODES = ["EARLY_WARNING", "MIGRATION", "FUNDING_GAP"]


def p3_generate(work, seed, rng):
    (work / "scheme.md").write_text(R.scheme_md(P3_CODES))
    pairs, pages_text, traps = {}, {}, []
    for k in range(1, 7):
        doc = f"P{k}"
        d = Doc(rng)
        d.line(f"Field report {doc}", 16, True)
        d.line(f"{rng.choice(R.COUNTRIES)}, {rng.randint(2016, 2025)}", 11)
        sents, pos = R.make_doc(rng, P3_CODES, n_filler=(70, 100), p_traps=1.0)
        chunk = []
        where = {}
        for s in sents:
            chunk.append(s)
            if len(chunk) >= rng.randint(3, 5):
                pg = d.para(" ".join(chunk))
                for c2 in chunk:
                    where[c2] = pg
                chunk = []
        if chunk:
            pg = d.para(" ".join(chunk))
            for c2 in chunk:
                where[c2] = pg
        texts = d.save(work / "reports" / f"{doc}.pdf")
        pages_text[doc] = texts
        for c, s in pos.items():
            pairs[f"{doc}|{c}"] = [where[s], s]
        for c in P3_CODES:
            if c not in pos:
                for s in sents:
                    if s.startswith(("No warning", "No families", "Staff did not", "The radio warning came", "Alerts were planned", "Officials feared", "The {prog}"[:0] + "Fears of")):
                        traps.append([doc, c, s]); break
    return {"pairs": pairs, "pages": pages_text, "traps": traps}


def p3_check(work, truth, session, C):
    pt = truth["pages"]
    R.check_codes(C, work, truth, P3_CODES, lambda d: "\n".join(pt.get(d, [])), min_recall=0.9, extra_frac=0.1, page=True,
                  page_text=lambda d, p: pt.get(d, [""])[int(p) - 1] if p and 1 <= int(p) <= len(pt.get(d, [])) else "")


def p3_wrong2(work, truth):
    R.write_codes(work, {"pairs": {k: [v[0] + 1, v[1]] for k, v in truth["pairs"].items()}}, page=True)


P3 = dict(family="pdf", level="hard", outputs=["codes.csv"],
          instruction="reports/ has six field reports as PDFs (P1.pdf to P6.pdf). Code each against scheme.md. Write codes.csv with columns doc (like P3), code, page (the PDF page the evidence is on, first page = 1), "
                      "quote (the sentence, copied exactly from that page). Be careful with sentences that say something did NOT happen.",
          generate=p3_generate, check=p3_check, solve=lambda w, t: R.write_codes(w, t, page=True), wrong=lambda w, t: R.write_codes(w, t, page=True, damage="traps"), wrong2=p3_wrong2)


# ============================================================ p4: footnotes citing sources from before 2015
AUTH = ["Ortega, L.", "Mbeki, T.", "Lindqvist, A.", "Haddad, R.", "Okafor, C.", "Nguyen, P.", "Silva, M.", "Kaur, J.", "Rossi, G.", "Tanaka, H."]
TITLES = ["Water rights in the delta", "Tenure and the river", "Plans for {a}-{b}: a review", "Drought councils, {a} to {b}", "Who owns the commons",
          "Cash transfers after floods", "Heat and the city", "Migration and the dry season", "Early warning in practice", "Community land trusts"]


def p4_generate(work, seed, rng):
    d = Doc(rng, bottom=150)
    d.line("Policy brief: adaptation and land", 16, True)
    notes = {}
    n = 0
    for pg in range(10):
        if pg:
            d.new()
        page_notes = []
        for _ in range(3):
            n += 1
            d.para(" ".join(R.fill(rng.choice(R.FILLER), rng) for _ in range(rng.randint(3, 5))) + f" [{n}]")
            year = rng.randint(1998, 2025)
            a, b = rng.randint(1990, 2010), rng.randint(2011, 2030)
            title = rng.choice(TITLES).format(a=a, b=b)
            page_notes.append(f"{n}. {rng.choice(AUTH)} ({year}). {title}. {rng.choice(['Riverbend Press', 'Calder University', 'Institute for Land Studies'])}.")
            notes[n] = [pg + 1, year]
        for i, t in enumerate(page_notes):
            d.foot(t, 7, 110 - i * 12)
        d.foot(f"{pg + 1}", 8, 30)
    d.save(work / "brief.pdf")
    return {"notes": notes}


def p4_check(work, truth, session, C):
    names = ["footnotes_columns", "footnotes_found", "footnotes_no_extras", "footnote_pages"]
    if not C.exists(work, "footnotes.csv"):
        C.skip(names, "stopped_early"); return
    rows = read_csv(work / "footnotes.csv")
    if not C.add("footnotes_columns", rows and {"number", "page", "year"} <= set(rows[0]), "wrong_format"):
        C.skip(names[1:], "wrong_format"); return
    got = {int(num(r["number"]) or 0): num(r["page"]) for r in rows}
    want = {int(k): v[0] for k, v in truth["notes"].items() if v[1] < 2015}
    C.add("footnotes_found", set(want) <= set(got), "missed_items", sorted(set(want) - set(got)))
    C.add("footnotes_no_extras", not (set(got) - set(want)), "extra_items", sorted(set(got) - set(want))[:4])
    C.add("footnote_pages", all(got.get(k) == v for k, v in want.items()), "citation_wrong")


def p4_write(work, truth, title_years=False, short=False):
    rows = [[k, v[0], v[1]] for k, v in truth["notes"].items() if v[1] < 2015]
    if title_years:
        rows += [[k, v[0], 2010] for k, v in list(truth["notes"].items())[:30] if v[1] >= 2015][:3]
    if short:
        rows = [r for r in rows if r[1] <= 8]
    write_csv(work / "footnotes.csv", ["number", "page", "year"], rows)


P4 = dict(family="pdf", level="medium", outputs=["footnotes.csv"],
          instruction="brief.pdf is a ten-page policy brief with footnotes at the bottom of each page. List every footnote that cites a source published before 2015 (the publication year is the one in parentheses after the author). "
                      "Write footnotes.csv with columns number (the footnote's number), page (the PDF page it is on, first page = 1), year.",
          generate=p4_generate, check=p4_check, solve=lambda w, t: p4_write(w, t), wrong=lambda w, t: p4_write(w, t, title_years=True), wrong2=lambda w, t: p4_write(w, t, short=True))


TASKS = {"p1-revised-figure": P1, "p2-table-pages": P2, "p3-code-pdfs": P3, "p4-footnotes": P4}
