#!/usr/bin/env python3
"""The chart skill's own tests. Run inside the workspace image (matplotlib is there):
    python3 /opt/ola/skills/chart/tests/test_chart.py
Prints one line per case and 'chart tests: N of N passed'; exit 0 only if all pass."""
import csv, json, sqlite3, subprocess, sys, tempfile
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "chart.py"
results = []


def case(name, ok, detail=""):
    results.append(ok)
    print(f"{'pass' if ok else 'FAIL'}  chart: {name}" + (f"  ({detail})" if detail and not ok else ""))


def run(*args):
    return subprocess.run([sys.executable, str(SCRIPT), *args], capture_output=True, text=True, timeout=120)


d = Path(tempfile.mkdtemp(prefix="chart-test-"))
with open(d / "t.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["region", "studies"])
    w.writerows([["North", "12"], ["South", "30"], ["East", ""], ["West", "7"], ["Total", "n/a"]])
r = run("draw", "--csv", str(d / "t.csv"), "--x", "region", "--y", "studies", "--kind", "bar", "--sort", "desc", "--title", "Studies per region",
        "--what", "Number of studies", "--source", "t.csv, made up for the test", "--out", str(d / "c"))
case("draw a bar chart from a CSV", r.returncode == 0, r.stdout[-300:] + r.stderr[-300:])
spec = json.loads((d / "c.json").read_text()) if (d / "c.json").exists() else {}
rows = list(csv.reader(open(d / "c.csv"))) if (d / "c.csv").exists() else []
case("the data file holds the drawn rows, largest first", rows[1:] == [["South", "30"], ["North", "12"], ["West", "7"]], rows)
case("rows without a number are left out and counted in the caption", spec.get("dropped") == 2 and "2 rows without a number" in spec.get("caption", ""), spec.get("caption"))
case("the caption names the source", "Source: t.csv, made up for the test." in spec.get("caption", ""))
case("bars start at zero", spec.get("zero_baseline") is True)
svg = (d / "c.svg").read_text() if (d / "c.svg").exists() else ""
case("the SVG keeps its words as text", "Studies per region" in svg and "<text" in svg)
case("the PNG is a real PNG", (d / "c.png").read_bytes()[:8] == b"\x89PNG\r\n\x1a\n" if (d / "c.png").exists() else False)

# a tampered data file must fail the check
rows[1][1] = "31"
with open(d / "c.csv", "w", newline="") as f:
    csv.writer(f).writerows(rows)
r = run("check", str(d / "c"))
case("check fails when the data file and the drawing disagree", r.returncode == 1 and "differ" in r.stdout, r.stdout)

# a query on a database, a line with a gap
con = sqlite3.connect(d / "p.db")
con.execute("CREATE TABLE rain (month TEXT, mm REAL)")
con.executemany("INSERT INTO rain VALUES (?,?)", [("2026-01", 80.5), ("2026-02", 61.0), ("2026-03", None), ("2026-04", 40.25)])
con.commit()
con.close()
r = run("draw", "--db", str(d / "p.db"), "--sql", "SELECT month, mm FROM rain ORDER BY month", "--x", "month", "--y", "mm", "--kind", "line",
        "--title", "Rain by month", "--what", "Rainfall (mm)", "--source", "rain table, made up", "--out", str(d / "line"))
spec = json.loads((d / "line.json").read_text()) if (d / "line.json").exists() else {}
case("a line from a read-only query keeps a missing month as a gap", r.returncode == 0 and spec.get("drawn") == [[80.5, 61.0, None, 40.25]] and spec.get("gaps") == 1, r.stdout[-200:] + r.stderr[-200:])
case("the gap is said in the caption", "1 missing value is shown as a gap." in spec.get("caption", ""), spec.get("caption"))
r = run("draw", "--db", str(d / "p.db"), "--sql", "DELETE FROM rain", "--x", "month", "--y", "mm", "--title", "x", "--what", "x", "--source", "x", "--out", str(d / "bad"))
con = sqlite3.connect(d / "p.db")
case("the database is opened read-only", r.returncode != 0 and con.execute("SELECT COUNT(*) FROM rain").fetchone()[0] == 4)
r = run("draw", "--csv", str(d / "t.csv"), "--x", "region", "--y", "studies", "--kind", "bar", "--no-zero", "--title", "x", "--what", "x", "--source", "x", "--out", str(d / "nz"))
case("a bar chart cannot leave zero", r.returncode != 0)
r = run("draw", "--csv", str(d / "t.csv"), "--x", "region", "--y", "studies", "--kind", "pie", "--title", "x", "--what", "x", "--source", "x", "--out", str(d / "pie"))
case("no pie charts", r.returncode != 0 and not (d / "pie.png").exists())
print(f"chart tests: {sum(results)} of {len(results)} passed")
sys.exit(0 if all(results) else 1)
