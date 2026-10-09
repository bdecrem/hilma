// Drives the daily-call design artifact headlessly: every screen on the phone,
// the call playing through to the summary, the Today states, an accent swap,
// desktop and phone layouts. Screenshots land in <dir>.
//   node scripts/design/daily-call-check.mjs <dir> [base]
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const out = process.argv[2] || 'out/daily-call'
const base = process.argv[3] || 'http://localhost:3250'
mkdirSync(out, { recursive: true })
const shot = (page, name) => page.screenshot({ path: path.join(out, `${name}.png`), fullPage: false })

const errors = []
const browser = await chromium.launch()
const fail = (m) => {
  errors.push(m)
  console.log('FAIL', m)
}

// ---- desktop ----
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  page.on('pageerror', (e) => fail(`pageerror: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && fail(`console: ${m.text()}`))
  await page.goto(`${base}/design/daily-call`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.dc-phone .ph-screen')
  await shot(page, 'desktop-top')

  // Every thumbnail in the Screens section shows its screen on the phone.
  const names = await page.$$eval('.dc-screens .dc-thumb-label', (els) => els.map((e) => e.textContent))
  console.log('screens:', names.join(' | '))
  if (names.length !== 11) fail(`expected 11 screen notes, got ${names.length}`)
  for (const n of names) {
    await page.click(`.dc-screens .dc-thumb:has(.dc-thumb-label:text-is("${n}"))`)
    await page.waitForTimeout(250)
    const cur = await page.textContent('.dc-current b')
    if (cur !== n) fail(`clicked ${n}, phone shows ${cur}`)
    const slug = n.toLowerCase().replace(/[^a-z]+/g, '-')
    await page.locator('.dc-left').screenshot({ path: path.join(out, `phone-${slug}.png`) })
  }

  // Today's three states.
  await page.click('.dc-screens .dc-thumb:has(.dc-thumb-label:text-is("Today"))')
  for (const s of ['Before the call', 'After', 'Missed yesterday']) {
    await page.click(`.dc-pill:text-is("${s}")`)
    await page.waitForTimeout(200)
    const txt = await page.textContent('.dc-phone .ph-today-card')
    if (s === 'After' && !/Done for today/.test(txt)) fail('after state missing "Done for today"')
    if (s === 'Missed yesterday' && !/slipped/.test(txt)) fail('missed state missing "slipped"')
    if (s === 'Before the call' && !/Start the call/.test(txt)) fail('before state missing button')
    await page.locator('.dc-left').screenshot({ path: path.join(out, `today-${s.split(' ')[0].toLowerCase()}.png`) })
  }

  // In-phone navigation: Today → Start the call → the call plays → Summary → Done → Today (after).
  await page.click('.dc-pill:text-is("Before the call")')
  await page.click('.dc-phone .ph-btn:text-is("Start the call")')
  await page.waitForTimeout(1600)
  const t1 = await page.textContent('.dc-phone .ph-timer')
  await page.waitForTimeout(9000)
  const t2 = await page.textContent('.dc-phone .ph-timer')
  console.log('timer', t1, '→', t2)
  if (!/^\d:\d\d$/.test(t2) || t1 === t2) fail(`timer not counting: ${t1} → ${t2}`)
  const fixVisible = await page.locator('.dc-phone .ph-fix').count()
  if (!fixVisible) fail('fix label never appeared during the call')
  await page.locator('.dc-left').screenshot({ path: path.join(out, 'call-mid.png') })
  await page.waitForSelector('.dc-phone .ph-sum', { timeout: 40000 })
  await page.locator('.dc-left').screenshot({ path: path.join(out, 'summary-after-call.png') })
  await page.click('.dc-phone .ph-btn:text-is("Done")')
  await page.waitForTimeout(250)
  const after = await page.textContent('.dc-phone .ph-today-card')
  if (!/Done for today/.test(after)) fail('Done did not land on Today (after)')

  // Message link → Today; rows → Level/Notebook → back keeps the state.
  await page.click('.dc-screens .dc-thumb:has(.dc-thumb-label:text-is("The daily text"))')
  await page.click('.dc-phone .ph-sms-link')
  await page.waitForTimeout(200)
  if ((await page.textContent('.dc-current b')) !== 'Today') fail('sms link did not open Today')
  await page.click('.dc-phone .ph-row:has-text("Level")')
  await page.waitForTimeout(200)
  if ((await page.textContent('.dc-current b')) !== 'Level') fail('Level row did not open Level')
  await page.click('.dc-phone .ph-back')
  await page.waitForTimeout(200)
  if ((await page.textContent('.dc-current b')) !== 'Today') fail('back did not return to Today')

  // Onboarding chain.
  await page.click('.dc-screens .dc-thumb:has(.dc-thumb-label:text-is("Welcome"))')
  for (const b of ['Get started', 'Continue', 'Continue']) {
    await page.click(`.dc-phone .ph-btn:text-is("${b}")`)
    await page.waitForTimeout(200)
  }
  if ((await page.textContent('.dc-current b')) !== 'Time and number') fail('onboarding chain broke')

  // Accent swap recolors the primary button.
  await page.click('.dc-screens .dc-thumb:has(.dc-thumb-label:text-is("Today"))')
  await page.click('.dc-pill:text-is("Before the call")')
  await page.waitForTimeout(200)
  const primary = '.dc-phone .ph-btn:text-is("Start the call")'
  const before = await page.$eval(primary, (e) => getComputedStyle(e).backgroundColor)
  await page.click('.dc-swatch[aria-label="Blue"]')
  await page.waitForTimeout(200)
  const afterC = await page.$eval(primary, (e) => getComputedStyle(e).backgroundColor)
  console.log('accent', before, '→', afterC)
  if (before === afterC) fail('accent swatch did not recolor the button')
  await page.locator('#tokens').scrollIntoViewIfNeeded()
  await shot(page, 'desktop-tokens')
  await page.click('.dc-swatch[aria-label="Ink (default)"]')

  // Keyboard.
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(150)
  if ((await page.textContent('.dc-current b')) !== 'The call') fail('ArrowRight did not advance from Today to The call')
  await page.close()
}

// ---- phone ----
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  page.on('pageerror', (e) => fail(`mobile pageerror: ${e.message}`))
  await page.goto(`${base}/design/daily-call`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.dc-phone .ph-screen')
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  if (over > 0) fail(`horizontal overflow on phone: ${over}px`)
  await shot(page, 'mobile-top')
  await page.screenshot({ path: path.join(out, 'mobile-full.png'), fullPage: true })
  await page.close()
}

// ---- OG ----
{
  const res = await fetch(`${base}/design/daily-call/opengraph-image`)
  console.log('og', res.status, res.headers.get('content-type'))
  if (res.status !== 200) fail(`og image ${res.status}`)
  else {
    const buf = Buffer.from(await res.arrayBuffer())
    const { writeFileSync } = await import('node:fs')
    writeFileSync(path.join(out, 'og.png'), buf)
  }
}

await browser.close()
console.log(errors.length ? `\n${errors.length} failure(s)` : '\nall checks passed')
process.exit(errors.length ? 1 : 0)
