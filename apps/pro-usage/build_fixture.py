#!/usr/bin/env python3
"""Builds fixture/, the frozen snapshot every task works on, from this repo.

Run it here (needs openpyxl for the GAMI workbook: `pip install openpyxl`), commit the
result, and the Pro machine never needs hilma, secrets or the Mac mini.

Everything in it is already public in this repo: the CASBS Quest game and its layout
mockups, the Migrant Rights Database's open data, the GAMI database workbook, and
hilma's CLAUDE.md (copied verbatim, because Bart's real sessions load it and it is
part of what a real session costs). No paper full texts: those came through Stanford's
library and stay on the mini.
"""
import csv, os, re, shutil, sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(HERE, 'fixture')

def src(*p): return os.path.join(REPO, *p)
def dst(*p):
    path = os.path.join(OUT, *p)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    return path
def copy(a, b): shutil.copyfile(src(*a), dst(*b))
def write(path, text):
    with open(dst(*path), 'w', encoding='utf-8') as f: f.write(text)

if os.path.exists(OUT): shutil.rmtree(OUT)

# ---- CLAUDE.md, verbatim ----
copy(['CLAUDE.md'], ['CLAUDE.md'])

# ---- CASBS Quest: the live game and the two layout mockups ----
copy(['public', 'semibart', 'index.html'], ['semibart', 'index.html'])
for f in ['index.html', 'pages.html', 'glide.html', 'world.js', 'mock.css']:
    copy(['public', 'semibart', 'mockups', f], ['semibart', 'mockups', f])
# the planted bug for task C2: clicking the miniature strip rounds instead of flooring,
# so a click on the right half of a segment lands on the next neighborhood
g = dst('semibart', 'mockups', 'glide.html')
html = open(g, encoding='utf-8').read()
good = 'else travel(Math.floor(stripX(e) * N));'
assert good in html, 'glide.html changed: update the planted bug'
open(g, 'w', encoding='utf-8').write(html.replace(good, 'else travel(Math.round(stripX(e) * N));'))
write(['semibart', 'README.md'], """# CASBS Quest (snapshot)

`index.html` is the live point-and-click game (ola.cx/semibart): one 320x180 canvas,
pixel helpers at the top, the map, the studies, the seminar room.
`mockups/` holds two layout mockups for fitting all 54 studies: `world.js` draws five
one-screen neighborhoods; `pages.html` flips between them, `glide.html` scrolls them as
one strip; `index.html` compares the two. Serve the folder with any static server
(`python3 -m http.server`) to look at them.
""")

# ---- MRD: the Migrant Rights Database's open data ----
for f in ['scores.csv', 'scores_wide.csv', 'categories.csv', 'questions.csv']:
    copy(['apps', 'mrd', 'data', f], ['mrd', 'data', f])
with open(src('apps', 'mrd', 'data', 'countries.csv'), encoding='utf-8') as f, open(dst('mrd', 'data', 'countries.csv'), 'w', encoding='utf-8', newline='') as o:
    w = csv.writer(o); w.writerow(['iso', 'name', 'description'])
    for r in csv.DictReader(f): w.writerow([r['iso'], r['name_en'], r['description_en']])
copy(['apps', 'mrd', 'pull.py'], ['mrd', 'pull.py'])
write(['mrd', 'README.md'], """# Migrant Rights Database (snapshot)

Cornell's Migrant Rights Initiative scores countries 0-100 on 18 categories of migrants'
rights, for 2020 and 2023, three ways: Protection (the law on paper), Implementation, and
Adjusted. Pulled from its open API (`pull.py` shows the API and how it pages).

- `data/scores.csv`: one row per country, category, score type and year
- `data/scores_wide.csv`: the same, one row per country
- `data/categories.csv`, `data/questions.csv`: the instrument
- `data/countries.csv`: the countries with their summary paragraph
- `text/<country>.md`: for six countries, every 2023 question with the coder's answer,
  subscore and the legal citations they quoted
""")
# six countries as text: question, answer, subscore, and the cited law
SIX = ['Germany', 'Japan', 'Kenya', 'Mexico', 'Saudi Arabia', 'Singapore']
cites = defaultdict(list)
with open(src('apps', 'mrd', 'data', 'citations.csv'), encoding='utf-8') as f:
    for r in csv.DictReader(f):
        if r['country'] in SIX:
            t = ' '.join(x for x in [r['citation_text_en'], r['local_text_en'], r['international_text_en']] if x).strip()
            if t: cites[(r['country'], r['question_id'])].append(t)
rows = defaultdict(list)
with open(src('apps', 'mrd', 'data', 'answers.csv'), encoding='utf-8') as f:
    for r in csv.DictReader(f):
        if r['country'] in SIX and r['year'] == '2023' and r['category'] != 'Basic information':
            rows[r['country']].append(r)
for c in SIX:
    out = [f'# {c}: Migrant Rights Database, 2023\n']
    cat = None
    for r in rows[c]:
        if r['category'] != cat:
            cat = r['category']; out.append(f'\n## {cat}\n')
        sub = f" (subscore {r['subscore']})" if r['subscore'] else ''
        out.append(f"\n**Q{r['question_id']} [{r['question_type']}]** {r['question_text_en']}\n\nAnswer: {r['answer_text_en'] or 'n/a'}{sub}\n")
        for t in cites.get((c, r['question_id']), [])[:2]:
            t = re.sub(r'\s+', ' ', t)
            out.append('\n> ' + (t[:1400] + ' […]' if len(t) > 1400 else t) + '\n')
    write(['mrd', 'text', re.sub(r'[^a-z]+', '-', c.lower()).strip('-') + '.md'], ''.join(out))

# ---- GAMI: the Global Adaptation Mapping Initiative database ----
try:
    import openpyxl
except ImportError:
    sys.exit('needs openpyxl: pip install openpyxl')
wb = openpyxl.load_workbook(src('apps', 'gami', 'GAMI_Database_FINAL.xlsx'), read_only=True)
ws = wb['GAMI_Database_FINAL']
it = ws.iter_rows(values_only=True)
head = list(next(it))
data = [dict(zip(head, r)) for r in it if r and r[head.index('Title')]]
KEEP = [('id', 'Article.ID'), ('title', 'Title'), ('journal', 'Journal'), ('authors', 'Authors'), ('summary', 'Summarize'),
        ('region', '1.1.Geography'), ('country', '1.1.1.Geography-Country'), ('sector', '1.2.Sector'),
        ('actors', '2.1.1.Actors.Institutions'), ('equity_planning', '2.2.1.Equity-Planning'),
        ('response_type', '3.1.1.ResponseType'), ('response_quotes', '3.1.2.Response-QUOTES'),
        ('hazards', '3.3.1.Hazards'), ('depth', '4.4.1.Depth'), ('scope', '4.5.1.Scope'), ('speed', '4.6.1.Speed'),
        ('reduced_risk', '5.1.1.Reduced.risk'), ('reduced_risk_quotes', '5.1.2.Reduced.risk-QUOTES'),
        ('maladaptation', '5.3.1.Maladaptation'), ('limits', '6.1.Limits'), ('methods', '7.1.Methods')]
def clean(v, n=700):
    s = re.sub(r'\s+', ' ', str(v or '')).replace('|||', ' | ').strip(' |')
    return s[:n] + ' […]' if len(s) > n else s
step = len(data) // 40
with open(dst('gami', 'studies_40.csv'), 'w', encoding='utf-8', newline='') as o:
    w = csv.writer(o); w.writerow([k for k, _ in KEEP])
    for r in data[::step][:40]: w.writerow([clean(r.get(col)) for _, col in KEEP])
with open(dst('gami', 'titles_15.csv'), 'w', encoding='utf-8', newline='') as o:
    w = csv.writer(o); w.writerow(['id', 'title', 'journal'])
    for r in data[step // 2::len(data) // 15][:15]:
        w.writerow([r['Article.ID'], clean(r['Title'], 400), clean(r['Journal'], 200)])
write(['gami', 'README.md'], """# GAMI (snapshot)

The Global Adaptation Mapping Initiative coded 1,682 peer-reviewed studies of human
adaptation to climate change (Berrang-Ford et al., 2021). Each study has a summary by the
coders and coded fields, many with supporting quotes.

- `studies_40.csv`: 40 studies, one row each, the main coded fields (quotes trimmed)
- `titles_15.csv`: 15 other studies, title and journal only, for looking them up
""")

# ---- the research task's country list ----
write(['research', 'countries.txt'], 'Portugal\nNorway\nPhilippines\nCosta Rica\nQatar\nChina\n')

total = sum(os.path.getsize(os.path.join(d, f)) for d, _, fs in os.walk(OUT) for f in fs)
print(f'fixture/ built: {sum(len(fs) for _, _, fs in os.walk(OUT))} files, {total / 1e6:.1f} MB')
