#!/usr/bin/env python3
"""listen.py: hear a page's sounds the way a careful sound designer would, and say what to fix.

    python3 listen.py index.html [--out sound-check] [--do click:#play --do wait:4 ...] [--json report.json]

Loads the page in the headless browser (ola-page's), with capture.js put in before the page's own
scripts: every sound the page makes is rendered offline, exactly, onto one timeline. Without --do it
plays the page like a visitor: waits two seconds (nothing may sound before a click), turns sound on
with the page's sound switch if it has one, presses each button once (filling in forms first), turns
sound off again and presses a button to check it is silent. With --do it follows your steps instead:
click:<css selector>, wait:<seconds>, fill (fill in the visible form), switch (press the page's sound
on/off button), js:<expression> (for example js:OlaSound.play('success') to hear one sound by name).

Writes <out>/everything.wav, one clip per sound (<out>/01-<button>.wav), <out>/spectrogram.png (a
picture of the sound: time across, pitch up, loudness as darkness) and <out>/report.json, then prints
plain lines: [fail] must be fixed, [warn] should be looked at, [ok] measured and fine. Exit 0 when the
page loaded (even with findings), 1 when it could not be listened to, 2 on a usage error.
Only Python's standard library; the browser does the measuring.
"""
import argparse, base64, fcntl, glob, http.server, json, math, os, re, shutil, socketserver, subprocess, sys, tempfile, threading, time
from urllib.parse import unquote, urlparse
from pathlib import Path

HERE = Path(__file__).resolve().parent
CAPTURE = (HERE / "capture.js").read_text()

# ------------------------------------------------------------------ the browser (ola-page's)

TYPES = {".html": "text/html; charset=utf-8", ".htm": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript",
         ".json": "application/json", ".csv": "text/csv; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
         ".woff2": "font/woff2", ".wav": "audio/wav", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".txt": "text/plain; charset=utf-8"}
CANDIDATES = ["/usr/bin/chromium-headless-shell", "/usr/lib/chromium/chromium-headless-shell", "/usr/lib/chromium/headless_shell", "/usr/bin/chromium"]

# The page server and the browser pipe are ola-page's (workspace/ola-page), copied so this script also
# runs where ola-page is not the Chromium one (the Mac app's), with Chrome or Playwright's browser.
class Quiet(http.server.SimpleHTTPRequestHandler):
    root = "/"

    def log_message(self, *a):
        pass

    def do_GET(self):
        rel = unquote(urlparse(self.path).path).lstrip("/") or "index.html"
        f = (Path(self.root) / rel).resolve()
        if not str(f).startswith(str(Path(self.root).resolve()) + os.sep) and f != Path(self.root).resolve():
            self.send_error(403)
            return
        if f.is_dir():
            f = f / "index.html"
        try:
            body = f.read_bytes()
        except OSError:
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Content-Type", TYPES.get(f.suffix.lower(), "application/octet-stream"))
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    do_HEAD = do_GET


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True


class CDP:
    """Chrome DevTools Protocol over --remote-debugging-pipe (fd 3 in, fd 4 out, NUL-separated JSON)."""

    def __init__(self, binary, profile):
        r_in, self.w = os.pipe()
        self.r, w_out = os.pipe()

        def wire():
            a = fcntl.fcntl(r_in, fcntl.F_DUPFD, 10)
            b = fcntl.fcntl(w_out, fcntl.F_DUPFD, 10)
            os.dup2(a, 3)
            os.dup2(b, 4)
            # A page is someone else's code (review 5 follow-up): the browser and every process it
            # starts may hold OLA_PAGE_MEM_MB (2048) of written memory and write files of 256 MiB at
            # most, so a page that grows without end fails here instead of taking the computer's
            # memory (and opencode with it). Address space is not capped: the browser reserves a lot.
            try:
                import resource
                mem = int(os.environ.get("OLA_PAGE_MEM_MB", "2048")) << 20
                resource.setrlimit(resource.RLIMIT_DATA, (mem, mem))
                resource.setrlimit(resource.RLIMIT_FSIZE, (256 << 20, 256 << 20))
            except (ImportError, ValueError, OSError):
                pass

        args = [binary, "--headless", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--remote-debugging-pipe",
                f"--user-data-dir={profile}", "--no-first-run", "--no-default-browser-check", "--disable-background-networking",
                "--disable-component-update", "--use-mock-keychain", "--password-store=basic", "--disable-sync", "--disable-extensions", "--mute-audio", "--hide-scrollbars",
                "--disable-features=Translate,MediaRouter,OptimizationHints", "--font-render-hinting=none",
                "--js-flags=--max-old-space-size=512", "--renderer-process-limit=1", "about:blank"]
        self.p = subprocess.Popen(args, preexec_fn=wire, close_fds=False, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        os.close(r_in)
        os.close(w_out)
        self.buf = b""
        self.n = 0
        self.events = []

    def send(self, method, params=None, session=None, timeout=30):
        self.n += 1
        msg = {"id": self.n, "method": method, "params": params or {}}
        if session:
            msg["sessionId"] = session
        os.write(self.w, json.dumps(msg).encode() + b"\0")
        want = self.n
        end = time.time() + timeout
        while time.time() < end:
            for m in self.read(end - time.time()):
                if m.get("id") == want:
                    if "error" in m:
                        raise RuntimeError(f"{method}: {m['error'].get('message')}")
                    return m.get("result", {})
                self.events.append(m)
        raise TimeoutError(method)

    def read(self, timeout):
        import select
        r, _, _ = select.select([self.r], [], [], max(0.0, min(timeout, 1.0)))
        if not r:
            return []
        chunk = os.read(self.r, 1 << 20)
        if not chunk:
            raise RuntimeError("the page renderer stopped")
        self.buf += chunk
        out = []
        while b"\0" in self.buf:
            one, self.buf = self.buf.split(b"\0", 1)
            try:
                out.append(json.loads(one))
            except ValueError:
                pass
        return out

    def pump(self, seconds):
        end = time.time() + seconds
        while time.time() < end:
            self.events.extend(self.read(end - time.time()))

    def close(self):
        try:
            self.p.kill()
            self.p.wait(5)
        except Exception:
            pass



def chromium():
    cands = [os.environ.get("OLA_PAGE_CHROMIUM")] + CANDIDATES
    cands += sorted(glob.glob(os.path.expanduser("~/Library/Caches/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-mac-arm64/chrome-headless-shell")), reverse=True)
    cands += sorted(glob.glob(os.path.expanduser("~/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux*/chrome-headless-shell")), reverse=True)
    cands += ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium", shutil.which("chromium-headless-shell") or ""]
    return next((c for c in cands if c and os.access(c, os.X_OK)), None)


CONTROLS = r"""
(() => {
  const vis = (e) => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && s.display !== 'none' && !e.disabled && !e.closest('[hidden],[aria-hidden=true]') }
  const els = [...document.querySelectorAll('button, [role=button], [role=switch], input[type=button], input[type=submit], input[type=checkbox], a[href^="#"], [data-sound], [onclick]')]
  const seen = new Set()
  return JSON.stringify(els.filter(vis).filter((e) => { if (seen.has(e)) return false; seen.add(e); return !(e.matches('input[type=checkbox]') && !/sound|audio|music|mute/i.test((e.closest('label') || {}).innerText || e.getAttribute('aria-label') || e.id || '')) }).map((e) => {
    if (!e.dataset.olaI) e.dataset.olaI = String((window.__olaN = (window.__olaN || 0) + 1))
    const name = (e.getAttribute('aria-label') || e.innerText || e.value || e.title || (e.closest('label') || {}).innerText || e.id || e.tagName).trim().replace(/\s+/g, ' ').slice(0, 40)
    const hay = name + ' ' + (e.id || '') + ' ' + (typeof e.className === 'string' ? e.className : '')
    return { id: e.dataset.olaI, name, sound: /\b(sounds?|audio|music|mute|unmute|volume|speaker)\b|♪|🔇|🔈|🔉|🔊/i.test(hay) || /^\s*(play|pause|stop)\s*$/i.test(name) }
  }))
})()
"""
FILL = r"""
(() => {
  let n = 0
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden' }
  for (const e of document.querySelectorAll('input, textarea, select')) {
    if (!vis(e) || e.disabled || e.readOnly) continue
    const t = (e.type || '').toLowerCase()
    const set = (v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); n++ }
    if (e.tagName === 'SELECT') { if (e.selectedIndex <= 0 && e.options.length > 1) { e.selectedIndex = 1; e.dispatchEvent(new Event('change', { bubbles: true })); n++ } continue }
    if (t === 'checkbox') { if (e.required && !e.checked) { e.checked = true; e.dispatchEvent(new Event('change', { bubbles: true })); n++ } continue }
    if (t === 'radio') { if (!document.querySelector(`input[type=radio][name="${e.name}"]:checked`)) { e.checked = true; e.dispatchEvent(new Event('change', { bubbles: true })); n++ } continue }
    if (['hidden', 'submit', 'button', 'file', 'range', 'color'].includes(t) || e.value) continue
    const hint = (e.name + ' ' + e.id + ' ' + e.placeholder + ' ' + ((e.labels && e.labels[0] && e.labels[0].innerText) || '')).toLowerCase()
    if (t === 'email' || /mail/.test(hint)) set('alex@example.org')
    else if (t === 'tel' || /phone|tel/.test(hint)) set('555 0100')
    else if (t === 'number') set(String(e.min || 2))
    else if (t === 'date') set('2026-12-05')
    else if (/zip|postal/.test(hint)) set('10001')
    else if (e.tagName === 'TEXTAREA') set('Happy to help on weekends.')
    else set('Alex Rivera')
  }
  return n
})()
"""
# Sources started since the last click that are still going (no stop yet, or a loop): music is playing.
LIVE = "(() => window.__olaListen ? window.__olaListen.live() : -1)()"


class Session:
    def __init__(self, binary, page, width):
        Quiet.root = str(page.parent)
        self.srv = Server(("127.0.0.1", 0), Quiet)
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        self.base = f"http://127.0.0.1:{self.srv.server_address[1]}/"
        self.profile = tempfile.mkdtemp(prefix="ola-listen-")
        self.cdp = CDP(binary, self.profile)
        tid = self.cdp.send("Target.createTarget", {"url": "about:blank"})["targetId"]
        self.sid = self.cdp.send("Target.attachToTarget", {"targetId": tid, "flatten": True})["sessionId"]
        for m in ("Page.enable", "Runtime.enable", "Network.enable"):
            self.cdp.send(m, session=self.sid)
        self.cdp.send("Emulation.setDeviceMetricsOverride", {"width": width, "height": 844, "deviceScaleFactor": 1, "mobile": False}, session=self.sid)
        self.cdp.send("Page.addScriptToEvaluateOnNewDocument", {"source": CAPTURE}, session=self.sid)
        self.url = self.base + page.name

    def js(self, expr, timeout=30, gesture=False):
        r = self.cdp.send("Runtime.evaluate", {"expression": expr, "returnByValue": True, "awaitPromise": True, "userGesture": gesture}, session=self.sid, timeout=timeout)
        if r.get("exceptionDetails"):
            raise RuntimeError(((r["exceptionDetails"].get("exception") or {}).get("description") or "script error").split("\n")[0][:160])
        return (r.get("result") or {}).get("value")

    def load(self):
        self.cdp.send("Page.navigate", {"url": self.url}, session=self.sid)
        end = time.time() + 20
        while time.time() < end and not any(e.get("method") == "Page.loadEventFired" for e in self.cdp.events):
            self.cdp.pump(0.25)
        return self.js("!!window.__olaListen")

    def wait(self, s):
        self.cdp.pump(s)

    def click(self, sel_or_id, label):
        q = f'[data-ola-i="{sel_or_id}"]' if str(sel_or_id).isdigit() else sel_or_id
        box = self.js(f"""(() => {{ const e = document.querySelector({json.dumps(q)}); if (!e) return null; e.scrollIntoView({{block: 'center'}});
            const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2] }})()""")
        self.js(f"window.__olaListen.gesture({json.dumps(label)})")
        if not box:
            return False
        x, y = box
        for t in ("mousePressed", "mouseReleased"):
            self.cdp.send("Input.dispatchMouseEvent", {"type": t, "x": x, "y": y, "button": "left", "clickCount": 1}, session=self.sid)
        return True

    def errors(self):
        out = []
        for e in self.cdp.events:
            if e.get("method") == "Runtime.exceptionThrown":
                d = e.get("params", {}).get("exceptionDetails", {})
                out.append(((d.get("exception") or {}).get("description") or d.get("text") or "error").split("\n")[0][:160])
        return out

    def close(self):
        try:
            self.cdp.close()
        finally:
            self.srv.shutdown()
            shutil.rmtree(self.profile, ignore_errors=True)


def live(s):
    try:
        return int(s.js(LIVE))
    except Exception:
        return 0


def settle(s, first=2.2, longest=12.0):
    """Wait for what a click started: at least `first` seconds, longer while sounds are still going
    (a melody, a loop), at most `longest`. Returns True when something still plays at the end (a loop)."""
    s.wait(first)
    waited = first
    while waited < longest and live(s) > 0:
        s.wait(1.0)
        waited += 1.0
    return live(s) > 0


def play_like_a_visitor(s, steps):
    """The default walk. Returns notes on what was pressed, for the mute check.

    First a probe: press one ordinary button. If it made a sound, sound is on already: press the rest,
    then the sound switch (off), then the probe button again (it must be silent). If it made none,
    press the sound switch first (on), then the buttons, then the switch (off) and a button again."""
    plan = {"sound_control": None, "pressed": [], "after_off": None}
    s.wait(2.0)
    controls = json.loads(s.js(CONTROLS) or "[]")
    sc = [c for c in controls if c["sound"]]
    done = {c["id"] for c in sc}

    def press(c, label=None):
        s.js(FILL)
        before = s.js("window.__olaListen.sources.length")
        s.click(c["id"], label or c["name"] or "button")
        still = settle(s)
        made = s.js("window.__olaListen.sources.length") > before
        plan["pressed"].append({"name": c["name"], "id": c["id"], "made_sources": made, "still_playing": still})
        return made

    def next_button():
        cs = json.loads(s.js(CONTROLS) or "[]")
        return next((c for c in cs if c["id"] not in done and not c["sound"]), None)

    probe = next_button() if sc else None
    on_already = False
    if probe:
        done.add(probe["id"])
        on_already = press(probe)
    if sc:
        plan["sound_control"] = sc[0]["name"]
        if not on_already:
            s.click(sc[0]["id"], f"sound on: {sc[0]['name']}")
            plan["sound_on_still_playing"] = settle(s)
            if probe and any(c["id"] == probe["id"] for c in json.loads(s.js(CONTROLS) or "[]")):
                press(probe)  # the probe again, now that sound is on
    for _ in range(8):
        nxt = next_button()
        if not nxt:
            break
        done.add(nxt["id"])
        press(nxt)
    looper = next((p for p in plan["pressed"] if p.get("still_playing")), None)
    if not sc and looper:
        # no sound switch, but a button started music that keeps going: press it again, as a person would
        plan["sound_control"] = looper["name"]
        plan["switch_is_the_play_button"] = True
        s.click(looper["id"], f"sound off: {looper['name']}")
        s.wait(2.2)
    if sc:
        controls = json.loads(s.js(CONTROLS) or "[]")
        again = next((c for c in controls if c["id"] == sc[0]["id"]), None) or next((c for c in controls if c["sound"]), None)
        if again:
            s.click(again["id"], f"sound off: {again['name']}")
            s.wait(2.2)
        maker = next((p for p in plan["pressed"] if p["made_sources"]), None)
        if maker:
            controls = json.loads(s.js(CONTROLS) or "[]")
            if any(c["id"] == maker["id"] for c in controls):
                plan["after_off"] = maker["name"]
                s.click(maker["id"], f"after sound off: {maker['name']}")
                s.wait(1.6)
    return plan


def follow(s, steps):
    plan = {"sound_control": None, "pressed": [], "after_off": None, "scripted": True}
    for st in steps:
        k, _, v = st.partition(":")
        if k == "wait":
            s.wait(float(v or 1))
        elif k == "fill":
            s.js(FILL)
        elif k == "click":
            name = s.js(f"(() => {{ const e = document.querySelector({json.dumps(v)}); return e ? (e.getAttribute('aria-label') || e.innerText || e.value || {json.dumps(v)}).trim().slice(0, 40) : null }})()")
            label = v if name is None else name
            if not s.click(v, label):
                plan.setdefault("missing", []).append(v)
            plan["pressed"].append({"name": label, "selector": v})
        elif k == "switch":
            cs = json.loads(s.js(CONTROLS) or "[]")
            sc = next((c for c in cs if c["sound"]), None)
            plan["sound_control"] = sc["name"] if sc else None
            if sc:
                s.click(sc["id"], f"sound switch: {sc['name']}")
                s.wait(float(v or 1.5))
        elif k == "js":
            s.js(f"window.__olaListen.gesture({json.dumps(v[:40])})")
            try:
                s.js(v, gesture=True)
            except RuntimeError as e:
                plan.setdefault("errors", []).append(str(e))
        else:
            raise SystemExit(f"listen.py: unknown step {st!r} (use click:, wait:, fill, switch, js:)")
    s.wait(0.3)
    return plan


# ------------------------------------------------------------------ the music in the notes

NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]
MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
SCALE = {"major": [0, 2, 4, 5, 7, 9, 11], "minor": [0, 2, 3, 5, 7, 8, 10, 11]}  # minor allows the raised 7th
TRIAD = {"major": [0, 4, 7], "minor": [0, 3, 7]}


def corr(a, b):
    ma, mb = sum(a) / 12, sum(b) / 12
    num = sum((x - ma) * (y - mb) for x, y in zip(a, b))
    den = math.sqrt(sum((x - ma) ** 2 for x in a) * sum((y - mb) ** 2 for y in b))
    return num / den if den else 0


def pitched_events(notes, t0=None, t1=None):
    """Oscillator notes grouped into events (sounding together within 25 ms), drums and LFOs left out."""
    ns = []
    for n in notes:
        f = n.get("freq") or 0
        if n.get("kind") != "OscillatorNode" or n.get("sweep") or not 40 <= f <= 5000:
            continue
        if t0 is not None and not (t0 <= n["at"] < t1):
            continue
        midi = 69 + 12 * math.log2(f / 440) + (n.get("detune") or 0) / 100
        if abs(midi - round(midi)) > 0.3:
            continue  # an inharmonic partial (a bell's or marimba's overtone), not a note
        dur = (n["stop"] - n["at"]) if n.get("stop") else 1.0
        ns.append((n["at"], round(midi), max(0.02, min(dur, 4.0))))
    ns.sort()
    ev = []
    for at, m, d in ns:
        if ev and at - ev[-1]["at"] < 0.025:
            ev[-1]["pitches"].add(m)
            ev[-1]["dur"] = max(ev[-1]["dur"], d)
            ev[-1]["durs"].append(d)
        else:
            ev.append({"at": at, "pitches": {m}, "dur": d, "durs": [d]})
    return ev


def music_of(ev):
    """Key, how much stays in it, the top line and its shape. Needs about six events."""
    w = [0.0] * 12
    for e in ev:
        for m in e["pitches"]:
            w[m % 12] += min(e["dur"], 2.0)
    best = max(((corr([w[(j + i) % 12] for j in range(12)], prof), i, mode)
                for i in range(12) for mode, prof in (("major", MAJOR), ("minor", MINOR))), key=lambda x: x[0])
    _, tonic, mode = best
    tot = sum(w) or 1
    inkey = sum(w[(tonic + s) % 12] for s in SCALE[mode]) / tot
    chords = sum(1 for e in ev if len(e["pitches"]) >= 3)
    top = [max(e["pitches"]) for e in ev]
    iv = [b - a for a, b in zip(top, top[1:])]
    run, longest = 1, 1
    for a, b in zip(top, top[1:]):
        run = run + 1 if a == b else 1
        longest = max(longest, run)
    # a figure that comes back: the best match of the interval sequence with itself, shifted by k notes
    # (bar two answering bar one scores high; a random walk matches only by chance, about 0.2)
    motif = 0.0
    for k in range(2, len(iv) // 2 + 1):
        pairs = [(iv[i], iv[i + k]) for i in range(len(iv) - k)]
        if len(pairs) >= 4:
            motif = max(motif, sum(1 for x, y in pairs if x == y) / len(pairs))
    ioi = [b2["at"] - a2["at"] for a2, b2 in zip(ev, ev[1:])]
    same_length = len(ioi) >= 6 and (max(ioi) - min(ioi)) <= 0.15 * (sum(ioi) / len(ioi))
    steps = sum(1 for x in iv if 1 <= abs(x) <= 2) / len(iv) if iv else 0
    pcs = {m % 12 for m in top}
    penta = any(pcs <= {(r + s) % 12 for s in (0, 2, 4, 7, 9)} for r in range(12))
    last = ev[-1]
    durs = sorted(e["dur"] for e in ev)
    return {"key": f"{NAMES[tonic]} {mode}", "tonic": tonic, "mode": mode, "in_key": round(inkey, 3), "events": len(ev), "chords": chords,
            "top_line": [NAMES[m % 12] + str(m // 12 - 1) for m in top[:48]], "longest_same_note_run": longest, "motif_share": round(motif, 2), "same_length": same_length,
            "step_share": round(steps, 2), "pentatonic_only": penta and len(pcs) >= 3, "range_semitones": (max(top) - min(top)) if top else 0,
            "last_pitch_class": NAMES[max(last["pitches"]) % 12], "ends_on_tonic": max(last["pitches"]) % 12 == tonic,
            "ends_on_tonic_chord": all(((p - tonic) % 12) in TRIAD[mode] for p in last["pitches"]),
            "last_is_long": last["dur"] >= durs[len(durs) // 2]}


# ------------------------------------------------------------------ the verdict

def judge(r, plan, page_text):
    """Plain lines: (level, text). Levels: fail, warn, ok."""
    out = []
    add = lambda lvl, txt: out.append((lvl, txt))
    segs = r["segments"]
    pre = segs[0] if segs else {"silent": True}
    early = [n for n in r["notes"] if n["clicks"] == 0] + [m for m in r["media"] if m["clicks"] == 0]
    if not pre.get("silent") or early:
        add("fail", f"sound plays before anyone clicks ({len(early)} sounds started on load, peak {pre.get('peak_dbfs')} dBFS). Browsers block it, and it startles people: start sound only from a click or tap.")
    else:
        add("ok", "nothing plays before a click")
    stuck = [c for c in r["contexts"] if c["before_click"] and not c["resumed_after_click"]]
    if stuck:
        add("fail", "the sound system is made when the page opens and never resumed after a click: phones and Safari keep it silent. Make it, or call resume() on it, inside the click handler (OlaSound does this).")
    n = len(r["contexts"])
    if n > 3:
        add("fail", f"a new sound system is made {n} times (one per sound). Browsers allow only a few, then go silent: make one AudioContext and reuse it.")
    elif n > 1:
        add("warn", f"{n} sound systems (AudioContext) are made; one, reused, is enough.")
    heard = [s for s in segs[1:] if not s.get("silent")]
    if not heard:
        add("fail", "nothing made a sound after the clicks" + (f" (pressed: {', '.join(p['name'] for p in plan['pressed'][:6])})" if plan.get("pressed") else " (no buttons were found)"))
    music = [s for s in heard if (s.get("sound_length") or 0) > 2.8]
    ui = [s for s in heard if s not in music and not s["label"].startswith(("sound off", "after sound off"))]
    looping = plan.get("sound_on_still_playing") or any(p.get("still_playing") for p in plan.get("pressed", []))
    for s in ui:
        name = f"\"{s['label']}\""
        p, hf, att = s.get("peak_dbfs"), s.get("hf") or 0, s.get("attack_ms") or 0
        if s.get("clipped_samples"):
            add("fail", f"{name} clips ({s['clipped_samples']} samples at full scale): turn it down.")
        if p > -10:
            add("fail", f"{name} is too loud for an interface sound: peak {p} dBFS. Keep interface sounds near -18 dBFS, never above -12.")
        elif p > -14:
            add("warn", f"{name} is on the loud side: peak {p} dBFS (aim for about -18).")
        if hf > 0.12:
            add("fail", f"{name} is harsh: {round(hf * 100)}% of its energy is above 5 kHz. Use sine or triangle voices and a lowpass near 3 to 4 kHz; no square or sawtooth for interface sounds.")
        elif hf > 0.05:
            add("warn", f"{name} is bright: {round(hf * 100)}% of its energy above 5 kHz (under 5% sounds soft).")
        if att < 1.0:
            add("fail", f"{name} starts with a click (it reaches full level in {att} ms). Ramp it up over 3 to 10 ms.")
        elif att < 2.0:
            add("warn", f"{name} starts sharply ({att} ms); 3 to 10 ms is softer.")
        if s.get("ends_abruptly"):
            add("fail", f"{name} is cut off instead of fading out (a click at the end). Let it decay (an exponential ramp to 0.001) before you stop it.")
        if s.get("jumps"):
            add("fail", f"{name} has hard edges in its waveform ({s['jumps']} sudden jumps): a square wave, or a sound switched on or off at full level.")
        if abs(s.get("dc") or 0) > 0.01:
            add("fail", f"{name} has a DC offset ({s['dc']}): it pushes the speaker off center.")
        if (s.get("sound_length") or 0) > 2.6:
            add("warn", f"{name} lasts {s['sound_length']} s; interface sounds are best under a second, a celebration under 2.5 s.")
        ok_bits = [f"peak {p} dBFS", f"{round(hf * 100, 1)}% above 5 kHz", f"attack {att} ms", f"{s.get('sound_length')} s"]
        if not any(t.startswith(name) for _, t in out if _ != "ok"):
            add("ok", f"{name}: " + ", ".join(ok_bits))
    for s in music:
        name = f"the music after \"{s['label']}\""
        p, rms, hf = s.get("peak_dbfs"), s.get("rms_dbfs") or -99, s.get("hf") or 0
        if s.get("clipped_samples"):
            add("fail", f"{name} clips ({s['clipped_samples']} samples at full scale): lower the master gain.")
        if p > -1:
            add("fail", f"{name} peaks at {p} dBFS: leave headroom (peak -3 dBFS or lower).")
        if rms > -14:
            add("fail", f"{name} is too loud for a page: {rms} dBFS RMS. A background bed sits near -24 dBFS, a melody near -18.")
        elif rms > -17:
            add("warn", f"{name} is loud for a page ({rms} dBFS RMS).")
        elif rms < -42:
            add("warn", f"{name} is very quiet ({rms} dBFS RMS); people may not hear it.")
        if hf > 0.15:
            add("fail", f"{name} is harsh: {round(hf * 100)}% of its energy above 5 kHz. Darken it: lowpass the voices, no raw square or sawtooth leads.")
        elif hf > 0.08:
            add("warn", f"{name} is bright ({round(hf * 100)}% above 5 kHz); a calm bed stays under 5%.")
        if abs(s.get("dc") or 0) > 0.01:
            add("fail", f"{name} has a DC offset ({s['dc']}).")
        if not any(t.startswith(name) for _, t in out if _ != "ok"):
            add("ok", f"{name}: {rms} dBFS RMS, peak {p} dBFS, {round(hf * 100, 1)}% above 5 kHz")
    if len(ui) >= 2:
        peaks = [s["peak_dbfs"] for s in ui]
        cents = [s.get("centroid") or 1 for s in ui]
        if max(peaks) - min(peaks) > 9:
            add("warn", f"the interface sounds' levels differ by {round(max(peaks) - min(peaks), 1)} dB; keep them within about 6 dB of each other.")
        if max(cents) / max(1, min(cents)) > 3.5:
            add("warn", "the interface sounds do not sound like one family (very different brightness); use one voice at different pitches.")
    # the mute switch
    off = next((s for s in segs if s["label"].startswith("sound off")), None)
    after = next((s for s in segs if s["label"].startswith("after sound off")), None)
    if plan.get("scripted"):
        pass
    elif plan.get("sound_control") is None and not any(c.get("sound") for c in r.get("controls", [])):
        if looping:
            add("fail", "the music cannot be turned off: add a clearly labeled sound on/off button.")
        elif heard:
            add("warn", "there is no sound on/off switch; add one (people listen in shared rooms).")
    else:
        if music and off is not None:
            if (off.get("tail_rms_dbfs") or -180) > -50:
                add("fail", f"pressing \"{plan['sound_control']}\" again did not stop the music.")
            else:
                add("ok", f"\"{plan['sound_control']}\" turns the music off")
        if after is not None:
            if not after.get("silent"):
                add("fail", f"after turning sound off, \"{plan['after_off']}\" still makes a sound.")
            else:
                add("ok", "with sound off, the buttons are silent")
    if heard and not re.search(r"prefers-reduced-motion|OlaSound", page_text):
        add("warn", "the page ignores the person's reduced-motion setting; start with sound off when it is on (OlaSound does this).")
    # the notes
    for s in music + [x for x in ui if (x.get("sound_length") or 0) > 0.8]:
        ev = pitched_events(r["notes"], s["start"], s["end"])
        if len(ev) < 6:
            continue
        m = music_of(ev)
        s["music"] = m
        name = f"the notes after \"{s['label']}\""
        if m["in_key"] < 0.85:
            add("fail", f"{name} wander out of key: only {round(m['in_key'] * 100)}% are in {m['key']}. Keep to one key's scale.")
        elif m["in_key"] < 0.95:
            add("warn", f"{name}: {round(m['in_key'] * 100)}% in {m['key']}.")
        tune = m["chords"] < len(ev) / 2
        if tune and len(ev) >= 8 and m["same_length"] and m["motif_share"] < 0.4:
            if m["pentatonic_only"]:
                add("fail", f"{name} sound like a pentatonic random walk ({' '.join(m['top_line'][:10])} ...): every note the same length, no figure that comes back. It noodles. Write a short motif of three or four notes with long and short notes, repeat it with one change, then answer it and land on the home note.")
            else:
                add("fail", f"{name} read as random ({' '.join(m['top_line'][:10])} ...): every note the same length and no figure that comes back. Write a motif with a rhythm and bring it back.")
        elif tune and len(ev) >= 8 and m["same_length"]:
            add("warn", f"{name} are all the same length; long and short notes make a tune.")
        elif tune and len(ev) >= 10 and m["motif_share"] < 0.2:
            add("warn", f"{name} never repeat a figure; a tune people remember brings its first idea back.")
        if m["longest_same_note_run"] > 4 and m["chords"] < len(ev) / 2:
            add("warn", f"{name} hit the same note {m['longest_same_note_run']} times in a row.")
        if m["range_semitones"] > 24:
            add("warn", f"{name} span {m['range_semitones']} semitones; a tune people can hum stays within about an octave and a half.")
        if not s.get("continues") and m["chords"] < len(ev) / 2:
            if not m["ends_on_tonic_chord"]:
                add("fail", f"{name} do not resolve: the phrase ends on {m['last_pitch_class']} in {m['key']}. End on the home note ({m['key'].split()[0]}) or its chord, held longer.")
            elif not m["ends_on_tonic"] or not m["last_is_long"]:
                add("warn", f"{name} end on {m['last_pitch_class']}; ending on {m['key'].split()[0]}, held, sounds finished.")
        if not any(t.startswith(name) for lvl, t in out if lvl != "ok"):
            add("ok", f"{name}: {m['events']} notes in {m['key']} ({round(m['in_key'] * 100)}% in key), figure repeats {round(m['motif_share'] * 100)}%")
    for w in r.get("warnings", []):
        if w.startswith("render_failed"):
            add("warn", f"one sound system could not be rendered ({w}).")
        elif w == "audio_file_not_decoded":
            add("warn", "an audio file could not be read; make sounds in code (OlaSound) instead of files.")
    return out


def main():
    ap = argparse.ArgumentParser(prog="listen.py", description="Hear a page's sounds and say what to fix.")
    ap.add_argument("page")
    ap.add_argument("--out", default="sound-check")
    ap.add_argument("--do", action="append", default=[], help="click:<selector>, wait:<seconds>, fill, js:<expression>")
    ap.add_argument("--json")
    ap.add_argument("--probe", help="a JavaScript expression to evaluate at the end (its value goes in report.json as probe)")
    ap.add_argument("--width", type=int, default=390)
    ap.add_argument("--no-clips", action="store_true")
    a = ap.parse_args()
    page = Path(a.page).resolve()
    if not page.is_file():
        print(f"listen.py: no such page: {a.page}", file=sys.stderr)
        return 2
    binary = chromium()
    if not binary:
        print("listen.py: the page renderer is not installed here, so the sounds cannot be checked", file=sys.stderr)
        return 1
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob("*.wav"):
        old.unlink()
    import signal

    def overdue(*_):
        raise TimeoutError("listening took longer than 150 s")
    signal.signal(signal.SIGALRM, overdue)
    signal.alarm(int(os.environ.get("OLA_LISTEN_DEADLINE_S", "150")))
    s = None
    try:
        t0 = time.time()
        s = Session(binary, page, a.width)
        dbg = os.environ.get("OLA_LISTEN_DEBUG")
        if not s.load():
            print("listen.py: the page did not load (or has no sound support)", file=sys.stderr)
            return 1
        if dbg: print(f"loaded {time.time() - t0:.1f}s", file=sys.stderr)
        plan = follow(s, a.do) if a.do else play_like_a_visitor(s, a.do)
        if dbg: print(f"played {time.time() - t0:.1f}s", file=sys.stderr)
        probe = None
        if a.probe:
            try:
                probe = s.js(a.probe)
            except RuntimeError as e:
                probe = f"error: {e}"
        raw = s.js("window.__olaListen.finish(%s)" % json.dumps({"clips": not a.no_clips}), timeout=120)
        r = json.loads(raw)
        r["script_errors"] = s.errors()[:10]
        r["probe"] = probe
        r["controls"] = json.loads(s.js(CONTROLS) or "[]")
        if dbg: print(f"rendered {time.time() - t0:.1f}s", file=sys.stderr)
    except Exception as e:
        print(f"listen.py: could not listen to the page ({type(e).__name__}: {str(e)[:160]})", file=sys.stderr)
        return 1
    finally:
        signal.alarm(0)
        if s:
            s.close()
    # files
    (out / "everything.wav").write_bytes(base64.b64decode(r.pop("wav") or ""))
    if r.get("spectrogram"):
        (out / "spectrogram.png").write_bytes(base64.b64decode(r.pop("spectrogram").split(",", 1)[1]))
    clips = r.pop("clips", []) or []
    for i, (seg, c) in enumerate(zip(r["segments"], clips)):
        if c:
            slug = re.sub(r"[^a-z0-9]+", "-", seg["label"].lower()).strip("-")[:40] or "sound"
            f = out / f"{i:02d}-{slug}.wav"
            f.write_bytes(base64.b64decode(c))
            seg["clip"] = str(f)
    for seg in r["segments"]:
        seg["tail_rms_dbfs"] = tail_rms(seg.get("clip"))
    page_text = " ".join(p.read_text(errors="ignore") for p in page.parent.glob("*") if p.suffix in (".html", ".js", ".mjs") and p.stat().st_size < 2_000_000)
    lines = judge(r, plan, page_text)
    r["plan"] = plan
    r["lines"] = [{"level": l, "text": t} for l, t in lines]
    r["problems"] = sum(1 for l, _ in lines if l == "fail")
    for n in r["notes"]:
        n.pop("ctx", None)
    rep = Path(a.json) if a.json else out / "report.json"
    r["notes"] = r["notes"][:1500]
    rep.write_text(json.dumps(r, indent=1))
    print(f"Listened to {a.page} for {r['seconds']} s: {len(r['clicks'])} clicks, {len(r['notes'])} sounds started. Files in {out}/ (spectrogram.png, everything.wav, one clip per sound).")
    for lvl in ("fail", "warn", "ok"):
        for l, t in lines:
            if l == lvl:
                print(f"  [{l}] {t}")
    for e in r["script_errors"][:3]:
        print(f"  [warn] script error: {e}")
    print(f"Result: {r['problems']} to fix." if r["problems"] else "Result: nothing to fix.")
    return 0


def tail_rms(path):
    """RMS (dBFS) of the last 0.8 s of a 16-bit stereo clip, or None."""
    if not path or not Path(path).is_file():
        return None
    import array
    b = Path(path).read_bytes()[44:]
    a = array.array("h")
    a.frombytes(b[: len(b) - len(b) % 2])
    n = min(len(a), int(44100 * 0.8) * 2)
    if n <= 0:
        return None
    seg = a[-n:]
    e = sum(x * x for x in seg) / n
    return round(10 * math.log10(e / (32768 ** 2) + 1e-18), 1)


if __name__ == "__main__":
    sys.exit(main())
