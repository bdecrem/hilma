// The sign-in form on a phone, in WebKit: types each input, taps "Text me a
// code", prints the status, the error line and whether the code step opened.
//   node scripts/onething/pw-signin.mjs <shots-dir>
//   OT_URL=http://localhost:3111/onething OT_INPUTS='07911 123456|44 7700 900123' node …
// Only use numbers nobody owns (Ofcom's drama range 07700 900xxx): a number
// that normalizes gets a real code texted to it on production.
import { chromium, webkit, devices } from 'playwright'
const url = process.env.OT_URL || 'https://onething.ink'
const out = process.argv[2]
const inputs = (process.env.OT_INPUTS || '07911 123456|275591|44 7700 900123|0044 7700 900123').split('|')
const engine = process.env.OT_ENGINE === 'chromium' ? chromium : webkit
const b = await engine.launch(process.env.OT_ENGINE === 'chromium' ? { channel: 'chrome' } : {})
const ctx = await b.newContext({ ...devices['iPhone 14'] })
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
page.on('response', (r) => { if (r.url().includes('/api/onething/auth')) console.log('RESP', r.status(), r.url()) })
for (const [i, v] of inputs.entries()) {
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.fill('input[aria-label="Phone number"]', v)
  await page.click('button:has-text("Text me a code")')
  await page.waitForTimeout(Number(process.env.OT_WAIT || 4000))
  const err = await page.locator('.ot-err').allTextContents()
  const stage = await page.locator('input[aria-label="Code"]').count()
  const notes = await page.locator('.ot-box .ot-note').allTextContents()
  console.log(JSON.stringify({ v, err, codeStage: stage, notes }))
  await page.locator('.ot-box').screenshot({ path: `${out}/signin-${i}.png` })
}
await b.close()
