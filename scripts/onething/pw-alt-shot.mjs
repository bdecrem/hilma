// Screenshot the margins experiment (/onething/alt) at phone size against
// the dev server on 3218: node scripts/onething/pw-alt-shot.mjs <out.png>
import { chromium, devices } from 'playwright'
const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['iPhone 13'] })
const p = await ctx.newPage(); const errs = []
p.on('pageerror', (e) => errs.push(String(e)))
await p.goto('http://localhost:3218/onething/alt', { waitUntil: 'networkidle' })
await p.waitForSelector('.alt-lines', { timeout: 30000 }); await p.waitForTimeout(1200)
await p.screenshot({ path: process.argv[2], fullPage: true })
console.log('doodles:', await p.locator('.alt-doodle').count(), 'errors:', errs)
await b.close()
