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
  const phone = page.locator('.hf-day-phone')
  const current = () => page.textContent('.hf-stepr.on .hf-stepr-text b')
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

  // Every step in The day puts its screen on the phone.
  const names = await page.$$eval('.hf-steps .hf-stepr-text b', (els) => els.map((e) => e.textContent))
  console.log('steps:', names.join(' | '))
  if (names.length !== 5) fail(`expected 5 steps, got ${names.length}`)
  for (const n of names) {
    await page.click(`.hf-steps .hf-stepr:has(b:text-is("${n}"))`)
    await page.waitForTimeout(250)
    if ((await current()) !== n) fail(`clicked ${n}, phone shows ${await current()}`)
  }
  // The three looks: art-only tiles under the header, each linking to its walkthrough in its own fonts.
  const looks = await page.$$eval('#looks .hf-look', (els) => els.map((e) => e.getAttribute('href')))
  if (looks.join(' ') !== '/design/daily-call-arcade /design/daily-call-candy /design/daily-call-sticker') fail(`looks links: ${looks.join(' ')}`)
  const lookFonts = await page.$$eval('#looks .hf-look-stage .w-day-n', (els) => els.map((e) => getComputedStyle(e).fontFamily.split(',')[0].replace(/['"]/g, '')))
  console.log('look fonts:', lookFonts.join(' | '))
  if (lookFonts.length !== 3 || lookFonts[0] === lookFonts[1] || lookFonts[1] === lookFonts[2]) fail(`look previews should use three different display faces, got ${lookFonts.join(' | ')}`)
  const toc = await page.$$eval('.hf-toc a', (els) => els.map((e) => e.getAttribute('href')))
  if (toc.slice(0, 4).join(' ') !== '#day #look #looks #dodo') fail(`chapter nav: ${toc.join(' ')}`)
  await page.locator('#looks').scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(out, 'desktop-looks.png') })
  // Dodo, for reference: a gallery that taps through every screen, and the jellies box.
  await page.locator('#dodo').scrollIntoViewIfNeeded()
  await page.waitForTimeout(500)
  const count = async () => page.$eval('#dodo .hf-gal-nav span', (e) => e.textContent.replace(/\s+/g, ' ').trim())
  const c0 = await count()
  if (!/^\d+ \/ 1[78]$/.test(c0)) fail(`gallery counter should read n / 18, got ${c0}`)
  await page.click('#dodo .hf-gal-ph')
  await page.waitForTimeout(450)
  const c1 = await count()
  if (parseInt(c1) !== (parseInt(c0) % 18) + 1) fail(`tapping the gallery should advance one, ${c0} → ${c1}`)
  const galImg = await page.$eval('#dodo .hf-gal-slide.on', (e) => e.tagName === 'VIDEO' || (e.complete && e.naturalWidth > 0))
  if (!galImg) fail('gallery screen not loaded')
  await page.click('#dodo .hf-gal-nav button[aria-label="Previous screen"]')
  await page.waitForTimeout(200)
  if ((await count()) !== c0) fail('gallery back button')
  console.log('dodo gallery:', c0, '→', c1)
  // The jellies: three slots, no words, characters take turns.
  const shown = () => page.$$eval('#dodo .dj-cell', (els) => els.map((e) => e.getAttribute('aria-label').split('.')[0]))
  const j0 = await shown()
  await page.waitForTimeout(3200)
  const j1 = await shown()
  const jellyImgs = await page.$$eval('#dodo .dj-img:not(.dj-squish)', (els) => els.filter((i) => !(i.complete && i.naturalWidth > 0)).length)
  const jellyWords = await page.$eval('#dodo .dj', (e) => e.innerText.trim())
  console.log('jellies:', j0.join(', '), '→', j1.join(', '))
  if (j0.length !== 3) fail(`expected 3 jelly slots, got ${j0.length}`)
  if (j0.join() === j1.join()) fail('jellies did not take turns')
  if (new Set(j1).size !== 3) fail(`a jelly is in two slots: ${j1.join(', ')}`)
  if (jellyWords) fail(`the jellies box should have no words, has "${jellyWords}"`)
  if (jellyImgs) fail(`${jellyImgs} jelly images not loaded`)
  const cell = page.locator('#dodo .dj-cell').nth(1)
  await cell.dispatchEvent('pointerdown')
  await page.waitForTimeout(60)
  const sq = await cell.evaluate((e) => [e.classList.contains('is-squish'), getComputedStyle(e.querySelector('.dj-squish')).opacity])
  if (!(sq[0] && sq[1] === '1')) fail(`tap did not squish a jelly: ${JSON.stringify(sq)}`)
  await page.waitForTimeout(400)
  if (await cell.evaluate((e) => e.classList.contains('is-squish'))) fail('jelly squish did not release')
  const words = await page.$eval('.hf', (e) => e.innerText.split(/\s+/).length)
  console.log('words on page:', words)
  await page.locator('#dodo').scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(out, 'desktop-dodo.png') })
  await page.locator('#look').scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(out, 'desktop-look.png') })
  await page.close()
}

{
  const page = await browser.newPage({ viewport: { width: 420, height: 912 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  page.on('pageerror', (e) => fail(`mobile pageerror: ${e.message}`))
  await page.goto(`${base}/design/daily-call-v2`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.hf-phone .p2-screen')
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  if (over > 0) fail(`horizontal overflow on phone: ${over}px`)
  const edge = await page.$eval('.hf-phone', (e) => e.getBoundingClientRect().right - window.innerWidth)
  if (edge > 0) fail(`phone frame past the right edge by ${Math.round(edge)}px`)
  await page.screenshot({ path: path.join(out, 'mobile-top.png') })
  await page.locator('#dodo').scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
  // On a phone the Dodo panel stacks: gallery first, the three jelly slots under it, full width.
  const stack = await page.evaluate(() => {
    const g = document.querySelector('#dodo .hf-gal').getBoundingClientRect(), j = document.querySelector('#dodo .dj').getBoundingClientRect()
    return { below: j.top >= g.bottom - 1, jw: Math.round(j.width) }
  })
  if (!stack.below) fail('on a phone the jellies should sit under the Dodo gallery')
  if (stack.jw < 280) fail(`on a phone the jelly slots should span the panel, are ${stack.jw}px`)
  await page.screenshot({ path: path.join(out, 'mobile-dodo.png') })
  await page.screenshot({ path: path.join(out, 'mobile-full.png'), fullPage: true })
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
