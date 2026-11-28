"""ola-poke on small made-up pages (OLA-515).

    python3 -I workspace/poke_test.py        (workspace/check.mjs runs it in the VM; on a Mac set
                                              OLA_PAGE_CHROMIUM to a chromium-headless-shell)

One working page (nothing reported), one with a dead button, one with a field that takes no input,
one with a script error on load, and one with harmless buttons that change nothing visible (Copy,
Reset on an empty form, a link): nothing reported.
"""
import json, os, subprocess, sys, tempfile
from pathlib import Path

POKE = "/opt/ola/bin/ola-poke" if Path("/opt/ola/bin/ola-poke").exists() else str(Path(__file__).resolve().parent / "ola-poke")
results = []


def ok(name, cond, detail=""):
    results.append(bool(cond))
    print(("pass  " if cond else "FAIL  ") + name + (f"  ({detail})" if detail and not cond else ""))


PAGES = {
    "working": """<!doctype html><title>Tasks</title>
<label>Task <input id="task"></label> <label>Due <input type="date" id="due"></label>
<select id="who"><option>Anyone</option><option>Ana</option></select>
<button id="add">Add</button> <button id="later">Count later</button> <span id="n"></span>
<ul id="list"></ul>
<div class="tile" id="t1">?</div><div class="tile" id="t2">?</div>
<script>
document.getElementById('add').addEventListener('click', () => {
  const li = document.createElement('li'); li.textContent = task.value + ' ' + due.value + ' ' + who.value
  const box = document.createElement('input'); box.type = 'checkbox'; box.addEventListener('change', () => li.classList.toggle('done'))
  li.prepend(box); list.append(li); task.value = ''
})
document.getElementById('later').onclick = () => setTimeout(() => (n.textContent = '1'), 400)
for (const t of document.querySelectorAll('.tile')) t.addEventListener('click', () => t.classList.toggle('up'))
</script>""",
    "dead-button": """<!doctype html><title>Tasks</title>
<input placeholder="Task" id="task"><button id="add">Add</button><ul id="list"></ul><button id="done">Done</button>
<script>
add.addEventListener('click', () => { const li = document.createElement('li'); li.textContent = task.value; list.append(li) })
document.getElementById('done').addEventListener('click', () => { const x = document.querySelector('.nothing-here'); if (x) x.remove() })
</script>""",
    "dead-field": """<!doctype html><title>Split</title>
<input id="bill" placeholder="Bill"> <input id="people" placeholder="People"> <button id="go">Split</button> <p id="out"></p>
<script>
people.addEventListener('input', () => { people.value = '' })
go.onclick = () => { out.textContent = (bill.value / (people.value || 1)).toFixed(2) }
</script>""",
    "load-error": """<!doctype html><title>Broken</title><p>Hi</p>
<script>setUpCounter()</script>""",
    "harmless": """<!doctype html><title>Share</title>
<form><input id="name" placeholder="Name"></form>
<p id="code">ABC-123</p>
<button onclick="navigator.clipboard && navigator.clipboard.writeText('ABC-123')">Copy</button>
<button id="copy2">Copy code</button>
<button type="button" onclick="this.form && this.form.reset()">Reset</button>
<a href="other.html">Read more</a>
<button id="say">Say hello</button>
<script>document.getElementById('say').onclick = () => alert('hello')</script>""",
}

# Grids (OLA-466): one used the way a person does (tap, type, Enter, type over a filled cell).
GRID_HEAD = """<!doctype html><title>Sheet</title><style>input{width:60px;font-size:16px}</style>
<table id="t"><tr><th></th><th>A</th><th>B</th><th>C</th><th>D</th><th>E</th></tr></table>
<script>
const raw = {}, ref = (c, r) => 'ABCDE'[c] + r
const val = (k) => { const s = raw[k] || ''; if (!s.startsWith('=')) return s; return String(s.slice(1).replace(/[A-E][1-5]/g, (m) => +val(m) || 0).split('*').reduce((a, b) => a * +b, 1)) }
"""
GRID_PAGES = {
    "grid-good": GRID_HEAD + """for (let r = 1; r <= 5; r++) { const tr = t.insertRow(); tr.insertCell().textContent = r
  for (let c = 0; c < 5; c++) { const i = document.createElement('input'); i.dataset.k = ref(c, r)
    i.setAttribute('onfocus', 'this.value = raw[this.dataset.k] || ""; this.select()'); i.setAttribute('onmouseup', 'return false')
    i.onblur = () => { raw[i.dataset.k] = i.value; draw() }
    i.onkeydown = (e) => { if (e.key === 'Enter') { raw[i.dataset.k] = i.value; i.blur() } }
    tr.insertCell().append(i) } }
function draw() { for (const i of document.querySelectorAll('input')) if (i !== document.activeElement) i.value = val(i.dataset.k) }
</script>""",
    # Selects the text, then a redraw sets every cell's value, the focused one too: 57 (Safari: 75).
    "grid-redraw": GRID_HEAD + """for (let r = 1; r <= 5; r++) { const tr = t.insertRow(); tr.insertCell().textContent = r
  for (let c = 0; c < 5; c++) { const i = document.createElement('input'); i.dataset.k = ref(c, r)
    i.onfocus = () => { i.select(); draw() }
    i.onblur = () => { raw[i.dataset.k] = i.value; draw() }
    i.onkeydown = (e) => { if (e.key === 'Enter') { raw[i.dataset.k] = i.value; i.blur() } }
    tr.insertCell().append(i) } }
function draw() { for (const i of document.querySelectorAll('input')) i.value = i === document.activeElement ? (raw[i.dataset.k] || '') : val(i.dataset.k) }
</script>""",
    # Cells are plain table cells; a tap marks one as chosen and focuses nothing.
    "grid-nofield": GRID_HEAD + """for (let r = 1; r <= 5; r++) { const tr = t.insertRow(); tr.insertCell().textContent = r
  for (let c = 0; c < 5; c++) { const d = tr.insertCell(); d.style.cssText = 'width:60px;height:24px;border:1px solid #999'; d.onclick = () => { document.querySelectorAll('.on').forEach((x) => x.classList.remove('on')); d.classList.add('on') } } }
</script>""",
}
PAGES.update(GRID_PAGES)


def run(name):
    d = Path(tempfile.mkdtemp(prefix="ola-poke-test-"))
    (d / "index.html").write_text(PAGES[name])
    r = subprocess.run([sys.executable, "-I", POKE, str(d / "index.html")], capture_output=True, text=True, timeout=60)
    try:
        return r.returncode, json.loads(r.stdout or "null"), r.stderr
    except ValueError:
        return r.returncode, None, r.stderr + r.stdout


c, j, e = run("working")
ok("a working page: nothing reported, its fields typed and its buttons, box and tiles pressed", c == 0 and j and j["dead"] == [] and j["typed"] >= 1 and j["pressed"] >= 4, f"{c} {j} {e[-300:]}")
c, j, e = run("dead-button")
says = [x["say"] for x in (j or {}).get("dead", [])]
ok("a dead button: only it is reported, in one plain sentence", c == 0 and says == ["Pressing 'Done' changed nothing on the page."], f"{c} {j} {e[-300:]}")
c, j, e = run("dead-field")
says = [x["say"] for x in (j or {}).get("dead", [])]
ok("a field that takes no input: only it is reported", c == 0 and says == ["The field 'People' did not take what was typed."], f"{c} {j} {e[-300:]}")
c, j, e = run("load-error")
says = [x["say"] for x in (j or {}).get("dead", [])]
ok("a script error on load is reported with its message", c == 0 and len(says) == 1 and says[0].startswith("Script error when the page opened:") and "setUpCounter" in says[0], f"{c} {j} {e[-300:]}")
c, j, e = run("harmless")
ok("Copy, Reset on an empty form, a link and an alert: nothing reported", c == 0 and j and j["dead"] == [], f"{c} {j} {e[-300:]}")
c, j, e = run("grid-good")
ok("a grid that works like a spreadsheet: nothing reported", c == 0 and j and j["dead"] == [], f"{c} {j} {e[-300:]}")
c, j, e = run("grid-redraw")
says = [x["say"] for x in (j or {}).get("dead", [])]
ok("a grid whose redraw undoes the selection: 'Typing 7 on the cell A1 that held 5 gave ...' only", c == 0 and len(says) == 1 and says[0].startswith("Typing 7 on the cell A1 that held 5 gave '57'"), f"{c} {j} {e[-300:]}")
c, j, e = run("grid-nofield")
says = [x["say"] for x in (j or {}).get("dead", [])]
ok("a grid where a tap opens no field: said once", c == 0 and len(says) == 1 and says[0].startswith("Tapping a cell of the grid opened no field"), f"{c} {j} {e[-300:]}")
d = Path(tempfile.mkdtemp(prefix="ola-poke-test-"))
(d / "index.html").write_text("<!doctype html><button onclick='while(true){}'>Spin</button>")
r = subprocess.run([sys.executable, "-I", POKE, str(d / "index.html")], capture_output=True, text=True, timeout=60, env={**os.environ, "OLA_POKE_DEADLINE_S": "6"})
ok("a page that hangs on a press: exits 1 within the deadline and prints nothing", r.returncode == 1 and not r.stdout.strip(), f"{r.returncode} {r.stdout[:200]} {r.stderr[-200:]}")

# --since: the page is found by its time, however it was written (the first live test: `cat > index.html`
# in a shell step, no write step), newest first, one page; none changed since then: nothing pressed.
import time  # noqa: E402
proj = Path(tempfile.mkdtemp(prefix="ola-poke-test-"))
(proj / "old.html").write_text(PAGES["working"])
os.utime(proj / "old.html", (time.time() - 3600, time.time() - 3600))
(proj / ".shots").mkdir()
(proj / ".shots" / "x.html").write_text(PAGES["load-error"])
start_ms = (time.time() - 5) * 1000
subprocess.run(["sh", "-c", f"cat > '{proj}/index.html'"], input=PAGES["dead-button"], text=True, check=True)
r = subprocess.run([sys.executable, "-I", POKE, "--since", str(start_ms), str(proj)], capture_output=True, text=True, timeout=60)
j = json.loads(r.stdout or "null") if r.returncode == 0 else None
ok("--since: a page written by a shell command since the turn began is the one pressed (not an older page, not a dot folder)", j and j["page"].endswith("/index.html") and [x["say"] for x in j["dead"]] == ["Pressing 'Done' changed nothing on the page."], f"{r.returncode} {r.stdout[:300]} {r.stderr[-200:]}")
r = subprocess.run([sys.executable, "-I", POKE, "--since", str((time.time() + 60) * 1000), str(proj)], capture_output=True, text=True, timeout=60)
ok("--since: no page changed since then: {\"page\": null, \"dead\": []}, nothing pressed", r.returncode == 0 and json.loads(r.stdout or "null") == {"page": None, "dead": []}, f"{r.returncode} {r.stdout[:200]}")

print(f"{sum(results)} passed, {len(results) - sum(results)} failed")
sys.exit(0 if all(results) else 1)
