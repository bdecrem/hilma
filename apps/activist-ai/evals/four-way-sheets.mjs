// The blind sheets of a design comparison: the same page requests made by several arms, one sheet per
// request with one column per arm labeled only A, B, C... (or 1, 2, 3... with --numbers), each a laptop
// first screen (1280x800) above a phone first screen (390x844). Made for the four-way of OLA-141
// (Nemotron and Opus, with and without the designer skill); the five-arm open-model test of OLA-168
// (four open models and Opus) runs it with --numbers. The labels are shuffled per request with a
// recorded seed; the key goes to key.json, which the judge does not see before judging.
//
//   node evals/four-way-sheets.mjs <manifest.json> <out dir> [--seed N] [--numbers]
//
// manifest.json: { "tasks_dir": "<evals/tasks>", "tasks": { "<task>": { "<arm>": "<run folder>", ... } } }
// with the same number of arms (2 to 8) for every task; each run folder holds work/index.html. In
// <out dir> it writes pages/<task>/<label>/ (the page and the files beside it, minus .shots and
// project.db), shots/<task>-<label>-{laptop,phone}.png (first screen) and -{laptop,phone}-full.png
// (the whole page), sheet-<task>.png, all.png (every sheet at half size, one under another, each under
// its request), request-<task>.txt and key.json.
// Playwright comes from apps/activist-ai/web/node_modules. Shots load from file:// with every other
// request refused, wait for the load event and document.fonts.ready, then 1.5 s for entrance motion.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(path.join(here, '../web/package.json'))
const { chromium } = require('playwright')

const [manifestPath, outArg] = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && all[i - 1] !== '--seed')
if (!manifestPath || !outArg) { console.error('usage: node four-way-sheets.mjs <manifest.json> <out dir> [--seed N] [--numbers]'); process.exit(2) }
const si = process.argv.indexOf('--seed')
const seed = si > 0 ? Number(process.argv[si + 1]) : Math.floor(Math.random() * 2 ** 31)
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const out = path.resolve(outArg)
mkdirSync(path.join(out, 'shots'), { recursive: true })

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
const LABELS = process.argv.includes('--numbers') ? ['1', '2', '3', '4', '5', '6', '7', '8'] : ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
const FULL_MAX = 20000 // px; a page taller than this is cut there in the full-page shot
const VIEWS = { laptop: { width: 1280, height: 800 }, phone: { width: 390, height: 844 } }

const browser = await chromium.launch()
async function shoot(file, view, dest, full) {
  const ctx = await browser.newContext({ viewport: VIEWS[view], deviceScaleFactor: 1, isMobile: view === 'phone', hasTouch: view === 'phone' })
  await ctx.route('**/*', (r) => (r.request().url().startsWith('file:') ? r.continue() : r.abort()))
  const p = await ctx.newPage()
  await p.goto(pathToFileURL(file).href, { waitUntil: 'load' })
  await p.evaluate(() => document.fonts.ready)
  await p.waitForTimeout(1500)
  await p.screenshot({ path: dest }) // first screen
  const h = await p.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0))
  if (h > FULL_MAX) await p.screenshot({ path: full, clip: { x: 0, y: 0, width: VIEWS[view].width, height: FULL_MAX }, fullPage: true })
  else await p.screenshot({ path: full, fullPage: true })
  await ctx.close()
}

const key = { seed, note: 'Not for the judge before judging.', tasks: {} }
const taskNames = Object.keys(manifest.tasks)
const N = Object.keys(manifest.tasks[taskNames[0]]).length
if (N < 2 || N > LABELS.length) throw new Error(`needs 2 to ${LABELS.length} arms, has ${N}`)
const sheets = []
for (const [ti, task] of taskNames.entries()) {
  const arms = manifest.tasks[task]
  const names = Object.keys(arms)
  if (names.length !== N) throw new Error(`${task}: has ${names.length} arms, the first request has ${N}`)
  // shuffle per request: the run seed plus the request's position, so each request has its own order
  const taskSeed = seed + ti
  const rnd = mulberry32(taskSeed)
  const order = [...names]
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]] }
  key.tasks[task] = { seed: taskSeed, letters: {} }
  const request = readFileSync(path.join(manifest.tasks_dir, task, 'instruction.md'), 'utf8').trim()
  writeFileSync(path.join(out, `request-${task}.txt`), request + '\n')
  const cells = []
  for (const [i, arm] of order.entries()) {
    const L = LABELS[i]
    const src = path.join(arms[arm], 'work')
    const dst = path.join(out, 'pages', task, L)
    rmSync(dst, { recursive: true, force: true })
    cpSync(src, dst, { recursive: true, filter: (s) => !/(^|\/)(\.shots|project\.db)$/.test(s) })
    key.tasks[task].letters[L] = { arm, run: arms[arm] }
    const page = path.join(dst, 'index.html')
    const shots = {}
    for (const view of Object.keys(VIEWS)) {
      shots[view] = path.join(out, 'shots', `${task}-${L}-${view}.png`)
      if (existsSync(page)) await shoot(page, view, shots[view], path.join(out, 'shots', `${task}-${L}-${view}-full.png`))
      else shots[view] = null
    }
    cells.push({ L, shots })
  }
  // the sheet: one equal column per arm; laptop shown at 800x500 (5/8 scale), phone at its own 390x844
  const img = (f, w, h) => (f ? `<img src="${pathToFileURL(f).href}" style="width:${w}px;height:${h}px">` : `<div style="width:${w}px;height:${h}px;display:grid;place-items:center;background:#eee;font:24px sans-serif">no page</div>`)
  const html = `<!doctype html><html><body style="margin:0;background:#d9d9d9;font-family:Helvetica,Arial,sans-serif">
<div style="display:flex;gap:28px;padding:28px">${cells.map((c) => `<div style="width:800px">
<div style="font:700 56px/1 Helvetica,Arial,sans-serif;color:#111;margin:0 0 18px">${c.L}</div>
<div style="outline:1px solid #999;width:800px">${img(c.shots.laptop, 800, 500)}</div>
<div style="margin:24px auto 0;width:390px;outline:1px solid #999">${img(c.shots.phone, 390, 844)}</div></div>`).join('')}</div></body></html>`
  const sheetHtml = path.join(out, 'shots', `sheet-${task}.html`)
  writeFileSync(sheetHtml, html)
  const ctx = await browser.newContext({ viewport: { width: 28 + N * 828, height: 600 }, deviceScaleFactor: 1 })
  const p = await ctx.newPage()
  await p.goto(pathToFileURL(sheetHtml).href, { waitUntil: 'load' })
  await p.screenshot({ path: path.join(out, `sheet-${task}.png`), fullPage: true })
  await ctx.close()
  rmSync(sheetHtml)
  sheets.push({ task, request, png: path.join(out, `sheet-${task}.png`) })
  console.log(`sheet-${task}.png`)
}
// all.png: every sheet at half size, each under its request, so one image shows the whole test
const W = Math.round((28 + N * 828) / 2)
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;')
const allHtml = path.join(out, 'shots', 'all.html')
writeFileSync(allHtml, `<!doctype html><html><body style="margin:0;background:#d9d9d9;font-family:Helvetica,Arial,sans-serif">${sheets.map((s) => `
<div style="padding:24px 14px 0;font:600 20px/1.35 Helvetica,Arial,sans-serif;color:#111;max-width:${W - 28}px">${esc(s.task)}: ${esc(s.request)}</div>
<img src="${pathToFileURL(s.png).href}" style="display:block;width:${W}px">`).join('')}</body></html>`)
const actx = await browser.newContext({ viewport: { width: W, height: 600 }, deviceScaleFactor: 1 })
const ap = await actx.newPage()
await ap.goto(pathToFileURL(allHtml).href, { waitUntil: 'load' })
await ap.screenshot({ path: path.join(out, 'all.png'), fullPage: true })
await actx.close()
rmSync(allHtml)
console.log('all.png')
await browser.close()
writeFileSync(path.join(out, 'key.json'), JSON.stringify(key, null, 1) + '\n')
console.log(`seed ${seed}; key.json written`)
