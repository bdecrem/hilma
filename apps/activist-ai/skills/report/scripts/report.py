#!/usr/bin/env python3
"""Turn a report written in plain text into a Word document and a PDF, and check its sources.

    python3 /opt/ola/skills/report/scripts/report.py check report.md
    python3 /opt/ola/skills/report/scripts/report.py build report.md [--out report]   -> report.docx, report.pdf

The text (report.md):

    # The title
    > One line under the title: who it is for, the date.
    ## A section heading
    A paragraph. Every claim names its source and page in brackets, the way the reader will see it:
    412 households moved in 2025 (flood-review.pdf, p. 3). A quote is in quotation marks and copied
    word for word: "the river rose faster than the gauges" (flood-review.pdf, p. 4). Numbers worked
    out by you name what they were computed from: 16,250 dollars in all (computed from grants.csv).
    - A bullet point, with its own source (minutes.pdf, pp. 2-3).
    ![Studies per region, 2015 to 2025](charts/studies.png)
    {{table: summary.csv | Grants by program}}

`check` refuses (exit 1) when: a paragraph with a number or a quotation names no source; a cited
file does not exist; a cited page is past the end of the PDF; a quotation is not on the cited page,
word for word. A number not found on its cited page is a warning (it may be computed). `build` runs
the same check first and stops if it fails, then writes the .docx (python-docx) and the .pdf
(reportlab: no browser), with the figures, the tables, page numbers and a Sources list.
"""
import argparse, csv, re, subprocess, sys
from datetime import date
from pathlib import Path

EXT = r"(?:pdf|csv|xlsx|txt|md|docx|html|json|tsv)"
CITE = re.compile(r"\((?:(computed from|from|see)\s+)?([^()\n]+?\." + EXT + r")(?:,\s*(?:pp?\.|pages?)\s*(\d+)(?:\s*[-–]\s*(\d+))?)?(?:,\s*[^()\n]{0,40})?\)", re.I)
QUOTE = re.compile(r"[\"“]([^\"“”]{12,}?)[\"”]")
NUM = re.compile(r"(?<![\w.])\d[\d,]*(?:\.\d+)?%?")
FIG = re.compile(r"^!\[([^\]]*)\]\(([^)]+)\)\s*$")
TAB = re.compile(r"^\{\{\s*table:\s*([^|}]+?)\s*(?:\|\s*([^}]*?))?\s*\}\}\s*$")


def norm(s):
    s = (s or "").replace("­", "").replace(" ", " ")
    s = re.sub(r"-\s*\n\s*", "", s)  # words broken across lines
    for a, b in (("‘", "'"), ("’", "'"), ("“", '"'), ("”", '"'), ("–", "-"), ("—", "-"), ("ﬁ", "fi"), ("ﬂ", "fl")):
        s = s.replace(a, b)
    return re.sub(r"\s+", " ", s).strip().lower()


def parse(md):
    """Blocks: (kind, data). kinds: title, sub, h1, h2, p, li, fig, table."""
    blocks, para = [], []

    def flush():
        if para:
            blocks.append(("p", " ".join(para)))
            para.clear()

    for line in md.splitlines():
        s = line.rstrip()
        if not s.strip():
            flush()
            continue
        if s.startswith("# "):
            flush(); blocks.append(("title", s[2:].strip()))
        elif s.startswith("> "):
            flush(); blocks.append(("sub", s[2:].strip()))
        elif s.startswith("## "):
            flush(); blocks.append(("h1", s[3:].strip()))
        elif s.startswith("### "):
            flush(); blocks.append(("h2", s[4:].strip()))
        elif re.match(r"^\s*[-*] ", s):
            flush(); blocks.append(("li", re.sub(r"^\s*[-*] ", "", s)))
        elif FIG.match(s.strip()):
            flush(); m = FIG.match(s.strip()); blocks.append(("fig", (m.group(1).strip(), m.group(2).strip())))
        elif TAB.match(s.strip()):
            flush(); m = TAB.match(s.strip()); blocks.append(("table", (m.group(1).strip(), (m.group(2) or "").strip())))
        else:
            para.append(s.strip())
    flush()
    return blocks


class Sources:
    def __init__(self, base):
        self.base, self.cache = Path(base), {}

    def path(self, name):
        for root in (self.base, Path("/work"), self.base / "sources", Path("/work/sources")):
            p = (root / name.strip()).resolve()
            if p.is_file():
                return p
        return None

    def pages(self, p):
        if p in self.cache:
            return self.cache[p]
        if p.suffix.lower() == ".pdf":
            try:
                n = int(re.search(r"Pages:\s+(\d+)", subprocess.run(["pdfinfo", str(p)], capture_output=True, text=True, timeout=60).stdout).group(1))
            except Exception:
                n = 0
            texts = [subprocess.run(["pdftotext", "-q", "-f", str(i), "-l", str(i), str(p), "-"], capture_output=True, text=True, timeout=60).stdout for i in range(1, n + 1)]
        elif p.suffix.lower() == ".xlsx":
            try:
                from openpyxl import load_workbook
                wb = load_workbook(p, read_only=True, data_only=True)
                texts = [" ".join(str(c) for ws in wb.worksheets for row in ws.iter_rows(values_only=True) for c in row if c is not None)]
            except Exception:
                texts = [""]
        else:
            texts = [p.read_text(encoding="utf-8", errors="replace")]
        self.cache[p] = [norm(t) for t in texts]
        return self.cache[p]


def check_text(md_path, quiet=False):
    md = Path(md_path).read_text(encoding="utf-8")
    blocks = parse(md)
    src = Sources(Path(md_path).parent)
    errors, warnings, cited = [], [], {}
    n_claims = 0
    for kind, data in blocks:
        if kind not in ("p", "li"):
            if kind == "fig" and not (Path(md_path).parent / data[1]).is_file():
                errors.append(f"the figure file {data[1]} does not exist")
            if kind == "table" and not (Path(md_path).parent / data[0]).is_file():
                errors.append(f"the table file {data[0]} does not exist")
            continue
        text = data
        # each sentence on its own: a number or a quotation needs a source in the same sentence
        for chunk in re.split(r"(?<=[.!?])\s+(?=[A-Z\"“])", text):
            body = CITE.sub("", chunk)
            quotes = [q.group(1) for q in QUOTE.finditer(body)]
            nums = [x for x in NUM.findall(body) if not re.fullmatch(r"(19|20)\d\d", x)]
            all_cites = list(CITE.finditer(chunk))
            if (quotes or nums) and not all_cites:
                errors.append(f"no source for: \"{chunk[:90]}\"")
                continue
            if not all_cites:
                continue
            n_claims += 1
            texts = []
            for c in all_cites:
                name, p1, p2 = c.group(2).strip(), c.group(3), c.group(4)
                p = src.path(name)
                if not p:
                    errors.append(f"cited file not found: {name}")
                    continue
                pages = src.pages(p)
                cited.setdefault(name, set())
                if p1:
                    a, b = int(p1), int(p2 or p1)
                    if p.suffix.lower() == ".pdf" and (a < 1 or b > len(pages) or a > b):
                        errors.append(f"{name} has {len(pages)} pages; cited p. {p1}{'-' + p2 if p2 else ''}")
                        continue
                    cited[name].update(range(a, b + 1))
                    texts += pages[a - 1 : b] if p.suffix.lower() == ".pdf" else pages
                else:
                    if p.suffix.lower() == ".pdf" and quotes:
                        errors.append(f"a quotation from {name} needs its page")
                    texts += pages
            here = " ".join(texts)
            computed = all(c.group(1) and c.group(1).lower() == "computed from" for c in all_cites)
            for q in quotes:
                if norm(q) not in here:
                    errors.append(f"quotation not found word for word on the cited page: \"{q[:80]}\"")
            if not computed:
                for x in nums:
                    v = x.rstrip("%")
                    if v.replace(",", "") not in here.replace(",", "") and v not in here:
                        warnings.append(f"{x} is not on the cited page ({chunk[:60]}...)")
    if not quiet:
        for w in warnings:
            print(f"  warning: {w}")
        for e in errors:
            print(f"  problem: {e}")
        if errors:
            print(f"report check FAILED: {len(errors)} problems, {len(warnings)} warnings, {n_claims} cited claims.")
        else:
            print(f"report check passed: {n_claims} cited claims, every quotation found on its page, {len(warnings)} warnings, {len(cited)} sources.")
    return blocks, errors, cited


def inline_runs(text):
    """[(text, bold, italic)] from **bold** and *italic*."""
    out = []
    for part in re.split(r"(\*\*[^*]+\*\*|\*[^*]+\*)", text):
        if not part:
            continue
        if part.startswith("**") and part.endswith("**"):
            out.append((part[2:-2], True, False))
        elif part.startswith("*") and part.endswith("*") and len(part) > 2:
            out.append((part[1:-1], False, True))
        else:
            out.append((part, False, False))
    return out


def read_csv(p):
    with open(p, newline="", encoding="utf-8-sig") as f:
        return [r for r in csv.reader(f) if any(c.strip() for c in r)]


def is_num(s):
    return bool(re.fullmatch(r"-?[\d,]+(\.\d+)?%?", s.strip()))


def sources_list(cited):
    out = []
    for name in sorted(cited):
        pages = sorted(cited[name])
        out.append(f"{name}" + (f", pages {', '.join(map(str, pages))}" if pages else ""))
    return out


def build_docx(blocks, base, out, cited):
    from docx import Document
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn
    from docx.shared import Inches, Pt, RGBColor
    doc = Document()
    st = doc.styles
    st["Normal"].font.name, st["Normal"].font.size = "Calibri", Pt(11)
    st["Normal"].paragraph_format.space_after = Pt(6)
    st["Normal"].paragraph_format.line_spacing = 1.2
    for name, size in (("Title", 24), ("Heading 1", 15), ("Heading 2", 12.5)):
        st[name].font.name, st[name].font.size, st[name].font.color.rgb = "Calibri", Pt(size), RGBColor(0x1F, 0x24, 0x30)
    sec = doc.sections[0]
    sec.left_margin = sec.right_margin = Inches(1)
    fp = sec.footer.paragraphs[0]
    fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    fld = OxmlElement("w:fldSimple")
    fld.set(qn("w:instr"), "PAGE")
    r = OxmlElement("w:r")
    t = OxmlElement("w:t")
    t.text = "1"
    r.append(t)
    fld.append(r)
    fp._p.append(fld)
    figs = tabs = 0

    def para(text, style=None):
        p = doc.add_paragraph(style=style)
        for txt, b, i in inline_runs(text):
            run = p.add_run(txt)
            run.bold, run.italic = b, i
        return p

    for kind, data in blocks:
        if kind == "title":
            doc.add_heading(data, 0)
        elif kind == "sub":
            p = para(data)
            for run in p.runs:
                run.italic = True
                run.font.color.rgb = RGBColor(0x59, 0x60, 0x70)
        elif kind == "h1":
            doc.add_heading(data, 1)
        elif kind == "h2":
            doc.add_heading(data, 2)
        elif kind == "p":
            para(data)
        elif kind == "li":
            para(data, "List Bullet")
        elif kind == "fig":
            figs += 1
            doc.add_picture(str(base / data[1]), width=Inches(6.0))
            doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER
            c = doc.add_paragraph(f"Figure {figs}. {data[0]}", style="Caption")
        elif kind == "table":
            tabs += 1
            rows = read_csv(base / data[0])
            if data[1]:
                doc.add_paragraph(f"Table {tabs}. {data[1]}", style="Caption")
            tb = doc.add_table(rows=len(rows), cols=max(len(r) for r in rows))
            tb.style = "Table Grid"
            for i, row in enumerate(rows):
                for j, val in enumerate(row):
                    cell = tb.cell(i, j)
                    cell.text = ""
                    run = cell.paragraphs[0].add_run(val)
                    run.font.size = Pt(10)
                    if i == 0:
                        run.bold = True
                        shd = OxmlElement("w:shd")
                        shd.set(qn("w:val"), "clear")
                        shd.set(qn("w:fill"), "E8EBF0")
                        cell._tc.get_or_add_tcPr().append(shd)
                    elif is_num(val):
                        cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.RIGHT
            doc.add_paragraph()
    if cited:
        doc.add_heading("Sources", 1)
        for s in sources_list(cited):
            para(s, "List Bullet")
    doc.add_paragraph(f"Made by Ola on {date.today().isoformat()}.").runs[0].italic = True
    doc.save(out)


def build_pdf(blocks, base, out, cited):
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_RIGHT
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.lib.utils import ImageReader
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.platypus import Image, KeepTogether, ListFlowable, ListItem, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    from xml.sax.saxutils import escape
    d = "/usr/share/fonts/truetype/dejavu/"
    for name, f in (("Sans", "DejaVuSans.ttf"), ("Sans-B", "DejaVuSans-Bold.ttf"), ("Serif", "DejaVuSerif.ttf"), ("Serif-B", "DejaVuSerif-Bold.ttf"), ("Serif-I", "DejaVuSerif-Italic.ttf")):
        if not Path(d + f).exists():  # the italic is in fonts-dejavu-extra; fall back to the upright face
            f = "DejaVuSerif.ttf" if name.startswith("Serif") else "DejaVuSans.ttf"
        pdfmetrics.registerFont(TTFont(name, d + f))
    pdfmetrics.registerFontFamily("Serif", normal="Serif", bold="Serif-B", italic="Serif-I", boldItalic="Serif-B")
    ink, muted = colors.HexColor("#1f2430"), colors.HexColor("#596070")
    S = {"title": ParagraphStyle("t", fontName="Sans-B", fontSize=21, leading=26, textColor=ink, spaceAfter=6),
         "sub": ParagraphStyle("s", fontName="Serif-I", fontSize=10.5, leading=15, textColor=muted, spaceAfter=14),
         "h1": ParagraphStyle("h1", fontName="Sans-B", fontSize=13.5, leading=18, textColor=ink, spaceBefore=12, spaceAfter=5),
         "h2": ParagraphStyle("h2", fontName="Sans-B", fontSize=11.5, leading=15, textColor=ink, spaceBefore=8, spaceAfter=4),
         "p": ParagraphStyle("p", fontName="Serif", fontSize=10.5, leading=15.5, textColor=ink, spaceAfter=7),
         "cap": ParagraphStyle("c", fontName="Sans", fontSize=8.5, leading=11, textColor=muted, spaceBefore=3, spaceAfter=10),
         "cell": ParagraphStyle("cell", fontName="Sans", fontSize=8.5, leading=11, textColor=ink),
         "celln": ParagraphStyle("celln", fontName="Sans", fontSize=8.5, leading=11, textColor=ink, alignment=TA_RIGHT),
         "cellh": ParagraphStyle("cellh", fontName="Sans-B", fontSize=8.5, leading=11, textColor=ink)}

    def rich(text):
        t = escape(text)
        t = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", t)
        return re.sub(r"\*([^*]+)\*", r"<i>\1</i>", t)

    width = letter[0] - 2 * inch
    story, figs, tabs, items = [], 0, 0, []

    def flush_list():
        if items:
            story.append(ListFlowable([ListItem(Paragraph(rich(x), S["p"]), leftIndent=12) for x in items], bulletType="bullet", start="•", leftIndent=12))
            items.clear()

    for kind, data in blocks:
        if kind != "li":
            flush_list()
        if kind in ("title", "sub", "h1", "h2", "p"):
            story.append(Paragraph(rich(data), S[kind]))
        elif kind == "li":
            items.append(data)
        elif kind == "fig":
            figs += 1
            ir = ImageReader(str(base / data[1]))
            w, h = ir.getSize()
            story.append(KeepTogether([Image(str(base / data[1]), width=width, height=width * h / w), Paragraph(rich(f"Figure {figs}. {data[0]}"), S["cap"])]))
        elif kind == "table":
            tabs += 1
            rows = read_csv(base / data[0])
            cells = [[Paragraph(escape(v), S["cellh"] if i == 0 else (S["celln"] if is_num(v) else S["cell"])) for v in r] for i, r in enumerate(rows)]
            t = Table(cells, repeatRows=1, hAlign="LEFT", colWidths=[width / max(len(r) for r in rows)] * max(len(r) for r in rows))
            t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e8ebf0")), ("LINEBELOW", (0, 0), (-1, 0), 0.8, colors.HexColor("#9aa1ae")),
                                   ("LINEBELOW", (0, 1), (-1, -1), 0.3, colors.HexColor("#d5d9e0")), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                                   ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
            if data[1]:
                story.append(Paragraph(rich(f"Table {tabs}. {data[1]}"), S["cap"]))
            story += [t, Spacer(1, 10)]
    flush_list()
    if cited:
        story.append(Paragraph("Sources", S["h1"]))
        for s in sources_list(cited):
            story.append(Paragraph(rich("• " + s), S["p"]))
    story.append(Paragraph(rich(f"*Made by Ola on {date.today().isoformat()}.*"), S["cap"]))

    def foot(c, d):
        c.saveState()
        c.setFont("Sans", 8)
        c.setFillColor(muted)
        c.drawCentredString(letter[0] / 2, 0.6 * inch, str(d.page))
        c.restoreState()

    SimpleDocTemplate(str(out), pagesize=letter, leftMargin=inch, rightMargin=inch, topMargin=inch, bottomMargin=inch,
                      title=next((d for k, d in blocks if k == "title"), "Report"), author="Ola").build(story, onFirstPage=foot, onLaterPages=foot)


def main():
    ap = argparse.ArgumentParser(prog="report.py")
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("check")
    c.add_argument("md")
    b = sub.add_parser("build")
    b.add_argument("md")
    b.add_argument("--out", help="the name without extension (default: the text file's)")
    b.add_argument("--no-pdf", action="store_true")
    a = ap.parse_args()
    blocks, errors, cited = check_text(a.md)
    if a.cmd == "check":
        return 1 if errors else 0
    if errors:
        print("Not built: fix the problems above, then build again.")
        return 1
    if not any(k == "title" for k, _ in blocks):
        print("Not built: the text needs a title line starting with '# '.")
        return 1
    base = Path(a.md).parent
    out = Path(a.out) if a.out else Path(a.md).with_suffix("")
    build_docx(blocks, base, out.with_suffix(".docx"), cited)
    made = [out.with_suffix(".docx").name]
    if not a.no_pdf:
        build_pdf(blocks, base, out.with_suffix(".pdf"), cited)
        made.append(out.with_suffix(".pdf").name)
    pages = ""
    if not a.no_pdf:
        r = subprocess.run(["pdfinfo", str(out.with_suffix(".pdf"))], capture_output=True, text=True)
        m = re.search(r"Pages:\s+(\d+)", r.stdout)
        pages = f" The PDF has {m.group(1)} pages." if m else ""
    print(f"Built {' and '.join(made)}.{pages}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
