#!/usr/bin/env node
// speed.mjs: time one chat request against an OpenAI-style local server (OLA-440).
//   node speed.mjs <prompt file> [--base http://127.0.0.1:8000/v1] [--key-file f] [--model id]
//                  [--effort medium] [--max 12000] [--runs 3] [--fresh] [--label text]
// Prints one JSON line per run: tokens read and written, seconds to the first token, tokens a second
// while writing (written tokens over the time from the first token to the last), and how the reply ended.
// --fresh puts a random line in front of the prompt, so no run is answered from the prompt cache:
// that is what makes "read" (prompt tokens over time to first token) a real reading speed.
import { readFileSync } from 'node:fs';
const a = process.argv.slice(2);
const opt = (n, d) => { const i = a.indexOf('--' + n); return i < 0 ? d : a[i + 1]; };
const file = a[0];
const base = opt('base', 'http://127.0.0.1:8000/v1');
const keyFile = opt('key-file', '');
const key = keyFile ? readFileSync(keyFile, 'utf8').trim() : '';
const effort = opt('effort', '');
const max = +opt('max', 12000);
const runs = +opt('runs', 1);
const fresh = a.includes('--fresh');
const label = opt('label', '');
const headers = { 'content-type': 'application/json', ...(key ? { authorization: 'Bearer ' + key } : {}) };
let model = opt('model', '');
if (!model) {
  const r = await fetch(base + '/models', { headers });
  model = (await r.json()).data[0].id;
}
const text = readFileSync(file, 'utf8');
for (let n = 1; n <= runs; n++) {
  const content = (fresh ? `Run ${Math.random().toString(36).slice(2)} of a timing test.\n\n` : '') + text;
  const body = { model, stream: true, stream_options: { include_usage: true }, max_tokens: max,
    messages: [{ role: 'user', content }], ...(effort ? { reasoning_effort: effort } : {}) };
  const t0 = performance.now();
  const res = await fetch(base + '/chat/completions', { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) { console.log(JSON.stringify({ label, run: n, error: res.status, body: (await res.text()).slice(0, 400) })); continue; }
  let first = 0, last = 0, usage = null, finish = null, think = 0, said = 0, buf = '';
  const dec = new TextDecoder();
  for await (const chunk of res.body) {
    buf += dec.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      const d = line.slice(5).trim();
      if (d === '[DONE]') continue;
      let j; try { j = JSON.parse(d); } catch { continue; }
      if (j.usage) usage = j.usage;
      const c = j.choices?.[0];
      if (!c) continue;
      if (c.finish_reason) finish = c.finish_reason;
      const r = c.delta?.reasoning_content ?? c.delta?.reasoning ?? '';
      const s = c.delta?.content ?? '';
      if (r || s) { const t = performance.now(); if (!first) first = t; last = t; think += r.length; said += s.length; }
    }
  }
  const written = usage?.completion_tokens ?? 0, read = usage?.prompt_tokens ?? 0;
  const ttft = (first - t0) / 1000, gen = (last - first) / 1000;
  console.log(JSON.stringify({ label, run: n, model, effort: effort || 'server default', read, written,
    first_token_s: +ttft.toFixed(2), read_tok_s: fresh ? Math.round(read / ttft) : null,
    write_s: +gen.toFixed(1), write_tok_s: gen > 0 ? +(written / gen).toFixed(1) : null,
    total_s: +((last - t0) / 1000).toFixed(1), finish, thinking_chars: think, answer_chars: said,
    cached: usage?.prompt_tokens_details?.cached_tokens ?? null }));
}
