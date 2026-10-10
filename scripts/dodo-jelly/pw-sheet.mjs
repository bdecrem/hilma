// Checks the avatar sheet on the landing page: desktop + phone, light + dark
// shots of the section, a tap that squishes, no horizontal overflow, every
// image loaded. usage: node scripts/dodo-jelly/pw-sheet.mjs <shots-dir> [url]
import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'

const out = process.argv[2]; fs.mkdirSync(out, { recursive: true })
const url = process.argv[3] || 'http://localhost:3250/dodo'
const b = await chromium.launch()
const fails = []
for (const [name, vp, scheme] of [['desktop', { width: 1280, height: 900 }, 'light'], ['desktop-dark', { width: 1280, height: 900 }, 'dark'], ['phone', { width: 390, height: 844 }, 'light'], ['phone-dark', { width: 390, height: 844 }, 'dark']]) {
  const page = await b.newPage({ viewport: vp, deviceScaleFactor: 2, colorScheme: scheme })
  await page.goto(url, { waitUntil: 'networkidle' })
  const sec = page.locator('section.da-cast')
  await sec.scrollIntoViewIfNeeded()
  await page.waitForTimeout(600)
  const loaded = await page.$$eval('.dj-img', (imgs) => imgs.map((i) => [i.getAttribute('src'), i.complete && i.naturalWidth > 0]))
  const bad = loaded.filter(([, ok]) => !ok).map(([s]) => s)
  if (bad.length) fails.push(name + ': images not loaded ' + bad.slice(0, 3).join(' '))
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  if (overflow > 0) fails.push(name + ': horizontal overflow ' + overflow + 'px')
  const box = await sec.boundingBox()
  const cells = await page.$$eval('.dj li', (els) => els.map((e) => e.getBoundingClientRect().width))
  console.log(name, 'section', Math.round(box.width) + 'x' + Math.round(box.height), 'cells', cells.length, 'cell w', Math.round(cells[0]), 'cols', await page.$eval('.dj', (e) => getComputedStyle(e).gridTemplateColumns.split(' ').length))
  // the sheet is wider than the section's box, so clip around the sheet itself
  const shot = async (file) => {
    const r = await page.evaluate(() => {
      const s = document.querySelector('section.da-cast').getBoundingClientRect(), g = document.querySelector('.dj').getBoundingClientRect()
      return { x: Math.max(0, g.left - 24), y: s.top + window.scrollY, w: Math.min(window.innerWidth, g.width + 48), h: s.height + 8 }
    })
    await page.screenshot({ path: path.join(out, file), fullPage: true, clip: { x: r.x, y: r.y, width: r.w, height: r.h } })
  }
  await shot(`sheet-${name}.png`)
  if (name === 'desktop') {
    const cell = page.locator('.dj-cell').nth(5)
    await cell.dispatchEvent('pointerdown')
    await page.waitForTimeout(60)
    const sq = await cell.evaluate((e) => [e.classList.contains('is-squish'), getComputedStyle(e.querySelector('.dj-squish')).opacity])
    if (!(sq[0] && sq[1] === '1')) fails.push('tap did not squish ' + JSON.stringify(sq))
    await page.waitForTimeout(80)
    await shot('sheet-squish.png')
    await page.waitForTimeout(400)
    const back = await cell.evaluate((e) => e.classList.contains('is-squish'))
    if (back) fails.push('squish did not release')
    await page.screenshot({ path: path.join(out, 'page-desktop.png'), fullPage: true })
  }
  await page.close()
}
await b.close()
if (fails.length) { console.log('FAIL\n' + fails.join('\n')); process.exit(1) }
console.log('ok')
