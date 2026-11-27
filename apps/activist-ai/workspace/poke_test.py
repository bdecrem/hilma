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
d = Path(tempfile.mkdtemp(prefix="ola-poke-test-"))
(d / "index.html").write_text("<!doctype html><button onclick='while(true){}'>Spin</button>")
r = subprocess.run([sys.executable, "-I", POKE, str(d / "index.html")], capture_output=True, text=True, timeout=60, env={**os.environ, "OLA_POKE_DEADLINE_S": "6"})
ok("a page that hangs on a press: exits 1 within the deadline and prints nothing", r.returncode == 1 and not r.stdout.strip(), f"{r.returncode} {r.stdout[:200]} {r.stderr[-200:]}")

print(f"{sum(results)} passed, {len(results) - sum(results)} failed")
sys.exit(0 if all(results) else 1)
