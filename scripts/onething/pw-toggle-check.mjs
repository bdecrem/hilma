// The doodles toggle in settings, with a real session: signs in as the
// throwaway Ada through /api/onething/dev/as on a dev server WITHOUT
// ONETHING_DEV_AS (the override answers GET as Bart but PUT needs the cookie),
// flips it off → the API says so and the page shows no doodles and no margin;
// then back on. Writes a screenshot of the page while off.
//   node scripts/onething/pw-toggle-check.mjs <off.png> [url] [user id]
import { chromium, devices } from 'playwright'
const URL = process.argv[3] ?? 'http://localhost:3219'
const AS = process.argv[4] ?? 'd65cc14f-d4b7-4b37-ac17-7bbeac93f4d6' // Ada, +1999…11
const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['iPhone 13'] }); const p = await ctx.newPage()
const errs = []; p.on('pageerror', (e) => errs.push(String(e)))
await p.goto(`${URL}/api/onething/dev/as?id=${AS}`, { waitUntil: 'networkidle' }); await p.waitForSelector('.ot-lines')
await p.click('.ot-gear'); await p.locator('[role=menuitem]', { hasText: 'settings' }).click(); await p.waitForSelector('.ot-toggle')
await p.locator('.ot-toggle input').uncheck(); await p.waitForTimeout(1500)
const r1 = await (await p.request.get(`${URL}/api/onething/me`)).json()
console.log('after off: user.doodles =', r1.user.doodles)
await p.locator('.ot-back .ot-link').click(); await p.waitForSelector('.ot-lines'); await p.waitForTimeout(800)
console.log('doodles shown while off:', await p.locator('.ot-doodle').count(), 'plain:', await p.locator('.ot-lines.plain').count())
await p.screenshot({ path: process.argv[2], fullPage: false })
await p.click('.ot-gear'); await p.locator('[role=menuitem]', { hasText: 'settings' }).click(); await p.waitForSelector('.ot-toggle')
await p.locator('.ot-toggle input').check(); await p.waitForTimeout(1500)
const r2 = await (await p.request.get(`${URL}/api/onething/me`)).json()
console.log('after on: user.doodles =', r2.user.doodles, 'errors:', errs)
await b.close()
