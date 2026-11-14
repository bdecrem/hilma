import { chromium } from 'playwright'
const [,, url, out, full] = process.argv
const b = await chromium.launch()
const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage()
await p.goto(url); await p.waitForTimeout(1200)
await p.screenshot({ path: out, fullPage: full === 'full' })
await b.close()
