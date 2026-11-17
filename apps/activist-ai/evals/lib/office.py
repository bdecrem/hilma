"""Reading and writing Office files with the standard library only, for the skills tasks' checkers
and reference solutions (the checker's Python has no openpyxl or python-docx).

xlsx_read(path) -> {sheet name: {"rows": [[cell text or number], ...], "formulas": n, "frozen": "A2" or None,
                                  "filter": "A1:F9" or None, "numeric": {(r, c), ...}}}
xlsx_write(path, sheets, frozen=..., filters=...)  a minimal valid workbook (inline strings, numbers)
docx_text(path) -> {"paragraphs": [(style, text)], "tables": n, "drawings": n, "xml": str}
docx_write(path, blocks)  a minimal valid document: ("title"|"h1"|"p", text), ("table", rows), ("image", png bytes)
"""
import re, zipfile
from xml.etree import ElementTree as ET
from xml.sax.saxutils import escape

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
      "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
      "pr": "http://schemas.openxmlformats.org/package/2006/relationships",
      "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}


def _col(ref):
    letters = re.match(r"[A-Z]+", ref).group(0)
    n = 0
    for ch in letters:
        n = n * 26 + ord(ch) - 64
    return n - 1, int(ref[len(letters):]) - 1


def xlsx_read(path):
    z = zipfile.ZipFile(path)
    names = set(z.namelist())
    shared = []
    if "xl/sharedStrings.xml" in names:
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", NS):
            shared.append("".join(t.text or "" for t in si.iter("{%s}t" % NS["m"])))
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rels = {r.get("Id"): r.get("Target") for r in ET.fromstring(z.read("xl/_rels/workbook.xml.rels")).findall("pr:Relationship", NS)}
    out = {}
    for s in wb.find("m:sheets", NS).findall("m:sheet", NS):
        target = rels[s.get("{%s}id" % NS["r"])].lstrip("/")
        target = target if target.startswith("xl/") else "xl/" + target
        root = ET.fromstring(z.read(target))
        grid, formulas, numeric = {}, 0, set()
        for c in root.iter("{%s}c" % NS["m"]):
            col, row = _col(c.get("r"))
            t = c.get("t")
            if c.find("m:f", NS) is not None:
                formulas += 1
            v = c.find("m:v", NS)
            if t == "s" and v is not None:
                val = shared[int(v.text)]
            elif t == "inlineStr":
                val = "".join(x.text or "" for x in c.iter("{%s}t" % NS["m"]))
            elif t in ("str", "e"):
                val = v.text if v is not None else ""
            elif t == "b":
                val = v.text if v is not None else ""
            elif v is not None:
                try:
                    val = float(v.text)
                    numeric.add((row, col))
                except ValueError:
                    val = v.text
            else:
                continue
            grid[(row, col)] = val
        rows = []
        if grid:
            nr, nc = max(r for r, _ in grid) + 1, max(c for _, c in grid) + 1
            rows = [[grid.get((r, c), "") for c in range(nc)] for r in range(nr)]
        pane = root.find(".//m:sheetView/m:pane", NS)
        frozen = pane.get("topLeftCell") if pane is not None and pane.get("state") in ("frozen", "frozenSplit") else None
        af = root.find("m:autoFilter", NS)
        out[s.get("name")] = {"rows": rows, "formulas": formulas, "frozen": frozen, "filter": af.get("ref") if af is not None else None, "numeric": numeric}
    return out


def _cref(r, c):
    s, c = "", c + 1
    while c:
        c, rem = divmod(c - 1, 26)
        s = chr(65 + rem) + s
    return f"{s}{r + 1}"


def xlsx_write(path, sheets, frozen=None, filters=None, formulas_for=()):
    """sheets: {name: rows}. frozen/filters: {name: True}. formulas_for: texts to write as formulas (for wrong outputs)."""
    frozen, filters = frozen or {}, filters or {}
    z = zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED)
    z.writestr("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
               '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
               '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
               + "".join(f'<Override PartName="/xl/worksheets/sheet{i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' for i in range(len(sheets)))
               + "</Types>")
    z.writestr("_rels/.rels", '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
               '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
    z.writestr("xl/workbook.xml", '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
               + "".join(f'<sheet name="{escape(n)}" sheetId="{i + 1}" r:id="rId{i + 1}"/>' for i, n in enumerate(sheets)) + "</sheets></workbook>")
    z.writestr("xl/_rels/workbook.xml.rels", '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
               + "".join(f'<Relationship Id="rId{i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{i + 1}.xml"/>' for i in range(len(sheets))) + "</Relationships>")
    for i, (name, rows) in enumerate(sheets.items()):
        view = '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' if frozen.get(name) else ""
        body = []
        for r, row in enumerate(rows):
            cells = []
            for c, v in enumerate(row):
                ref = _cref(r, c)
                if v is None or v == "":
                    continue
                if isinstance(v, (int, float)) and not isinstance(v, bool):
                    cells.append(f'<c r="{ref}"><v>{v}</v></c>')
                elif str(v) in formulas_for:
                    cells.append(f'<c r="{ref}"><f>{escape(str(v)[1:])}</f></c>')
                else:
                    cells.append(f'<c r="{ref}" t="inlineStr"><is><t xml:space="preserve">{escape(str(v))}</t></is></c>')
            body.append(f'<row r="{r + 1}">' + "".join(cells) + "</row>")
        af = ""
        if filters.get(name) and rows:
            af = f'<autoFilter ref="A1:{_cref(len(rows) - 1, max(len(x) for x in rows) - 1)}"/>'
        z.writestr(f"xl/worksheets/sheet{i + 1}.xml", '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
                   + view + "<sheetData>" + "".join(body) + "</sheetData>" + af + "</worksheet>")
    z.close()


def docx_text(path):
    z = zipfile.ZipFile(path)
    xml = z.read("word/document.xml").decode("utf-8", "replace")
    root = ET.fromstring(xml)
    W = "{%s}" % NS["w"]
    paras = []
    for p in root.iter(W + "p"):
        st = p.find(f"{W}pPr/{W}pStyle")
        text = "".join(t.text or "" for t in p.iter(W + "t"))
        paras.append((st.get(W + "val") if st is not None else "", text))
    return {"paragraphs": paras, "tables": len(list(root.iter(W + "tbl"))), "drawings": xml.count("<w:drawing") + xml.count("<w:pict"), "xml": xml,
            "media": [n for n in z.namelist() if n.startswith("word/media/")]}


def docx_write(path, blocks):
    W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' \
        'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' \
        'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"'
    body, media, n_img = [], [], 0

    def para(text, style=None):
        ps = f'<w:pPr><w:pStyle w:val="{style}"/></w:pPr>' if style else ""
        return f'<w:p>{ps}<w:r><w:t xml:space="preserve">{escape(text)}</w:t></w:r></w:p>'

    for kind, data in blocks:
        if kind == "title":
            body.append(para(data, "Title"))
        elif kind == "h1":
            body.append(para(data, "Heading1"))
        elif kind == "p":
            body.append(para(data))
        elif kind == "table":
            rows = "".join("<w:tr>" + "".join(f'<w:tc><w:p><w:r><w:t xml:space="preserve">{escape(str(c))}</w:t></w:r></w:p></w:tc>' for c in r) + "</w:tr>" for r in data)
            body.append(f"<w:tbl><w:tblPr/>{rows}</w:tbl>")
        elif kind == "image":
            n_img += 1
            media.append((f"word/media/image{n_img}.png", data))
            cx, cy = 5486400, 3086100
            body.append(f'<w:p><w:r><w:drawing><wp:inline><wp:extent cx="{cx}" cy="{cy}"/><wp:docPr id="{n_img}" name="Picture {n_img}"/>'
                        f'<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="{n_img}" name="image{n_img}.png"/><pic:cNvPicPr/></pic:nvPicPr>'
                        f'<pic:blipFill><a:blip r:embed="rIdImg{n_img}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>'
                        f"</a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>")
    z = zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED)
    z.writestr("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
               '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>'
               '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
    z.writestr("_rels/.rels", '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
               '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
    z.writestr("word/_rels/document.xml.rels", '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
               + "".join(f'<Relationship Id="rIdImg{i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image{i + 1}.png"/>' for i in range(len(media))) + "</Relationships>")
    z.writestr("word/document.xml", f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document {W}><w:body>' + "".join(body) + "</w:body></w:document>")
    for name, data in media:
        z.writestr(name, data)
    z.close()


def png_bytes(w=800, h=450, rgb=(43, 76, 126)):
    import struct, zlib
    raw = b"".join(b"\0" + bytes(rgb) * w for _ in range(h))
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


def png_size(data):
    import struct
    return struct.unpack(">II", data[16:24]) if data[:8] == b"\x89PNG\r\n\x1a\n" and len(data) > 24 else (0, 0)
