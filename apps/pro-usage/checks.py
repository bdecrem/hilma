"""Did the task produce what it was asked for? One check per task, run on its workspace.

These are deliberately light: they prove the deliverable exists, has the right shape and
(for code) still parses. They don't grade quality; the point of the test is what the work
costs, and a pass rate keeps a model that gives up early from looking cheap.
Each returns (ok, note). JavaScript is syntax-checked with `node --check` when node is
installed; without node those parts are skipped and the note says so.
"""
import csv, os, re, shutil, subprocess, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
FIXTURE = os.path.join(HERE, 'fixture')
NODE = shutil.which('node')

def _read(path):
    try:
        with open(path, encoding='utf-8', errors='replace') as f: return f.read()
    except OSError: return None

def _js_ok(code):
    if not NODE: return None
    with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False) as f: f.write(code); name = f.name
    try: return subprocess.run([NODE, '--check', name], capture_output=True, timeout=30).returncode == 0
    finally: os.unlink(name)

def _page_js_ok(html):
    """every inline <script> in a page parses"""
    blocks = [b for a, b in re.findall(r'<script([^>]*)>(.*?)</script>', html, re.S) if 'src=' not in a and b.strip()]
    if not blocks: return False
    res = [_js_ok(b) for b in blocks]
    return None if None in res else all(res)

def _rows(path):
    try:
        with open(path, encoding='utf-8', errors='replace', newline='') as f: return list(csv.reader(f))
    except OSError: return None

def _out(work, rel):
    """an output file at the top of the workspace, or (as a model may well choose) under the data folder"""
    for base in ['', 'mrd', 'gami', 'research', 'semibart']:
        path = os.path.join(work, base, rel)
        if os.path.exists(path): return path
    return os.path.join(work, rel)

def _changed(work, rel):
    a, b = _read(os.path.join(FIXTURE, rel)), _read(os.path.join(work, rel))
    return b is not None and a != b

def _verdict(parts):
    """parts: list of (name, True/False/None). None = could not check (no node)."""
    fails = [n for n, v in parts if v is False]
    skipped = [n for n, v in parts if v is None]
    note = ('missing/failed: ' + ', '.join(fails)) if fails else 'ok'
    if skipped: note += ' (not checked without node: ' + ', '.join(skipped) + ')'
    return (not fails), note

def C1(w):
    h = _read(os.path.join(w, 'semibart/index.html')) or ''
    return _verdict([('index.html changed', _changed(w, 'semibart/index.html')), ('script parses', _page_js_ok(h) if h else False),
                     ('Dish lines added', h.lower().count('space') > (_read(os.path.join(FIXTURE, 'semibart/index.html')) or '').lower().count('space'))])

def C2(w):
    h = _read(os.path.join(w, 'semibart/mockups/glide.html')) or ''
    return _verdict([('rounding bug gone', 'Math.round(stripX(e) * N)' not in h), ('script parses', _page_js_ok(h) if h else False)])

def C3(w):
    js = _read(os.path.join(w, 'semibart/mockups/world.js')) or ''
    parts = [('Orchard in world.js', 'orchard' in js.lower()), ('world.js parses', _js_ok(js) if js else False),
             ('studies 55-60', all(re.search(r'\b%d\b' % n, js) for n in range(55, 61)))]
    for p in ['pages.html', 'glide.html']:
        h = _read(os.path.join(w, 'semibart/mockups', p)) or ''
        parts.append((p + ' parses', _page_js_ok(h) if h else False))
    parts.append(('index.html mentions The Orchard', 'orchard' in (_read(os.path.join(w, 'semibart/mockups/index.html')) or '').lower()))
    return _verdict(parts)

def C4(w):
    h = _read(os.path.join(w, 'mrd/compare.html'))
    return _verdict([('compare.html', h is not None), ('script parses', _page_js_ok(h) if h else False),
                     ('loads scores.csv', bool(h and 'scores.csv' in h)), ('draws SVG', bool(h and 'svg' in h.lower()))])

def C5(w):
    rows = _rows(_out(w, 'out/movers.csv'))
    return _verdict([('movers.py', os.path.exists(os.path.join(w, 'mrd/movers.py'))), ('out/movers.csv has 50+ rows', bool(rows and len(rows) > 50)),
                     ('out/movers.md', os.path.exists(_out(w, 'out/movers.md')))])

def C6(w):
    r = _read(_out(w, 'REVIEW.md')) or ''
    refs = len(re.findall(r'\.(?:js|html):\d+', r))
    return _verdict([('REVIEW.md', bool(r)), ('3+ file:line findings', refs >= 3),
                     ('fixes made', _changed(w, 'semibart/mockups/world.js') or _changed(w, 'semibart/mockups/glide.html'))])

def K1(w):
    h = _read(_out(w, 'deck.html')) or ''
    slides = max(len(re.findall(r'<section\b', h, re.I)), len(re.findall(r'class="[^"]*\bslide\b', h, re.I)))
    return _verdict([('deck.html', bool(h)), ('8+ slides', slides >= 8), ('SVG chart', '<svg' in h.lower()),
                     ('script parses', _page_js_ok(h) if h else False), ('notes.md', os.path.exists(_out(w, 'notes.md')))])

def K2(w):
    a = _read(_out(w, 'answers.md')) or ''
    sections = len(re.findall(r'^#{1,4}\s', a, re.M)) or len(re.findall(r'^\s*\d\.', a, re.M))
    quotes = len(re.findall(r'^\s*>', a, re.M)) + len(re.findall(r'["“][^"”\n]{25,}["”]', a))
    return _verdict([('answers.md', bool(a)), ('6 sections', sections >= 6), ('6+ quotes', quotes >= 6)])

def K3(w):
    m = _read(_out(w, 'memo.md')) or ''
    rows = len([l for l in m.splitlines() if l.strip().startswith('|')])
    return _verdict([('memo.md', bool(m)), ('table covers 40 studies', rows >= 42), ('600+ words', len(m.split()) >= 600)])

def D1(w):
    rows = _rows(_out(w, 'out/answers.csv')) or []
    text = ' '.join(','.join(r) for r in rows).lower()
    return _verdict([('out/answers.csv has 100+ rows', len(rows) > 100), ('both countries', 'argentina' in text and 'kenya' in text),
                     ('out/summary.md', os.path.exists(_out(w, 'out/summary.md')))])

def D2(w):
    rows = _rows(_out(w, 'out/gami_meta.csv')) or []
    dois = sum(1 for r in rows[1:] if any(re.search(r'\b10\.\d{4,}/', c) for c in r))
    return _verdict([('out/gami_meta.csv has 15 rows', len(rows) >= 16), ('8+ DOIs found', dois >= 8),
                     ('confidence column', bool(rows) and any('confidence' in c.lower() for c in rows[0])),
                     ('out/notes.md', os.path.exists(_out(w, 'out/notes.md')))])

def D3(w):
    rows = _rows(_out(w, 'out/wages.csv')) or []
    urls = sum(len(re.findall(r'https?://', ','.join(r))) for r in rows)
    return _verdict([('out/wages.csv has 6 countries', len(rows) >= 7), ('6+ source URLs', urls >= 6),
                     ('out/method.md', os.path.exists(_out(w, 'out/method.md')))])

def SMOKE(w):
    return _verdict([('hello.txt', (_read(os.path.join(w, 'hello.txt')) or '').strip().lower().startswith('hello'))])

def check(task_id, work):
    fn = globals().get(task_id)
    if not fn: return None, 'no check'
    try: return fn(work)
    except Exception as e: return False, 'check crashed: %s' % e
