// Every milestone payoff (/onething/grow?streak=N) in a phone viewport against
// a dev server on 3218: a still as the drop falls, one mid-growth, and the
// finale two and a half seconds after arrival. Prints page errors.
//   node scripts/onething/pw-milestones.mjs <dir> [3,7,14,30,60,100,365] [--desktop]
import { chromium, devices } from 'playwright'
import fs from 'node:fs'
const dir = process.argv[2]; fs.mkdirSync(dir, { recursive: true })
const list = (process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : '3,7,14,30,60,100,365').split(',').map(Number)
const desktop = process.argv.includes('--desktop')
const b = await chromium.launch()
const errs = []
for (const n of list) {
  const ctx = await b.newContext(desktop ? { viewport: { width: 1280, height: 860 } } : { ...devices['iPhone 13'] })
  const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(`${n}: ${e}`))
  await p.goto(`http://localhost:3218/onething/grow?streak=${n}`, { waitUntil: 'networkidle' })
  await p.waitForSelector('.ot-payoff canvas')
  await p.waitForTimeout(450); await p.screenshot({ path: `${dir}/${n}-a-drop.png` })
  await p.waitForTimeout(1900); await p.screenshot({ path: `${dir}/${n}-b-grow.png` })
  await p.waitForSelector('.ot-payoff-foot.in', { timeout: 15000 })
  await p.waitForTimeout(2500); await p.screenshot({ path: `${dir}/${n}-c-finale.png` })
  console.log(n, 'arrived:', await p.locator('.ot-payoff-name').innerText())
  await ctx.close()
}
console.log('page errors:', errs.length ? errs : 'none')
await b.close()
