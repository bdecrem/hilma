// Play DRUM headlessly, every gesture, and check the press's state after each:
// node scripts/drum/pw-play.mjs <outdir> [url]
import { chromium } from 'playwright'
import { mkdirSync, statSync } from 'node:fs'

const out = process.argv[2] ?? '/tmp/drum-play'
const url = process.argv.find((a) => a.startsWith('http')) ?? 'http://localhost:3222/drum'
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`))
await page.goto(url)
await page.waitForFunction(() => window.__drum, null, { timeout: 90000 })
await page.waitForTimeout(500)
const L = await page.evaluate(() => ({ s: window.__drum.s, ox: window.__drum.ox, oy: window.__drum.oy }))
const V = (x, y) => [L.ox + x * L.s, L.oy + y * L.s]
const P = (fn) => page.evaluate(fn)
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` })
let fails = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
  if (!ok) fails++
}
const tap = async (x, y) => page.mouse.click(...V(x, y))
const drag = async (x0, y0, x1, y1, ms = 300, steps = 12) => {
  await page.mouse.move(...V(x0, y0))
  await page.mouse.down()
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(...V(x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps))
    await page.waitForTimeout(ms / steps)
  }
  await page.mouse.up()
}

// START
await tap(72, 756)
await page.waitForTimeout(1200)
check('motor runs', await P(() => window.__drum.press.motor))

// punch a hole in the red drum, then tape it shut
const before = await P(() => window.__drum.press.drums[2].holes.length)
await tap(273, 614)
const after = await P(() => window.__drum.press.drums[2].holes.length)
check('punch adds a red hole', after === before + 1, `${before} → ${after}`)

// squeeze the sunflower tube for a second and a half
await page.mouse.move(...V(31, 686))
await page.mouse.down()
await page.waitForTimeout(1500)
await shot('01-squeeze')
await page.mouse.up()
const ink = await P(() => window.__drum.press.drums[3].ink)
check('squeezing floods sunflower', ink > 1.1, ink.toFixed(2))
check('finger is inky', (await P(() => window.__drum.press.finger?.ink)) === 3)

// pull the blue registration off true
await drag(350, 530, 363, 541, 200, 6)
const reg = await P(() => [window.__drum.press.drums[1].regX, window.__drum.press.drums[1].regY])
check('blue registration moved', reg[0] > 0.6 && reg[1] > 0.5, reg.map((v) => v.toFixed(2)).join(','))

// scratch: grab the black drum and drag it back and forth
const pos0 = await P(() => window.__drum.press.pos)
await page.mouse.move(...V(188, 452))
await page.mouse.down()
for (let i = 1; i <= 10; i++) {
  await page.mouse.move(...V(188, 452 - i * 7))
  await page.waitForTimeout(25)
}
await shot('02-scratch')
const grabbed = await P(() => window.__drum.press.grabbed)
for (let i = 1; i <= 10; i++) {
  await page.mouse.move(...V(188, 382 + i * 7))
  await page.waitForTimeout(25)
}
await page.mouse.up()
check('drag grabs the press', grabbed)
check('release hands back to the motor', await P(() => !window.__drum.press.grabbed && window.__drum.press.motor))
const pos1 = await P(() => window.__drum.press.pos)
await page.waitForTimeout(500)
const pos2 = await P(() => window.__drum.press.pos)
check('the motor turns the press again after the scratch', pos2 - pos1 > 3, `${pos1.toFixed(1)} → ${pos2.toFixed(1)} in 0.5 s`)

// touch the paper with the inky finger
await page.waitForTimeout(400)
const top = await P(() => 400 - window.__drum.press.visibleUnits() * 264)
await tap(200, Math.min(392, top + 30))
const fingers = await P(() => window.__drum.press.cur?.marks.filter((m) => m.kind === 'finger').length ?? 0)
check('fingerprint on the sheet', fingers === 1)
await shot('03-fingerprint')

// flick the sheet up: pulled early, paper out, muffled
await page.waitForTimeout(300)
const top2 = await P(() => 400 - window.__drum.press.visibleUnits() * 264)
await drag(200, Math.min(394, top2 + 20), 200, Math.min(394, top2 + 20) - 90, 120, 5)
check('sheet pulled, press runs paperless', await P(() => window.__drum.press.paperless))
await page.waitForTimeout(250)
await shot('04-yank')
await page.waitForFunction(() => !window.__drum.press.paperless, null, { timeout: 12000 })
check('paper feeds again at the next sheet boundary', true)
await page.waitForTimeout(600)
await shot('05-refed')

// hold the sunflower drum: peel the master
await page.mouse.move(...V(150, 686))
await page.mouse.down()
await page.waitForTimeout(900)
await shot('06-peel')
await page.mouse.up()
await page.waitForTimeout(500)
check('peeling clears the sunflower master', (await P(() => window.__drum.press.drums[3].holes.length)) === 0)

// stop: the press coasts down
await tap(169, 756)
await page.waitForTimeout(150)
const coast = await P(() => [window.__drum.press.motor, window.__drum.press.vel])
check('stop coasts', coast[0] === false && coast[1] > 0, `vel ${coast[1].toFixed(2)}`)
await page.waitForTimeout(3000)
check('coast comes to rest', (await P(() => window.__drum.press.vel)) === 0)

// the tray
await tap(335, 23)
await page.waitForSelector('.drum-tray')
await page.waitForTimeout(400)
await shot('07-tray')
const n = await page.locator('.drum-tray figure').count()
check('tray lists the manual and the printed sheets', n >= 2, `${n} figures`)
const blank = await P(() => window.__drum.press.sheets.filter((s) => s.kind === 'print' && !s.marks.some((m) => ['kick', 'hat', 'stab', 'wash'].includes(m.kind))).length)
check('no blank sheets', blank === 0, `${blank} blank`)
const dl = page.waitForEvent('download', { timeout: 20000 })
await page.locator('.drum-tray figure').first().getByText('Save print').click()
const d = await dl
const file = `${out}/saved-${d.suggestedFilename()}`
await d.saveAs(file)
check('save print downloads a png', statSync(file).size > 100000, `${d.suggestedFilename()} ${statSync(file).size} bytes`)
const soundBtn = page.locator('.drum-tray figure').first().locator('button').nth(1)
check('newest sheet still has its sound', await soundBtn.isEnabled(), await soundBtn.textContent())
if (await soundBtn.isEnabled()) {
  const dl2 = page.waitForEvent('download', { timeout: 20000 })
  await soundBtn.click()
  const w = await dl2
  const wf = `${out}/saved-${w.suggestedFilename()}`
  await w.saveAs(wf)
  check('save sound downloads a wav', statSync(wf).size > 200000, `${w.suggestedFilename()} ${statSync(wf).size} bytes`)
}
await page.locator('.drum-tray .close').click()

console.log(errors.length ? errors.join('\n') : 'no page errors')
console.log(fails ? `${fails} failed` : 'all passed')
await browser.close()
process.exit(fails ? 1 : 0)
