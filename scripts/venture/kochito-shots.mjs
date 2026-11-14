// Looks at kochitolabs.com's pages: each at desktop and phone width, the top
// of the page and the whole page. Does not submit a form (see kochito-check.mjs).
// Usage: node scripts/venture/kochito-shots.mjs <out-dir> [base]
//   base defaults to http://localhost:3277/kochito (a dev server); for the
//   live site pass https://kochitolabs.com
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
const [out, base = 'http://localhost:3277/kochito'] = process.argv.slice(2)
if (!out) { console.error('usage: node scripts/venture/kochito-shots.mjs <out-dir> [base]'); process.exit(1) }
mkdirSync(out, { recursive: true })
const b = await chromium.launch()
const errs = []
for (const [name, w, h] of [['desk', 1280, 800], ['phone', 390, 844]]) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2, userAgent: 'kochito-shots headless check' })
  p.on('pageerror', (e) => errs.push(e.message))
  for (const [page, path] of [['home', ''], ['pdf', '/pdf'], ['apps', '/apps']]) {
    await p.goto(base + path, { waitUntil: 'networkidle' })
    await p.evaluate(() => document.fonts.ready)
    await p.screenshot({ path: `${out}/${page}-${name}.png` })
    await p.screenshot({ path: `${out}/${page}-${name}-full.png`, fullPage: true })
    const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    if (over > 0) errs.push(`${page} ${name}: page is ${over}px wider than the screen`)
  }
  await p.close()
}
await b.close()
console.log(`shots in ${out}${errs.length ? '\nproblems: ' + [...new Set(errs)].join(' | ') : ''}`)
