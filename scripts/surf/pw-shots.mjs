// Token Surfers web check: screenshots /surf, /surf/gallery and an app page at desktop + phone widths,
// signs up a throwaway web user, upvotes, opens full screen, and renders the OG card.
// node scripts/surf/pw-shots.mjs [base] [out-dir] [slug]
import { chromium } from 'playwright'
const base = process.argv[2] || 'http://localhost:3219'
const out = process.argv[3] || '.'
const slug = process.argv[4] || 'pgyv9u2'
const b = await chromium.launch()
const errors = []
for (const [name, w, h] of [['desktop', 1280, 900], ['phone', 390, 844]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name} console: ${m.text().slice(0, 120)}`) })
  for (const [p, f] of [['/surf', 'landing'], ['/surf/gallery', 'gallery'], [`/surf/a/${slug}`, 'app']]) {
    await page.goto(base + p, { waitUntil: 'networkidle', timeout: 60000 })
    await page.waitForTimeout(800)
    await page.screenshot({ path: `${out}/${f}-${name}.png`, fullPage: true })
  }
  // upvote requires sign-in: click and check the modal appears
  await page.goto(`${base}/surf/a/${slug}`, { waitUntil: 'networkidle' })
  await page.click('button[aria-pressed]')
  await page.waitForTimeout(500)
  const modal = await page.locator('.modal').count()
  console.log(name, 'sign-in modal after upvote:', modal)
  if (name === 'phone') {
    await page.fill('input[placeholder="handle"]', 'webtester' + Math.floor(Math.random() * 10000))
    await page.fill('input[placeholder="password"]', 'pass1234')
    await page.click('.modal button[type=submit]')
    await page.waitForTimeout(2500)
    const votes = await page.locator('button[aria-pressed]').textContent()
    console.log('after signup + vote:', votes, 'pressed=', await page.locator('button[aria-pressed]').getAttribute('aria-pressed'))
    await page.screenshot({ path: `${out}/app-voted-phone.png` })
    await page.click('text=play full screen')
    await page.waitForTimeout(600)
    await page.screenshot({ path: `${out}/app-full-phone.png` })
  }
  await ctx.close()
}
// OG card
const ctx = await b.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
await page.goto(base + '/surf/og', { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
await page.screenshot({ path: `${out}/og.png`, clip: { x: 0, y: 0, width: 1200, height: 630 } })
await b.close()
console.log('errors:', errors.length ? errors : 'none')
