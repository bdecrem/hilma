// Screenshots the start of every room at a phone width (and a desktop width).
//   npx tsx scripts/woodworker/pw-shots.ts <out-dir> [base=http://localhost:3255] [width=390]
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { LEVELS } from '../../src/app/woodworker/lib/levels'

const [out = '/tmp/ww', base = 'http://localhost:3255', width = '390'] = process.argv.slice(2)
mkdirSync(out, { recursive: true })

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: Number(width), height: 1000 }, deviceScaleFactor: 2 })
  await page.goto(`${base}/woodworker`)
  await page.waitForSelector('.note')
  for (let i = 0; i < LEVELS.length; i++) {
    await page.locator('.lvl').nth(i).click()
    await page.waitForTimeout(400)
    const stage = page.locator('.stage-wrap')
    await stage.scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${out}/${i + 1}-${LEVELS[i].id}.png`, fullPage: true })
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    console.log(`${LEVELS[i].id}: horizontal overflow ${overflow}px`)
  }
  await browser.close()
}
main()
