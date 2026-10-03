// Headless check for the level-15 minigame mockups in public/dodo/level15.
//
//   python3 -m http.server 8123 --directory public      (from the repo root)
//   node scripts/dodo-level15/pw-check.mjs <shots-dir> [http://localhost:8123] [pebble|dive|all]
//
// Phone viewport 390x844 @2x: loads each page, fails on page/console errors,
// starts a round through window.__game, plays it with simulated input, checks
// that the score advances and the end card appears, and saves screenshots
// (start, mid-play, end, plus the desktop phone-frame view at 1280x900).

import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const [, , outDir = '/tmp/level15-shots', base = 'http://localhost:8123', which = 'all'] = process.argv
mkdirSync(outDir, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failed = false
const ok = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) failed = true }

const browser = await chromium.launch()
async function open(url, viewport, dsf) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dsf, hasTouch: true, isMobile: viewport.width < 500 })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })
  page.on('crash', () => errors.push('CRASH'))
  await page.goto(url, { waitUntil: 'load' })
  await sleep(600)
  return { ctx, page, errors }
}

async function desktopShot(file, name) {
  const { ctx, page, errors } = await open(`${base}/dodo/level15/${file}`, { width: 1280, height: 900 }, 1)
  await page.screenshot({ path: join(outDir, `${name}-desktop.png`) })
  ok(errors.length === 0, `${name} desktop: no errors ${errors.join(' | ')}`)
  await ctx.close()
}

async function checkPebble() {
  const { ctx, page, errors } = await open(`${base}/dodo/level15/pebble-skip.html`, { width: 390, height: 844 }, 2)
  await page.screenshot({ path: join(outDir, 'pebble-start.png') })
  await page.evaluate(() => window.__game.start())
  await sleep(300)
  // Five throws; a tapper inside the page taps when the stone is inside its window.
  const result = await page.evaluate(async () => {
    const g = window.__game, sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    let maxRun = 0
    const t0 = performance.now()
    while (g.state().phase !== 'end' && performance.now() - t0 < 40000) {
      const s = g.state()
      if (s.phase === 'aim') { g.throw((Math.random() - .5) * .4, .55 + Math.random() * .45); await sleep(60); continue }
      if (s.phase === 'flight' && s.stoneState === 'flight' && s.tti <= s.window * .6 && s.tti > 0.005) g.tap()
      if (s.run > maxRun) maxRun = s.run
      await sleep(8)
    }
    return { ...g.state(), maxRun }
  })
  console.log('pebble result', JSON.stringify(result))
  ok(result.score >= 6, `pebble: score advanced (${result.score})`)
  ok(result.phase === 'end', `pebble: round ended (phase ${result.phase})`)
  const endVisible = await page.evaluate(() => !document.getElementById('end').classList.contains('hidden'))
  ok(endVisible, 'pebble: end card visible')
  await sleep(500)
  await page.screenshot({ path: join(outDir, 'pebble-end.png') })
  // Mid-play shot: start again, throw once, grab a frame while the stone is in the air with a few skips.
  await page.evaluate(() => window.__game.start())
  await sleep(200)
  await page.evaluate(async () => {
    const g = window.__game, sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    g.throw(.15, .9)
    const t0 = performance.now()
    while (performance.now() - t0 < 4000) {
      const s = g.state()
      if (s.phase !== 'flight') break
      if (s.stoneState === 'flight' && s.tti <= s.window * .6 && s.tti > 0.005) g.tap()
      if (s.run >= 4 && s.tti > 0.12) break
      await sleep(8)
    }
  })
  await page.screenshot({ path: join(outDir, 'pebble-mid.png') })
  // Also the aim preview: a drag in progress.
  await page.evaluate(() => window.__game.start())
  await sleep(100)
  await page.mouse.move(156, 666); await page.mouse.down(); await page.mouse.move(120, 760, { steps: 8 }); await sleep(150)
  await page.screenshot({ path: join(outDir, 'pebble-aim.png') })
  await page.mouse.up()
  ok(errors.length === 0, `pebble: no page/console errors ${errors.join(' | ')}`)
  await ctx.close()
  await desktopShot('pebble-skip.html', 'pebble')
}

async function checkDive() {
  const { ctx, page, errors } = await open(`${base}/dodo/level15/deep-dive.html`, { width: 390, height: 844 }, 2)
  await page.screenshot({ path: join(outDir, 'dive-start.png') })
  await page.evaluate(() => window.__game.start())
  await sleep(300)
  // ~15 s of hold/release waves, steering toward pearls when the hook offers a target.
  const mid = await page.evaluate(async () => {
    const g = window.__game, sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const t0 = performance.now()
    let shot = false
    while (performance.now() - t0 < 15000 && g.state().phase === 'dive') {
      const s = g.state()
      const x = s.target ? s.target.x : 195 + Math.sin(performance.now() / 900) * 120
      g.press(x); await sleep(1150)
      g.release(); await sleep(250)
    }
    return g.state()
  })
  console.log('dive mid', JSON.stringify(mid))
  await page.screenshot({ path: join(outDir, 'dive-mid.png') })
  ok(mid.depth >= 8, `dive: depth advanced (${mid.depth} m)`)
  ok(mid.score >= 8, `dive: score advanced (${mid.score})`)
  // Drain the air so the dive ends on its own, then expect the surfacing card.
  const end = await page.evaluate(async () => {
    const g = window.__game, sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    g.drainAir()
    const t0 = performance.now()
    while (performance.now() - t0 < 15000 && g.state().phase !== 'end') { g.press(195); await sleep(300); g.release(); await sleep(200) }
    return g.state()
  })
  console.log('dive end', JSON.stringify(end))
  ok(end.phase === 'end', `dive: round ended (phase ${end.phase})`)
  const endVisible = await page.evaluate(() => !document.getElementById('end').classList.contains('hidden'))
  ok(endVisible, 'dive: end card visible')
  await sleep(500)
  await page.screenshot({ path: join(outDir, 'dive-end.png') })
  // The deep look: a fresh dive warped to 55 m, a moment of play, then a frame.
  await page.evaluate(() => { window.__game.start(); window.__game.warp(55) })
  await page.evaluate(async () => { const g = window.__game, sleep = (ms) => new Promise((r) => setTimeout(r, ms)); for (let i = 0; i < 3; i++) { g.press(195 + (i - 1) * 90); await sleep(700); g.release(); await sleep(300) } })
  await page.screenshot({ path: join(outDir, 'dive-deep.png') })
  const deep = await page.evaluate(() => window.__game.state())
  ok(deep.depth >= 50 && deep.phase === 'dive', `dive: deep frame at ${deep.depth} m`)
  ok(errors.length === 0, `dive: no page/console errors ${errors.join(' | ')}`)
  await ctx.close()
  await desktopShot('deep-dive.html', 'dive')
}

async function checkPicker() {
  const { ctx, page, errors } = await open(`${base}/dodo/level15/`, { width: 390, height: 844 }, 2)
  await page.screenshot({ path: join(outDir, 'picker.png') })
  const links = await page.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href')))
  ok(links.some((h) => h.includes('pebble-skip')) && links.some((h) => h.includes('deep-dive')), `picker links: ${links.join(', ')}`)
  ok(errors.length === 0, `picker: no errors ${errors.join(' | ')}`)
  await ctx.close()
}

if (which === 'all' || which === 'pebble') await checkPebble()
if (which === 'all' || which === 'dive') await checkDive()
if (which === 'all' || which === 'picker') await checkPicker()
await browser.close()
console.log(failed ? 'SOME CHECKS FAILED' : 'ALL CHECKS PASSED', '→', outDir)
process.exit(failed ? 1 : 0)
