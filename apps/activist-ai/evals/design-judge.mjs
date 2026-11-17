#!/usr/bin/env node
// The judged half of the design evals: for every design task and seed, the page made WITH the skill
// and the page made WITHOUT it are rendered (laptop 1280 x 800 and phone 390 x 844, first screen),
// put side by side unlabeled as A and B, and the `see` model is asked which is better designed by a
// short rubric taken from the owner's taste. Each pair is asked twice with the order swapped; a pair
// counts for one arm only when both orders agree, otherwise it is a split. Also writes, per task, a
// labeled sheet (Without | With, one row per seed) for a person to look at.
//
//   node evals/design-judge.mjs --runs runs/<config name> --port 4397 --token-file <file> [--out dir] [--json results/design-judge.json]
//
// <config name> is the configuration without -skills-on/-off (the runner's folders). The token is the
// evals gateway's probe caller (never printed). The judge is a mid-size model that looks at pictures:
// read its verdicts as a second opinion, and its agreement with itself across the swap as how far to
// trust them.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(path.join(here, '../../../package.json'))
const { chromium } = require('playwright')
const args = {}
for (let i = 2; i < process.argv.length; i++) if (process.argv[i].startsWith('--')) args[process.argv[i].slice(2)] = process.argv[i + 1]
if (!args.runs || !args.port || !args['token-file']) { console.error('usage: node design-judge.mjs --runs runs/<config> --port <gateway port> --token-file <file> [--out dir] [--json file] [--tasks u1,u2]'); process.exit(2) }
const token = readFileSync(args['token-file'], 'utf8').trim()
const outDir = path.resolve(args.out || path.join(here, 'results', 'design-sheets'))
mkdirSync(outDir, { recursive: true })
const tasks = readdirSync(path.join(here, 'tasks')).filter((d) => existsSync(path.join(here, 'tasks', d, 'task.json')))
  .map((d) => JSON.parse(readFileSync(path.join(here, 'tasks', d, 'task.json'), 'utf8')))
  .filter((t) => ['designer', 'app-designer'].includes(t.skill) && (!args.tasks || args.tasks.split(',').some((x) => t.id.startsWith(x))))

const RUBRIC = `You are judging two versions, A and B, of the same {kind}, built from the same content, shown side by side. In each column the laptop view is above the phone view. Judge as a senior designer with restrained, independent taste:
1. One clear visual idea that comes from the subject, not decoration.
2. An obvious first thing to look at, and a clear order after it.
3. Confident type at a professional size, not too big.
4. A small, calm palette with at most one accent color.
5. No decoration that says nothing: gradients, glows, rounded cards everywhere, emoji, sparkles, a colored italic phrase in the headline.
6. Not bare: not a default-looking white page with one plain blue and a table.
7. It works and reads well on the phone.
Write one short line about A and one about B. Then a final line exactly "Better: A" or "Better: B" or "Better: same".`
const APP_RUBRIC = RUBRIC.replace('In each column the laptop view is above the phone view.', 'Each is the first screen of a phone app prototype.')
  .replace('7. It works and reads well on the phone.', '7. It looks like a normal, finished iPhone app (navigation bar, tab bar or back button, standard sizes), not a web page.')

function latest(arm, task, seed) {
  const dir = path.resolve(`${args.runs}-skills-${arm}`)
  if (!existsSync(dir)) return null
  const runs = readdirSync(dir).filter((d) => d.startsWith(`${task}-s${seed}-`)).sort()
  return runs.length ? path.join(dir, runs.at(-1), 'work') : null
}

function serve(root) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.csv': 'text/csv' }
  const s = http.createServer(async (req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '')
    const f = path.resolve(root, rel)
    if (!f.startsWith(root)) return res.writeHead(403).end()
    try { res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }).end(await readFile(f)) } catch { res.writeHead(404).end() }
  })
  return new Promise((r) => s.listen(0, '127.0.0.1', () => r(s)))
}

async function shots(browser, work, file) {
  const out = {}
  if (!work || !existsSync(path.join(work, file))) return null
  const srv = await serve(work)
  const base = `http://127.0.0.1:${srv.address().port}/`
  for (const [k, w, h] of [['laptop', 1280, 800], ['phone', 390, 844]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } })
    await ctx.route((u) => !u.href.startsWith(base), (r) => r.abort())
    const p = await ctx.newPage()
    await p.goto(base + file, { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {})
    await p.waitForTimeout(400)
    out[k] = (await p.screenshot()).toString('base64')
    await ctx.close()
  }
  srv.close()
  return out
}

async function sheet(browser, cols, file, app) {
  const cells = cols.map(([label, s]) => `<section><h2>${label}</h2>${s ? (app ? `<img class="phone solo" src="data:image/png;base64,${s.phone}">`
    : `<img src="data:image/png;base64,${s.laptop}"><img class="phone" src="data:image/png;base64,${s.phone}">`) : '<p>nothing made</p>'}</section>`).join('')
  const w = app ? 48 + cols.length * 424 : 48 + cols.length * 664
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 } })
  const p = await ctx.newPage()
  await p.setContent(`<style>body{margin:0;padding:24px;background:#e4e2de;font:16px system-ui}main{display:flex;gap:24px;align-items:flex-start}
section{width:${app ? 400 : 640}px}h2{font-size:22px;margin:0 0 8px}img{display:block;width:100%;margin-bottom:12px;box-shadow:0 0 0 1px #0003;background:#fff}
img.phone{width:45%}img.solo{width:100%}</style><main>${cells}</main>`)
  await p.screenshot({ path: file, fullPage: true })
  await ctx.close()
}

async function ask(png, rubric) {
  const body = { model: 'see', max_tokens: 500, messages: [{ role: 'user', content: [{ type: 'text', text: rubric }, { type: 'image_url', image_url: { url: `data:image/png;base64,${png}` } }] }] }
  const r = await fetch(`http://127.0.0.1:${args.port}/v1/chat/completions`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const j = await r.json().catch(() => ({}))
  const text = j?.choices?.[0]?.message?.content || JSON.stringify(j).slice(0, 200)
  const m = /Better:\s*(A|B|same)/i.exec(text)
  return { verdict: m ? m[1].toUpperCase() : '?', text }
}

const browser = await chromium.launch()
const results = []
try {
  for (const t of tasks) {
    const file = t.outputs[0]
    const app = t.skill === 'app-designer'
    const rows = []
    for (const seed of [1, 2, 3]) {
      const on = await shots(browser, latest('on', t.id, seed), file)
      const off = await shots(browser, latest('off', t.id, seed), file)
      rows.push([seed, off, on])
      if (!on || !off) { results.push({ task: t.id, seed, verdict: !on && !off ? 'none' : on ? 'with' : 'without', why: 'only one arm made the page' }); continue }
      const tmp = path.join(outDir, `.pair-${t.id}-${seed}.png`)
      const v = []
      for (const [first, second] of [[on, off], [off, on]]) {
        await sheet(browser, [['A', first], ['B', second]], tmp, app)
        v.push(await ask(readFileSync(tmp).toString('base64'), app ? APP_RUBRIC : RUBRIC.replace('{kind}', 'web page')))
      }
      const pick = (x, aIsOn) => (x.verdict === 'SAME' ? 'same' : x.verdict === '?' ? '?' : (x.verdict === 'A') === aIsOn ? 'with' : 'without')
      const p1 = pick(v[0], true), p2 = pick(v[1], false)
      results.push({ task: t.id, seed, first: p1, swapped: p2, verdict: p1 === p2 ? p1 : 'split', why: [v[0].text, v[1].text].map((s) => s.slice(0, 500)) })
      console.log(`${t.id} seed ${seed}: ${p1} / ${p2}`)
    }
    // The labeled sheet for a person: one row per seed, Without on the left, With on the right.
    const rowsHtml = []
    for (const [seed, off, on] of rows) {
      const f = path.join(outDir, `.row-${t.id}-${seed}.png`)
      await sheet(browser, [[`Without the skill (seed ${seed})`, off], [`With the skill (seed ${seed})`, on]], f, app)
      rowsHtml.push(readFileSync(f).toString('base64'))
    }
    const ctx = await browser.newContext({ viewport: { width: app ? 920 : 1400, height: 900 } })
    const p = await ctx.newPage()
    await p.setContent(`<style>body{margin:0;background:#e4e2de;font:20px system-ui}h1{font-size:24px;margin:24px 24px 0}img{display:block;width:100%}</style><h1>${t.id}: without and with the ${t.skill} skill</h1>${rowsHtml.map((b) => `<img src="data:image/png;base64,${b}">`).join('')}`)
    await p.screenshot({ path: path.join(outDir, `${t.id}.png`), fullPage: true })
    await ctx.close()
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
