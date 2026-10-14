"""Build gami.db from the spreadsheet, the manifest and the PDFs. Safe to rerun: it rebuilds the coded
fields and the text, and keeps every classification run (runs, labels) already in the file.
usage (on the mini): ~/GAMI/.venv/bin/python build.py      GAMI_DIR defaults to ~/GAMI
"""
import csv, json, os, re, sqlite3, sys, time
from pathlib import Path
import fitz, ftfy, openpyxl

GAMI = Path(os.environ.get('GAMI_DIR', Path.home() / 'GAMI'))
XLSX = Path(os.environ.get('GAMI_XLSX', Path(__file__).resolve().parent.parent / 'GAMI_Database_FINAL.xlsx'))
DB = GAMI / 'gami.db'
fitz.TOOLS.mupdf_display_errors(False)

# spreadsheet header -> column name; anything not listed gets an automatic name
RENAME = {'Article.ID': 'id', 'Summarize': 'summary', 'User.Note': 'user_note',
          'NumericScoreImplementationStage': 'implementation_score', 'DEPTH SCORE': 'depth_score',
          'SCOPE SCORE': 'scope_score', 'SPEED SCORE': 'speed_score', 'LIMITS CHALLENGED': 'limits_challenged'}
# multi-value coded fields that also go into the tags table, for exact filtering
TAGS = {'region': '1.1.Geography', 'country': '1.1.1.Geography-Country', 'sector': '1.2.Sector',
        'cross_cutting': '1.3.Cross.cutting.topics', 'actors': '2.1.1.Actors.Institutions',
        'equity_planning': '2.2.1.Equity-Planning', 'equity_targeting': '2.3.1.Equity-Targeting',
        'response_type': '3.1.1.ResponseType', 'hazard': '3.3.1.Hazards', 'exposure': '3.4.1.Exposure.vulnerability'}
EMPTY = {'', 'n/a', 'none', 'na'}

def colname(h):
    if h in RENAME: return RENAME[h]
    if h.startswith('Implementation widespread'): return 'implementation_stage'
    return re.sub(r'_+', '_', re.sub(r'[^a-z0-9]+', '_', re.sub(r'^[\d.]+', '', h).lower())).strip('_')

def fx(v): return ftfy.fix_text(str(v)).strip() if v is not None else ''
def parts(v): return [p.strip() for p in fx(v).split('|||') if p.strip() and p.strip().lower() not in EMPTY]
def cell(v):
    if isinstance(v, bool): return int(v)
    if isinstance(v, (int, float)): return v
    p = parts(v); return ' | '.join(p) if p else None

ws = openpyxl.load_workbook(XLSX, read_only=True, data_only=True).worksheets[0]
rows = list(ws.iter_rows(values_only=True))
hdr = list(rows[0]); cols, seen = [], set()
for h in hdr:
    c = colname(h)
    while c in seen: c += '_2'
    seen.add(c); cols.append(c)
sheet = {str(r[0]).strip(): r for r in rows[1:] if r[0] is not None}
man = {m['article_id']: m for m in csv.DictReader(open(GAMI / 'manifest.csv'))}
years = json.loads((GAMI / 'years.json').read_text()) if (GAMI / 'years.json').exists() else {}  # from years.py

db = sqlite3.connect(DB)
db.executescript('''
DROP TABLE IF EXISTS papers; DROP TABLE IF EXISTS tags; DROP TABLE IF EXISTS papers_fts; DROP TABLE IF EXISTS pages_fts;
CREATE TABLE IF NOT EXISTS runs (run TEXT PRIMARY KEY, created TEXT, model TEXT, source TEXT, question TEXT, buckets TEXT);
CREATE TABLE IF NOT EXISTS labels (run TEXT, paper_id TEXT, label TEXT, confidence TEXT, reason TEXT, PRIMARY KEY (run, paper_id));
''')
meta = ['n INTEGER', 'year INTEGER', 'doi TEXT', 'status TEXT', 'pdf TEXT', 'pages INTEGER', 'words INTEGER', 'body TEXT']
coded = [f'"{c}"' for c in cols if c != 'id']
db.execute(f'CREATE TABLE papers (id TEXT PRIMARY KEY, {", ".join(meta)}, {", ".join(c + " " for c in coded)})')
db.execute('CREATE TABLE tags (paper_id TEXT, field TEXT, value TEXT)')
db.execute("CREATE VIRTUAL TABLE papers_fts USING fts5(id UNINDEXED, title, summary, body, tokenize='porter unicode61 remove_diacritics 2')")
db.execute("CREATE VIRTUAL TABLE pages_fts USING fts5(paper_id UNINDEXED, page UNINDEXED, text, tokenize='porter unicode61 remove_diacritics 2')")

t0, got = time.time(), 0
for i, (pid, r) in enumerate(sheet.items()):
    rec = {c: cell(v) for c, v in zip(cols, r)}
    rec['title'] = fx(r[hdr.index('Title')])
    m = man.get(pid, {})
    pdf = GAMI / 'papers' / f'{pid}.pdf'
    pages, body = [], ''
    if pdf.exists():
        try:
            with fitz.open(pdf) as d: pages = [p.get_text() for p in d]
        except Exception as e: print('unreadable', pid, e, file=sys.stderr)
        body = '\n\n'.join(pages); got += 1
    vals = dict(id=pid, n=int(m['n']) if m.get('n') else None, year=years.get(m.get('doi')), doi=m.get('doi') or None,
                status=m.get('status') or 'not_attempted', pdf=f'papers/{pid}.pdf' if pdf.exists() else None,
                pages=len(pages) or None, words=len(body.split()) or None, body=body or None)
    vals.update({c: rec[c] for c in cols if c != 'id'})
    names = ', '.join('"%s"' % k for k in vals)
    db.execute(f'INSERT INTO papers ({names}) VALUES ({", ".join("?" * len(vals))})', list(vals.values()))
    for field, h in TAGS.items():
        for v in dict.fromkeys(parts(r[hdr.index(h)])):
            if field == 'country' and (len(v) > 40 or v[0] in '"“'): continue  # a quote, not a country
            db.execute('INSERT INTO tags VALUES (?,?,?)', (pid, field, v))
    db.execute('INSERT INTO papers_fts VALUES (?,?,?,?)', (pid, rec['title'], rec.get('summary') or '', body))
    for k, t in enumerate(pages, 1):
        if t.strip(): db.execute('INSERT INTO pages_fts VALUES (?,?,?)', (pid, k, t))
    if i % 100 == 99: print(f'{i + 1} papers, {time.time() - t0:.0f}s', flush=True)
db.executescript('''
CREATE INDEX tags_fv ON tags (field, value); CREATE INDEX tags_p ON tags (paper_id);
INSERT INTO papers_fts(papers_fts) VALUES ('optimize'); INSERT INTO pages_fts(pages_fts) VALUES ('optimize');
''')
db.commit()
n, txt, thin = db.execute("select count(*), count(body), sum(words < 1000) from papers").fetchone()
print(f'{DB}: {n} papers, {txt} with full text ({got} PDFs), {thin} with under 1,000 words of text, {time.time() - t0:.0f}s')
db.execute('VACUUM')
