// The site against a local dev server on 3218: the landing page signed out,
// then the journal signed in as a throwaway account (scripts/onething/review-user.ts
// prints its id; /api/onething/dev/as signs in on localhost only). Writes
// landing.png, page.png, details.png, day.png, payoff.png, settings.png
// (+ redraw.png with --redraw: three real Opus calls) and prints what it saw.
//   node scripts/onething/pw-page-shot.mjs <dir> <user id> [--desktop] [--redraw]
import { chromium, devices } from 'playwright'
import fs from 'node:fs'
const [dir, id] = process.argv.slice(2)
if (!dir || !id) throw new Error('usage: pw-page-shot.mjs <dir> <user id> [--desktop] [--redraw]')
fs.mkdirSync(dir, { recursive: true })
const desktop = process.argv.includes('--desktop')
const base = 'http://localhost:3218'
const b = await chromium.launch()
const opts = desktop ? { viewport: { width: 1280, height: 900 } } : { ...devices['iPhone 13'] }
const errs = []

// signed out
const out = await b.newContext(opts)
const lp = await out.newPage()
lp.on('pageerror', (e) => errs.push(String(e)))
await lp.goto(`${base}/onething`, { waitUntil: 'networkidle' })
await lp.waitForSelector('.ot-hero', { timeout: 30000 }); await lp.waitForTimeout(800)
await lp.screenshot({ path: `${dir}/landing.png`, fullPage: true })
console.log('landing samples:', await lp.locator('.ot-card.sample').count(), '· sign-in form:', await lp.locator('#start form').count())

// signed in
const ctx = await b.newContext(opts)
const p = await ctx.newPage()
p.on('pageerror', (e) => errs.push(String(e)))
await p.goto(`${base}/api/onething/dev/as?id=${id}`, { waitUntil: 'networkidle' })
await p.waitForSelector('.ot-day', { timeout: 30000 }); await p.waitForTimeout(1200)
console.log('wall cards:', await p.locator('.ot-wall .ot-card').count(), '· doodles:', await p.locator('.ot-boil').count())
await p.screenshot({ path: `${dir}/page.png`, fullPage: true })
await p.click('.ot-info'); await p.waitForTimeout(300)
await p.locator('.ot-garden').screenshot({ path: `${dir}/details.png` })
console.log('milestone dots:', await p.locator('.ot-replays .ot-dot').count())
await p.locator('.ot-replays .ot-dot', { hasText: /^7$/ }).click()
await p.waitForSelector('.ot-payoff', { timeout: 5000 }); await p.waitForTimeout(2500)
await p.screenshot({ path: `${dir}/payoff.png` })
await p.keyboard.press('Escape'); await p.waitForTimeout(400)
console.log('payoff closed:', (await p.locator('.ot-payoff').count()) === 0)
// a past day opens into a sheet
const card = p.locator('.ot-wall button.ot-card').first()
if (await card.count()) {
  await card.click(); await p.waitForSelector('.ot-sheet .ot-day'); await p.waitForTimeout(600)
  await p.screenshot({ path: `${dir}/day.png` })
  if (process.argv.includes('--redraw') && (await p.locator('.ot-sheet .ot-pill', { hasText: 'Redraw' }).count())) {
    await p.locator('.ot-sheet .ot-pill', { hasText: 'Redraw' }).click()
    await p.waitForSelector('.ot-redraw'); await p.waitForTimeout(1500)
    await p.screenshot({ path: `${dir}/redraw-wait.png` })
    await p.waitForSelector('.ot-take[role=radio]', { timeout: 60000 }); await p.waitForTimeout(600)
    console.log('takes:', await p.locator('.ot-take[role=radio]').count())
    await p.screenshot({ path: `${dir}/redraw.png` })
    await p.keyboard.press('Escape'); await p.waitForTimeout(300)
  }
  await p.keyboard.press('Escape'); await p.waitForTimeout(300)
  console.log('sheet closed:', (await p.locator('.ot-sheet').count()) === 0)
}
await p.click('.ot-me'); await p.locator('[role=menuitem]', { hasText: 'Settings' }).click()
await p.waitForSelector('.ot-toggle'); await p.waitForTimeout(300)
await p.screenshot({ path: `${dir}/settings.png`, fullPage: true })
console.log('page errors:', errs.length ? errs : 'none')
await b.close()
