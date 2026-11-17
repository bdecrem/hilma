#!/usr/bin/env python3
"""The report skill's own tests. Run inside the workspace image (python-docx, reportlab, poppler):
    python3 /opt/ola/skills/report/tests/test_report.py"""
import csv, struct, subprocess, sys, tempfile, zipfile, zlib
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "report.py"
results = []


def case(name, ok, detail=""):
    results.append(ok)
    print(f"{'pass' if ok else 'FAIL'}  report: {name}" + (f"  ({detail})" if detail and not ok else ""))


def run(*args, cwd=None):
    return subprocess.run([sys.executable, str(SCRIPT), *args], capture_output=True, text=True, timeout=180, cwd=cwd)


def pdf(path, pages):
    objs, kids = [], " ".join("%d 0 R" % (3 + 2 * i) for i in range(len(pages)))
    objs += ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [%s] /Count %d >>" % (kids, len(pages))]
    font = 3 + 2 * len(pages)
    for i, text in enumerate(pages):
        stream = "BT /F1 12 Tf 72 720 Td (%s) Tj ET" % text
        objs += ["<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 %d 0 R >> >> /Contents %d 0 R >>" % (font, 4 + 2 * i),
                 "<< /Length %d >>\nstream\n%s\nendstream" % (len(stream), stream)]
    objs.append("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    out, offs = "%PDF-1.4\n", []
    for n, o in enumerate(objs, 1):
        offs.append(len(out))
        out += "%d 0 obj\n%s\nendobj\n" % (n, o)
    x = len(out)
    out += "xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1) + "".join("%010d 00000 n \n" % o for o in offs)
    out += "trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs) + 1, x)
    Path(path).write_bytes(out.encode("latin-1"))


def png(path, w=60, h=30):
    raw = b"".join(b"\0" + bytes([40, 76, 126]) * w for _ in range(h))
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    Path(path).write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))


d = Path(tempfile.mkdtemp(prefix="report-test-"))
pdf(d / "review.pdf", ["Introduction to the review.", "In 2025 the town moved 412 households away from the river.", "The river rose faster than the gauges could report."])
png(d / "fig.png")
with open(d / "t.csv", "w", newline="") as f:
    csv.writer(f).writerows([["Town", "Households"], ["Kesteren", "412"], ["Ochten", "88"]])
good = """# Relocation in the river towns
> A test brief.
## What we found
The town moved 412 households in 2025 (review.pdf, p. 2). The review says "the river rose faster than the gauges" (review.pdf, p. 3).
- In all, 500 households (computed from t.csv).
![Households moved](fig.png)
{{table: t.csv | Households moved, by town}}
## How this was made
I read the review and the table.
"""
(d / "good.md").write_text(good)
r = run("check", "good.md", cwd=d)
case("a cited text passes the check", r.returncode == 0, r.stdout[-400:])
r = run("build", "good.md", cwd=d)
case("build writes a .docx and a .pdf", r.returncode == 0 and (d / "good.docx").exists() and (d / "good.pdf").exists(), r.stdout[-300:] + r.stderr[-300:])
x = zipfile.ZipFile(d / "good.docx").read("word/document.xml").decode() if (d / "good.docx").exists() else ""
case("the document has headings, a table, a picture and the citations", 'w:val="Heading1"' in x and "<w:tbl>" in x and "<w:drawing>" in x and "(review.pdf, p. 2)" in x and "Sources" in x)
t = subprocess.run(["pdftotext", str(d / "good.pdf"), "-"], capture_output=True, text=True).stdout if (d / "good.pdf").exists() else ""
case("the PDF carries the text, the table and the sources", "412 households" in t and "Kesteren" in t and "Sources" in t and "review.pdf" in t, t[:200])

bad = good.replace("(review.pdf, p. 2)", "").replace("faster than the gauges", "faster than the forecasts").replace("(review.pdf, p. 3)", "(review.pdf, p. 9)")
(d / "bad.md").write_text(bad + "\nIt cost 3 million dollars (missing.pdf, p. 1).\n")
r = run("check", "bad.md", cwd=d)
out = r.stdout
case("a number with no source is refused", r.returncode == 1 and "no source for" in out, out[-500:])
case("a page past the end of the PDF is refused", "has 3 pages; cited p. 9" in out)
case("a cited file that does not exist is refused", "cited file not found: missing.pdf" in out)
(d / "q.md").write_text("# T\n## A\nThe review says \"the river rose faster than the forecasts\" (review.pdf, p. 3).\n")
r = run("check", "q.md", cwd=d)
case("a quotation not on its page word for word is refused", r.returncode == 1 and "not found word for word" in r.stdout, r.stdout)
r = run("build", "q.md", cwd=d)
case("build stops while the check fails", r.returncode == 1 and not (d / "q.docx").exists())
print(f"report tests: {sum(results)} of {len(results)} passed")
sys.exit(0 if all(results) else 1)
