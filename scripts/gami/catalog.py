"""Rebuild the clean outputs from the manifest + spreadsheet + PDFs on disk.
~/Desktop/GAMI/papers.json  one record per paper, for the summary web page
~/Desktop/GAMI/papers.csv   same, as a table
~/Desktop/GAMI/log.md       one line per paper, readable
usage: uv run --with openpyxl --with pypdf --with ftfy python -I scripts/gami/catalog.py
"""
import csv, json, os, re, time
from pathlib import Path
import openpyxl, pypdf, ftfy, logging
logging.getLogger('pypdf').setLevel(logging.ERROR)
OUT = Path.home() / 'Desktop/GAMI'
XLSX = Path.home() / 'Documents/coding2025/hilma/misc/GAMI_Database_FINAL.xlsx'
PUB = {'10.1016': 'Elsevier', '10.1007': 'Springer', '10.1080': 'Taylor & Francis', '10.1177': 'Sage', '10.3390': 'MDPI', '10.1002': 'Wiley', '10.1111': 'Wiley', '10.1088': 'IOP', '10.1017': 'Cambridge'}
def fx(v): return ftfy.fix_text(str(v)).strip() if v is not None else ''
def split(v): return [x.strip() for x in fx(v).split('|||') if x.strip() and x.strip() != 'n/a']

ws = openpyxl.load_workbook(XLSX, read_only=True, data_only=True).worksheets[0]
rows = list(ws.iter_rows(values_only=True)); hdr = list(rows[0]); ix = {h: i for i, h in enumerate(hdr)}
sheet = {str(r[0]).strip(): r for r in rows[1:] if r[0] is not None}
man = list(csv.DictReader(open(OUT / 'manifest.csv')))
recs = []
for m in man:
    r = sheet[m['article_id']]; f = OUT / 'papers' / f"{m['article_id']}.pdf"
    pages = None
    if f.exists():
        try: pages = len(pypdf.PdfReader(str(f)).pages)
        except Exception: pass
    src = m['source']
    method = 'open access' if not src.startswith('stanford') else ('Stanford, in Bart\'s Chrome' if 'in-chrome' in src else 'Stanford, automated browser')
    recs.append(dict(
        n=int(m['n']), id=m['article_id'], title=fx(r[ix['Title']]), authors=fx(r[ix['Authors']]), journal=fx(r[ix['Journal']]),
        doi=m['doi'], doi_url=f"https://doi.org/{m['doi']}" if m['doi'] else '', publisher=PUB.get(m['doi'][:7], '') if m['doi'] else '',
        status=m['status'], pdf=f"papers/{f.name}" if f.exists() else '', pages=pages, kb=f.stat().st_size // 1024 if f.exists() else None, method=method if f.exists() else '',
        region=[x.strip() for x in fx(r[ix['1.1.Geography']]).split('|||') if x.strip()], country=split(r[ix['1.1.1.Geography-Country']]),
        sector=split(r[ix['1.2.Sector']]), hazards=split(r[ix['3.3.1.Hazards']]), response=split(r[ix['3.1.1.ResponseType']]),
        summary=fx(r[ix['Summarize']]), note=m['note']))
(OUT / 'papers.json').write_text(json.dumps(recs, indent=1, ensure_ascii=False))
cols = ['n', 'id', 'status', 'pdf', 'pages', 'title', 'authors', 'journal', 'publisher', 'doi_url', 'method', 'region', 'country', 'sector']
with open(OUT / 'papers.csv', 'w', newline='') as fh:
    w = csv.writer(fh); w.writerow(cols)
    for x in recs: w.writerow(['; '.join(x[c]) if isinstance(x[c], list) else x[c] for c in cols])
got = sum(1 for x in recs if x['pdf'])
L = [f'# GAMI papers', '', f'Updated {time.strftime("%Y-%m-%d %H:%M")}. {got} of {len(recs)} attempted downloaded (1,682 in the database).', '',
     'Files: papers/<id>.pdf · papers.json and papers.csv (one row per paper, for the web page) · debug/ (attempt details, screenshots)', '',
     '| # | id | status | pages | publisher | how | title |', '|---|---|---|---|---|---|---|']
for x in recs:
    L.append(f"| {x['n']} | {x['id']} | {'✓' if x['pdf'] else x['status']} | {x['pages'] or ''} | {x['publisher']} | {x['method']} | {x['title'][:90]} |")
(OUT / 'log.md').write_text('\n'.join(L) + '\n')
print('\n'.join(L))
