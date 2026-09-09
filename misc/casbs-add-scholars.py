#!/usr/bin/env python3
"""Add the 2026-27 visiting scholars to the CASBS class-of-2026 page.

Reads the generated src/app/1ziu1wahxw/html.ts (built by casbs-ten-inline.py
from the saved artifact), drops any scholar cards already present, adds the
people in misc/casbs-scholars.json with their 160px photos from
misc/casbs-scholars/<slug>.jpg, re-sorts the grid by surname and rewrites
html.ts. Idempotent. Also writes the OG card source to the scratchpad path
given as argv[1] (default /tmp/casbs-og.html) for a Playwright screenshot.

Scholar cards are the ones whose blurb starts with <b>Scholar</b>."""
import re, sys, json, base64, unicodedata, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SLUG = '1ziu1wahxw'
TS = ROOT / f'src/app/{SLUG}/html.ts'
DATA = ROOT / 'misc/casbs-scholars.json'
PHOTOS = ROOT / 'misc/casbs-scholars'
OG_HTML = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/casbs-og.html')

html = json.loads(TS.read_text().split('export const html = ', 1)[1])

CARD = re.compile(r'<article class="card"[^>]*>\s*<img src="([^"]+)" alt="([^"]*)" width="60" height="60">\s*<div>\s*'
    r'<h4><a href="([^"]+)" target="_blank" rel="noopener">([^<]*)</a></h4>\s*'
    r'<div class="school">(.*?)</div>\s*<p>(.*?)</p>\s*</div>\s*</article>', re.S)

people = []
for src, alt, href, name, school, bio in CARD.findall(html):
    if bio.startswith('<b>Scholar</b>'):
        continue  # rebuilt below from the JSON
    people.append(dict(src=src, alt=alt, href=href, name=name, school=school, bio=bio, surname=None))
assert len(people) == 40, len(people)

for s in json.loads(DATA.read_text()):
    jpg = (PHOTOS / f"{s['slug']}.jpg").read_bytes()
    people.append(dict(
        src='data:image/jpeg;base64,' + base64.b64encode(jpg).decode(),
        alt=s['name'], href=f"https://casbs.stanford.edu/people/{s['slug']}",
        name=s['name'], school=s['school'], bio=s['bio'], surname=s.get('surname')))
    assert people[-1]['bio'].startswith('<b>Scholar</b>'), s['name']

# Two orders: first name (the page default) and surname. Multi-word surnames keep
# the order the original page used. Both are baked into every card as data-first /
# data-last indices; the toggle at the top just swaps the CSS order property.
SURNAME = {'Lewis Abedi Asante': 'Asante', 'John Casellas Connors': 'Casellas Connors', 'Inbal Ben Ami Bartal': 'Ben Ami Bartal'}
def fold(s):
    return unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().casefold()
def surname(p):
    return p['surname'] or SURNAME.get(p['name']) or p['name'].split()[-1]
for i, p in enumerate(sorted(people, key=lambda p: (fold(surname(p)), fold(p['name'])))):
    p['olast'] = i
people.sort(key=lambda p: (fold(p['name']), fold(surname(p))))
for i, p in enumerate(people):
    p['ofirst'] = i

def card(p):
    return f'''      <article class="card" data-first="{p['ofirst']}" data-last="{p['olast']}">
        <img src="{p['src']}" alt="{p['alt']}" width="60" height="60">
        <div>
          <h4><a href="{p['href']}" target="_blank" rel="noopener">{p['name']}</a></h4>
          <div class="school">{p['school']}</div>
          <p>{p['bio']}</p>
        </div>
      </article>'''

grid = chr(10).join(card(p) for p in people)
out, n = re.subn(r'(<div class="grid">\n).*?(\n    </div>)', lambda m: m.group(1) + grid + m.group(2), html, count=1, flags=re.S)
assert n == 1

# Style: the bold marker on scholar blurbs. Added once.
MARK_CSS = '.card p b { color: var(--ink); font-weight: 700; }'
if MARK_CSS not in out:
    out = out.replace('</style>', f'/* Visiting scholars: blurb opens with a bold "Scholar". */\n{MARK_CSS}\n</style>', 1)

# Sort toggle: first name (default, and the DOM order of the grid) or surname.
# Markup, CSS and script are each fenced by comments so a re-run replaces them.
SORT_BAR = """<!--sortbar-->
    <div class="sortbar" hidden>
      <span>Sort by</span>
      <div class="seg" role="group" aria-label="Sort order">
        <button type="button" class="seg-btn is-on" data-sort="first" aria-pressed="true">First name</button>
        <button type="button" class="seg-btn" data-sort="last" aria-pressed="false">Last name</button>
      </div>
    </div>
<!--/sortbar-->"""

SORT_CSS = """/* Sort toggle above the grid. */
.sortbar { display: flex; align-items: center; gap: 12px; margin-top: 14px;
  font-family: "IBM Plex Mono", monospace; font-size: 0.72rem; letter-spacing: 0.09em;
  text-transform: uppercase; color: var(--muted); }
.sortbar[hidden] { display: none; }
.seg { display: flex; background: var(--card); border: 1px solid var(--hairline);
  border-radius: 999px; overflow: hidden; }
.seg-btn { appearance: none; -webkit-appearance: none; border: 0; background: transparent;
  font: inherit; letter-spacing: inherit; text-transform: inherit; color: var(--muted);
  padding: 6px 14px; line-height: 1.2; cursor: pointer; }
.seg-btn + .seg-btn { border-left: 1px solid var(--hairline); }
.seg-btn:hover { color: var(--ink); }
.seg-btn.is-on { background: var(--accent); color: var(--paper); }
.seg-btn:focus-visible { outline: 2px solid var(--accent-ink); outline-offset: 2px; }"""

SORT_JS = """<!--sortjs-->
<script>
(function () {
  var bar = document.querySelector('.sortbar');
  var cards = Array.prototype.slice.call(document.querySelectorAll('.grid .card'));
  var btns = Array.prototype.slice.call(document.querySelectorAll('.seg-btn'));
  if (!bar || !cards.length) return;
  function apply(mode) {
    cards.forEach(function (c) { c.style.order = c.getAttribute('data-' + mode); });
    btns.forEach(function (b) {
      var on = b.getAttribute('data-sort') === mode;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }
  btns.forEach(function (b) {
    b.addEventListener('click', function () { apply(b.getAttribute('data-sort')); });
  });
  apply('first');
  bar.hidden = false;   // no JS, no toggle: the grid stays in first-name order
})();
</script>
<!--/sortjs-->"""

out = re.sub(r'<!--sortbar-->.*?<!--/sortbar-->\n?', '', out, flags=re.S)
out = out.replace('    <div class="grid">', SORT_BAR + '\n    <div class="grid">', 1)

if SORT_CSS not in out:
    out = out.replace('</style>', SORT_CSS + '\n</style>', 1)

out = re.sub(r'<!--sortjs-->.*?<!--/sortjs-->\n?', '', out, flags=re.S)
out = out.replace('</body>', SORT_JS + '\n</body>', 1)


fellows = sum(1 for p in people if not p['bio'].startswith('<b>Scholar</b>'))
scholars = len(people) - fellows
out = re.sub(r'<h2>[^<]*</h2>', '<h2>Fellows &amp; visiting scholars, A to Z</h2>', out, count=1)
out = re.sub(r'(<meta property="og:description" content=")[^"]*(")',
             r'\g<1>The 2026 fellows and visiting scholars, A to Z.\2', out, count=1)
out = re.sub(r'casbs\.stanford\.edu &middot; [A-Za-z]+ 2026', 'casbs.stanford.edu &middot; September 2026', out, count=1)

TS.write_text('// Generated by misc/casbs-ten-inline.py, then misc/casbs-add-scholars.py — do not edit by hand.\nexport const html = '
              + json.dumps(out, ensure_ascii=False) + '\n')
print(f'wrote {TS} ({len(out)//1024} KB): {fellows} fellows + {scholars} scholars')

# OG card: 7 x 7 tiles for the forty-nine.
tiles = ''.join(f'<img src="{p["src"]}">' for p in people)
OG_HTML.write_text(f'''<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,750&family=IBM+Plex+Mono:wght@500&display=swap">
<style>
body {{ margin:0; width:1200px; height:630px; background:#F6F5F1; color:#24211C; position:relative; overflow:hidden; }}
.t {{ position:absolute; left:64px; top:0; height:630px; width:420px; display:flex; flex-direction:column; justify-content:center; }}
h1 {{ font-family:"Newsreader",Georgia,serif; font-weight:750; font-size:64px; line-height:1.02; letter-spacing:-0.015em; margin:0; }}
.k {{ font-family:"IBM Plex Mono",monospace; font-size:15px; letter-spacing:0.14em; text-transform:uppercase; color:#6E6A5F; margin-top:22px; line-height:1.6; }}
.g {{ position:absolute; left:592px; top:75px; display:grid; grid-template-columns:repeat(7,60px); gap:10px; }}
.g img {{ width:60px; height:60px; border-radius:6px; object-fit:cover; display:block; box-sizing:border-box; }}
</style></head><body>
<div class="t"><h1>CASBS class of 2026</h1><div class="k">Forty fellows &amp;<br>nine visiting scholars</div></div>
<div class="g">{tiles}</div>
</body></html>''')
print(f'wrote {OG_HTML}')
for i, p in enumerate(people, 1):
    print(f"{i:2d} {'S' if p['bio'].startswith('<b>Scholar</b>') else ' '} {p['name']}")
