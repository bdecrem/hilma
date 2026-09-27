// Let the press run clean for a few sheets, then take a sheet's sound off the
// tape: node scripts/drum/pw-listen.mjs <outdir> [url] [--flood]
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const out = process.argv[2] ?? '/tmp/drum-listen'
const url = process.argv.find((a) => a.startsWith('http')) ?? 'http://localhost:3222/drum'
const flood = process.argv.includes('--flood')
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true })
const page = await ctx.newPage()
await page.goto(url)
await page.waitForFunction(() => window.__drum, null, { timeout: 90000 })
await page.evaluate(() => window.__drum.press.start())
if (flood) await page.evaluate(() => window.__drum.press.drums.forEach((d) => (d.ink = 1.35)))
await page.waitForFunction(() => window.__drum.press.sheets.filter((s) => s.kind === 'print').length >= 3, null, { timeout: 60000 })
await page.waitForTimeout(300)
await page.evaluate(() => window.__drum.opts.onTray())
await page.waitForSelector('.drum-tray')
const dl = page.waitForEvent('download')
await page.locator('.drum-tray figure').first().locator('button').nth(1).click()
const d = await dl
const f = `${out}/${flood ? 'flood-' : ''}${d.suggestedFilename()}`
await d.saveAs(f)
await page.locator('.drum-tray .close').click()
await page.waitForTimeout(200)
await page.screenshot({ path: `${out}/${flood ? 'flood-' : ''}running.png` })
console.log(f)
await browser.close()
