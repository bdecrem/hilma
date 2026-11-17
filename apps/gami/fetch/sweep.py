"""GAMI second sweep (2026-11-16): another go at the papers the first run missed.

For every manifest row that is not downloaded:
  1. find a DOI if there is none: the GAMI Zotero group (public metadata, api.zotero.org/groups/5943294),
     then Crossref / OpenAlex / Semantic Scholar by title at a looser threshold, checked by title + year/author
  2. collect open copies: Unpaywall, OpenAlex locations, Semantic Scholar, CORE, Europe PMC, the Zotero url,
     publisher patterns that are open (MDPI, Emerald open journals), and the landing page's citation_pdf_url
  3. download each candidate and keep the first PDF whose first pages carry the paper's title

Writes papers/<id>.pdf, updates manifest.csv (doi, status, source), logs to debug/sweep.md, and saves every
candidate URL in debug/sweep-candidates.json for the browser pass (fetch.mjs reads debug/candidates.json).

usage: GAMI_DIR=~/Desktop/GAMI uv run -q --with requests --with ftfy --with pypdf python -I apps/gami/fetch/sweep.py [--ids a,b] [--workers 6]
"""
import argparse, csv, difflib, html, io, json, logging, os, re, sys, time, threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import quote, urljoin
import requests, ftfy, pypdf

logging.getLogger('pypdf').setLevel(logging.ERROR)
OUT = Path(os.environ.get('GAMI_DIR', Path.home() / 'Desktop/GAMI'))
PAPERS, MANIFEST = OUT / 'papers', OUT / 'manifest.csv'
LOG, SIDE, ZOT = OUT / 'debug' / 'sweep.md', OUT / 'debug' / 'sweep-candidates.json', OUT / 'debug' / 'zotero.json'
MAILTO = 'amber@intheamber.com'
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
PROXY = 'https://stanford.idm.oclc.org/login?url='
lock = threading.Lock()
tl = threading.local()

def sess():
    if not hasattr(tl, 's'):
        tl.s = requests.Session(); tl.s.headers['User-Agent'] = UA
    return tl.s

def get(url, tries=2, **kw):
    kw.setdefault('timeout', 45)
    for a in range(tries):
        try:
            r = sess().get(url, **kw)
            if r.status_code == 429: time.sleep(4 * (a + 1)); continue
            return r
        except requests.RequestException:
            if a == tries - 1: return None
            time.sleep(2)
    return None

def norm(s): return re.sub(r'\s+', ' ', re.sub(r'[^a-z0-9 ]+', ' ', ftfy.fix_text(s or '').lower())).strip()
def squash(s): return re.sub(r'[^a-z0-9]+', '', ftfy.fix_text(s or '').lower())
def sim(a, b): return difflib.SequenceMatcher(None, norm(a), norm(b)).ratio()

def title_in_pdf(body, title):
    """The check verify.py does: the title on the first two pages."""
    try: text = squash(' '.join(p.extract_text() or '' for p in pypdf.PdfReader(io.BytesIO(body)).pages[:3]))
    except Exception: return False
    t = squash(title)[:60]
    if not t or not text: return False
    if t[:40] in text: return True
    return difflib.SequenceMatcher(None, t, text[:6000]).find_longest_match(0, len(t), 0, min(len(text), 6000)).size >= min(30, len(t) - 5)

# ---- step 1: DOIs ----
def load_zotero():
    if ZOT.exists(): return json.loads(ZOT.read_text())
    items, start = [], 0
    while True:
        r = get(f'https://api.zotero.org/groups/5943294/items?limit=100&start={start}&format=json', tries=4)
        d = r.json() if r is not None and r.status_code == 200 else []
        if not d: break
        items += d; start += 100
    ZOT.write_text(json.dumps(items)); return items

def zotero_index(items):
    idx = {}
    for i in items:
        d = i['data']
        if d['itemType'] in ('attachment', 'note'): continue
        idx.setdefault(squash(d.get('title'))[:60], d)
    return idx

def zotero_match(idx, title):
    k = squash(title)[:60]
    if k in idx: return idx[k]
    g = difflib.get_close_matches(k, list(idx), 1, 0.82)
    return idx[g[0]] if g else None

def surname(authors):
    a = ftfy.fix_text(authors or '').split(';')[0].split(',')[0].strip()
    return norm(a).split(' ')[-1] if a else ''

def find_doi(title, authors):
    """Looser than resolve.py: accept 0.90 on title alone, 0.80 with the first author's surname."""
    sn, notes = surname(authors), []
    r = get('https://api.crossref.org/works', params={'query.bibliographic': title, 'rows': 8, 'mailto': MAILTO, 'select': 'DOI,title,author'})
    if r is not None and r.status_code == 200:
        for it in r.json()['message']['items']:
            s = max((sim(title, t) for t in it.get('title') or ['']), default=0)
            au = sn and sn in {norm(a.get('family', '')) for a in it.get('author', [])}
            if s >= 0.90 or (s >= 0.80 and au): return it['DOI'].lower(), f'crossref {s:.2f}'
    r = get('https://api.openalex.org/works', params={'search': re.sub(r'[^\w\s]', ' ', title), 'per-page': 8, 'mailto': MAILTO})
    if r is not None and r.status_code == 200:
        for it in r.json().get('results', []):
            s = sim(title, it.get('title') or '')
            au = sn and sn in {norm(a['author'].get('display_name', '')).split(' ')[-1] for a in it.get('authorships', []) if a.get('author')}
            if s >= 0.90 or (s >= 0.80 and au):
                doi = (it.get('doi') or '').replace('https://doi.org/', '').lower()
                return (doi or None), f'openalex {s:.2f}', it
    return None, 'no doi by title'

# ---- step 2: candidates ----
def candidates(row, z, oa_work=None):
    doi, title, c = row['doi'], row['title'], []
    def add(src, u):
        if u and u.startswith('http'): c.append((src, u))
    if z and z.get('url'): add('zotero-url', z['url'])
    if doi:
        r = get(f'https://api.unpaywall.org/v2/{quote(doi)}', params={'email': MAILTO})
        if r is not None and r.status_code == 200:
            j = r.json()
            for loc in [j.get('best_oa_location')] + (j.get('oa_locations') or []):
                if loc: add('unpaywall', loc.get('url_for_pdf')); add('unpaywall-landing', loc.get('url'))
        if not oa_work:
            r = get(f'https://api.openalex.org/works/https://doi.org/{quote(doi)}', params={'mailto': MAILTO})
            oa_work = r.json() if r is not None and r.status_code == 200 else None
        r = get(f'https://api.semanticscholar.org/graph/v1/paper/DOI:{quote(doi)}', params={'fields': 'openAccessPdf'})
        if r is not None and r.status_code == 200: add('semanticscholar', (r.json().get('openAccessPdf') or {}).get('url'))
        r = get('https://www.ebi.ac.uk/europepmc/webservices/rest/search', params={'query': f'DOI:"{doi}"', 'format': 'json', 'resultType': 'core'})
        if r is not None and r.status_code == 200:
            for it in r.json().get('resultList', {}).get('result', []):
                if it.get('pmcid'): add('europepmc', f'https://europepmc.org/backend/ptpmcrender.fcgi?accid={it["pmcid"]}&blobtype=pdf')
                for ft in (it.get('fullTextUrlList') or {}).get('fullTextUrl', []):
                    if ft.get('availabilityCode') in ('OA', 'F'): add('europepmc-link', ft.get('url'))
        if doi.startswith('10.3390/'): add('mdpi', f'https://doi.org/{doi}')
        add('doi', f'https://doi.org/{doi}')
        add('stanford', PROXY + f'https://doi.org/{doi}')
    if oa_work:
        for loc in [oa_work.get('best_oa_location')] + (oa_work.get('locations') or []):
            if loc: add('openalex', loc.get('pdf_url')); add('openalex-landing', loc.get('landing_page_url') if loc.get('is_oa') else None)
        add('openalex-oa_url', (oa_work.get('open_access') or {}).get('oa_url'))
    # CORE: full-text repository copies, by DOI then by title
    for q in ([f'doi:"{doi}"'] if doi else []) + [f'title:"{re.sub(chr(34), "", title)[:150]}"']:
        r = get('https://api.core.ac.uk/v3/search/works', params={'q': q, 'limit': 5})
        if r is not None and r.status_code == 200:
            for it in r.json().get('results', []):
                if sim(title, it.get('title') or '') >= 0.85:
                    add('core', it.get('downloadUrl'))
                    for u in it.get('sourceFulltextUrls') or []: add('core-source', u)
    seen, out = set(), []
    for s, u in c:
        if u not in seen: seen.add(u); out.append((s, u))
    return out

PDF_LINK = re.compile(rb'(?:href|content)="([^"]+(?:\.pdf(?:\?[^"]*)?|/pdf/?[^"]*|pdfdirect[^"]*|/download/[^"]*|article-pdf[^"]*|viewcontent\.cgi[^"]*|bitstream[^"]*))"', re.I)

def fetch_pdf(url, title, depth=0):
    r = get(url, headers={'Accept': 'application/pdf,text/html;q=0.9,*/*;q=0.8'}, allow_redirects=True)
    if r is None: return None, 'no response'
    body = r.content
    if body[:1024].lstrip().startswith(b'%PDF'):
        return (body, 'ok') if title_in_pdf(body, title) else (None, 'a pdf, but not this paper')
    if depth >= 2 or b'<' not in body[:2000]: return None, f'not a pdf ({r.status_code})'
    links = []
    for pat in (rb'<meta[^>]+name="citation_pdf_url"[^>]+content="([^"]+)"', rb'content="([^"]+)"[^>]+name="citation_pdf_url"'):
        links += re.findall(pat, body)
    links += PDF_LINK.findall(body)[:25]
    seen = set()
    for l in links:
        u = urljoin(r.url, html.unescape(l.decode('utf8', 'ignore')))
        if u in seen or u == url or not u.startswith('http') or re.search(r'\.(css|js|png|jpg|svg)(\?|$)', u): continue
        seen.add(u)
        if len(seen) > 6: break
        b, msg = fetch_pdf(u, title, depth + 2 if depth else depth + 1)
        if b: return b, 'ok'
    return None, f'landing page, no matching pdf ({r.status_code}, {r.url[:70]})'

def work(row, zidx, side, lines):
    out = [f'### [{row["article_id"]}] {row["title"][:110]}']
    z = zotero_match(zidx, row['title'])
    oa_work = None
    if not row['doi'] and z and z.get('DOI'):
        row['doi'] = re.sub(r'^https?://(dx\.)?doi\.org/', '', z['DOI'].strip()).lower(); out.append(f'- DOI from the GAMI Zotero library: {row["doi"]}')
    if not row['doi']:
        res = find_doi(row['title'], row.get('authors', ''))
        if res[0]: row['doi'] = res[0]; out.append(f'- DOI by title ({res[1]}): {row["doi"]}')
        elif len(res) > 2: oa_work = res[2]
        if len(res) > 2: oa_work = res[2]
    cands = candidates(row, z, oa_work)
    with lock: side[row['article_id']] = {'doi': row['doi'], 'urls': [u for _, u in cands]}
    got = None
    for src, u in cands:
        try: body, msg = fetch_pdf(u, row['title'])
        except Exception as e: body, msg = None, f'error {type(e).__name__}'
        out.append(f'  - {src} {u[:100]} → {msg}')
        if body: got = (src, body); break
    if got:
        (PAPERS / f'{row["article_id"]}.pdf').write_bytes(got[1])
        row.update(status='downloaded', source=f'sweep/{got[0]}', file=f'{row["article_id"]}.pdf', note='')
        out.append(f'- **DOWNLOADED** ({got[0]}, {len(got[1]) // 1024} KB)\n')
    else:
        if row['status'] == 'no_doi' and row['doi']: row['status'] = 'paywalled'
        out.append(f'- still missing ({len(cands)} candidates)\n')
    with lock:
        with open(LOG, 'a') as f: f.write('\n'.join(out) + '\n')
        print(out[0][:90], '→', 'GOT' if got else 'no', flush=True)

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--ids'); ap.add_argument('--workers', type=int, default=6); a = ap.parse_args()
    PAPERS.mkdir(parents=True, exist_ok=True); LOG.parent.mkdir(parents=True, exist_ok=True)
    rows = list(csv.DictReader(open(MANIFEST)))
    authors = {}
    cat = OUT / 'papers.csv'
    if cat.exists():
        for r in csv.DictReader(open(cat)): authors[str(r.get('article_id') or r.get('id'))] = r.get('authors', '')
    todo = [r for r in rows if r['status'] != 'downloaded' and (not a.ids or r['article_id'] in a.ids.split(','))]
    for r in todo: r['authors'] = authors.get(r['article_id'], '')
    zidx = zotero_index(load_zotero())
    side = json.loads(SIDE.read_text()) if SIDE.exists() else {}
    with open(LOG, 'a') as f: f.write(f'\n## Sweep · {time.strftime("%Y-%m-%d %H:%M")} · {len(todo)} papers\n\n')
    def save():
        with lock:
            fields = [k for k in rows[0].keys() if k != 'authors']
            w = csv.DictWriter(open(MANIFEST, 'w', newline=''), fieldnames=fields, extrasaction='ignore'); w.writeheader(); w.writerows(rows)
            SIDE.write_text(json.dumps(side))
    with ThreadPoolExecutor(a.workers) as ex:
        for n, _ in enumerate(ex.map(lambda r: work(r, zidx, side, None), todo), 1):
            if n % 10 == 0: save()
    save()
    print('downloaded now:', sum(1 for r in todo if r['status'] == 'downloaded'), 'of', len(todo))

if __name__ == '__main__': main()
