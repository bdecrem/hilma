"""Step 9, part 4: a small web page to talk to the SFT model.

Type a question, get the SFT model's answer; tick "base" to also see what the
pretrained model does with the same text. Every question is a fresh
conversation, because the model was only trained on single question-and-answer
pairs. Temperature and top-k are on the page.

Run:  .venv/bin/python 09-sft/chat.py            (http://localhost:3270)
      .venv/bin/python 09-sft/chat.py --port 3271 --ckpt out/sft-lr3e-4/final.pt
"""

import argparse
import json
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import torch

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(ROOT, "02-tokenizer"))
from ask import continue_text  # noqa: E402
from bpe import Tokenizer  # noqa: E402
from sft import BASE, OUT, TOK, Chat, answer, load_sft  # noqa: E402

PAGE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>smallgpt chat</title>
<style>
  :root { --paper: #f7efdf; --ink: #16121c; --dim: #6b6358; --line: #ddd2bd; --red: #ff4b1f; --blue: #3d3bff; }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: var(--paper); color: var(--ink); }
  body { font: 16px/1.5 ui-monospace, "SF Mono", Menlo, monospace; min-height: 100dvh; display: flex; flex-direction: column; }
  header { padding: 16px 16px 8px; max-width: 760px; width: 100%; margin: 0 auto; }
  h1 { font-size: 18px; margin: 0; }
  header p { margin: 4px 0 0; color: var(--dim); font-size: 13px; }
  main { flex: 1; max-width: 760px; width: 100%; margin: 0 auto; padding: 8px 16px; }
  .turn { border-top: 1px solid var(--line); padding: 14px 0; }
  .q { font-weight: 700; }
  .a { margin-top: 6px; white-space: pre-wrap; }
  .a.base { color: var(--dim); }
  .tag { display: inline-block; font-size: 11px; padding: 0 6px; border-radius: 3px; margin-right: 6px; color: var(--paper); background: var(--blue); vertical-align: 1px; }
  .base .tag { background: var(--dim); }
  .wait { color: var(--dim); }
  form { position: sticky; bottom: 0; background: var(--paper); border-top: 1px solid var(--line);
         padding: 12px 16px calc(12px + env(safe-area-inset-bottom)); }
  .row { max-width: 728px; margin: 0 auto; display: flex; gap: 8px; }
  input[type=text] { flex: 1; min-width: 0; font: inherit; padding: 10px 12px; border: 1.5px solid var(--ink); border-radius: 6px; background: #fffaf0; color: var(--ink); }
  button { font: inherit; font-weight: 700; padding: 10px 16px; border: 0; border-radius: 6px; background: var(--red); color: #fff; cursor: pointer; }
  button:disabled { opacity: .5; }
  .opts { max-width: 728px; margin: 8px auto 0; display: flex; flex-wrap: wrap; gap: 6px 18px; font-size: 13px; color: var(--dim); }
  .opts label { display: flex; align-items: center; gap: 6px; }
  .opts input[type=range] { width: 90px; }
  .empty { color: var(--dim); padding: 24px 0; }
  .empty a { color: var(--blue); cursor: pointer; text-decoration: underline; }
</style></head>
<body>
<header>
  <h1>smallgpt · step 9</h1>
  <p>10M parameters, pretrained on Usenet 1981–1991, then SFT on 2,945 computing Q&amp;A pairs. Each question is a new conversation.</p>
</header>
<main id="log"><div class="empty" id="empty">Try:
<a>How do I quit vi?</a> · <a>Is a 2400 baud modem worth it?</a> · <a>What is a SIMM?</a> · <a>Should I buy an Amiga or an Atari ST?</a></div></main>
<form id="f">
  <div class="row"><input id="q" type="text" placeholder="Ask something from 1985–1991…" autocomplete="off" autofocus><button id="go">Ask</button></div>
  <div class="opts">
    <label><input id="base" type="checkbox"> also ask the base model</label>
    <label>temperature <input id="t" type="range" min="0.1" max="1.5" step="0.1" value="0.7"><span id="tv">0.7</span></label>
    <label>top-k <input id="k" type="range" min="1" max="200" step="1" value="40"><span id="kv">40</span></label>
  </div>
</form>
<script>
const $ = id => document.getElementById(id);
const esc = s => s.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
$('t').oninput = () => $('tv').textContent = $('t').value;
$('k').oninput = () => $('kv').textContent = $('k').value;
document.querySelectorAll('.empty a').forEach(a => a.onclick = () => { $('q').value = a.textContent; ask(); });
$('f').onsubmit = e => { e.preventDefault(); ask(); };
async function ask() {
  const q = $('q').value.trim();
  if (!q) return;
  $('empty')?.remove();
  const turn = document.createElement('div');
  turn.className = 'turn';
  turn.innerHTML = `<div class="q">${esc(q)}</div><div class="a wait">thinking…</div>`;
  $('log').appendChild(turn);
  turn.scrollIntoView({ block: 'end' });
  $('q').value = ''; $('go').disabled = true;
  try {
    const r = await fetch('ask', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ q, base: $('base').checked, temperature: +$('t').value, top_k: +$('k').value }) });
    const d = await r.json();
    let html = `<div class="a"><span class="tag">sft</span>${esc(d.sft)}</div>`;
    if (d.base !== undefined) html += `<div class="a base"><span class="tag">base</span>${esc(d.base)}</div>`;
    turn.querySelector('.wait').outerHTML = html;
  } catch (e) {
    turn.querySelector('.wait').textContent = 'error: ' + e;
  }
  $('go').disabled = false; $('q').focus();
  turn.scrollIntoView({ block: 'end' });
}
</script>
</body></html>
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=3270)
    ap.add_argument("--ckpt", default=os.path.join(OUT, "final.pt"))
    args = ap.parse_args()

    tok = Tokenizer.load(TOK)
    chat = Chat(tok)
    sft, base = load_sft(args.ckpt), load_sft(BASE)
    lock = threading.Lock()   # one generation at a time

    class Handler(BaseHTTPRequestHandler):
        def send(self, code, body, ctype):
            data = body.encode()
            self.send_response(code)
            self.send_header("content-type", ctype)
            self.send_header("content-length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            self.send(200, PAGE, "text/html; charset=utf-8")

        def do_POST(self):
            req = json.loads(self.rfile.read(int(self.headers["content-length"])))
            q = req["q"].strip()[:500]
            t = min(max(float(req.get("temperature", 0.7)), 0.05), 2.0)
            k = min(max(int(req.get("top_k", 40)), 1), 8192)
            with lock:
                out = {"sft": answer(sft, chat, q, temperature=t, top_k=k)}
                if req.get("base"):
                    out["base"] = continue_text(base, tok, q + "\n", temperature=t, top_k=k).replace("\n", " / ")
            self.send(200, json.dumps(out), "application/json")

        def log_message(self, fmt, *a):
            pass

    print(f"http://localhost:{args.port}  ({args.ckpt})", flush=True)
    ThreadingHTTPServer(("", args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
