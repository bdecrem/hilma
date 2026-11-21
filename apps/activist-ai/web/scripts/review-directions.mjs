#!/usr/bin/env node
// Renders review-directions.html (OLA-312): two directions x three screens, phone 390 x 844 and laptop 1280 x 800.
//   node web/scripts/review-directions.mjs <dir>
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { webkit } from 'playwright'
const out = path.resolve(process.argv[2] ?? 'directions')
const page = pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), 'review-directions.html')).href
const b = await webkit.launch()
for (const d of ['a', 'b']) for (const s of ['conv', 'question', 'home']) {
  const wide = s === 'home'
  const c = await b.newContext({ viewport: wide ? { width: 1280, height: 800 } : { width: 390, height: 844 }, deviceScaleFactor: wide ? 1 : 2 })
  const p = await c.newPage()
  await p.goto(`${page}?d=${d}&s=${s}`)
  await p.evaluate(() => document.fonts.ready)
  await p.waitForTimeout(300)
  await p.screenshot({ path: path.join(out, `dir-${d}-${s}.png`) })
  await c.close()
}
await b.close()
console.log(`directions in ${out}`)
