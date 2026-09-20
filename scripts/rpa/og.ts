// Renders scripts/rpa/og.html to public/rpa/og.png (1200×630). Rerun after a type or palette change.
import { chromium } from 'playwright'
import path from 'node:path'
async function main() {
  const b = await chromium.launch()
  const p = await b.newPage({ viewport: { width: 1200, height: 630 } })
  await p.goto(`file://${path.resolve('scripts/rpa/og.html')}`, { waitUntil: 'networkidle' })
  await p.evaluate(() => document.fonts.ready)
  await p.screenshot({ path: 'public/rpa/og.png' })
  await b.close()
}
main()
