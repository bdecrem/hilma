"""GAMI paper retrieval: resolve DOIs and fetch open-access PDFs.

usage: uv run --with openpyxl --with requests --with ftfy python -I scripts/gami/resolve.py --start 0 --count 10
Appends to ~/Desktop/GAMI/log.md and ~/Desktop/GAMI/manifest.csv, PDFs to ~/Desktop/GAMI/papers/<Article.ID>.pdf
"""
import argparse, csv, difflib, html, json, os, re, sys, time
from pathlib import Path
import openpyxl, requests, ftfy

XLSX = Path.home() / 'Documents/coding2025/hilma/misc/GAMI_Database_FINAL.xlsx'
OUT = Path.home() / 'Desktop/GAMI'
PAPERS = OUT / 'papers'
LOG = OUT / 'debug' / 'attempts.md'
MANIFEST = OUT / 'manifest.csv'
SIDE = OUT / 'debug' / 'candidates.json'
MAILTO = 'amber@intheamber.com'
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
S = requests.Session()
S.headers['User-Agent'] = f'GAMI-retrieval/0.1 (mailto:{MAILTO}) ' + UA
ACCEPT = 0.85

def norm(s):
    s = ftfy.fix_text(s or '').lower()
    s = re.sub(r'[^a-z0-9 ]+', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()

def sim(a, b):
    return difflib.SequenceMatcher(None, norm(a), norm(b)).ratio()

def first_surname(authors):
    a = ftfy.fix_text(authors or '').split(';')[0].split(',')[0].strip()
    return norm(a).split(' ')[-1] if a else ''

def load_rows():
    wb = openpyxl.load_workbook(XLSX, read_only=True, data_only=True)
    ws = wb.worksheets[0]
    rows = list(ws.iter_rows(values_only=True))
    hdr = list(rows[0]); idx = {h: i for i, h in enumerate(hdr)}
    out = []
    for r in rows[1:]:
        if r[0] is None: continue
        out.append(dict(id=str(r[0]).strip(), title=ftfy.fix_text(str(r[idx['Title']] or '')).strip(),
                        authors=ftfy.fix_text(str(r[idx['Authors']] or '')).strip(), journal=str(r[idx['Journal']] or '').strip()))
    return out

def get(url, **kw):
    kw.setdefault('timeout', 40)
    for attempt in range(3):
        try:
            return S.get(url, **kw)
        except requests.RequestException as e:
            if attempt == 2: raise
            time.sleep(2 * (attempt + 1))

def crossref(p):
    r = get('https://api.crossref.org/works', params=dict(**{'query.bibliographic': p['title'], 'query.author': first_surname(p['authors'])},
            rows=5, mailto=MAILTO, select='DOI,title,author,container-title,issued'))
    if r.status_code != 200: return None, f'crossref http {r.status_code}'
    best = None
    for it in r.json()['message']['items']:
        t = (it.get('title') or [''])[0]
        s = sim(p['title'], t)
        surn = {norm(a.get('family', '')) for a in it.get('author', [])}
        auth_ok = first_surname(p['authors']) in surn or not first_surname(p['authors'])
        if (best is None or s > best[0]): best = (s, it['DOI'].lower(), t, auth_ok)
    if not best: return None, 'crossref: no results'
    s, doi, t, auth_ok = best
    if (s >= ACCEPT and auth_ok) or s >= 0.97: return doi, f'crossref match {s:.2f}' + ('' if auth_ok else ' (title only)')
    return None, f'crossref best {s:.2f} author_ok={auth_ok} ({t[:70]!r})'

def openalex_by_title(p):
    r = get('https://api.openalex.org/works', params={'search': p['title'], 'per-page': 5, 'mailto': MAILTO})
    if r.status_code != 200: return None, None, f'openalex http {r.status_code}'
    best = None
    for it in r.json().get('results', []):
        s = sim(p['title'], it.get('title') or '')
        surn = {norm(a['author'].get('display_name', '')).split(' ')[-1] for a in it.get('authorships', []) if a.get('author')}
        auth_ok = first_surname(p['authors']) in surn
        if best is None or s > best[0]: best = (s, it, auth_ok)
    if not best: return None, None, 'openalex: no results'
    s, it, auth_ok = best
    if (s >= ACCEPT and auth_ok) or s >= 0.97:
        doi = (it.get('doi') or '').replace('https://doi.org/', '').lower() or None
        return doi, it, f'openalex match {s:.2f}'
    return None, None, f'openalex best {s:.2f} author_ok={auth_ok}'

def openalex_by_doi(doi):
    r = get(f'https://api.openalex.org/works/https://doi.org/{doi}', params={'mailto': MAILTO})
    return r.json() if r.status_code == 200 else None

def oa_candidates(doi, oa_work):
    urls = []
    if oa_work:
        for loc in [oa_work.get('best_oa_location')] + (oa_work.get('locations') or []):
            if loc and loc.get('pdf_url'): urls.append(('openalex', loc['pdf_url']))
        if oa_work.get('open_access', {}).get('oa_url'): urls.append(('openalex-oa_url', oa_work['open_access']['oa_url']))
    try:
        r = get(f'https://api.unpaywall.org/v2/{doi}', params={'email': MAILTO})
        if r.status_code == 200:
            j = r.json()
            for loc in [j.get('best_oa_location')] + (j.get('oa_locations') or []):
                if loc and loc.get('url_for_pdf'): urls.append(('unpaywall', loc['url_for_pdf']))
                elif loc and loc.get('url'): urls.append(('unpaywall-landing', loc['url']))
    except Exception as e: urls.append(('unpaywall-error', str(e)))
    try:
        r = get(f'https://api.semanticscholar.org/graph/v1/paper/DOI:{doi}', params={'fields': 'openAccessPdf'})
        if r.status_code == 200 and (r.json().get('openAccessPdf') or {}).get('url'):
            urls.append(('semanticscholar', r.json()['openAccessPdf']['url']))
    except Exception as e: urls.append(('s2-error', str(e)))
    seen, out = set(), []
    for src, u in urls:
        if u not in seen and u.startswith('http'): seen.add(u); out.append((src, u))
    return out

def fetch_pdf(url, dest, depth=0):
    r = get(url, headers={'User-Agent': UA, 'Accept': 'application/pdf,text/html;q=0.9,*/*;q=0.8'}, allow_redirects=True)
    ct = r.headers.get('content-type', '')
    body = r.content
    if body.startswith(b'%PDF'):
        dest.write_bytes(body)
        return True, f'{dest.stat().st_size // 1024} KB'
    if 'html' in ct and depth < 2:
        m = re.search(rb'<meta[^>]+name="citation_pdf_url"[^>]+content="([^"]+)"', body) or re.search(rb'content="([^"]+)"[^>]+name="citation_pdf_url"', body)
        if m:
            u2 = html.unescape(m.group(1).decode())
            if u2 != url: return fetch_pdf(u2, dest, depth + 1)
        return False, f'html landing page ({r.status_code}, {r.url[:60]})'
    return False, f'not a pdf (status {r.status_code}, {ct[:40]})'

def log(s):
    with open(LOG, 'a') as f: f.write(s + '\n')
    print(s)

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--start', type=int, default=0); ap.add_argument('--count', type=int, default=10); ap.add_argument('--ids')
    a = ap.parse_args()
    PAPERS.mkdir(parents=True, exist_ok=True)
    allrows = load_rows()
    rows = [r for r in allrows if r['id'] in a.ids.split(',')] if a.ids else allrows[a.start:a.start + a.count]
    new = not MANIFEST.exists()
    done = set() if new else {r['article_id'] for r in csv.DictReader(open(MANIFEST))}
    rows = [r for r in rows if r['id'] not in done]
    if not rows: print('nothing new in this range'); return
    side = json.loads(SIDE.read_text()) if SIDE.exists() else {}
    mf = open(MANIFEST, 'a', newline=''); w = csv.writer(mf)
    if new: w.writerow(['n', 'article_id', 'doi', 'status', 'source', 'file', 'note', 'title'])
    log(f'\n## Batch {a.start + 1}–{a.start + len(rows)} · {time.strftime("%Y-%m-%d %H:%M")}\n')
    tally = dict(downloaded=0, paywalled=0, no_doi=0)
    idx = {r['id']: n for n, r in enumerate(load_rows(), 1)}
    for p in rows:
        i = idx[p['id']]
        t0 = time.time()
        log(f'### {i}. [{p["id"]}] {p["title"]}')
        log(f'- {p["authors"][:90]} · {p["journal"]}')
        doi, why = crossref(p)
        notes = [why]
        oa_work = None
        if not doi:
            doi, oa_work, why2 = openalex_by_title(p); notes.append(why2)
        if not doi:
            status, src, file, note = 'no_doi', '', '', '; '.join(notes)
            log(f'- DOI: not found ({note})'); log(f'- **Status: NO DOI** — needs a manual look\n'); tally['no_doi'] += 1
            w.writerow([i, p['id'], '', status, src, file, note, p['title']]); mf.flush(); continue
        log(f'- DOI: https://doi.org/{doi} ({notes[0] if "match" in notes[0] else notes[-1]})')
        if not oa_work: oa_work = openalex_by_doi(doi)
        cands = oa_candidates(doi, oa_work)
        side[p['id']] = {'oa': [u for s_, u in cands if not s_.endswith('error')]}
        if doi.startswith('10.1016/'):
            try: side[p['id']]['pii'] = (get(f'https://api.crossref.org/works/{doi}', params={'mailto': MAILTO}).json()['message'].get('alternative-id') or [None])[0]
            except Exception: pass
        SIDE.write_text(json.dumps(side))
        dest = PAPERS / f'{p["id"]}.pdf'
        got, src, tried = False, '', []
        for s, u in cands:
            if s.endswith('error'): tried.append(f'{s}: {u[:60]}'); continue
            try: ok, msg = fetch_pdf(u, dest)
            except Exception as e: ok, msg = False, f'error {type(e).__name__}'
            tried.append(f'{s} {u[:80]} → {msg}')
            if ok: got, src = True, s; break
        for line in tried: log(f'  - tried {line}')
        if got:
            log(f'- **Status: DOWNLOADED** (open access via {src}, {dest.stat().st_size // 1024} KB, {time.time() - t0:.0f}s)\n'); tally['downloaded'] += 1
            w.writerow([i, p['id'], doi, 'downloaded', src, dest.name, '', p['title']])
        else:
            oa = (oa_work or {}).get('open_access', {}).get('is_oa')
            log(f'- **Status: PAYWALLED** (no open copy found; OpenAlex is_oa={oa}) — queued for the Stanford proxy\n'); tally['paywalled'] += 1
            w.writerow([i, p['id'], doi, 'paywalled', '', '', f'oa_candidates={len(cands)}', p['title']])
        mf.flush()
    log(f'**Batch result:** {tally["downloaded"]} downloaded, {tally["paywalled"]} paywalled (queued for Stanford), {tally["no_doi"]} with no DOI.\n')

if __name__ == '__main__': main()
