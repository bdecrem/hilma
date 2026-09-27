// Drive DRUM headlessly and take screenshots: node scripts/drum/pw-shot.mjs <outdir> [url] [--desk]
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const out = process.argv[2] ?? '/tmp/drum-shots'
const url = process.argv.find((a) => a.startsWith('http')) ?? 'http://localhost:3222/drum'
const desk = process.argv.includes('--desk')
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })
const ctx = await browser.newContext(
  desk
    ? { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }
    : { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
)
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`))
await page.goto(url)
await page.waitForFunction(() => window.__drum, null, { timeout: 90000 })
await page.waitForTimeout(700)
const tag = desk ? 'desk' : 'phone'
await page.screenshot({ path: `${out}/${tag}-01-idle.png` })
const L = await page.evaluate(() => ({ s: window.__drum.s, ox: window.__drum.ox, oy: window.__drum.oy }))
const V = (x, y) => ({ x: L.ox + x * L.s, y: L.oy + y * L.s })
const tap = async (x, y) => {
  const p = V(x, y)
  await page.mouse.click(p.x, p.y)
}
await tap(72, 756) // START
await page.waitForTimeout(3200)
await page.screenshot({ path: `${out}/${tag}-02-running.png` })
await page.waitForTimeout(6500)
await page.screenshot({ path: `${out}/${tag}-03-first-sheet.png` })
if (process.argv.includes('--long')) {
  await page.waitForTimeout(24000)
  await page.screenshot({ path: `${out}/${tag}-04-wall.png` })
}
const state = await page.evaluate(() => {
  const p = window.__drum.press
  return { pos: p.pos, sheets: p.sheets.length, motor: p.motor, ink: p.drums.map((d) => +d.ink.toFixed(3)), audio: p.audio?.ctx.state }
})
console.log(JSON.stringify(state))
console.log(errors.length ? errors.join('\n') : 'no page errors')
await browser.close()
