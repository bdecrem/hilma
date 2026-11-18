// The blind sheets of the four-way design comparison (OLA-141): the same page requests made by
// four arms (Nemotron with and without the designer skill, Opus with and without), one sheet per
// request with four columns labeled only A to D, each a laptop first screen (1280x800) above a phone
// first screen (390x844). The letters are shuffled per request with a recorded seed; the key goes to
// key.json, which the judge does not see before judging.
//
//   node evals/four-way-sheets.mjs <manifest.json> <out dir> [--seed N]
//
// manifest.json: { "tasks_dir": "<evals/tasks>", "tasks": { "<task>": { "<arm>": "<run folder>", ... } } }
// with exactly four arms per task; each run folder holds work/index.html. In <out dir> it writes
// pages/<task>/<letter>/ (the page and the files beside it, minus .shots and project.db),
// shots/<task>-<letter>-{laptop,phone}.png, sheet-<task>.png, request-<task>.txt and key.json.
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
if (!manifestPath || !outArg) { console.error('usage: node four-way-sheets.mjs <manifest.json> <out dir> [--seed N]'); process.exit(2) }
const si = process.argv.indexOf('--seed')
const seed = si > 0 ? Number(process.argv[si + 1]) : Math.floor(Math.random() * 2 ** 31)
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const out = path.resolve(outArg)
mkdirSync(path.join(out, 'shots'), { recursive: true })

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
const LETTERS = ['A', 'B', 'C', 'D']
const VIEWS = { laptop: { width: 1280, height: 800 }, phone: { width: 390, height: 844 } }

const browser = await chromium.launch()
async function shoot(file, view, dest) {
  const ctx = await browser.newContext({ viewport: VIEWS[view], deviceScaleFactor: 1, isMobile: view === 'phone', hasTouch: view === 'phone' })
  await ctx.route('**/*', (r) => (r.request().url().startsWith('file:') ? r.continue() : r.abort()))
  const p = await ctx.newPage()
  await p.goto(pathToFileURL(file).href, { waitUntil: 'load' })
  await p.evaluate(() => document.fonts.ready)
  await p.waitForTimeout(1500)
  await p.screenshot({ path: dest }) // first screen only
  await ctx.close()
}

const key = { seed, note: 'Not for the judge before judging.', tasks: {} }
const taskNames = Object.keys(manifest.tasks)
for (const [ti, task] of taskNames.entries()) {
  const arms = manifest.tasks[task]
  const names = Object.keys(arms)
  if (names.length !== 4) throw new Error(`${task}: needs four arms, has ${names.length}`)
  // shuffle per request: the run seed plus the request's position, so each request has its own order
  const taskSeed = seed + ti
  const rnd = mulberry32(taskSeed)
  const order = [...names]
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]] }
  key.tasks[task] = { seed: taskSeed, letters: {} }
  writeFileSync(path.join(out, `request-${task}.txt`), readFileSync(path.join(manifest.tasks_dir, task, 'instruction.md'), 'utf8').trim() + '\n')
  const cells = []
  for (const [i, arm] of order.entries()) {
    const L = LETTERS[i]
    const src = path.join(arms[arm], 'work')
    const dst = path.join(out, 'pages', task, L)
    rmSync(dst, { recursive: true, force: true })
    cpSync(src, dst, { recursive: true, filter: (s) => !/(^|\/)(\.shots|project\.db)$/.test(s) })
    key.tasks[task].letters[L] = { arm, run: arms[arm] }
    const page = path.join(dst, 'index.html')
    const shots = {}
    for (const view of Object.keys(VIEWS)) {
      shots[view] = path.join(out, 'shots', `${task}-${L}-${view}.png`)
      if (existsSync(page)) await shoot(page, view, shots[view])
      else shots[view] = null
    }
    cells.push({ L, shots })
  }
  // the sheet: four equal columns; laptop shown at 800x500 (5/8 scale), phone at its own 390x844
  const img = (f, w, h) => (f ? `<img src="${pathToFileURL(f).href}" style="width:${w}px;height:${h}px">` : `<div style="width:${w}px;height:${h}px;display:grid;place-items:center;background:#eee;font:24px sans-serif">no page</div>`)
  const html = `<!doctype html><html><body style="margin:0;background:#d9d9d9;font-family:Helvetica,Arial,sans-serif">
<div style="display:flex;gap:28px;padding:28px">${cells.map((c) => `<div style="width:800px">
<div style="font:700 56px/1 Helvetica,Arial,sans-serif;color:#111;margin:0 0 18px">${c.L}</div>
<div style="outline:1px solid #999;width:800px">${img(c.shots.laptop, 800, 500)}</div>
<div style="margin:24px auto 0;width:390px;outline:1px solid #999">${img(c.shots.phone, 390, 844)}</div></div>`).join('')}</div></body></html>`
  const sheetHtml = path.join(out, 'shots', `sheet-${task}.html`)
  writeFileSync(sheetHtml, html)
  const ctx = await browser.newContext({ viewport: { width: 28 + 4 * 828, height: 600 }, deviceScaleFactor: 1 })
  const p = await ctx.newPage()
  await p.goto(pathToFileURL(sheetHtml).href, { waitUntil: 'load' })
  await p.screenshot({ path: path.join(out, `sheet-${task}.png`), fullPage: true })
  await ctx.close()
  rmSync(sheetHtml)
  console.log(`sheet-${task}.png`)
}
await browser.close()
writeFileSync(path.join(out, 'key.json'), JSON.stringify(key, null, 1) + '\n')
console.log(`seed ${seed}; key.json written`)
