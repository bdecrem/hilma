"""Python side of bfetch.mjs: one headless Chrome shared by all finder threads."""
import base64, json, os, subprocess, threading, itertools

_proc = None; _lock = threading.Lock(); _ids = itertools.count(1); _waiting = {}


def _start():
    global _proc
    here = os.path.dirname(os.path.abspath(__file__))
    _proc = subprocess.Popen(["node", os.path.join(here, "bfetch.mjs")], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                             stderr=open(os.path.join(here, "bfetch.err"), "ab"), text=True, bufsize=1, cwd=here)
    threading.Thread(target=_reader, daemon=True).start()


def _reader():
    for line in _proc.stdout:
        try: r = json.loads(line)
        except Exception: continue
        ev = _waiting.get(r.get("id"))
        if ev: ev[1] = r; ev[0].set()


def browser_fetch(url, timeout=150):
    """Returns (final_url, fmt, data_bytes, text, pdf_links). Raises on a worker error."""
    with _lock:
        if _proc is None or _proc.poll() is not None: _start()
        i = next(_ids); ev = [threading.Event(), None]; _waiting[i] = ev
        _proc.stdin.write(json.dumps({"id": i, "url": url}) + "\n"); _proc.stdin.flush()
    if not ev[0].wait(timeout):
        _waiting.pop(i, None); raise TimeoutError("browser fetch timed out")
    r = _waiting.pop(i); r = r[1]
    if r.get("error"): raise RuntimeError("browser: " + r["error"])
    if r["format"] == "pdf":
        return r["final"], "pdf", base64.b64decode(r["data"]), "", r.get("pdf_links", [])
    return r["final"], "html", r["text"].encode(), r["text"], r.get("pdf_links", [])


def stop():
    if _proc and _proc.poll() is None:
        try: _proc.stdin.write(json.dumps({"quit": True}) + "\n"); _proc.stdin.flush()
        except Exception: pass
