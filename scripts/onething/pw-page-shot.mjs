// The journal at phone size against a dev server on 3218 (ONETHING_DEV_AS set):
// the page, the streak details with the replay links, a replay opening the
// payoff scene, and the settings toggle. Writes <dir>/page.png, details.png,
// payoff.png, settings.png; prints doodle count and page errors.
//   node scripts/onething/pw-page-shot.mjs <dir> [--desktop]
import { chromium, devices } from 'playwright'
import fs from 'node:fs'
const dir = process.argv[2]; fs.mkdirSync(dir, { recursive: true })
const desktop = process.argv.includes('--desktop')
const b = await chromium.launch()
const ctx = await b.newContext(desktop ? { viewport: { width: 1280, height: 900 } } : { ...devices['iPhone 13'] })
const p = await ctx.newPage(); const errs = []
p.on('pageerror', (e) => errs.push(String(e)))
await p.goto('http://localhost:3218/onething', { waitUntil: 'networkidle' })
await p.waitForSelector('.ot-lines', { timeout: 30000 }); await p.waitForTimeout(1200)
console.log('doodles:', await p.locator('.ot-doodle').count())
// every row a whole number of rules?
const off = await p.$$eval('.ot-lines > li', (rows) => rows.map((r) => Math.round(r.getBoundingClientRect().height * 10) / 10).filter((h) => Math.abs(h % 28) > 0.6))
console.log('rows off the grid:', off)
await p.screenshot({ path: `${dir}/page.png`, fullPage: true })
await p.click('.ot-info'); await p.waitForTimeout(300)
await p.locator('.ot-garden').screenshot({ path: `${dir}/details.png` })
console.log('replay links:', await p.locator('.ot-replays .ot-link').count())
await p.locator('.ot-replays .ot-link', { hasText: /^7$/ }).click()
await p.waitForSelector('.ot-payoff', { timeout: 5000 }); await p.waitForTimeout(2500)
await p.screenshot({ path: `${dir}/payoff.png` })
await p.keyboard.press('Escape'); await p.waitForTimeout(400)
console.log('payoff closed:', (await p.locator('.ot-payoff').count()) === 0)
await p.click('.ot-gear'); await p.locator('[role=menuitem]', { hasText: 'settings' }).click()
await p.waitForSelector('.ot-toggle'); await p.waitForTimeout(300)
await p.locator('.ot-toggle').screenshot({ path: `${dir}/settings.png` })
console.log('toggle checked:', await p.locator('.ot-toggle input').isChecked(), 'errors:', errs)
await b.close()
