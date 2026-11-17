#!/usr/bin/env python3
"""The workbook skill's own tests. Run inside the workspace image (openpyxl is there):
    python3 /opt/ola/skills/workbook/tests/test_workbook.py"""
import csv, sqlite3, subprocess, sys, tempfile, zipfile
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "workbook.py"
results = []


def case(name, ok, detail=""):
    results.append(ok)
    print(f"{'pass' if ok else 'FAIL'}  workbook: {name}" + (f"  ({detail})" if detail and not ok else ""))


def run(*args):
    return subprocess.run([sys.executable, str(SCRIPT), *args], capture_output=True, text=True, timeout=120)


d = Path(tempfile.mkdtemp(prefix="wb-test-"))
rows = [["id", "program", "amount", "paid", "contact", "note"],
        ["00742", "Water", "1,250", "2026-03-04", "+1 555 0100", "=HYPERLINK(\"http://x.test\",\"click\")"],
        ["00743", "Seeds", "980.5", "2026-04-01", "@field", "-ok"],
        ["00744", "Water", "15000", "2026-05-12", "", "fine\x01"]]
with open(d / "data.csv", "w", newline="") as f:
    csv.writer(f).writerows(rows)
with open(d / "sum.csv", "w", newline="") as f:
    csv.writer(f).writerows([["Program", "Grants", "Total amount (USD)"], ["Water", "2", "16250"], ["Seeds", "1", "980.5"]])
con = sqlite3.connect(d / "p.db")
con.execute("CREATE TABLE programs (name TEXT, region TEXT)")
con.executemany("INSERT INTO programs VALUES (?,?)", [("Water", "North"), ("Seeds", "South")])
con.commit()
con.close()
out = d / "out.xlsx"
r = run("build", "--out", str(out), "--title", "Grants 2026", "--source", "made up for the test", "--summary", str(d / "sum.csv"),
        "--data", f"Grants={d / 'data.csv'}", "--db", str(d / "p.db"), "--data", "Programs=sql:SELECT name, region FROM programs ORDER BY name",
        "--note", "Dropped 1 row with no amount (id 00745).")
case("build a workbook from a CSV, a query and a summary", r.returncode == 0 and "check passed" in r.stdout, r.stdout[-300:] + r.stderr[-300:])
from openpyxl import load_workbook
wb = load_workbook(out)
case("sheets in order: Summary, data, Notes", wb.sheetnames == ["Summary", "Grants", "Programs", "Notes"], wb.sheetnames)
g = wb["Grants"]
case("leading zeros kept as text", g["A2"].value == "00742" and g["A2"].data_type == "s")
case("numbers are numbers with formats", g["C2"].value == 1250 and g["C2"].number_format == "#,##0" and g["C3"].value == 980.5 and g["C3"].number_format.startswith("#,##0.0"))
case("dates are dates", str(g["D2"].value).startswith("2026-03-04") and g["D2"].number_format == "yyyy-mm-dd")
xml = zipfile.ZipFile(out).read("xl/worksheets/sheet2.xml").decode()
case("text that looks like a formula is stored as text, never as a formula", "<f>" not in xml and "<f " not in xml and g["F2"].value.startswith("=HYPERLINK") and g["F2"].data_type == "s")
case("+, @ and - leading text stays text", g["E2"].value == "+1 555 0100" and g["E3"].value == "@field" and g["F3"].value == "-ok")
case("characters a spreadsheet cannot hold are removed", g["F4"].value == "fine")
case("the header is frozen and filtered", g.freeze_panes == "A2" and g.auto_filter.ref == "A1:F4")
case("the summary sheet carries title, source and its table", wb["Summary"]["A1"].value == "Grants 2026" and "made up" in wb["Summary"]["A2"].value and wb["Summary"]["A4"].value == "Program" and wb["Summary"].freeze_panes == "A5")
case("the notes sheet says what was dropped", any("Dropped 1 row" in str(c.value) for c in wb["Notes"]["A"]))

# a formula slipped in by hand must fail the check
wb["Grants"]["G2"] = "=1+1"
wb.save(d / "bad.xlsx")
r = run("check", str(d / "bad.xlsx"))
case("check refuses a workbook with a formula", r.returncode == 1 and "formulas" in r.stdout, r.stdout)
print(f"workbook tests: {sum(results)} of {len(results)} passed")
sys.exit(0 if all(results) else 1)
