"""Publication year for every paper with a DOI, from Crossref, saved to $GAMI_DIR/years.json (build.py reads it).
Only looks up DOIs not already in the file. usage: python3 years.py
"""
import csv, json, os, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
GAMI = Path(os.environ.get('GAMI_DIR', Path.home() / 'GAMI')); OUT = GAMI / 'years.json'
have = json.loads(OUT.read_text()) if OUT.exists() else {}
todo = [m['doi'] for m in csv.DictReader(open(GAMI / 'manifest.csv')) if m['doi'] and m['doi'] not in have]
def year(doi):
    req = urllib.request.Request('https://api.crossref.org/works/' + urllib.parse.quote(doi), headers={'User-Agent': 'gami-corpus (mailto:bdecrem@gmail.com)'})
    try:
        w = json.load(urllib.request.urlopen(req, timeout=30))['message']
        for k in ('published-print', 'published-online', 'issued', 'created'):
            p = (w.get(k) or {}).get('date-parts') or [[None]]
            if p[0][0]: return doi, p[0][0]
    except Exception: pass
    return doi, None
with ThreadPoolExecutor(8) as ex:
    for doi, y in ex.map(year, todo):
        if y: have[doi] = y
OUT.write_text(json.dumps(have, indent=0))
print(f'{len(have)} DOIs with a year, {sum(1 for d in todo if d not in have)} not found')
