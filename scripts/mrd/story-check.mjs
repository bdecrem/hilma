import { chromium } from 'playwright'
const [out, base = 'http://localhost:3260'] = process.argv.slice(2)
const b = await chromium.launch()
for (const [n, w, h] of [['desk', 1440, 900], ['phone', 390, 844]]) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
  await p.goto(base + '/mrd/story', { waitUntil: 'networkidle' })
  await p.screenshot({ path: `${out}/story-${n}.png`, fullPage: true })
}
await b.close()
