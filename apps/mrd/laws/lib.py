"""Shared helpers for the law crawl: env, Supabase REST, Claude, Brave search."""
import json, os, sys, time, urllib.request, urllib.parse, urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def load_env():
    for path in (os.path.join(ROOT, ".env"), os.path.join(ROOT, "..", "..", ".env.local")):
        if not os.path.exists(path):
            continue
        for line in open(path):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


load_env()
SB_URL = os.environ["MRD_SUPABASE_URL"]
SB_KEY = os.environ["MRD_SUPABASE_SERVICE_KEY"]


def http(method, url, body=None, headers=None, timeout=120, raw=False):
    data = None if body is None else (body if isinstance(body, bytes) else json.dumps(body).replace("\\u0000", "").encode())  # Postgres text rejects NUL
    req = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        out = r.read()
        return out if raw else (json.loads(out) if out else None)


def sb(method, path, body=None, prefer=None, params=None):
    h = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}", "Content-Type": "application/json"}
    if prefer:
        h["Prefer"] = prefer
    url = f"{SB_URL}/rest/v1/{path}"
    if params:
        url += ("&" if "?" in url else "?") + urllib.parse.urlencode(params)
    for attempt in range(4):
        try:
            return http(method, url, body, h)
        except urllib.error.HTTPError as e:
            msg = e.read().decode()[:500]
            if e.code < 500:
                raise SystemExit(f"supabase {method} {path}: {e.code} {msg}")
        except Exception as e:
            msg = str(e)
        time.sleep(2 * (attempt + 1))
    raise SystemExit(f"supabase {method} {path} failed: {msg}")


def sb_all(path, page=1000):
    rows, start = [], 0
    while True:
        h = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}", "Range": f"{start}-{start + page - 1}"}
        chunk = http("GET", f"{SB_URL}/rest/v1/{path}", headers=h)
        rows += chunk
        if len(chunk) < page:
            return rows
        start += page


def upload(path, data, content_type):
    h = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}", "Content-Type": content_type, "x-upsert": "true"}
    return http("POST", f"{SB_URL}/storage/v1/object/sources/{urllib.parse.quote(path)}", data, h, timeout=300)


# ---- Claude (Haiku 5.5 by default; cost tracked per run) ----
PRICES = {"claude-haiku-5-5": (1.0, 5.0), "claude-sonnet-5-5": (3.0, 15.0)}  # $/M in, out
USAGE = {"in": 0, "out": 0, "cost": 0.0, "calls": 0}


def claude(system, user, model="claude-haiku-5-5", max_tokens=4000, schema=None):
    body = {"model": model, "max_tokens": max_tokens, "system": system,
            "messages": [{"role": "user", "content": user}],
            "output_config": {"effort": "low"}}
    if system is None:
        del body["system"]
    if schema:
        body["output_config"]["format"] = {"type": "json_schema", "schema": schema}
    h = {"x-api-key": os.environ["ANTHROPIC_API_KEY"], "anthropic-version": "2023-06-01",
         "content-type": "application/json"}
    for attempt in range(5):
        try:
            r = http("POST", "https://api.anthropic.com/v1/messages", body, h, timeout=180)
            break
        except urllib.error.HTTPError as e:
            msg = e.read().decode()[:400]
            if e.code in (429, 500, 502, 503, 529):
                time.sleep(5 * (attempt + 1)); continue
            raise RuntimeError(f"claude {e.code}: {msg}")
        except Exception as e:
            msg = str(e); time.sleep(5 * (attempt + 1))
    else:
        raise RuntimeError(f"claude failed: {msg}")
    u = r.get("usage", {})
    pin, pout = PRICES.get(model, (3.0, 15.0))
    USAGE["in"] += u.get("input_tokens", 0); USAGE["out"] += u.get("output_tokens", 0); USAGE["calls"] += 1
    USAGE["cost"] += u.get("input_tokens", 0) / 1e6 * pin + u.get("output_tokens", 0) / 1e6 * pout
    if r.get("stop_reason") not in ("end_turn", "stop_sequence"):
        raise RuntimeError(f"claude stop_reason {r.get('stop_reason')}")
    text = "".join(b.get("text", "") for b in r["content"] if b.get("type") == "text")
    return json.loads(text) if schema else text


# ---- Brave web search ----
SEARCHES = {"n": 0}


def search(q, count=8):
    url = "https://api.search.brave.com/res/v1/web/search?" + urllib.parse.urlencode({"q": q, "count": count})
    h = {"X-Subscription-Token": os.environ["BRAVE_API_KEY"], "Accept": "application/json"}
    for attempt in range(4):
        try:
            d = http("GET", url, headers=h, timeout=30)
            SEARCHES["n"] += 1
            return [{"url": r["url"], "title": r.get("title", ""), "snippet": r.get("description", "")}
                    for r in d.get("web", {}).get("results", [])]
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(2 * (attempt + 1)); continue
            raise
    return []


# ---- progress heartbeat for the dashboard (ola.cx/mrd) ----
_last_beat = {"t": 0}


def beat(step, done, total, status="running", note=None, force=False, base=None):
    """Upsert this step's row in `runs`. Cost/calls/searches add onto `base` (the
    row as it stood when the process started) so restarts keep the running totals."""
    if not force and time.time() - _last_beat["t"] < 5:
        return
    _last_beat["t"] = time.time()
    b = base or {}
    row = {"step": step, "status": status, "done": done, "total": total,
           "calls": b.get("calls", 0) + USAGE["calls"], "searches": b.get("searches", 0) + SEARCHES["n"],
           "cost_usd": round(float(b.get("cost_usd", 0)) + USAGE["cost"], 4), "note": note,
           "updated_at": "now()"}
    try:
        sb("POST", "runs", [row], prefer="resolution=merge-duplicates")
    except SystemExit as e:
        print("beat failed:", e, file=sys.stderr)


def run_base(step):
    r = sb("GET", "runs", params={"step": f"eq.{step}", "select": "*"})
    return r[0] if r else {}
