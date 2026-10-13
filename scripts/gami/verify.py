"""Check each PDF's first two pages contain its title. Writes verified column into manifest.
usage: uv run --with pypdf --with ftfy python -I scripts/gami/verify.py"""
import csv, os, re, difflib, logging
from pathlib import Path
import pypdf, ftfy
logging.getLogger('pypdf').setLevel(logging.ERROR)
OUT = Path.home() / 'Desktop/GAMI'
norm = lambda s: re.sub(r'[^a-z0-9]+', '', ftfy.fix_text(s or '').lower())
rows = list(csv.DictReader(open(OUT / 'manifest.csv')))
bad = []
for r in rows:
    f = OUT / 'papers' / f"{r['article_id']}.pdf"
    if not f.exists():
        if r['status'] == 'downloaded': r['status'] = 'failed'; r['file'] = ''
        continue
    try: text = norm(' '.join(p.extract_text() or '' for p in pypdf.PdfReader(str(f)).pages[:2]))
    except Exception as e: text = ''
    t = norm(r['title'])[:60]
    ok = t[:40] in text or difflib.SequenceMatcher(None, t, text[:4000]).find_longest_match(0, len(t), 0, min(len(text), 4000)).size >= min(30, len(t) - 5)
    if ok:
        r['status'] = 'downloaded'; r['file'] = f.name
        if not r['source']: r['source'] = 'stanford/sciencedirect-in-chrome' if r['doi'].startswith('10.1016/') else 'file-on-disk'
    else:
        (OUT / 'debug' / 'wrong').mkdir(parents=True, exist_ok=True); f.rename(OUT / 'debug' / 'wrong' / f.name)
        r['status'] = 'failed'; r['file'] = ''; r['note'] = 'downloaded file was a different document'
        bad.append((r['article_id'], r['title'][:70]))
w = csv.DictWriter(open(OUT / 'manifest.csv', 'w', newline=''), fieldnames=rows[0].keys()); w.writeheader(); w.writerows(rows)
print('checked', sum(1 for r in rows if r['file']), 'mismatched', len(bad))
for b in bad: print(' ', *b)
