import { chromium, devices } from 'playwright'
const base = 'http://localhost:3000'
const shots = process.argv[2]
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ ...devices['iPhone 14'], viewport: { width: 390, height: 844 } })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`) })
const t0 = Date.now(); const stamp = () => `${((Date.now() - t0) / 1000).toFixed(0)}s`

await page.goto(`${base}/socratic`, { waitUntil: 'networkidle' })
await page.getByRole('link', { name: /create a new topic/i }).click()
await page.waitForURL(/\/socratic\/new/)
await page.screenshot({ path: `${shots}/new-0-form.png`, fullPage: true })
console.log(`[${stamp()}] new-topic page; draft button disabled: ${await page.getByRole('button', { name: /draft the topic/i }).isDisabled()}`)
await page.getByRole('button', { name: /use this example/i }).click()
console.log(`[${stamp()}] example filled; course = ${await page.locator('#soc-course').inputValue()}`)
await page.getByRole('button', { name: /draft the topic/i }).click()
await page.waitForSelector('.soc-drafting', { timeout: 10000 })
await page.waitForTimeout(3000)
await page.screenshot({ path: `${shots}/new-1-drafting.png` })
console.log(`[${stamp()}] drafting… (${await page.locator('.soc-elapsed').innerText()})`)
await page.waitForSelector('.soc-notes, .soc-error', { timeout: 600000 })
const err = await page.locator('.soc-error').first().innerText().catch(() => '')
if (err) { console.log('ERROR', err); await page.screenshot({ path: `${shots}/new-err.png`, fullPage: true }); process.exit(1) }
await page.screenshot({ path: `${shots}/new-2-done.png`, fullPage: true })
console.log(`[${stamp()}] done: ${await page.locator('h1').innerText()} — ${await page.locator('.soc-sub').innerText()}`)
console.log(`notes (first 300): ${(await page.locator('.soc-notes').innerText()).slice(0, 300)}`)
await page.getByRole('link', { name: /start a session/i }).click()
await page.waitForURL(/\/socratic\?module=/)
await page.waitForSelector('#soc-module')
console.log(`[${stamp()}] start page picker: ${await page.locator('#soc-module').inputValue()} / h1: ${await page.locator('h1').innerText()}`)
console.log(`options: ${(await page.locator('#soc-module option').allInnerTexts()).join(' | ')}`)
await page.screenshot({ path: `${shots}/new-3-start.png`, fullPage: true })
if (errors.length) console.log('page errors:\n' + errors.join('\n'))
console.log(`MODULE=${await page.locator('#soc-module').inputValue()}`)
await browser.close()
