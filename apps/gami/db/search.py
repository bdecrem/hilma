"""Keyword search across the full text, with the page and a snippet for each hit.
usage: python3 search.py 'managed retreat'            phrase
       python3 search.py 'drought AND (pastoral* OR herder*) NOT flood'   SQLite FTS5 syntax: AND OR NOT, prefix*, NEAR(a b, 10)
       python3 search.py --sql "select ..."           any SQL against gami.db
       [--where "SQL on papers p"] [--limit 50] [--csv out.csv]
"""
import argparse, csv, os, sqlite3, sys
from pathlib import Path
GAMI = Path(os.environ.get('GAMI_DIR', Path.home() / 'GAMI'))
ap = argparse.ArgumentParser(); ap.add_argument('query', nargs='?'); ap.add_argument('--sql'); ap.add_argument('--where', default='1=1')
ap.add_argument('--limit', type=int, default=50); ap.add_argument('--csv')
a = ap.parse_args()
db = sqlite3.connect(GAMI / 'gami.db')
if a.sql:
    cur = db.execute(a.sql); hdr = [d[0] for d in cur.description]; rows = cur.fetchall()
else:
    q = a.query if any(t in a.query for t in ('"', ' AND ', ' OR ', ' NOT ', 'NEAR(', '*')) else f'"{a.query}"'
    total = db.execute(f'select count(*) from papers_fts f join papers p using(id) where papers_fts match ? and ({a.where})', (q,)).fetchone()[0]
    print(f'{total} papers match', file=sys.stderr)
    hdr = ['id', 'year', 'title', 'hits', 'page', 'snippet']
    rows = db.execute(f'''select p.id, p.year, p.title, (select count(*) from pages_fts where paper_id=p.id and pages_fts match ?1) hits,
        (select page from pages_fts where paper_id=p.id and pages_fts match ?1 order by rank limit 1),
        (select snippet(pages_fts, 2, '[', ']', '…', 14) from pages_fts where paper_id=p.id and pages_fts match ?1 order by rank limit 1)
        from papers_fts f join papers p using(id) where papers_fts match ?1 and ({a.where}) order by f.rank limit ?2''', (q, a.limit)).fetchall()
if a.csv:
    with open(a.csv, 'w', newline='') as fh: w = csv.writer(fh); w.writerow(hdr); w.writerows(rows)
    print(f'{len(rows)} rows -> {a.csv}', file=sys.stderr)
else:
    for r in rows: print(' | '.join('' if v is None else str(v).replace('\n', ' ') for v in r))
