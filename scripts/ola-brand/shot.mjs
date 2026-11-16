#!/usr/bin/env node
// Screenshot a local HTML file or a URL at a given size, to look at design work.
//   node scripts/ola-brand/shot.mjs <file.html | https://url> <out.png> [width=1280] [height=800] [--full]
// --full captures the whole page instead of the first screen. Run from the repo root.
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

const [src, out, w = '1280', h = '800', ...rest] = process.argv.slice(2)
if (!src || !out) {
  console.error('usage: shot.mjs <file.html | url> <out.png> [width] [height] [--full]')
  process.exit(2)
}
const url = /^https?:/.test(src) ? src : pathToFileURL(path.resolve(src)).href
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) }, deviceScaleFactor: 2 })
await page.goto(url, { waitUntil: 'networkidle', timeout: 45_000 })
await page.evaluate(() => document.fonts.ready)
await page.waitForTimeout(400)
await page.screenshot({ path: out, fullPage: rest.includes('--full') || w === '--full' })
await browser.close()
console.log(`wrote ${out}`)
