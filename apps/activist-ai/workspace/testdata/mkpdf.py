# A made-up PDF for the checks: one page per argument, each page one line of text.
#   python3 mkpdf.py "page one text" "page two text" > out.pdf
import sys


def pdf(pages):
    objs = []
    kids = " ".join("%d 0 R" % (3 + 2 * i) for i in range(len(pages)))
    objs.append("<< /Type /Catalog /Pages 2 0 R >>")
    objs.append("<< /Type /Pages /Kids [%s] /Count %d >>" % (kids, len(pages)))
    font = 3 + 2 * len(pages)
    for i, text in enumerate(pages):
        stream = "BT /F1 14 Tf 72 720 Td (%s) Tj ET" % text.replace("(", "").replace(")", "").replace("\\", "")
        objs.append("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 %d 0 R >> >> /Contents %d 0 R >>" % (font, 4 + 2 * i))
        objs.append("<< /Length %d >>\nstream\n%s\nendstream" % (len(stream), stream))
    objs.append("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    out = "%PDF-1.4\n"
    offs = []
    for n, o in enumerate(objs, 1):
        offs.append(len(out))
        out += "%d 0 obj\n%s\nendobj\n" % (n, o)
    x = len(out)
    out += "xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1) + "".join("%010d 00000 n \n" % o for o in offs)
    out += "trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs) + 1, x)
    return out.encode("latin-1")


sys.stdout.buffer.write(pdf(sys.argv[1:]))
