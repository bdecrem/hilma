// Shots of ola.cx/dodo-motion (the method page), its OG card and the hosted player.
//   node scripts/dodo-motion/page-check.mjs <shots-dir> [base]   (default base http://localhost:3250)
import { chromium } from 'playwright'
const out = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:3250'
const b = await chromium.launch()
const errs = []
const p = await b.newPage({ viewport: { width: 1280, height: 900 } })
p.on('pageerror', (e) => errs.push(String(e)))
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()) })
await p.goto(BASE + '/dodo-motion', { waitUntil: 'networkidle', timeout: 120000 })
await p.screenshot({ path: out + '/page-desktop.png', fullPage: true })
await p.setViewportSize({ width: 390, height: 844 })
await p.waitForTimeout(300)
await p.screenshot({ path: out + '/page-phone.png', fullPage: true })
const sw = await p.evaluate(() => document.documentElement.scrollWidth)
console.log('phone scrollWidth', sw)
await p.goto(BASE + '/dodo-motion/one-unit-apart.html', { waitUntil: 'load', timeout: 60000 })
await p.waitForTimeout(3500)
await p.screenshot({ path: out + '/player-phone.png' })
await p.goto(BASE + '/dodo-motion/opengraph-image', { timeout: 120000 })
await p.screenshot({ path: out + '/og.png' })
console.log('errors:', errs.length ? errs : 'none')
await b.close()
