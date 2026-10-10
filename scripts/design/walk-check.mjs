// Drives one styled walkthrough (arcade | candy | sticker): the whole day in
// the phone, the six slides via the arrows, the phone layout at phone width,
// and the OG image. Screenshots land in <dir>.
//   node scripts/design/walk-check.mjs <dir> <slug> [base]
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const out = process.argv[2] || 'out/walk'
const slug = process.argv[3] || 'arcade'
const base = process.argv[4] || 'http://localhost:3250'
const url = `${base}/design/daily-call-${slug}`
mkdirSync(out, { recursive: true })
const errors = []
const fail = (m) => {
  errors.push(m)
  console.log('FAIL', m)
}
const browser = await chromium.launch()

{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  page.on('pageerror', (e) => fail(`pageerror: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && fail(`console: ${m.text()}`))
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForSelector('.sl-phone .w-screen')
  await page.waitForTimeout(600)
  const snap = (n) => page.screenshot({ path: path.join(out, `${slug}-${n}.png`) })
  const label = () => page.textContent('.sl-label')

  await snap('1-map')
  // The day, in the phone.
  await page.click('.sl-phone .w-btn:text-is("Start today")')
  await page.waitForSelector('.sl-phone .w-talk', { timeout: 3000 })
  if (!(await label()).includes('Talk')) fail('slide label did not follow into Talk')
  await page.waitForTimeout(10500)
  if (!(await page.locator('.sl-phone .w-fixchip').count())) fail('fix chip never appeared')
  await snap('2-talk')
  await page.waitForSelector('.sl-phone .w-things', { timeout: 40000 })
  await page.waitForSelector('.sl-phone button.w-mic', { timeout: 8000 })
  await snap('3-things')
  await page.click('.sl-phone button.w-mic')
  await page.waitForSelector('.sl-phone .w-speech.got', { timeout: 5000 })
  await snap('3b-got-it')
  await page.waitForSelector('.sl-phone .w-option', { timeout: 8000 })
  await snap('4-cards')
  await page.click('.sl-phone .w-option:text-is("madrugar")')
  await page.waitForSelector('.sl-phone .w-option.right', { timeout: 3000 })
  await snap('4b-right')
  await page.waitForSelector('.sl-phone .w-input', { timeout: 6000 })
  await page.fill('.sl-phone .w-input', 'voy por tren')
  await page.press('.sl-phone .w-input', 'Enter')
  await page.waitForSelector('.sl-phone .w-flash.miss', { timeout: 3000 })
  await snap('4c-miss')
  await page.waitForSelector('.sl-phone .w-done', { timeout: 8000 })
  await page.waitForTimeout(700)
  await snap('5-done')
  const totals = await page.textContent('.sl-phone .w-totals')
  if (!totals.includes('9 / 10')) fail(`expected 9 / 10 on done, got ${totals}`)
  await page.click('.sl-phone .w-btn:text-is("Back to the map")')
  await page.waitForTimeout(400)
  if (!(await label()).includes('Map, done')) fail('Back to the map did not land on the done slide')
  await snap('6-map-done')

  // Slides by arrow: six, wrapping.
  const seen = []
  for (let i = 0; i < 6; i++) {
    await page.click('.sl-arrow[aria-label="Next slide"]')
    await page.waitForTimeout(300)
    seen.push((await page.textContent('.sl-label small')).trim())
  }
  console.log('slides:', seen.join(' | '))
  if (seen[5] !== '6 of 6') fail(`arrow stepping ended on ${seen[5]}`)
  await page.close()
}

{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  page.on('pageerror', (e) => fail(`mobile pageerror: ${e.message}`))
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForSelector('.sl-phone .w-screen')
  await page.waitForTimeout(500)
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  if (over > 0) fail(`horizontal overflow on phone: ${over}px`)
  const edge = await page.$eval('.sl-phone', (e) => e.getBoundingClientRect().right - window.innerWidth)
  if (edge > 0) fail(`phone frame past the right edge by ${Math.round(edge)}px`)
  await page.screenshot({ path: path.join(out, `${slug}-mobile.png`) })
  await page.close()
}

{
  const res = await fetch(`${url}/opengraph-image`)
  console.log('og', res.status, res.headers.get('content-type'))
  if (res.status !== 200) fail(`og image ${res.status}`)
  else writeFileSync(path.join(out, `${slug}-og.png`), Buffer.from(await res.arrayBuffer()))
}

await browser.close()
console.log(errors.length ? `\n${slug}: ${errors.length} failure(s)` : `\n${slug}: all checks passed`)
process.exit(errors.length ? 1 : 0)
