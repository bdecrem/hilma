#!/usr/bin/env node
// The judged half of the sound evals: for every sound task and seed, what the page played WITH the
// skill and WITHOUT it, as listen.py heard it (the spectrogram, and per sound its level, loudness,
// share of energy above 5 kHz, attack, length, and the notes of a tune), put side by side unlabeled as
// A and B, and the `see` model is asked which is better sound design by a short rubric from the
// owner's taste. Each pair is asked twice with the order swapped; a pair counts for one arm only when
// both orders agree, otherwise it is a split. The checker's pass and fail lines are not shown. Also
// writes, per task, a labeled sheet (Without | With, one row per seed) for a person.
//
//   node evals/sound-judge.mjs --runs runs/<config name> --port 4398 --token-file <file> [--out dir] [--json results/sound-judge.json]
//
// <config name> is the configuration without -skills-on/-off. The token is the evals gateway's probe
// caller (never printed). A 30B model reading pictures and numbers: a second opinion, no more.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(path.join(here, '../../../package.json'))
const { chromium } = require('playwright')
const args = {}
for (let i = 2; i < process.argv.length; i++) if (process.argv[i].startsWith('--')) args[process.argv[i].slice(2)] = process.argv[i + 1]
if (!args.runs || !args.port || !args['token-file']) { console.error('usage: node sound-judge.mjs --runs runs/<config> --port <gateway port> --token-file <file> [--out dir] [--json file] [--tasks v1,v2]'); process.exit(2) }
const token = readFileSync(args['token-file'], 'utf8').trim()
const outDir = path.resolve(args.out || path.join(here, 'results', 'sound-sheets'))
mkdirSync(outDir, { recursive: true })
const tasks = readdirSync(path.join(here, 'tasks')).filter((d) => existsSync(path.join(here, 'tasks', d, 'task.json')))
  .map((d) => JSON.parse(readFileSync(path.join(here, 'tasks', d, 'task.json'), 'utf8')))
  .filter((t) => t.skill === 'sound' && (!args.tasks || args.tasks.split(',').some((x) => t.id.startsWith(x))))

const RUBRIC = `You are judging two versions, A and B, of the sounds for the same {kind}, made from the same request: "{request}".
You cannot hear them, so each is shown as measured by a program: a spectrogram (time across, pitch up, loudness as darkness; a dashed red line at 5 kHz; a blue line at each click) and a table, one row per sound.
Judge as a senior sound designer with restrained, tasteful ears:
1. Interface sounds are quiet (peak near -18 dBFS, never above -12), short, with a soft start (attack 3 to 10 ms) and a clean fade, and almost nothing above 5 kHz. In the picture: a few thin horizontal lines that fade, not smears, not dark vertical bars.
2. The sounds form one family and each moment is recognizably different.
3. Music sits under the page (about -24 dBFS RMS), is dark and calm rather than bright, and never clips.
4. A tune stays in one key, has a figure that comes back, uses long and short notes, and ends on the home note. A random walk over a scale, especially five notes noodling, is cheesy.
5. Nothing plays before a click; harsh square or sawtooth tones, loud beeps and buzzers are bad design.
Write one short line about A and one about B. Then a final line exactly "Better: A" or "Better: B" or "Better: same".`

function latest(arm, task, seed) {
  const dir = path.resolve(`${args.runs}-skills-${arm}`)
  if (!existsSync(dir)) return null
  const runs = readdirSync(dir).filter((d) => d.startsWith(`${task}-s${seed}-`)).sort()
  return runs.length ? path.join(dir, runs.at(-1), 'work-listen') : null
}

function card(dir) {
  if (!dir || !existsSync(path.join(dir, 'report.json'))) return null
  const r = JSON.parse(readFileSync(path.join(dir, 'report.json'), 'utf8'))
  const pic = existsSync(path.join(dir, 'spectrogram.png')) ? readFileSync(path.join(dir, 'spectrogram.png')).toString('base64') : null
  const rows = (r.segments || []).filter((s) => !s.silent || s.label === 'before any click').map((s) => {
    const m = s.music ? `${s.music.events} notes, ${s.music.key}, ${Math.round(s.music.in_key * 100)}% in key, ends on ${s.music.last_pitch_class}: ${s.music.top_line.slice(0, 12).join(' ')}` : ''
    return s.silent ? `<tr><td>${s.label}</td><td colspan=6>silent</td></tr>`
      : `<tr><td>${s.label}</td><td>${s.peak_dbfs}</td><td>${s.rms_dbfs}</td><td>${Math.round((s.hf || 0) * 1000) / 10}%</td><td>${s.attack_ms}</td><td>${s.sound_length} s</td><td>${m}</td></tr>`
  }).join('')
  return { pic, table: `<table><tr><th>after the click on</th><th>peak dBFS</th><th>RMS dBFS</th><th>above 5 kHz</th><th>attack ms</th><th>length</th><th>notes</th></tr>${rows}</table><p>${(r.contexts || []).length} sound systems made</p>` }
}

async function sheet(browser, cols, file) {
  const cells = cols.map(([label, c]) => `<section><h2>${label}</h2>${c ? `${c.pic ? `<img src="data:image/png;base64,${c.pic}">` : '<p>no picture</p>'}${c.table}` : '<p>nothing made a sound, or nothing was made</p>'}</section>`).join('')
  const ctx = await browser.newContext({ viewport: { width: 48 + cols.length * 1024, height: 900 } })
  const p = await ctx.newPage()
  await p.setContent(`<style>body{margin:0;padding:24px;background:#e9e6e0;font:15px system-ui}main{display:flex;gap:24px;align-items:flex-start}
section{width:1000px;background:#fff;padding:12px;box-sizing:border-box}h2{font-size:22px;margin:0 0 8px}img{display:block;width:100%}
table{border-collapse:collapse;width:100%;margin-top:8px}td,th{border-bottom:1px solid #ccc;padding:4px 6px;text-align:left;font-size:14px;vertical-align:top}</style><main>${cells}</main>`)
  await p.screenshot({ path: file, fullPage: true })
  await ctx.close()
}

async function ask(png, rubric) {
  const body = { model: 'see', max_tokens: 2000, messages: [{ role: 'user', content: [{ type: 'text', text: rubric }, { type: 'image_url', image_url: { url: `data:image/png;base64,${png}` } }] }] }
  const r = await fetch(`http://127.0.0.1:${args.port}/v1/chat/completions`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const j = await r.json().catch(() => ({}))
  const text = j?.choices?.[0]?.message?.content || JSON.stringify(j).slice(0, 200)
  const m = /Better:\s*\**\s*(A|B|same)/i.exec(text)
  return { verdict: m ? m[1].toUpperCase() : '?', text }
}

const browser = await chromium.launch()
const results = []
try {
  for (const t of tasks) {
    const request = readFileSync(path.join(here, 'tasks', t.id, 'instruction.md'), 'utf8').trim()
    const rubric = RUBRIC.replace('{kind}', t.outputs[0]).replace('{request}', request)
    const rows = []
    for (const seed of [1, 2, 3]) {
      const on = card(latest('on', t.id, seed)), off = card(latest('off', t.id, seed))
      rows.push([seed, off, on])
      if (!on || !off) { results.push({ task: t.id, seed, verdict: !on && !off ? 'none' : on ? 'with' : 'without', why: 'only one arm was heard' }); continue }
      const tmp = path.join(outDir, `.pair-${t.id}-${seed}.png`)
      const v = []
      for (const [first, second] of [[on, off], [off, on]]) {
        await sheet(browser, [['A', first], ['B', second]], tmp)
        v.push(await ask(readFileSync(tmp).toString('base64'), rubric))
      }
      const pick = (x, aIsOn) => (x.verdict === 'SAME' ? 'same' : x.verdict === '?' ? '?' : (x.verdict === 'A') === aIsOn ? 'with' : 'without')
      const p1 = pick(v[0], true), p2 = pick(v[1], false)
      results.push({ task: t.id, seed, first: p1, swapped: p2, verdict: p1 === p2 ? p1 : 'split', why: [v[0].text, v[1].text].map((s) => s.slice(0, 500)) })
      console.log(`${t.id} seed ${seed}: ${p1} / ${p2}`)
    }
    for (const [seed, off, on] of rows) await sheet(browser, [[`Without the skill (seed ${seed})`, off], [`With the skill (seed ${seed})`, on]], path.join(outDir, `${t.id}-s${seed}.png`))
  }
} finally {
  await browser.close()
}
const tally = {}
for (const r of results) ((tally[r.task] ||= { with: 0, without: 0, same: 0, split: 0, other: 0 })[['with', 'without', 'same', 'split'].includes(r.verdict) ? r.verdict : 'other'] += 1)
const judged = results.filter((r) => r.first)
const consistent = judged.filter((r) => r.first === r.swapped).length
const summary = { made: new Date().toISOString(), judge: 'see (through the evals gateway)', pairs: results.length, consistent_across_swap: `${consistent} of ${judged.length}`, tally, results }
if (args.json) writeFileSync(args.json, JSON.stringify(summary, null, 1))
console.log(JSON.stringify({ tally, consistent_across_swap: summary.consistent_across_swap }, null, 1))
