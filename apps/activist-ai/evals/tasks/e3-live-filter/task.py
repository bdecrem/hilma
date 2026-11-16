import json
from evalkit import page, num
from fam_site import loaded, vals

COUNTRIES = ["Arvania", "Belmora", "Corvenia", "Dastria", "Elyria"]


def make(rng):
    return [{"country": rng.choice(COUNTRIES), "project": f"P{i:03d}", "beneficiaries": rng.randint(20, 5000)} for i in range(1, rng.randint(30, 60))]


def summ(data, c):
    sel = [d for d in data if c == "all" or d["country"] == c]
    return [len(sel), sum(d["beneficiaries"] for d in sel)]


def generate(work, seed, rng):
    data = make(rng)
    (work / "data.json").write_text(json.dumps(data, indent=1))
    pick = rng.choice(sorted({d["country"] for d in data}))
    alt = make(rng)
    alt = [d for d in alt]
    alt_pick = pick if any(d["country"] == pick for d in alt) else alt[0]["country"]
    return {"all": summ(data, "all"), "pick": pick, "picked": summ(data, pick), "alt": alt, "alt_pick": alt_pick, "alt_picked": summ(alt, alt_pick)}


def _read(r):
    g = lambda s: num("".join(ch for ch in vals(r, s) if ch.isdigit() or ch == ".") or None)
    return [g("#count"), g("#beneficiaries")]


def check(work, truth, session, C):
    names = ["page_loads", "all_numbers", "filter_numbers", "reads_data_at_run_time", "works_offline"]
    if not C.exists(work, "index.html"):
        C.skip(names, "stopped_early")
        return
    rd = ["#count", "#beneficiaries"]
    r0 = page(work, {"path": "index.html", "read": rd})
    loaded(C, "page_loads", r0)
    C.add("all_numbers", _read(r0) == truth["all"], "numbers_wrong", _read(r0))
    r1 = page(work, {"path": "index.html", "read": rd, "select": [["#country", truth["pick"]]]})
    C.add("filter_numbers", _read(r1) == truth["picked"] and not r1.get("errors"), "numbers_wrong", _read(r1))
    r2 = page(work, {"path": "index.html", "read": rd, "select": [["#country", truth["alt_pick"]]], "override": {"data.json": json.dumps(truth["alt"])}})
    C.add("reads_data_at_run_time", _read(r2) == truth["alt_picked"], "numbers_wrong", _read(r2))
    C.add("works_offline", r0.get("ok") and not r0.get("external"), "page_broken")


JS = """<script>
let data = [];
const sel = document.getElementById('country');
function show() { const c = sel.value; const s = data.filter(d => c === 'all' || d.country === c);
  document.getElementById('count').textContent = s.length;
  document.getElementById('beneficiaries').textContent = s.reduce((a, d) => a + d.beneficiaries, 0); }
fetch('data.json').then(r => r.json()).then(d => { data = d;
  for (const c of [...new Set(d.map(x => x.country))].sort()) sel.add(new Option(c, c)); show(); });
sel.addEventListener('change', show);
</script>"""


def solve(work, truth):
    (work / "index.html").write_text("<!doctype html><title>Projects</title><select id=country><option value=all>all</option></select>"
                                     "<p>Projects <span id=count></span></p><p>Beneficiaries <span id=beneficiaries></span></p>" + JS)


def wrong(work, truth):
    data = json.loads((work / "data.json").read_text())
    opts = "".join(f"<option value='{c}'>{c}</option>" for c in sorted({d['country'] for d in data}))
    table = {c: summ(data, c) for c in ["all"] + sorted({d["country"] for d in data})}
    (work / "index.html").write_text(f"<!doctype html><select id=country><option value=all>all</option>{opts}</select><p id=count>{table['all'][0]}</p>"
                                     f"<p id=beneficiaries>{table['all'][1]}</p><script>const t={json.dumps(table)};document.getElementById('country').onchange=e=>"
                                     "{const v=t[e.target.value];count.textContent=v[0];beneficiaries.textContent=v[1]}</script>")
