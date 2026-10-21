"""Turn Elsevier full-text XML (Article Retrieval API, view=FULL) into a plain PDF, for papers where the API's PDF is
only the first-page preview but the XML carries the whole text.
usage: uv run --with pymupdf python -I apps/gami/fetch/elsevier-xml-pdf.py <in.xml> <out.pdf>"""
import sys, html
import xml.etree.ElementTree as ET
import pymupdf as fitz

CE = '{http://www.elsevier.com/xml/common/dtd}'
DC = '{http://purl.org/dc/elements/1.1/}'
PRISM = '{http://prismstandard.org/namespaces/basic/2.0/}'

def text(el):
    if el is None: return ''
    skip = {CE + 'label'}
    out = [el.text or '']
    for c in el:
        if c.tag not in skip or el.tag == CE + 'section-title': out.append(text(c))
        out.append(c.tail or '')
    return ' '.join(''.join(out).split())

root = ET.parse(sys.argv[1]).getroot()
title = text(root.find(f'.//{DC}title'))
authors = '; '.join(text(a) for a in root.findall(f'.//{DC}creator'))
journal = text(root.find(f'.//{PRISM}publicationName'))
doi = text(root.find(f'.//{PRISM}doi'))
parts = [f'<h1>{html.escape(title)}</h1>', f'<p class="m">{html.escape(authors)}</p>',
         f'<p class="m">{html.escape(journal)} · doi:{html.escape(doi)} · text from the Elsevier Article Retrieval API</p>']

def walk(el, depth):
    for c in el:
        if c.tag == CE + 'section-title': parts.append(f'<h{min(depth, 4)}>{html.escape(text(c))}</h{min(depth, 4)}>')
        elif c.tag in (CE + 'para', CE + 'simple-para'): parts.append(f'<p>{html.escape(text(c))}</p>')
        elif c.tag in (CE + 'section', CE + 'sections', CE + 'abstract-sec'): walk(c, depth + 1)

for ab in root.iter(CE + 'abstract'):
    if ab.get('class') in (None, 'author'):
        parts.append('<h2>Abstract</h2>'); walk(ab, 2); break
body = next((e for e in root.iter() if e.tag.endswith('}body') or e.tag == '{http://www.elsevier.com/xml/bk/dtd}chapter'), None)
if body is None: sys.exit('no body in ' + sys.argv[1])
walk(body, 2)
refs = [text(r) for r in root.iter(CE + 'bib-reference')]
if refs: parts.append('<h2>References</h2>' + ''.join(f'<p class="r">{html.escape(r)}</p>' for r in refs))

css = 'body{font-family:serif;font-size:10pt} h1{font-size:15pt} h2{font-size:12pt} h3,h4{font-size:10.5pt} .m{font-size:9pt;color:#444} .r{font-size:8.5pt}'
story = fitz.Story(html=''.join(parts), user_css=css)
w = fitz.DocumentWriter(sys.argv[2])
rect, more = fitz.paper_rect('letter'), 1
while more:
    dev = w.begin_page(rect); more, _ = story.place(rect + (54, 54, -54, -54)); story.draw(dev); w.end_page()
w.close()
d = fitz.open(sys.argv[2]); print(sys.argv[2], d.page_count, 'pages', sum(len(p.get_text().split()) for p in d), 'words')
