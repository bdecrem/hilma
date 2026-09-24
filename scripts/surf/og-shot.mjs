// Screenshots the OG card (/surf/og, 1200×630) into public/surf/og.png, and the
// landing at phone width for a look, from a dev server:
//   npx next dev --turbopack -p 3219   then   node scripts/surf/og-shot.mjs [base] [landing-shot-path]
import { chromium } from 'playwright'
const base = process.argv[2] || 'http://localhost:3219'
const landingShot = process.argv[3] || ''
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
await page.goto(base + '/surf/og', { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
await page.screenshot({ path: 'public/surf/og.png', clip: { x: 0, y: 0, width: 1200, height: 630 } })
console.log('wrote public/surf/og.png')
if (landingShot) {
  const p2 = await ctx.newPage()
  await p2.setViewportSize({ width: 390, height: 844 })
  await p2.goto(base + '/surf', { waitUntil: 'networkidle' })
  await p2.waitForTimeout(800)
  await p2.screenshot({ path: landingShot })
  console.log('wrote', landingShot)
}
await b.close()
