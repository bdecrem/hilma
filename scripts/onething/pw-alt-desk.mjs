// Screenshot the margins experiment at desktop width (1280×900, first screen)
// against the dev server on 3218: node scripts/onething/pw-alt-desk.mjs <out.png>
import { chromium } from 'playwright'
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 900 } })
await p.goto('http://localhost:3218/onething/alt', { waitUntil: 'networkidle' })
await p.waitForSelector('.alt-lines'); await p.waitForTimeout(1200)
await p.screenshot({ path: process.argv[2], fullPage: false })
await b.close()
