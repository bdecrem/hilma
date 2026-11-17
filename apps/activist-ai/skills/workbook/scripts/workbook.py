#!/usr/bin/env python3
"""Build a formatted Excel workbook that is safe to open, and check it.

    python3 /opt/ola/skills/workbook/scripts/workbook.py build --out grants.xlsx --title "Grants 2026" \
        --source "grants.csv, uploaded 2026-11-16" --summary summary.csv --data "Grants=clean.csv" \
        [--data "Programs=sql:SELECT * FROM programs" --db /work/project.db] \
        --note "Dropped 3 rows with no amount (ids 12, 40, 77)." --note "Amounts are in US dollars."
    python3 .../workbook.py check grants.xlsx

Sheets, in order: Summary (title, source, the summary table), one sheet per --data, and Notes (what
was dropped or assumed, where the data came from, when it was made). Every table has a bold header
row, frozen so it stays in view, a filter, widths that fit, and number formats: whole numbers with
thousands separators, decimals with up to three places, ISO dates as dates, everything else as text.

No formulas. A cell whose text starts with = + - or @ is stored as text, so nothing runs when the
file is opened (a spreadsheet would otherwise treat "=HYPERLINK(...)" or "+1 555 0100" as a formula).
Identifiers with leading zeros ("00742") stay text. `check` reopens the file and proves all of this.
"""
import argparse, csv, re, sqlite3, sys
from datetime import date, datetime
from pathlib import Path

INT = re.compile(r"^-?(0|[1-9]\d{0,2}(,\d{3})+|[1-9]\d*)$")
DEC = re.compile(r"^-?(\d{1,3}(,\d{3})+|\d+)\.\d+$")
ISO = re.compile(r"^\d{4}-\d{2}-\d{2}$")
RISKY = ("=", "+", "-", "@", "\t", "\r")
MAX_SHEET = 31


def cell_value(v):
    """(value, kind) for one cell: kind is int, dec, date or text."""
    if v is None:
        return None, "empty"
    if isinstance(v, bool):
        return str(v), "text"
    if isinstance(v, int):
        return v, "int"
    if isinstance(v, float):
        return v, "dec"
    s = str(v).strip()
    if s == "":
        return None, "empty"
    if INT.match(s) and not (len(s) > 1 and s.startswith("0")):
        n = int(s.replace(",", ""))
        if abs(n) < 10**15:
            return n, "int"
    if DEC.match(s):
        return float(s.replace(",", "")), "dec"
    if ISO.match(s):
        try:
            return datetime.strptime(s, "%Y-%m-%d").date(), "date"
        except ValueError:
            pass
    return CONTROL.sub("", str(v)), "text"


CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")  # characters a spreadsheet file cannot hold


def read_table(spec, db):
    if spec.startswith("sql:"):
        if not db:
            sys.exit("workbook: a sql: table needs --db")
        con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
        cur = con.execute(spec[4:])
        return [d[0] for d in cur.description], [list(r) for r in cur.fetchall()]
    with open(spec, newline="", encoding="utf-8-sig") as f:
        rows = list(csv.reader(f))
    if not rows:
        sys.exit(f"workbook: {spec} is empty")
    return rows[0], [r for r in rows[1:] if any(c.strip() for c in r)]


def write_table(ws, header, rows, top):
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    from openpyxl.utils import get_column_letter
    bold, fill, line = Font(bold=True, color="1F2430"), PatternFill("solid", fgColor="E8EBF0"), Side(style="thin", color="9AA1AE")
    for j, h in enumerate(header, 1):
        c = ws.cell(row=top, column=j, value=str(h))
        c.data_type = "s"
        c.font, c.fill, c.border = bold, fill, Border(bottom=line)
        c.alignment = Alignment(vertical="bottom", wrap_text=True)
    widths = [len(str(h)) for h in header]
    decimals = [0] * len(header)
    for r in rows:
        for j, v in enumerate(r[: len(header)]):
            if isinstance(v, str) and DEC.match(v.strip()):
                decimals[j] = max(decimals[j], min(3, len(v.strip().split(".")[1])))
            elif isinstance(v, float):
                decimals[j] = max(decimals[j], min(3, len(repr(v).split(".")[1]) if "." in repr(v) else 0))
    for i, r in enumerate(rows, top + 1):
        for j, raw in enumerate(r[: len(header)], 1):
            v, kind = cell_value(raw)
            if kind == "empty":
                continue
            c = ws.cell(row=i, column=j, value=v)
            if kind == "text":
                c.data_type = "s"  # never a formula, whatever it starts with
            elif kind == "int":
                c.number_format = "#,##0"
                c.alignment = Alignment(horizontal="right")
            elif kind == "dec":
                c.number_format = "#,##0." + "0" * max(1, decimals[j - 1])
                c.alignment = Alignment(horizontal="right")
            elif kind == "date":
                c.number_format = "yyyy-mm-dd"
            widths[j - 1] = max(widths[j - 1], len(f"{v:,}" if kind in ("int", "dec") else str(v)))
    for j, wdt in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(j)].width = max(8, min(50, wdt + 2))
    last = get_column_letter(max(1, len(header)))
    ws.freeze_panes = ws.cell(row=top + 1, column=1)
    ws.auto_filter.ref = f"A{top}:{last}{top + max(1, len(rows))}"


def safe_title(name, used):
    t = re.sub(r"[\[\]:*?/\\]", " ", name).strip()[:MAX_SHEET] or "Sheet"
    base, k = t, 2
    while t.lower() in used:
        t = f"{base[: MAX_SHEET - 3]} {k}"
        k += 1
    used.add(t.lower())
    return t


def build(a):
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font
    wb = Workbook()
    used = {"summary", "notes"}
    s = wb.active
    s.title = "Summary"
    s["A1"] = a.title
    s["A1"].font = Font(bold=True, size=14, color="1F2430")
    s["A2"] = f"Source: {a.source}"
    s["A2"].font = Font(italic=True, color="596070")
    for ref in ("A1", "A2"):
        s[ref].data_type = "s"
    counts = {}
    if a.summary:
        h, rows = read_table(a.summary, a.db)
        write_table(s, h, rows, 4)
    else:
        s.freeze_panes = "A4"
    for spec in a.data:
        if "=" not in spec:
            sys.exit(f"workbook: --data wants Name=file.csv or Name=sql:SELECT ..., not {spec!r}")
        name, src = spec.split("=", 1)
        h, rows = read_table(src, a.db)
        ws = wb.create_sheet(safe_title(name, used))
        write_table(ws, h, rows, 1)
        counts[ws.title] = len(rows)
    n = wb.create_sheet("Notes")
    n["A1"] = "What was dropped or assumed"
    n["A1"].font = Font(bold=True, size=13)
    row = 3
    for note in a.note or ["Nothing was dropped and nothing was assumed."]:
        c = n.cell(row=row, column=1, value=note)
        c.data_type = "s"
        c.alignment = Alignment(wrap_text=True, vertical="top")
        row += 1
    row += 1
    for label, val in (("Source", a.source), ("Made", date.today().isoformat()), ("Sheets", ", ".join(f"{k} ({v} rows)" for k, v in counts.items()))):
        n.cell(row=row, column=1, value=f"{label}: {val}").data_type = "s"
        row += 1
    n.column_dimensions["A"].width = 100
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    wb.save(out)
    return check(out, expect={k: v for k, v in counts.items()})


def check(path, expect=None):
    from openpyxl import load_workbook
    problems = []
    try:
        wb = load_workbook(path)
    except Exception as e:
        print(f"workbook check FAILED: {path} does not open ({e})")
        return 1
    names = wb.sheetnames
    if names[0] != "Summary" or names[-1] != "Notes":
        problems.append(f"the sheets should be Summary, the data, then Notes (they are {names})")
    formulas = 0
    for ws in wb.worksheets:
        for row in ws.iter_rows():
            for c in row:
                if c.data_type == "f" or (isinstance(c.value, str) and c.data_type != "s" and c.value.startswith("=")):
                    formulas += 1
    if formulas:
        problems.append(f"{formulas} cells are formulas")
    for ws in wb.worksheets[1:-1]:
        if ws.freeze_panes != "A2":
            problems.append(f"{ws.title}: the header row is not frozen")
        if not ws.auto_filter.ref:
            problems.append(f"{ws.title}: no filter on the header")
        if not all(c.font.bold for c in ws[1] if c.value is not None):
            problems.append(f"{ws.title}: the header is not bold")
        if expect and ws.title in expect and ws.max_row - 1 != expect[ws.title] and expect[ws.title] > 0:
            problems.append(f"{ws.title}: {ws.max_row - 1} rows, expected {expect[ws.title]}")
    notes = [c.value for c in wb["Notes"]["A"] if c.value] if "Notes" in names else []
    if len(notes) < 3:
        problems.append("the Notes sheet is empty")
    if problems:
        print("workbook check FAILED: " + "; ".join(problems))
        return 1
    rows = ", ".join(f"{ws.title} {ws.max_row - 1} rows" for ws in wb.worksheets[1:-1])
    print(f"workbook check passed: {Path(path).name} opens; sheets {', '.join(names)}; {rows}; no formulas; headers frozen with filters.")
    return 0


def main():
    ap = argparse.ArgumentParser(prog="workbook.py")
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build")
    b.add_argument("--out", required=True)
    b.add_argument("--title", required=True)
    b.add_argument("--source", required=True, help="where the data came from, and when")
    b.add_argument("--summary", help="a CSV (or sql:SELECT ... with --db) for the Summary sheet")
    b.add_argument("--data", action="append", default=[], help="Name=file.csv or Name=sql:SELECT ...; repeat for more sheets")
    b.add_argument("--db")
    b.add_argument("--note", action="append", help="one sentence on what was dropped or assumed; repeat")
    c = sub.add_parser("check")
    c.add_argument("path")
    a = ap.parse_args()
    if a.cmd == "check":
        return check(a.path)
    if not a.data:
        sys.exit("workbook: give at least one --data sheet")
    return build(a)


if __name__ == "__main__":
    sys.exit(main())
