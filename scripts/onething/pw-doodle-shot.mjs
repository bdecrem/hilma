// Screenshot the journal at phone size with its doodles (dev server with
// ONETHING_DEV_AS set): node scripts/onething/pw-doodle-shot.mjs <out.png>
// Prints the doodle count and any page errors. Server: http://localhost:3218.
import { chromium, devices } from 'playwright'
const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['iPhone 13'] })
const p = await ctx.newPage(); const errs = []
p.on('pageerror', (e) => errs.push(String(e)))
await p.goto('http://localhost:3218/onething', { waitUntil: 'networkidle' })
await p.waitForSelector('.ot-lines', { timeout: 20000 })
await p.waitForTimeout(800)
const n = await p.locator('.ot-doodle').count()
await p.screenshot({ path: process.argv[2], fullPage: true })
console.log('doodles on page:', n, 'errors:', errs)
await b.close()
