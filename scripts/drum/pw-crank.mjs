// Turn the press by hand before START, on a small phone: node scripts/drum/pw-crank.mjs <outdir> [url]
import { chromium } from 'playwright'
const out = process.argv[2] ?? '/tmp/drum-crank'
const url = process.argv.find((a) => a.startsWith('http')) ?? 'http://localhost:3222/drum'
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })
const page = await browser.newPage({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2 })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.goto(url)
await page.waitForFunction(() => window.__drum, null, { timeout: 90000 })
const L = await page.evaluate(() => ({ s: window.__drum.s, ox: window.__drum.ox, oy: window.__drum.oy }))
const V = (x, y) => [L.ox + x * L.s, L.oy + y * L.s]
// five hard upward flicks on the red drum
for (let f = 0; f < 5; f++) {
  await page.mouse.move(...V(188, 630))
  await page.mouse.down()
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(...V(188, 630 - i * 9))
    await page.waitForTimeout(12)
  }
  await page.mouse.up()
  await page.waitForTimeout(350)
}
await page.waitForTimeout(1500)
const st = await page.evaluate(() => {
  const p = window.__drum.press
  return { motor: p.motor, pos: +p.pos.toFixed(2), vel: p.vel, marks: p.cur?.marks.filter((m) => m.kind !== 'reg' && m.kind !== 'crop').length ?? 0, smeared: p.cur?.marks.filter((m) => m.smear).length ?? 0 }
})
console.log(JSON.stringify(st))
await page.screenshot({ path: `${out}/crank-se.png` })
console.log(st.marks > 4 && !st.motor && st.pos > 8 ? 'ok hand-cranked prints' : 'FAIL hand crank')
console.log(errors.length ? errors.join('\n') : 'no page errors')
await browser.close()
