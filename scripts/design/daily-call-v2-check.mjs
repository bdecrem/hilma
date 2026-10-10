// Drives the daily-call v2 artifact headlessly: the whole day in the phone
// (map → talk plays → three things, three mic taps → cards, nine answers →
// day complete → map done), the four map states, every thumbnail, the phone
// layout and the OG image. Screenshots land in <dir>.
//   node scripts/design/daily-call-v2-check.mjs <dir> [base]
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const out = process.argv[2] || 'out/daily-call-v2'
const base = process.argv[3] || 'http://localhost:3250'
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
  await page.goto(`${base}/design/daily-call-v2`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.hf-phone .p2-screen')
  const phone = page.locator('.hf-left')
  const current = () => page.textContent('.hf-current b')
  const snap = (n) => phone.screenshot({ path: path.join(out, `${n}.png`) })
  await page.screenshot({ path: path.join(out, 'desktop-top.png') })

  // Map states.
  for (const [label, needle] of [
    ['Morning', 'Start today'],
    ['After the talk', 'Next: Three things'],
    ['After three things', 'Next: Cards'],
    ['Cards paused', 'Resume cards'],
    ['Done', 'Tomorrow'],
  ]) {
    await page.click(`.hf-pill:text-is("${label}")`)
    await page.waitForTimeout(250)
    const txt = await page.textContent('.hf-phone .p2-today')
    if (!txt.includes(needle)) fail(`map ${label}: expected "${needle}" in today card`)
    await snap(`map-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`)
  }

  // The whole day, in the phone.
  await page.click('.hf-pill:text-is("Morning")')
  await page.click('.hf-phone .p2-btn:text-is("Start today")')
  await page.waitForTimeout(300)
  if ((await current()) !== 'Part 1 · Talk') fail('Start today did not open Talk')
  await page.waitForTimeout(1500)
  const t1 = await page.textContent('.hf-phone .p2-timer')
  await page.waitForTimeout(9500)
  const t2 = await page.textContent('.hf-phone .p2-timer')
  console.log('timer', t1, '→', t2)
  if (t1 === t2) fail('timer not counting')
  if (!(await page.locator('.hf-phone .p2-fixchip').count())) fail('fix chip never appeared')
  await snap('talk-mid')
  await page.waitForSelector('.hf-phone .p2-things', { timeout: 40000 })
  if ((await current()) !== 'Part 2 · Three things') fail('talk did not hand into three things')

  // Three things: the walkthrough plays one card. Tap the mic when it is live.
  await page.waitForSelector('.hf-phone button.p2-mic', { timeout: 8000 })
  await snap('things-your-turn')
  await page.click('.hf-phone button.p2-mic')
  await page.waitForSelector('.hf-phone .p2-speech.got', { timeout: 5000 })
  await snap('things-got-it')
  await page.waitForSelector('.hf-phone .p2-cards', { timeout: 8000 })
  if ((await current()) !== 'Part 3 · Cards') fail('three things did not hand into cards')

  // Cards: the walkthrough plays question 1 (pick) and question 6 (type),
  // with a leave and resume in between.
  await page.waitForSelector('.hf-phone .p2-option', { timeout: 8000 })
  await snap('cards-pick')
  await page.click('.hf-phone .p2-option:text-is("madrugar")')
  await page.waitForSelector('.hf-phone .p2-option.right', { timeout: 3000 })
  await snap('cards-right')
  await page.waitForTimeout(1500)
  await page.waitForSelector('.hf-phone .p2-input', { timeout: 5000 })
  await page.click('.hf-phone .p2-close')
  await page.waitForTimeout(300)
  const pausedTxt = await page.textContent('.hf-phone .p2-today')
  if (!pausedTxt.includes('1 of 10')) fail(`paused map should say "1 of 10", got: ${pausedTxt}`)
  await snap('map-paused')
  await page.click('.hf-phone .p2-btn:text-is("Resume cards")')
  await page.waitForSelector('.hf-phone .p2-input', { timeout: 5000 })
  const modeTxt = await page.textContent('.hf-phone .p2-mode')
  if (!modeTxt.startsWith('6')) fail(`resume should land on question 6, got "${modeTxt}"`)
  await snap('cards-type')
  await page.fill('.hf-phone .p2-input', 'voy por tren')
  await page.press('.hf-phone .p2-input', 'Enter')
  await page.waitForSelector('.hf-phone .p2-flash.miss', { timeout: 3000 })
  await snap('cards-type-miss')
  await page.waitForSelector('.hf-phone .p2-done', { timeout: 8000 })
  if ((await current()) !== 'Day complete') fail('cards did not hand into day complete')
  const totals = await page.textContent('.hf-phone .p2-totals')
  if (!totals.includes('9 / 10')) fail(`expected 9 / 10 cards on the done screen, got: ${totals}`)
  const backTxt = await page.textContent('.hf-phone .p2-back')
  if (!backTxt.includes('voy en tren')) fail('the typed miss should come back tomorrow')
  await snap('done')
  await page.click('.hf-phone .p2-btn:text-is("Back to the map")')
  await page.waitForTimeout(300)
  const after = await page.textContent('.hf-phone .p2-today')
  if (!after.includes('Tomorrow')) fail('Back to the map did not land on the done map')
  await snap('map-after-loop')

  // Every thumbnail in Screens.
  const names = await page.$$eval('.hf-screens .hf-thumb-label', (els) => els.map((e) => e.textContent))
  console.log('screens:', names.join(' | '))
  if (names.length !== 5) fail(`expected 5 screen notes, got ${names.length}`)
  for (const n of names) {
    await page.click(`.hf-screens .hf-thumb:has(.hf-thumb-label:text-is("${n}"))`)
    await page.waitForTimeout(250)
    if ((await current()) !== n) fail(`clicked ${n}, phone shows ${await current()}`)
  }
  // The three looks: three cards, each linking to its walkthrough, each with a live preview in its own fonts.
  const looks = await page.$$eval('#looks .hf-look', (els) => els.map((e) => e.getAttribute('href')))
  if (looks.join(' ') !== '/design/daily-call-arcade /design/daily-call-candy /design/daily-call-sticker') fail(`looks links: ${looks.join(' ')}`)
  const lookFonts = await page.$$eval('#looks .hf-look-stage .w-day-n', (els) => els.map((e) => getComputedStyle(e).fontFamily.split(',')[0].replace(/['"]/g, '')))
  console.log('look fonts:', lookFonts.join(' | '))
  if (lookFonts.length !== 3 || lookFonts[0] === lookFonts[1] || lookFonts[1] === lookFonts[2]) fail(`look previews should use three different display faces, got ${lookFonts.join(' | ')}`)
  await page.locator('#looks').scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(out, 'desktop-looks.png') })
  await page.locator('#look').scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(out, 'desktop-look.png') })
  await page.close()
}

{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  page.on('pageerror', (e) => fail(`mobile pageerror: ${e.message}`))
  await page.goto(`${base}/design/daily-call-v2`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.hf-phone .p2-screen')
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  if (over > 0) fail(`horizontal overflow on phone: ${over}px`)
  const edge = await page.$eval('.hf-phone', (e) => e.getBoundingClientRect().right - window.innerWidth)
  if (edge > 0) fail(`phone frame past the right edge by ${Math.round(edge)}px`)
  await page.screenshot({ path: path.join(out, 'mobile-top.png') })
  await page.close()
}

{
  const res = await fetch(`${base}/design/daily-call-v2/opengraph-image`)
  console.log('og', res.status, res.headers.get('content-type'))
  if (res.status !== 200) fail(`og image ${res.status}`)
  else writeFileSync(path.join(out, 'og.png'), Buffer.from(await res.arrayBuffer()))
}

await browser.close()
console.log(errors.length ? `\n${errors.length} failure(s)` : '\nall checks passed')
process.exit(errors.length ? 1 : 0)
