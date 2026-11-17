#!/usr/bin/env node
// Pictures of the board for design work: each URL at desktop (1440) and phone (390) width, full
// page, then one sheet with the URLs side by side (desktop on top, phone below), so two directions
// can be compared at a glance.
//   node scripts/venture/board-shots.mjs <out-dir> <name>=<url> [<name>=<url> …] [--sheet file.png]
// e.g. against a dev server with made-up data:
//   node scripts/venture/board-shots.mjs ~/Desktop/Ola/kit-shots a=http://localhost:3291/kochito/kit/mock?v=a b=http://localhost:3291/kochito/kit/mock?v=b --sheet dashboard-compare.png
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'

const args = process.argv.slice(2)
const out = args[0]
const sheet = args.includes('--sheet') ? args[args.indexOf('--sheet') + 1] : null
const targets = args.slice(1).filter((a, i, all) => a.includes('=') && all[i] !== sheet && all[i - 1] !== '--sheet').map((a) => [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)])
if (!out || !targets.length) {
  console.error('usage: board-shots.mjs <out-dir> <name>=<url> … [--sheet file.png]')
  process.exit(1)
}
mkdirSync(out, { recursive: true })
const b = await chromium.launch()
const shots = []
for (const [name, url] of targets) {
  for (const [tag, w, h] of [['desk', 1440, 900], ['phone', 390, 844]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
    const p = await ctx.newPage()
    await p.goto(url, { waitUntil: 'networkidle' })
    await p.evaluate(() => document.fonts.ready)
    const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    if (over > 0) console.log(`${name} ${tag}: ${over}px wider than the screen`)
    const file = join(out, `board-${name}-${tag}.png`)
    await p.screenshot({ path: file, fullPage: true })
    shots.push({ name, tag, file })
    await ctx.close()
  }
}
if (sheet) {
  const img = (f) => `data:image/png;base64,${readFileSync(f).toString('base64')}`
  const col = (name) => `<div class="col"><h2>${name}</h2>${['desk', 'phone'].map((t) => `<img class="${t}" src="${img(shots.find((s) => s.name === name && s.tag === t).file)}">`).join('')}</div>`
  const html = `<!doctype html><style>body{margin:0;background:#ddd;font:600 28px system-ui;display:flex;gap:40px;padding:30px;align-items:flex-start}.col{width:1440px}h2{margin:0 0 16px}img{display:block;border:1px solid #999;margin-bottom:24px}img.desk{width:1440px;max-height:5200px;object-fit:cover;object-position:top}img.phone{width:390px}</style>${targets.map(([n]) => col(n)).join('')}`
  const ctx = await b.newContext({ viewport: { width: 30 + targets.length * 1480, height: 900 } })
  const p = await ctx.newPage()
  await p.setContent(html, { waitUntil: 'load' })
  await p.screenshot({ path: join(out, sheet), fullPage: true })
  console.log(`sheet: ${join(out, sheet)}`)
}
await b.close()
for (const s of shots) console.log(s.file)
