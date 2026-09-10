// Renders /hi/card at 1600x900 (2x) and writes the LinkedIn share image to the Desktop.
// Needs the dev server running:  pnpm dev -p 3100
import { chromium } from 'playwright'
import { homedir } from 'node:os'
import { join } from 'node:path'

const URL = process.env.CARD_URL || 'http://localhost:3100/hi/card'
const OUT = process.argv[2] || join(homedir(), 'Desktop', 'bartin16-linkedin.png')

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 })
await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForTimeout(900)
await page.screenshot({ path: OUT, clip: { x: 0, y: 0, width: 1600, height: 900 } })
await browser.close()
console.log('wrote', OUT, '(3200x1800)')
