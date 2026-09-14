// Runs every probe twice against a local Ollama model: once bare, once with
// the constitution as the system prompt. Writes a side-by-side markdown
// report to out/<date>-<model>.md.
//
//   OLLAMA=http://localhost:11435 MODEL=qwen3.5:9b node run.mjs
//
// Point OLLAMA at the mini through an ssh tunnel:
//   ssh -f -N -L 11435:localhost:11434 admin@171.66.240.175

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OLLAMA = process.env.OLLAMA || 'http://localhost:11434';
const MODEL = process.env.MODEL || 'qwen3.5:9b';
const NUM_PREDICT = Number(process.env.NUM_PREDICT || 500);

const constitution = readFileSync(join(here, 'constitution.md'), 'utf8');
const probes = JSON.parse(readFileSync(join(here, 'probes.json'), 'utf8'));

async function ask(prompt, system) {
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });
  const t0 = Date.now();
  const res = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages,
      stream: false,
      think: false,
      options: { temperature: 0.3, num_predict: NUM_PREDICT },
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const json = await res.json();
  const secs = (Date.now() - t0) / 1000;
  const toks = json.eval_count || 0;
  return { text: json.message.content.trim(), secs, toks, tps: toks / Math.max(secs, 0.001) };
}

const date = new Date().toISOString().slice(0, 10);
const out = [];
out.push(`# 01 constitution — ${MODEL} — ${date}`);
out.push('');
out.push(`Bare = no system prompt. Constitution = constitution.md as system prompt. temperature 0.3, thinking off, max ${NUM_PREDICT} tokens.`);
out.push('');

let bareWords = 0, conWords = 0, tpsSum = 0, n = 0;
for (const p of probes) {
  process.stderr.write(`${p.id} … `);
  const bare = await ask(p.prompt);
  const con = await ask(p.prompt, constitution);
  process.stderr.write(`bare ${bare.text.split(/\s+/).length}w / con ${con.text.split(/\s+/).length}w (${con.tps.toFixed(1)} tok/s)\n`);
  bareWords += bare.text.split(/\s+/).length;
  conWords += con.text.split(/\s+/).length;
  tpsSum += bare.tps + con.tps; n += 2;
  out.push(`## ${p.id}`);
  out.push('');
  out.push(`> ${p.prompt}`);
  out.push('');
  out.push(`**Bare** (${bare.toks} tokens, ${bare.secs.toFixed(1)}s)`);
  out.push('');
  out.push(bare.text);
  out.push('');
  out.push(`**Constitution** (${con.toks} tokens, ${con.secs.toFixed(1)}s)`);
  out.push('');
  out.push(con.text);
  out.push('');
}
out.push('## Totals');
out.push('');
out.push(`| | words |`);
out.push(`|---|---|`);
out.push(`| bare | ${bareWords} |`);
out.push(`| constitution | ${conWords} |`);
out.push('');
out.push(`Average ${(tpsSum / n).toFixed(1)} tok/s.`);

mkdirSync(join(here, 'out'), { recursive: true });
const file = join(here, 'out', `${date}-${MODEL.replace(/[:/]/g, '-')}.md`);
writeFileSync(file, out.join('\n') + '\n');
console.log(file);
