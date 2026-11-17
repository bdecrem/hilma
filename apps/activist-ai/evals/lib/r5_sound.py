"""Round five: sound tasks for the sound skill, run with and without it.

    v1-app-chimes      a chime for a new message, another for a reminder, a soft click for Save, in an app page
    v2-signature-tune  a four-bar signature tune for a campaign page, played from a button
    v3-calm-loop       calm background music for a page, with a way to turn it off
    v4-signup-sounds   a sign-up flow: a sound for Next, a gentle one for a mistake, a happy one at the end
    v5-petition-win    a short celebration when the petition is signed
    v6-fix-harsh       a page whose sounds hurt: make them good, keep a sound for each moment

Every check comes from listening: skills/sound/scripts/listen.py renders everything the page plays,
exactly, in a headless browser (the same program the skill gives the agent, run here on the host),
and reports levels, energy above 5 kHz, attacks and endings, sound before a click, the on/off switch,
and the notes of a tune (key, a figure that comes back, the ending). Its files go beside the run's
work folder (work-listen/: report.json, spectrogram.png, one .wav per sound) for the judge and for
a person. Made-up content only.
"""
import json, os, re, shutil, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SKILL = HERE.parents[1] / "skills" / "sound"
LISTEN = SKILL / "scripts" / "listen.py"
GROUPS = ["Eastgate Tenants Union", "Riverbend Clean Air Coalition", "Northside Food Co-op", "Harbor Street Neighbors", "Hillcrest Youth League"]
CAMPAIGNS = [("Clean Air for Eastgate", "a filter for every classroom"), ("Fix the 14 Bus", "buses every ten minutes"),
             ("Open the Library Sundays", "a library open seven days"), ("Shade for Mill Park", "two hundred new trees")]


def listen(work, rel, steps=(), probe=None):
    out = Path(str(work).rstrip("/") + "-listen")
    if out.exists():
        shutil.rmtree(out, ignore_errors=True)
    cmd = [sys.executable, str(LISTEN), str(Path(work) / rel), "--out", str(out)]
    for st in steps:
        cmd += ["--do", st]
    if probe:
        cmd += ["--probe", probe]
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=400)
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "listen timed out"}
    rep = out / "report.json"
    if p.returncode != 0 or not rep.exists():
        return {"ok": False, "error": (p.stderr or p.stdout)[-300:]}
    r = json.loads(rep.read_text())
    r["ok"] = True
    return r


def heard(r):
    return [s for s in r.get("segments", [])[1:] if not s.get("silent")]


def is_music(s):
    return (s.get("sound_length") or 0) > 2.8


def fails(r, *words):
    return [x["text"] for x in r.get("lines", []) if x["level"] == "fail" and any(w in x["text"] for w in words)]


COMMON = ["listened", "silent_until_a_click", "works_on_phones", "no_clipping", "not_too_loud", "not_harsh", "soft_starts", "clean_endings", "no_dc_offset", "has_a_sound_switch"]


def sound_checks(C, r, calm=False):
    """The checks every sound task shares, on what listen.py heard."""
    C.add("listened", r.get("ok") and bool(heard(r)), "page_broken", r.get("error") or ("nothing made a sound" if r.get("ok") else ""))
    segs = r.get("segments") or [{}]
    early = [n for n in r.get("notes", []) if n.get("clicks") == 0]
    C.add("silent_until_a_click", r.get("ok") and segs[0].get("silent") and not early, "page_broken", f"{len(early)} sounds on load, peak {segs[0].get('peak_dbfs')}")
    stuck = [c for c in r.get("contexts", []) if c.get("before_click") and not c.get("resumed_after_click")]
    C.add("works_on_phones", r.get("ok") and not stuck and len(r.get("contexts", [])) <= 3, "page_broken", f"{len(r.get('contexts', []))} sound systems, {len(stuck)} made on load and never resumed")
    hs = [s for s in heard(r) if not s["label"].startswith(("sound off", "after sound off", "sound switch"))]
    ui = [s for s in hs if not is_music(s)]
    mu = [s for s in hs if is_music(s)]
    C.add("no_clipping", hs and all(not s.get("clipped_samples") for s in hs), "harsh_sound", [(s["label"], s.get("clipped_samples")) for s in hs if s.get("clipped_samples")])
    C.add("not_too_loud", hs and all(s["peak_dbfs"] <= -12 for s in ui) and all(s["peak_dbfs"] <= -1 and (s.get("rms_dbfs") or -99) <= -14 for s in mu), "harsh_sound",
          [(s["label"], s.get("peak_dbfs"), s.get("rms_dbfs")) for s in hs])
    C.add("not_harsh", hs and all((s.get("hf") or 0) <= 0.12 for s in ui) and all((s.get("hf") or 0) <= (0.08 if calm else 0.15) for s in mu), "harsh_sound",
          [(s["label"], s.get("hf")) for s in hs])
    C.add("soft_starts", hs and all((s.get("attack_ms") or 0) >= 1.0 for s in ui), "harsh_sound", [(s["label"], s.get("attack_ms")) for s in ui])
    C.add("clean_endings", hs and all(not s.get("ends_abruptly") and not s.get("jumps") for s in ui), "harsh_sound", [(s["label"], s.get("ends_abruptly"), s.get("jumps")) for s in ui])
    C.add("no_dc_offset", hs and all(abs(s.get("dc") or 0) <= 0.01 for s in hs), "harsh_sound", [(s["label"], s.get("dc")) for s in hs])
    C.add("has_a_sound_switch", r.get("ok") and (any(c.get("sound") for c in r.get("controls", [])) or bool((r.get("plan") or {}).get("sound_control"))), "missed_items",
          [c["name"] for c in r.get("controls", [])][:8])
    return ui, mu


def seg(r, word):
    return [s for s in heard(r) if word.lower() in s["label"].lower() and not s["label"].startswith(("sound off", "after sound off"))]


def differ(a, b):
    """Two sounds are different when their length, brightness or level clearly differ."""
    return (abs((a.get("sound_length") or 0) - (b.get("sound_length") or 0)) > 0.12 or abs((a.get("centroid") or 0) - (b.get("centroid") or 0)) > 120
            or abs(a["peak_dbfs"] - b["peak_dbfs"]) > 3)


def start(C, work, rel, extra):
    C.exists(work, rel)
    if not (Path(work) / rel).exists():
        C.skip(COMMON + extra, "stopped_early")
        return False
    return True


def kit(work):
    shutil.copy(SKILL / "assets" / "olasound.js", Path(work) / "olasound.js")


PAGE = """<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{title}</title>
<style>body{{font:17px/1.5 system-ui, sans-serif;margin:0;padding:24px;max-width:640px;color:#1d1d1f;background:#fbfaf7}} h1{{font-size:28px}}
button{{font:inherit;padding:10px 16px;margin:4px 8px 4px 0;border:1px solid #444;background:#fff;border-radius:6px}} button:focus-visible{{outline:3px solid #1f4e8c}}
.error{{color:#a1260d}} [hidden]{{display:none}}</style></head><body>
{body}
{script}</body></html>"""


# ------------------------------------------------------------------ v1: chimes for an app

def v1_generate(work, seed, rng):
    g = rng.choice(GROUPS)
    body = f"""<h1>{g}: organizer</h1>
<p>Messages and reminders for the {g}. The two test buttons below show what happens when something arrives.</p>
<section><h2>Inbox</h2><ul id="inbox"><li>Welcome to the organizer.</li></ul>
<label for="note">Note to the team</label><br><textarea id="note">Bring sign-up sheets on Saturday.</textarea><br>
<button id="save" type="button">Save</button></section>
<section><h2>Test</h2>
<button id="new-message" type="button">Simulate a new message</button>
<button id="reminder" type="button">Simulate a reminder</button></section>"""
    script = """<script>
const inbox = document.getElementById('inbox')
function add(text) { const li = document.createElement('li'); li.textContent = text; inbox.prepend(li) }
document.getElementById('save').addEventListener('click', () => add('Saved your note.'))
document.getElementById('new-message').addEventListener('click', () => add('New message from the canvassing team.'))
document.getElementById('reminder').addEventListener('click', () => add('Reminder: phone bank tonight at 6.'))
</script>"""
    (Path(work) / "app.html").write_text(PAGE.format(title=g, body=body, script=script))
    return {"group": g}


def v1_check(work, truth, session, C):
    extra = ["each_moment_has_a_sound", "message_and_reminder_differ", "page_kept"]
    if not start(C, work, "app.html", extra):
        return
    r = listen(work, "app.html")
    sound_checks(C, r)
    m, rem, sv = seg(r, "message"), seg(r, "reminder"), seg(r, "save")
    C.add("each_moment_has_a_sound", m and rem and sv, "missed_items", f"message {bool(m)}, reminder {bool(rem)}, save {bool(sv)}: {[s['label'] for s in heard(r)]}")
    C.add("message_and_reminder_differ", m and rem and differ(m[-1], rem[-1]), "missed_items")
    html = (Path(work) / "app.html").read_text(errors="ignore")
    C.add("page_kept", all(f'id="{i}"' in html or f"id='{i}'" in html or f"id={i}" in html for i in ("save", "new-message", "reminder", "inbox")), "broke_earlier_work")


def v1_solve(work, truth, wrong=False):
    p = Path(work) / "app.html"
    html = p.read_text()
    if wrong:
        js = """<script>
function beep(f) { const c = new AudioContext(), o = c.createOscillator(); o.type = 'square'; o.frequency.value = f; o.connect(c.destination); o.start(); o.stop(c.currentTime + 0.2) }
document.getElementById('save').addEventListener('click', () => beep(1500))
document.getElementById('new-message').addEventListener('click', () => beep(2000))
document.getElementById('reminder').addEventListener('click', () => beep(2500))
</script>"""
    else:
        kit(work)
        js = """<p><button id="sound" type="button">Sound on</button></p>
<script src="olasound.js"></script><script>
OlaSound.toggleButton(document.getElementById('sound'))
document.getElementById('save').addEventListener('click', () => OlaSound.play('tap'))
document.getElementById('new-message').addEventListener('click', () => OlaSound.play('message'))
document.getElementById('reminder').addEventListener('click', () => OlaSound.play('reminder'))
</script>"""
    p.write_text(html.replace("</body>", js + "</body>"))
    return "Added the sounds to app.html."


# ------------------------------------------------------------------ v2: a signature tune

def v2_generate(work, seed, rng):
    name, goal = rng.choice(CAMPAIGNS)
    g = rng.choice(GROUPS)
    (Path(work) / "campaign.md").write_text(f"""# {name}

A campaign by the {g}. Our goal: {goal}, by next fall.
We meet every Tuesday at 7 pm. The mood we want: hopeful, warm, people together, not angry.
""")
    body = f"<h1>{name}</h1><p>A campaign by the {g}. Our goal: {goal}, by next fall.</p><p>We meet every Tuesday at 7 pm.</p>"
    (Path(work) / "index.html").write_text(PAGE.format(title=name, body=body, script=""))
    return {"name": name}


def v2_check(work, truth, session, C):
    extra = ["a_tune_plays", "in_one_key", "not_random", "resolves", "singable_range", "page_kept"]
    if not start(C, work, "index.html", extra):
        return
    r = listen(work, "index.html")
    sound_checks(C, r)
    tunes = [s for s in heard(r) if s.get("music") and s["music"]["events"] >= 8]
    t = max(tunes, key=lambda s: s["music"]["events"])["music"] if tunes else None
    C.add("a_tune_plays", t is not None, "missed_items", [(s["label"], s.get("sound_length"), (s.get("music") or {}).get("events")) for s in heard(r)])
    if not t:
        C.skip(["in_one_key", "not_random", "resolves", "singable_range"], "missed_items")
    else:
        C.add("in_one_key", t["in_key"] >= 0.9, "not_musical", f"{t['in_key']} in {t['key']}")
        C.add("not_random", not (t["same_length"] and t["motif_share"] < 0.4) and t["motif_share"] >= 0.25, "not_musical", f"motif {t['motif_share']}, same length {t['same_length']}: {t['top_line'][:16]}")
        C.add("resolves", t["ends_on_tonic_chord"], "not_musical", f"ends on {t['last_pitch_class']} in {t['key']}")
        C.add("singable_range", t["range_semitones"] <= 24, "not_musical", f"{t['range_semitones']} semitones")
    html = (Path(work) / "index.html").read_text(errors="ignore")
    C.add("page_kept", truth["name"] in html, "broke_earlier_work")


TUNE = "D4 q, F#4 e, A4 e, B4 h, D4 q, F#4 e, A4 e, D5 h, B4 q, A4 e, F#4 e, G4 q, E4 q, D4 w"
WALK = "D4 e, E4 e, F#4 e, A4 e, B4 e, A4 e, F#4 e, B4 e, D5 e, B4 e, A4 e, E4 e, F#4 e, D5 e, E5 e, B4 e"


def v2_solve(work, truth, wrong=False):
    kit(work)
    p = Path(work) / "index.html"
    js = f"""<p><button id="play" type="button">Play our tune</button> <button id="sound" type="button">Sound on</button></p>
<script src="olasound.js"></script><script>
OlaSound.toggleButton(document.getElementById('sound'))
document.getElementById('play').addEventListener('click', () => OlaSound.melody('{WALK if wrong else TUNE}', {{ bpm: 100, chords: 'D | G | Bm | D' }}))
</script>"""
    p.write_text(p.read_text().replace("</body>", js + "</body>"))
    return "Added the tune."


# ------------------------------------------------------------------ v3: a calm loop

def v3_generate(work, seed, rng):
    g = rng.choice(["Mill Park Community Garden", "Linden Place Garden", "Orchard Row Growers"])
    body = f"""<h1>{g}: open day</h1><p>Saturday, May 16, 10 am to 3 pm. Tours of the beds every hour, seedlings to take home, tea under the pear tree.</p>
<h2>What to bring</h2><p>Gloves if you want to help in the afternoon, a jar for honey, and your neighbors.</p>"""
    (Path(work) / "index.html").write_text(PAGE.format(title=g, body=body, script=""))
    return {"name": g}


def v3_check(work, truth, session, C):
    extra = ["music_keeps_playing", "switch_stops_it", "calm_level", "page_kept"]
    if not start(C, work, "index.html", extra):
        return
    r = listen(work, "index.html")
    ui, mu = sound_checks(C, r, calm=True)
    plan = r.get("plan") or {}
    looping = plan.get("sound_on_still_playing") or any(p.get("still_playing") for p in plan.get("pressed", []))
    C.add("music_keeps_playing", looping and any((s.get("sound_length") or 0) >= 6 for s in mu), "missed_items", [(s["label"], s.get("sound_length")) for s in heard(r)])
    C.add("switch_stops_it", looping and bool(plan.get("sound_control")) and not fails(r, "did not stop", "cannot be turned off"), "page_broken", fails(r, "stop", "turned off"))
    C.add("calm_level", mu and all(-42 <= (s.get("rms_dbfs") or -99) <= -16 and s["peak_dbfs"] <= -3 for s in mu), "harsh_sound", [(s["label"], s.get("rms_dbfs"), s.get("peak_dbfs")) for s in mu])
    C.add("page_kept", truth["name"] in (Path(work) / "index.html").read_text(errors="ignore"), "broke_earlier_work")


def v3_solve(work, truth, wrong=False):
    kit(work)
    p = Path(work) / "index.html"
    if wrong:
        js = """<p><button id="music" type="button">Play music</button></p><script>
document.getElementById('music').addEventListener('click', () => { const c = new AudioContext(); const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 220
  const g = c.createGain(); g.gain.value = 0.5; o.connect(g); g.connect(c.destination); o.start() })
</script>"""
    else:
        js = """<p><button id="music" type="button" aria-pressed="false">Play music</button></p>
<script src="olasound.js"></script><script>
let bed = null; const b = document.getElementById('music')
b.addEventListener('click', () => { if (bed && bed.playing) { bed.stop(); bed = null; b.textContent = 'Play music'; b.setAttribute('aria-pressed', 'false') }
  else { bed = OlaSound.loop('pad'); b.textContent = 'Stop music'; b.setAttribute('aria-pressed', 'true') } })
</script>"""
    p.write_text(p.read_text().replace("</body>", js + "</body>"))
    return "Added calm music with a button."


# ------------------------------------------------------------------ v4: a sign-up flow

SIGNUP_STEPS = ["click:#next1", "wait:2.2", "fill", "click:#next1", "wait:2.2", "fill", "click:#next2", "wait:2.2", "fill", "click:#submit", "wait:3.5", "switch:1.5"]
SIGNUP_PROBE = "(() => { const t = document.getElementById('thanks'); return !!t && !t.hidden && getComputedStyle(t).display !== 'none' })()"


def v4_generate(work, seed, rng):
    g = rng.choice(GROUPS)
    body = f"""<h1>Volunteer with the {g}</h1>
<form id="form" novalidate>
<section id="step1"><h2>Step 1 of 3: you</h2>
<label for="name">Your name</label><br><input id="name" name="name" required><br>
<label for="email">Email</label><br><input id="email" name="email" type="email" required><br>
<p id="err1" class="error" hidden>Please fill in your name and email.</p>
<button id="next1" type="button">Next</button></section>
<section id="step2" hidden><h2>Step 2 of 3: when</h2>
<label for="day">Which day suits you?</label><br><select id="day" required><option value="">Choose a day</option><option>Saturday mornings</option><option>Weekday evenings</option></select>
<p id="err2" class="error" hidden>Please choose a day.</p>
<button id="next2" type="button">Next</button></section>
<section id="step3" hidden><h2>Step 3 of 3: check and send</h2><p>We will email you the schedule.</p>
<button id="submit" type="submit">Sign up</button></section>
</form>
<section id="thanks" hidden><h2>Thank you for signing up</h2><p>See you soon.</p></section>"""
    script = """<script>
const $ = (id) => document.getElementById(id)
function next1() { if (!$('name').value.trim() || !$('email').value.trim()) { $('err1').hidden = false; return false } $('err1').hidden = true; $('step1').hidden = true; $('step2').hidden = false; return true }
function next2() { if (!$('day').value) { $('err2').hidden = false; return false } $('err2').hidden = true; $('step2').hidden = true; $('step3').hidden = false; return true }
$('next1').addEventListener('click', next1)
$('next2').addEventListener('click', next2)
$('form').addEventListener('submit', (e) => { e.preventDefault(); $('form').hidden = true; $('thanks').hidden = false })
</script>"""
    (Path(work) / "signup.html").write_text(PAGE.format(title="Volunteer sign-up", body=body, script=script))
    return {"group": g}


def v4_check(work, truth, session, C):
    extra = ["mistake_has_a_sound", "next_has_a_sound", "finish_has_a_sound", "finish_differs_from_next", "mistake_differs_from_next", "form_still_works"]
    if not start(C, work, "signup.html", extra):
        return
    r = listen(work, "signup.html", SIGNUP_STEPS, SIGNUP_PROBE)
    sound_checks(C, r)
    s = (r.get("segments") or [])[1:]
    get = lambda i: s[i] if len(s) > i and not s[i].get("silent") else None
    err, n1, n2, fin = get(0), get(1), get(2), get(3)
    C.add("mistake_has_a_sound", err is not None, "missed_items", [x.get("label") for x in s])
    C.add("next_has_a_sound", n1 is not None and n2 is not None, "missed_items")
    C.add("finish_has_a_sound", fin is not None, "missed_items")
    C.add("finish_differs_from_next", fin is not None and n1 is not None and differ(fin, n1), "missed_items")
    C.add("mistake_differs_from_next", err is not None and n1 is not None and differ(err, n1), "missed_items")
    C.add("form_still_works", r.get("probe") is True, "broke_earlier_work", str(r.get("probe")))


def v4_solve(work, truth, wrong=False):
    p = Path(work) / "signup.html"
    if wrong:
        js = """<script>
const ac = new AudioContext()
function beep(f, len) { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(ac.destination); o.start(); o.stop(ac.currentTime + len) }
document.getElementById('next1').addEventListener('click', () => beep(900, 0.15))
document.getElementById('next2').addEventListener('click', () => beep(900, 0.15))
document.getElementById('form').addEventListener('submit', () => beep(1200, 0.6))
</script>"""
    else:
        kit(work)
        js = """<p><button id="sound" type="button">Sound on</button></p>
<script src="olasound.js"></script><script>
OlaSound.toggleButton(document.getElementById('sound'))
document.getElementById('next1').addEventListener('click', () => OlaSound.play(document.getElementById('step1').hidden ? 'tap' : 'error'))
document.getElementById('next2').addEventListener('click', () => OlaSound.play(document.getElementById('step2').hidden ? 'tap' : 'error'))
document.getElementById('form').addEventListener('submit', () => OlaSound.play('celebrate'))
</script>"""
    p.write_text(p.read_text().replace("</body>", js + "</body>"))
    return "Added sounds to the sign-up."


# ------------------------------------------------------------------ v5: a petition is signed

PETITION_STEPS = ["fill", "click:#sign", "wait:3.5", "switch:1.5"]
PETITION_PROBE = "(() => { const t = document.getElementById('thanks'); return !!t && !t.hidden && getComputedStyle(t).display !== 'none' })()"


def v5_generate(work, seed, rng):
    name, goal = rng.choice(CAMPAIGNS)
    body = f"""<h1>Sign the petition: {name}</h1><p>We ask the city for {goal}.</p>
<form id="petition"><label for="name">Name</label><br><input id="name" required><br>
<label for="email">Email</label><br><input id="email" type="email" required><br>
<label for="zip">ZIP code</label><br><input id="zip" required><br>
<button id="sign" type="submit">Sign the petition</button></form>
<section id="thanks" hidden><h2>Thank you. Your name is on it.</h2><p>Share it with two neighbors.</p></section>"""
    script = """<script>
document.getElementById('petition').addEventListener('submit', (e) => { e.preventDefault(); e.target.hidden = true; document.getElementById('thanks').hidden = false })
</script>"""
    (Path(work) / "petition.html").write_text(PAGE.format(title=name, body=body, script=script))
    return {"name": name}


def v5_check(work, truth, session, C):
    extra = ["win_has_a_sound", "short", "form_still_works"]
    if not start(C, work, "petition.html", extra):
        return
    r = listen(work, "petition.html", PETITION_STEPS, PETITION_PROBE)
    sound_checks(C, r)
    s = (r.get("segments") or [])[1:]
    win = s[0] if s and not s[0].get("silent") else None
    C.add("win_has_a_sound", win is not None, "missed_items", [x.get("label") for x in s])
    C.add("short", win is not None and 0.3 <= (win.get("sound_length") or 0) <= 3.0, "missed_items", win and win.get("sound_length"))
    C.add("form_still_works", r.get("probe") is True, "broke_earlier_work", str(r.get("probe")))


def v5_solve(work, truth, wrong=False):
    p = Path(work) / "petition.html"
    if wrong:
        js = """<script>
document.getElementById('petition').addEventListener('submit', () => { const c = new AudioContext(); [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => {
  const o = c.createOscillator(); o.type = 'square'; o.frequency.value = f; o.connect(c.destination); o.start(c.currentTime + i * 0.08); o.stop(c.currentTime + i * 0.08 + 0.08) }) })
</script>"""
    else:
        kit(work)
        js = """<p><button id="sound" type="button">Sound on</button></p>
<script src="olasound.js"></script><script>
OlaSound.toggleButton(document.getElementById('sound'))
document.getElementById('petition').addEventListener('submit', () => OlaSound.play('celebrate'))
</script>"""
    p.write_text(p.read_text().replace("</body>", js + "</body>"))
    return "Added a celebration sound."


# ------------------------------------------------------------------ v6: fix harsh sounds

HARSH = """<script>
const boot = new AudioContext()
const b0 = boot.createOscillator(); b0.type = 'square'; b0.frequency.value = 1200; b0.connect(boot.destination); b0.start(); b0.stop(boot.currentTime + 0.25)
function tone(f, type, len, vol) { const c = new AudioContext(), o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.value = f; g.gain.value = vol
  o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + len); return [c, o] }
document.getElementById('post').addEventListener('click', () => { tone(1800, 'square', 0.3, 0.8); add('Posted.') })
document.getElementById('like').addEventListener('click', () => { for (let i = 0; i < 3; i++) setTimeout(() => tone(2400 + i * 400, 'sawtooth', 0.08, 0.9), i * 90) })
document.getElementById('alert').addEventListener('click', () => { const [c, o] = tone(900, 'square', 2.0, 0.7)
  for (let i = 0; i < 8; i++) o.frequency.setValueAtTime(i % 2 ? 900 : 1400, c.currentTime + i * 0.25) })
function add(t) { const li = document.createElement('li'); li.textContent = t; document.getElementById('posts').prepend(li) }
</script>"""


def v6_generate(work, seed, rng):
    g = rng.choice(GROUPS)
    body = f"""<h1>{g}: neighborhood board</h1><ul id="posts"><li>Street cleanup moved to Sunday.</li></ul>
<button id="post" type="button">Post</button> <button id="like" type="button">Like</button> <button id="alert" type="button">Alert neighbors</button>"""
    (Path(work) / "board.html").write_text(PAGE.format(title=g, body=body, script=HARSH))
    return {"group": g}


def v6_check(work, truth, session, C):
    extra = ["every_moment_still_sounds", "switch_silences_everything"]
    if not start(C, work, "board.html", extra):
        return
    r = listen(work, "board.html")
    sound_checks(C, r)
    C.add("every_moment_still_sounds", all(seg(r, w) for w in ("post", "like", "alert")), "missed_items", [s["label"] for s in heard(r)])
    plan = r.get("plan") or {}
    C.add("switch_silences_everything", bool(plan.get("sound_control")) and not fails(r, "did not stop", "still makes a sound"), "page_broken", fails(r, "stop", "still"))


def v6_solve(work, truth, wrong=False):
    p = Path(work) / "board.html"
    html = p.read_text()
    if wrong:
        html = html.replace("0.8)", "0.3)").replace("0.9)", "0.3)")  # quieter, still square and on load
    else:
        kit(work)
        html = html.replace(HARSH, """<p><button id="sound" type="button">Sound on</button></p>
<script src="olasound.js"></script><script>
OlaSound.toggleButton(document.getElementById('sound'))
document.getElementById('post').addEventListener('click', () => { OlaSound.play('success'); add('Posted.') })
document.getElementById('like').addEventListener('click', () => OlaSound.play('tap'))
document.getElementById('alert').addEventListener('click', () => OlaSound.play('notify'))
function add(t) { const li = document.createElement('li'); li.textContent = t; document.getElementById('posts').prepend(li) }
</script>""")
    p.write_text(html)
    return "Fixed the sounds."


def W(f):
    return lambda work, truth: f(work, truth, wrong=True)


INSTR = {
    "v1-app-chimes": "app.html is the web version of our organizing app. Add sounds to it: a chime when a new message arrives, a different one for a reminder, "
                     "and a soft click when someone presses Save. The two Simulate buttons are there to test them. Keep everything else on the page as it is.",
    "v2-signature-tune": "Write a short signature tune for our campaign (about four bars) and put it on index.html, from campaign.md: it should play when "
                         "someone presses a Play button. Make it memorable and warm, not cheesy.",
    "v3-calm-loop": "Add calm background music to index.html that people can turn on and off. It should be pleasant to leave playing while they read the page.",
    "v4-signup-sounds": "signup.html is our volunteer sign-up: three steps and a thank-you. Add sounds: a soft one for each Next, a gentle one when someone "
                        "forgets a required field, and a happy one when they finish signing up. Keep the form working as it is.",
    "v5-petition-win": "When someone signs the petition on petition.html, play a short celebratory sound. It should feel like a small win, not a slot machine. "
                       "Keep the form as it is.",
    "v6-fix-harsh": "People say the sounds on board.html hurt their ears. Fix them so they sound good, and keep a sound for each thing that has one now.",
}

TASKS = {
    "v1-app-chimes": dict(level="medium", outputs=["app.html"], generate=v1_generate, check=v1_check, solve=lambda w, t: v1_solve(w, t), wrong=W(v1_solve)),
    "v2-signature-tune": dict(level="medium", outputs=["index.html"], generate=v2_generate, check=v2_check, solve=lambda w, t: v2_solve(w, t), wrong=W(v2_solve)),
    "v3-calm-loop": dict(level="medium", outputs=["index.html"], generate=v3_generate, check=v3_check, solve=lambda w, t: v3_solve(w, t), wrong=W(v3_solve)),
    "v4-signup-sounds": dict(level="hard", outputs=["signup.html"], generate=v4_generate, check=v4_check, solve=lambda w, t: v4_solve(w, t), wrong=W(v4_solve)),
    "v5-petition-win": dict(level="easy", outputs=["petition.html"], generate=v5_generate, check=v5_check, solve=lambda w, t: v5_solve(w, t), wrong=W(v5_solve)),
    "v6-fix-harsh": dict(level="medium", outputs=["board.html"], generate=v6_generate, check=v6_check, solve=lambda w, t: v6_solve(w, t), wrong=W(v6_solve)),
}
for k, v in TASKS.items():
    v["family"] = "skills"
    v["skill"] = "sound"
    v["instruction"] = INSTR[k]
    v["wrong2"] = (lambda w, t: "I could not do it.")
