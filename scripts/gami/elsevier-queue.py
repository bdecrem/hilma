"""Print pending Elsevier papers as `id pii`, ready for the in-Chrome pass."""
import csv, json, os
from pathlib import Path
OUT = Path.home() / 'Desktop/GAMI'
side = json.loads((OUT / 'debug/candidates.json').read_text()) if (OUT / 'debug/candidates.json').exists() else {}
done_ids = {l.strip() for l in open(OUT / 'debug/elsevier-tried.txt')} if (OUT / 'debug/elsevier-tried.txt').exists() else set()
for r in csv.DictReader(open(OUT / 'manifest.csv')):
    if r['doi'].startswith('10.1016/') and not (OUT / 'papers' / f"{r['article_id']}.pdf").exists() and r['article_id'] not in done_ids:
        pii = side.get(r['article_id'], {}).get('pii')
        if pii: print(r['article_id'], pii)
